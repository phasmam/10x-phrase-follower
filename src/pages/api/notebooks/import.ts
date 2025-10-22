import type { APIRoute } from "astro";
import type { ImportNotebookCommand, ImportNotebookResultDTO } from "../../types";
// import type { LocalsWithAuth } from "../../lib/types";
import { withErrorHandling, requireAuth, ApiErrors, ApiError } from "../../lib/errors";
// Temporarily inline import service functions to avoid import issues
// import {
//   validateImportCommand,
//   processImportLines,
//   generatePositions,
//   createBasicTokens,
// } from "../../lib/import.service";
// Temporarily inline idempotency functions
function validateIdempotencyKey(key: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(key);
}

function getIdempotencyResponse(userId: string, route: string, key: string) {
  // For now, return null (no caching)
  return null;
}

function storeIdempotencyResponse(userId: string, route: string, key: string, response: any) {
  // For now, do nothing (no caching)
}

// Temporary inline implementations to avoid import issues
function validateImportCommand(command: ImportNotebookCommand): void {
  const { name, lines, normalize } = command;

  if (!name || typeof name !== "string") {
    throw ApiErrors.validationError("Notebook name is required and must be a string");
  }

  if (name.length < 1 || name.length > 100) {
    throw ApiErrors.validationError("Notebook name must be between 1 and 100 characters");
  }

  if (!Array.isArray(lines)) {
    throw ApiErrors.validationError("Lines must be an array");
  }

  if (lines.length === 0) {
    throw ApiErrors.validationError("Lines array cannot be empty");
  }

  if (lines.length > 100) {
    throw ApiErrors.limitExceeded("Import exceeds 100 phrases limit");
  }

  if (normalize !== undefined && typeof normalize !== "boolean") {
    throw ApiErrors.validationError("Normalize must be a boolean");
  }

  for (let i = 0; i < lines.length; i++) {
    if (typeof lines[i] !== "string") {
      throw ApiErrors.validationError(`Line ${i + 1} must be a string`);
    }
  }
}

function processImportLines(lines: string[], normalize = false) {
  const accepted: Array<{ en: string; pl: string; lineNo: number; rawText: string }> = [];
  const rejected: Array<{ lineNo: number; rawText: string; reason: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let line = lines[i];

    if (normalize) {
      line = line.replace(/\s+/g, " ").trim();
    }

    const trimmed = line.trim();
    if (trimmed.length === 0) {
      rejected.push({ lineNo, rawText: lines[i], reason: "Empty line" });
      continue;
    }

    const separatorCount = (trimmed.match(/:::/g) || []).length;
    if (separatorCount !== 1) {
      rejected.push({ 
        lineNo, 
        rawText: lines[i], 
        reason: separatorCount === 0 ? "Missing separator (:::)" : "Multiple separators (:::)" 
      });
      continue;
    }

    const parts = trimmed.split(":::");
    const en = parts[0].trim();
    const pl = parts[1].trim();

    if (en.length === 0) {
      rejected.push({ lineNo, rawText: lines[i], reason: "Empty EN part" });
      continue;
    }

    if (pl.length === 0) {
      rejected.push({ lineNo, rawText: lines[i], reason: "Empty PL part" });
      continue;
    }

    if (en.length > 2000) {
      rejected.push({ lineNo, rawText: lines[i], reason: "EN part exceeds 2000 characters" });
      continue;
    }

    if (pl.length > 2000) {
      rejected.push({ lineNo, rawText: lines[i], reason: "PL part exceeds 2000 characters" });
      continue;
    }

    accepted.push({ en, pl, lineNo, rawText: lines[i] });
  }

  return { accepted, rejected };
}

function generatePositions(count: number): number[] {
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    positions.push((i + 1) * 10);
  }
  return positions;
}

function createBasicTokens(en: string, pl: string) {
  const tokenize = (text: string) => {
    const tokens: { text: string; start: number; end: number }[] = [];
    const words = text.split(/(\s+)/);
    let currentPos = 0;

    for (const word of words) {
      if (word.trim().length > 0) {
        tokens.push({
          text: word,
          start: currentPos,
          end: currentPos + word.length,
        });
      }
      currentPos += word.length;
    }

    return tokens;
  };

  return {
    en: tokenize(en),
    pl: tokenize(pl),
  };
}

export const prerender = false;

