import type { APIRoute } from "astro";
import type { ImportNotebookCommand, ImportNotebookResultDTO } from "../../../types";
import { withErrorHandling, ApiErrors } from "../../../lib/errors";
import {
  validateIdempotencyKey,
  getIdempotencyResponse,
  storeIdempotencyResponse,
} from "../../../lib/idempotency.service";
import {
  validateImportCommand,
  processImportLines,
  generatePositions,
  createBasicTokens,
} from "../../../lib/import.service";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../db/database.types";
import type { Json } from "../../../db/database.types";
import { DEFAULT_USER_ID } from "../../../db/supabase.client";

export const prerender = false;

export const POST: APIRoute = withErrorHandling(async ({ locals, request }) => {
  // Check for idempotency key
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !validateIdempotencyKey(idempotencyKey)) {
    throw ApiErrors.validationError("Valid Idempotency-Key header is required (UUID format)");
  }

  // Get user from locals (set by middleware)
  const userId = locals.userId as string;
  if (!userId) {
    throw ApiErrors.unauthorized();
  }

  // Check for existing idempotent response
  const existingResponse = getIdempotencyResponse(userId, "import", idempotencyKey);
  if (existingResponse) {
    return new Response(JSON.stringify(existingResponse), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse and validate request
  const command: ImportNotebookCommand = await request.json();
  validateImportCommand(command);

  const { name, lines, normalize = false } = command;

  // Get Supabase client from locals
  let supabase = locals.supabase;

  // In development, use service role key to bypass RLS
  if (import.meta.env.NODE_ENV === "development" && userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseServiceKey) {
      supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  }

  // Check notebook limit (500 per user)
  const { count: notebookCount, error: countError } = await supabase
    .from("notebooks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) {
    throw ApiErrors.internal("Failed to check notebook limit", countError);
  }

  if (notebookCount && notebookCount >= 500) {
    throw ApiErrors.limitExceeded("Maximum 500 notebooks per user exceeded");
  }

  // Process import lines
  const importResult = processImportLines(lines, normalize);
  const { accepted, rejected } = importResult;

  if (accepted.length === 0) {
    throw ApiErrors.validationError("No valid phrases found in import");
  }

  // Create notebook
  const notebookId = crypto.randomUUID();
  const { data: notebook, error: notebookError } = await supabase
    .from("notebooks")
    .insert({
      id: notebookId,
      user_id: userId,
      name: name.trim(),
    })
    .select("id, name, current_build_id, last_generate_job_id, created_at, updated_at")
    .single();

  if (notebookError) {
    if (notebookError.code === "23505") {
      throw ApiErrors.uniqueViolation("Notebook name already exists");
    }
    throw ApiErrors.internal("Failed to create notebook", notebookError);
  }

  // Create phrases with positions
  const positions = generatePositions(accepted.length);
  const phrases = accepted.map((line, index) => ({
    id: crypto.randomUUID(),
    notebook_id: notebookId,
    position: positions[index],
    en_text: line.en,
    pl_text: line.pl,
    tokens: createBasicTokens(line.en, line.pl) as Json, // Cast to Json for DB compatibility
  }));

  const { error: phrasesError } = await supabase.from("phrases").insert(phrases);

  if (phrasesError) {
    throw ApiErrors.internal("Failed to create phrases", phrasesError);
  }

  // Create import logs for rejected lines
  if (rejected.length > 0) {
    const importLogs = rejected.map((reject) => ({
      id: crypto.randomUUID(),
      user_id: userId,
      notebook_id: notebookId,
      line_no: reject.lineNo,
      raw_text: reject.rawText,
      reason: reject.reason,
    }));

    const { error: logsError } = await supabase.from("import_logs").insert(importLogs);
    if (logsError) {
      // Log error but don't fail the import
      // eslint-disable-next-line no-console
      console.error("Failed to create import logs:", logsError);
    }
  }

  // Prepare response
  const response: ImportNotebookResultDTO = {
    notebook,
    import: {
      accepted: accepted.length,
      rejected: rejected.length,
      logs: rejected.map((reject) => ({
        id: crypto.randomUUID(),
        line_no: reject.lineNo,
        raw_text: reject.rawText,
        reason: reject.reason,
        created_at: new Date().toISOString(),
      })),
    },
  };

  // Store idempotent response
  storeIdempotencyResponse(userId, "import", idempotencyKey, response);

  return new Response(JSON.stringify(response), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
});
