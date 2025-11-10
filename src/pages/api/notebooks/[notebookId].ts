import type { APIRoute, APIContext } from "astro";
import type { UpdateNotebookCommand } from "../../../types";
import type { LocalsWithAuth } from "../../../lib/types";
import { withErrorHandling, requireAuth, ApiErrors } from "../../../lib/errors";
import { ensureUserExists, getSupabaseClient } from "../../../lib/utils";

export const prerender = false;

// GET /api/notebooks/:notebookId - Get notebook by ID
const getNotebook = async (context: APIContext): Promise<Response> => {
  const locals = context.locals as LocalsWithAuth;
  requireAuth(locals.userId);

  const { notebookId } = context.params as { notebookId: string };

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notebookId)) {
    throw ApiErrors.validationError("Invalid notebook ID format");
  }

  const supabase = getSupabaseClient(context);

  const { data, error } = await supabase
    .from("notebooks")
    .select("id, name, current_build_id, last_generate_job_id, created_at, updated_at")
    .eq("id", notebookId)
    .eq("user_id", locals.userId) // RLS will handle this, but explicit check for clarity
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned - notebook not found or not owned by user
      throw ApiErrors.notFound("Notebook not found");
    }
    // eslint-disable-next-line no-console
    console.error("Database error:", error);
    throw ApiErrors.internal("Failed to fetch notebook");
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

// PATCH /api/notebooks/:notebookId - Update notebook
const updateNotebook = async (context: APIContext): Promise<Response> => {
  const locals = context.locals as LocalsWithAuth;
  requireAuth(locals.userId);

  const { notebookId } = context.params as { notebookId: string };

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notebookId)) {
    throw ApiErrors.validationError("Invalid notebook ID format");
  }

  const body = await context.request.json();
  const { name }: UpdateNotebookCommand = body;

  // Validate input
  if (name !== undefined) {
    if (typeof name !== "string") {
      throw ApiErrors.validationError("Name must be a string");
    }
    if (name.length < 1 || name.length > 100) {
      throw ApiErrors.validationError("Name must be between 1 and 100 characters");
    }
  }

  const supabase = getSupabaseClient(context);
  await ensureUserExists(supabase, locals.userId);

  // Build update object
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) {
    updateData.name = name.trim();
  }
  updateData.updated_at = new Date().toISOString();

  if (Object.keys(updateData).length === 1) {
    // Only updated_at was set, no actual changes
    throw ApiErrors.validationError("No valid fields to update");
  }

  const { data, error } = await supabase
    .from("notebooks")
    .update(updateData)
    .eq("id", notebookId)
    .eq("user_id", locals.userId) // RLS will handle this, but explicit check for clarity
    .select("id, name, current_build_id, last_generate_job_id, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned - notebook not found or not owned by user
      throw ApiErrors.notFound("Notebook not found");
    }
    if (error.code === "23505") {
      // Unique violation - notebook name already exists for this user
      throw ApiErrors.uniqueViolation("Notebook name already exists");
    }
    // eslint-disable-next-line no-console
    console.error("Database error:", error);
    throw ApiErrors.internal("Failed to update notebook");
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

// DELETE /api/notebooks/:notebookId - Delete notebook
const deleteNotebook = async (context: APIContext): Promise<Response> => {
  const locals = context.locals as LocalsWithAuth;
  requireAuth(locals.userId);

  const { notebookId } = context.params as { notebookId: string };

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notebookId)) {
    throw ApiErrors.validationError("Invalid notebook ID format");
  }

  const supabase = getSupabaseClient(context);
  await ensureUserExists(supabase, locals.userId);

  const { error } = await supabase.from("notebooks").delete().eq("id", notebookId).eq("user_id", locals.userId); // RLS will handle this, but explicit check for clarity

  if (error) {
    // eslint-disable-next-line no-console
    console.error("Database error:", error);
    throw ApiErrors.internal("Failed to delete notebook");
  }

  return new Response(null, { status: 204 });
};

export const GET: APIRoute = withErrorHandling(getNotebook);
export const PATCH: APIRoute = withErrorHandling(updateNotebook);
export const DELETE: APIRoute = withErrorHandling(deleteNotebook);
