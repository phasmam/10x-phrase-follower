import type { APIRoute } from "astro";
import type { ImportNotebookCommand, ImportNotebookResultDTO } from "../../types";
import type { LocalsWithAuth } from "../../lib/types";
import { withErrorHandling, requireAuth, ApiErrors } from "../../lib/errors";
import {
  validateImportCommand,
  processImportLines,
  generatePositions,
  createBasicTokens,
} from "../../lib/import.service";
import {
  validateIdempotencyKey,
  getIdempotencyResponse,
  storeIdempotencyResponse,
} from "../../lib/idempotency.service";

export const prerender = false;

// POST /api/notebooks:import - Create notebook and import phrases
const importNotebook = async ({ locals, request }: { locals: LocalsWithAuth; request: Request }): Promise<Response> => {
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
