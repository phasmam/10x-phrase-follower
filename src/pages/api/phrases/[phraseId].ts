import type { APIRoute } from "astro";
import type { UpdatePhraseCommand } from "../../../types";
import type { LocalsWithAuth } from "../../../lib/types";
import { withErrorHandling, requireAuth, ApiErrors } from "../../../lib/errors";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_USER_ID } from "../../../db/supabase.client";

export const prerender = false;

// PATCH /api/phrases/:phraseId - Update phrase
const updatePhrase = async ({
  locals,
  params,
  request,
}: {
  locals: LocalsWithAuth;
  params: { phraseId: string };
  request: Request;
}): Promise<Response> => {
  const userId = locals.userId;
  let supabase = supabase;
  requireAuth(userId);

  // In development, use service role key to bypass RLS
  if (import.meta.env.NODE_ENV === "development" && userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL || (typeof process !== "undefined" && process.env.SUPABASE_URL);
    const supabaseServiceKey =
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
      (typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  const { phraseId } = params;

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(phraseId)) {
    throw ApiErrors.validationError("Invalid phrase ID format");
  }

  const body = await request.json();
  const { position, en_text, pl_text, tokens }: UpdatePhraseCommand = body;

  // Validate input
  if (position !== undefined && (typeof position !== "number" || !Number.isInteger(position))) {
    throw ApiErrors.validationError("Position must be an integer");
  }

  if (en_text !== undefined) {
    if (typeof en_text !== "string") {
      throw ApiErrors.validationError("English text must be a string");
    }
    if (en_text.length < 1 || en_text.length > 2000) {
      throw ApiErrors.validationError("English text must be between 1 and 2000 characters");
    }
  }

  if (pl_text !== undefined) {
    if (typeof pl_text !== "string") {
      throw ApiErrors.validationError("Polish text must be a string");
    }
    if (pl_text.length < 1 || pl_text.length > 2000) {
      throw ApiErrors.validationError("Polish text must be between 1 and 2000 characters");
    }
  }

  // Build update object
  const updateData: Record<string, unknown> = {};
  if (position !== undefined) {
    updateData.position = position;
  }
  if (en_text !== undefined) {
    updateData.en_text = en_text.trim();
  }
  if (pl_text !== undefined) {
    updateData.pl_text = pl_text.trim();
  }
  if (tokens !== undefined) {
    updateData.tokens = tokens;
  }
  updateData.updated_at = new Date().toISOString();

  if (Object.keys(updateData).length === 1) {
    // Only updated_at was set, no actual changes
    throw ApiErrors.validationError("No valid fields to update");
  }

  const { data, error } = await supabase
    .from("phrases")
    .update(updateData)
    .eq("id", phraseId)
    .select(
      `
      id, position, en_text, pl_text, tokens, created_at, updated_at,
      notebook:notebooks!inner(id, user_id)
    `
    )
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned - phrase not found or not owned by user
      throw ApiErrors.notFound("Phrase not found");
    }
    if (error.code === "23505") {
      // Unique violation - position already exists in this notebook
      throw ApiErrors.conflict("Position already exists in this notebook");
    }
    // eslint-disable-next-line no-console
    console.error("Database error:", error);
    throw ApiErrors.internal("Failed to update phrase");
  }

  // Verify ownership through the joined notebook
  if (data.notebook.user_id !== locals.userId) {
    throw ApiErrors.notFound("Phrase not found");
  }

  // Remove the notebook data from response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { notebook, ...phraseData } = data;

  return new Response(JSON.stringify(phraseData), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

// DELETE /api/phrases/:phraseId - Delete phrase
const deletePhrase = async ({
  locals,
  params,
}: {
  locals: LocalsWithAuth;
  params: { phraseId: string };
}): Promise<Response> => {
  const userId = locals.userId;
  let supabase = locals.supabase;
  requireAuth(userId);

  // In development, use service role key to bypass RLS
  if (import.meta.env.NODE_ENV === "development" && userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL || (typeof process !== "undefined" && process.env.SUPABASE_URL);
    const supabaseServiceKey =
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
      (typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  const { phraseId } = params;

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(phraseId)) {
    throw ApiErrors.validationError("Invalid phrase ID format");
  }

  // First verify the phrase exists and belongs to the user
  const { data: phrase, error: phraseError } = await supabase
    .from("phrases")
    .select(
      `
      id,
      notebook:notebooks!inner(id, user_id)
    `
    )
    .eq("id", phraseId)
    .single();

  if (phraseError || !phrase) {
    throw ApiErrors.notFound("Phrase not found");
  }

  // Verify ownership
  if (phrase.notebook.user_id !== locals.userId) {
    throw ApiErrors.notFound("Phrase not found");
  }

  // Delete the phrase
  const { error } = await supabase.from("phrases").delete().eq("id", phraseId);

  if (error) {
    // eslint-disable-next-line no-console
    console.error("Database error:", error);
    throw ApiErrors.internal("Failed to delete phrase");
  }

  return new Response(null, { status: 204 });
};

export const PATCH: APIRoute = withErrorHandling(updatePhrase);
export const DELETE: APIRoute = withErrorHandling(deletePhrase);
