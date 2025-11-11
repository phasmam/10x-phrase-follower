import type { APIContext } from "astro";
import { ApiError, ApiErrors } from "../../../lib/errors";
import type { BuildDTO } from "../../../types";

export const prerender = false;

// Helper function to get user ID from context
function getUserId(context: APIContext): string {
  const userId = context.locals.userId;
  if (!userId) {
    throw ApiErrors.unauthorized("Authentication required");
  }
  return userId;
}

export async function GET(context: APIContext) {
  try {
    getUserId(context); // Verify authentication
    const supabase = context.locals.supabase;

    // Parse and validate path parameter
    const buildId = context.params.buildId;
    if (!buildId) {
      throw ApiErrors.validationError("Build ID is required");
    }

    // Get the build (with RLS ensuring user can only access their own builds)
    const { data: build, error } = await supabase
      .from("builds")
      .select("id, job_id, notebook_id, created_at")
      .eq("id", buildId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw ApiErrors.notFound("Build not found");
      }
      throw ApiErrors.internal("Failed to fetch build");
    }

    const response: BuildDTO = build;

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return error.toResponse();
    }
    return new Response(JSON.stringify({ error: { code: "internal", message: "Internal server error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
