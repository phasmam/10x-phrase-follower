import type { APIContext } from "astro";
import { createClient } from "@supabase/supabase-js";
import { ApiError, ApiErrors } from "../../../lib/errors";
import { DEFAULT_USER_ID } from "../../../db/supabase.client";
import type { CancelJobResponseDTO } from "../../../types";

export const prerender = false;

// Helper function to get user ID from context
function getUserId(context: APIContext): string {
  const userId = context.locals.userId;
  if (!userId) {
    throw ApiErrors.unauthorized("Authentication required");
  }
  return userId;
}

// Helper function to get the appropriate Supabase client
function getSupabaseClient(context: APIContext) {
  const userId = context.locals.userId;

  // In development mode with DEFAULT_USER_ID, use service role key to bypass RLS
  if (import.meta.env.NODE_ENV === "development" && userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL || (typeof process !== "undefined" && process.env.SUPABASE_URL);
    const supabaseServiceKey =
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
      (typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (supabaseServiceKey) {
      return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  return context.locals.supabase;
}

export async function POST(context: APIContext) {
  try {
    const userId = getUserId(context);
    const supabase = getSupabaseClient(context);

    // Parse and validate path parameter
    const jobId = context.params.jobId;
    if (!jobId) {
      throw ApiErrors.validationError("Job ID is required");
    }

    // Get the current job state
    const { data: job, error: fetchError } = await supabase
      .from("jobs")
      .select("id, state, user_id")
      .eq("id", jobId)
      .eq("user_id", userId) // Ensure user can only cancel their own jobs
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        throw ApiErrors.notFound("Job not found");
      }
      throw ApiErrors.internal("Failed to fetch job");
    }

    // Check if job can be canceled
    if (job.state === "succeeded" || job.state === "failed" || job.state === "canceled" || job.state === "timeout") {
      throw ApiErrors.cannotCancel("Cannot cancel job in current state");
    }

    // Update job state to canceled
    const { data: updatedJob, error: updateError } = await supabase
      .from("jobs")
      .update({
        state: "canceled",
        ended_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select("id, state")
      .single();

    if (updateError) {
      throw ApiErrors.internal("Failed to cancel job");
    }

    const response: CancelJobResponseDTO = updatedJob;

    return new Response(JSON.stringify(response), {
      status: 202,
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
