import type { APIRoute } from "astro";
import type { ImportLogsListResponse } from "../../../../types";
import type { LocalsWithAuth } from "../../../../lib/types";
import { withErrorHandling, requireAuth, ApiErrors } from "../../../../lib/errors";

export const prerender = false;

// GET /api/notebooks/:notebookId/import-logs - List import logs for a notebook
const getImportLogs = async ({
  locals,
  params,
  url,
}: {
  locals: LocalsWithAuth;
  params: { notebookId: string };
  url: URL;
}): Promise<Response> => {
  requireAuth(locals.userId);

  const { notebookId } = params;

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notebookId)) {
    throw ApiErrors.validationError("Invalid notebook ID format");
  }

  // Parse query parameters
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);
  const cursor = url.searchParams.get("cursor");
  const sort = url.searchParams.get("sort") || "created_at";
  const order = url.searchParams.get("order") || "desc";

  // Validate sort field
  const allowedSorts = ["created_at"];
  if (!allowedSorts.includes(sort)) {
    throw ApiErrors.validationError(`Invalid sort field. Must be one of: ${allowedSorts.join(", ")}`);
  }

  // Validate order
  if (!["asc", "desc"].includes(order)) {
    throw ApiErrors.validationError("Invalid order. Must be 'asc' or 'desc'");
  }

  // First verify the notebook exists and belongs to the user
  const { data: notebook, error: notebookError } = await locals.supabase
    .from("notebooks")
    .select("id")
    .eq("id", notebookId)
    .eq("user_id", locals.userId)
    .single();

  if (notebookError || !notebook) {
    throw ApiErrors.notFound("Notebook not found");
  }

  // Build query
  let query = locals.supabase
    .from("import_logs")
    .select("id, line_no, raw_text, reason, created_at")
    .eq("notebook_id", notebookId)
    .eq("user_id", locals.userId) // RLS will handle this, but explicit check for clarity
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
    throw ApiErrors.internal("Failed to fetch import logs");
  }

  // Check if there are more results
  const hasMore = data && data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data || [];
  const nextCursor = hasMore ? (parseInt(cursor || "0") + limit).toString() : null;

  const response: ImportLogsListResponse = {
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

export const GET: APIRoute = withErrorHandling(getImportLogs);
