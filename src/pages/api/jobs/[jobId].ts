import type { APIContext } from "astro";
import { ApiErrors } from "../../../lib/errors";
import type { JobDTO } from "../../../types";

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
    const userId = getUserId(context);
    const supabase = context.locals.supabase;

    // Parse and validate path parameter
    const jobId = context.params.jobId;
    if (!jobId) {
      throw ApiErrors.validationError("Job ID is required");
    }

    // Get the job
    const { data: job, error } = await supabase
      .from("jobs")
      .select("id, user_id, notebook_id, type, state, started_at, ended_at, timeout_sec, error, created_at")
      .eq("id", jobId)
      .eq("user_id", userId) // Ensure user can only access their own jobs
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw ApiErrors.notFound("Job not found");
      }
      throw ApiErrors.internal("Failed to fetch job");
    }

    const response: JobDTO = job;

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      const status = (error as any).code === "unauthorized" ? 401 : (error as any).code === "not_found" ? 404 : 400;
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
