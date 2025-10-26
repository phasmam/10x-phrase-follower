import type { APIContext } from "astro";
import { z } from "zod";
import { ApiErrors } from "../../../../lib/errors";
import type { JobListResponse } from "../../../../types";

export const prerender = false;

// Validation schemas
const JobStateSchema = z.enum(["queued", "running", "succeeded", "failed", "canceled", "timeout"]);

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
  const state = url.searchParams.get("state");
  
  return {
    limit,
    cursor,
    state: state ? JobStateSchema.parse(state) : undefined,
  };
}

export async function GET(context: APIContext) {
  try {
    const userId = getUserId(context);
    const supabase = context.locals.supabase;

    // Parse and validate path parameter
    const notebookId = context.params.notebookId;
    if (!notebookId) {
      throw ApiErrors.validationError("Notebook ID is required");
    }

    // Parse query parameters
    const { limit, cursor, state } = parseQueryParams(new URL(context.request.url));

    // Build query
    let query = supabase
      .from("jobs")
      .select("id, type, state, started_at, ended_at, timeout_sec, error, created_at")
      .eq("notebook_id", notebookId)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // Get one extra to check if there are more

    if (state) {
      query = query.eq("state", state);
    }

    if (cursor) {
      // Simple cursor-based pagination using created_at
      query = query.lt("created_at", cursor);
    }

    const { data: jobs, error } = await query;

    if (error) {
      throw ApiErrors.internal("Failed to fetch jobs");
    }

    // Check if there are more items
    const hasMore = jobs && jobs.length > limit;
    const items = hasMore ? jobs.slice(0, limit) : jobs || [];
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

    const response: JobListResponse = {
      items,
      next_cursor: nextCursor,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: {
            code: "validation_error",
            message: "Invalid query parameters",
            details: error.errors,
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    if (error instanceof Error && "code" in error) {
      return new Response(JSON.stringify({ error: { code: (error as any).code, message: error.message } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: { code: "internal", message: "Internal server error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
