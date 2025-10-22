import type { APIRoute } from "astro";
import type { PhraseListResponse, CreatePhraseCommand } from "../../../../../types";
import type { LocalsWithAuth } from "../../../../../lib/types";
import { withErrorHandling, requireAuth, ApiErrors } from "../../../../../lib/errors";
import {
  validateUUID,
  validatePaginationParams,
  validateSortParams,
  validateJsonBody,
  validateInteger,
  validateNonEmptyText,
  validateRateLimit,
} from "../../../../../lib/validation.service";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_USER_ID } from "../../../../../db/supabase.client";

export const prerender = false;

// GET /api/notebooks/:notebookId/phrases - List phrases in a notebook
const getPhrases = async ({
  locals,
  params,
  url,
}: {
  locals: LocalsWithAuth;
  params: { notebookId: string };
  url: URL;
}): Promise<Response> => {
  requireAuth(locals.userId);

  // In development, use service role key to bypass RLS
  let supabase = locals.supabase;
  if (import.meta.env.NODE_ENV === "development" && locals.userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  const { notebookId } = params;

  // Validate UUID format
  validateUUID(notebookId, "Notebook ID");

  // Validate query parameters
  const { limit, cursor } = validatePaginationParams(url);
  const { sort, order } = validateSortParams(url, ["position", "created_at"], "position");

  // First verify the notebook exists and belongs to the user
  const { data: notebook, error: notebookError } = await supabase
    .from("notebooks")
    .select("id")
    .eq("id", notebookId)
    .eq("user_id", locals.userId)
    .single();

  if (notebookError || !notebook) {
    throw ApiErrors.notFound("Notebook not found");
  }

  // Build query
  let query = supabase
    .from("phrases")
    .select("id, position, en_text, pl_text, tokens, created_at, updated_at")
    .eq("notebook_id", notebookId)
    .order(sort, { ascending: order === "asc" })
    .limit(limit + 1); // Get one extra to check if there are more

  // Apply cursor pagination
  if (cursor) {
    // For cursor-based pagination, we need to decode the cursor
    // For now, using simple offset-based pagination
    const offset = parseInt(cursor) || 0;
    query = query.range(offset, offset + limit);
  }

  const { data, error } = await query;

  if (error) {
    // eslint-disable-next-line no-console
    console.error("Database error:", error);
    throw ApiErrors.internal("Failed to fetch phrases");
  }

  // Check if there are more results
  const hasMore = data && data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data || [];
  const nextCursor = hasMore ? (parseInt(cursor || "0") + limit).toString() : null;

  const response: PhraseListResponse = {
    items,
    next_cursor: nextCursor,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

// POST /api/notebooks/:notebookId/phrases - Create a new phrase
const createPhrase = async ({
  locals,
  params,
  request,
}: {
  locals: LocalsWithAuth;
  params: { notebookId: string };
  request: Request;
}): Promise<Response> => {
  requireAuth(locals.userId);

  // In development, use service role key to bypass RLS
  let supabase = locals.supabase;
  if (import.meta.env.NODE_ENV === "development" && locals.userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  const { notebookId } = params;

  // Validate UUID format
  validateUUID(notebookId, "Notebook ID");

  // Rate limiting for phrase creation
  validateRateLimit(`create_phrase:${locals.userId}`, 20, 60000); // 20 per minute

  const body = await request.json();
  validateJsonBody(body, ["position", "en_text", "pl_text"]);

  const { position, en_text, pl_text, tokens }: CreatePhraseCommand = body;

  // Validate input
  const validatedPosition = validateInteger(position, 1, undefined, "Position");
  const sanitizedEnText = validateNonEmptyText(en_text, "English text");
  const sanitizedPlText = validateNonEmptyText(pl_text, "Polish text");

  if (sanitizedEnText.length > 2000) {
    throw ApiErrors.validationError("English text must be at most 2000 characters");
  }

  if (sanitizedPlText.length > 2000) {
    throw ApiErrors.validationError("Polish text must be at most 2000 characters");
  }

  // First verify the notebook exists and belongs to the user
  const { data: notebook, error: notebookError } = await supabase
    .from("notebooks")
    .select("id")
    .eq("id", notebookId)
    .eq("user_id", locals.userId)
    .single();

  if (notebookError || !notebook) {
    throw ApiErrors.notFound("Notebook not found");
  }

  // Create phrase
  const { data, error } = await supabase
    .from("phrases")
    .insert({
      id: crypto.randomUUID(),
      notebook_id: notebookId,
      position: validatedPosition,
      en_text: sanitizedEnText,
      pl_text: sanitizedPlText,
      tokens: tokens || null,
    })
    .select("id, position, en_text, pl_text, tokens, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Unique violation - position already exists in this notebook
      throw ApiErrors.conflict("Position already exists in this notebook");
    }
    // eslint-disable-next-line no-console
    console.error("Database error:", error);
    throw ApiErrors.internal("Failed to create phrase");
  }

  return new Response(JSON.stringify(data), {
    status: 201,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const GET: APIRoute = withErrorHandling(getPhrases);
export const POST: APIRoute = withErrorHandling(createPhrase);
