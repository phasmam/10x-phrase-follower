import type { APIContext } from "astro";
import { ApiErrors } from "../../../../lib/errors";
import type { BuildListResponse } from "../../../../types";
import { getSupabaseClient } from "../../../../lib/utils";

export const prerender = false;

// Helper function to get user ID from context
function getUserId(context: APIContext): string {
  const userId = context.locals.userId;
  if (!userId) {
    throw ApiErrors.unauthorized("Authentication required");
  }
  return userId;
}

// Helper function to parse query parameters
function parseQueryParams(url: URL) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);
  const cursor = url.searchParams.get("cursor");
  
  return { limit, cursor };
}

export async function GET(context: APIContext) {
  try {
    const userId = getUserId(context);
    const supabase = getSupabaseClient(context);

    // Parse and validate path parameter
    const notebookId = context.params.notebookId;
    if (!notebookId) {
      throw ApiErrors.validationError("Notebook ID is required");
    }

    // Parse query parameters
    const { limit, cursor } = parseQueryParams(new URL(context.request.url));

    // Build query
    let query = supabase
      .from("builds")
      .select("id, job_id, notebook_id, created_at")
      .eq("notebook_id", notebookId)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // Get one extra to check if there are more

    if (cursor) {
      // Simple cursor-based pagination using created_at
      query = query.lt("created_at", cursor);
    }

    const { data: builds, error } = await query;

    if (error) {
      throw ApiErrors.internal("Failed to fetch builds");
    }

    // Check if there are more items
    const hasMore = builds && builds.length > limit;
    const items = hasMore ? builds.slice(0, limit) : builds || [];
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

    const response: BuildListResponse = {
      items,
      next_cursor: nextCursor,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      const status = (error as any).code === "unauthorized" ? 401 : 400;
      return new Response(JSON.stringify({ error: { code: (error as any).code, message: error.message } }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: { code: "internal", message: "Internal server error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