// POST /api/notebooks:import - Create notebook and import phrases
const importNotebook = async ({ locals, request }: { locals: any; request: Request }): Promise<Response> => {
  requireAuth(locals.userId);

  // Check for idempotency key
  const idempotencyKey = request.headers.get("Idempotency-Key");

  // Handle idempotency if key is provided
  if (idempotencyKey) {
    if (!validateIdempotencyKey(idempotencyKey)) {
      throw ApiErrors.validationError("Invalid Idempotency-Key format. Must be a valid UUID v4");
    }

    const cachedResponse = getIdempotencyResponse(locals.userId, "notebooks:import", idempotencyKey);
    if (cachedResponse) {
      return new Response(JSON.stringify(cachedResponse), {
        status: 201,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
  }

  const body = await request.json();
  const command: ImportNotebookCommand = body;

  // Validate the import command
  validateImportCommand(command);

  const { name, lines, normalize = false } = command;

  // Check user's notebook limit (500 per user)
  const { count: notebookCount, error: countError } = await locals.supabase
    .from("notebooks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", locals.userId);

  if (countError) {
    // eslint-disable-next-line no-console
    console.error("Database error:", countError);
    throw ApiErrors.internal("Failed to check notebook limit");
  }

  if (notebookCount && notebookCount >= 500) {
    throw ApiErrors.limitExceeded("Maximum 500 notebooks per user exceeded");
  }

  // Process the import lines
  const importResult = processImportLines(lines, normalize);
  const { accepted, rejected } = importResult;

  // Check if we have any accepted phrases
  if (accepted.length === 0) {
    throw ApiErrors.validationError("No valid phrases found in import");
  }

  // Start transaction-like operations
  try {
    // Create the notebook
    const notebookId = crypto.randomUUID();
    const { data: notebook, error: notebookError } = await locals.supabase
      .from("notebooks")
      .insert({
        id: notebookId,
        user_id: locals.userId,
        name: name.trim(),
      })
      .select("id, name, current_build_id, last_generate_job_id, created_at, updated_at")
      .single();

    if (notebookError) {
      if (notebookError.code === "23505") {
        // Unique violation - notebook name already exists for this user
        throw ApiErrors.uniqueViolation("Notebook name already exists");
      }
      // eslint-disable-next-line no-console
      console.error("Database error:", notebookError);
      throw ApiErrors.internal("Failed to create notebook");
    }

    // Generate positions for accepted phrases
    const positions = generatePositions(accepted.length);

    // Prepare phrases for bulk insert
    const phrases = accepted.map((line, index) => ({
      id: crypto.randomUUID(),
      notebook_id: notebookId,
      position: positions[index],
      en_text: line.en,
      pl_text: line.pl,
      tokens: createBasicTokens(line.en, line.pl),
    }));

    // Bulk insert phrases
    const { error: phrasesError } = await locals.supabase.from("phrases").insert(phrases);

    if (phrasesError) {
      // eslint-disable-next-line no-console
      console.error("Database error:", phrasesError);
      throw ApiErrors.internal("Failed to create phrases");
    }

    // Insert import logs for rejected lines
    if (rejected.length > 0) {
      const importLogs = rejected.map((reject) => ({
        id: crypto.randomUUID(),
        user_id: locals.userId,
        notebook_id: notebookId,
        line_no: reject.lineNo,
        raw_text: reject.rawText,
        reason: reject.reason,
      }));

      const { error: logsError } = await locals.supabase.from("import_logs").insert(importLogs);

      if (logsError) {
        // eslint-disable-next-line no-console
        console.error("Database error:", logsError);
        // Don't fail the entire import for log errors, but log them
        // eslint-disable-next-line no-console
        console.warn("Failed to create import logs:", logsError);
      }
    }

    // Prepare response
    const response: ImportNotebookResultDTO = {
      notebook,
      import: {
        accepted: accepted.length,
        rejected: rejected.length,
        logs: rejected.map((reject) => ({
          id: crypto.randomUUID(), // Generate ID for response (not persisted)
          line_no: reject.lineNo,
          raw_text: reject.rawText,
          reason: reject.reason,
          created_at: new Date().toISOString(),
        })),
      },
    };

    // Store response for idempotency if key was provided
    if (idempotencyKey) {
      storeIdempotencyResponse(locals.userId, "notebooks:import", idempotencyKey, response);
    }

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    // If it's already an ApiError, re-throw it
    if (error instanceof ApiError) {
      throw error;
    }

    // eslint-disable-next-line no-console
    console.error("Unexpected error during import:", error);
    throw ApiErrors.internal("Failed to import notebook");
  }
};

export const POST: APIRoute = withErrorHandling(importNotebook);
