import type { APIContext } from "astro";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "../../../../../db/database.types";
import { ApiError, ApiErrors } from "../../../../../lib/errors";
import type { JobDTO } from "../../../../../types";
import { ensureUserExists, getSupabaseClient, getSupabaseEnvVars } from "../../../../../lib/utils";
import { JobWorker } from "../../../../../lib/job-worker";
import { setRuntimeEnv } from "../../../../../lib/tts-encryption";

type SupabaseClient = ReturnType<typeof createClient<Database>>;

export const prerender = false;

// Validation schemas
const GenerateRebuildSchema = z.object({
  timeout_sec: z.number().int().min(60).max(3600).optional(),
});

// Helper function to get user ID from context
function getUserId(context: APIContext): string {
  const userId = context.locals.userId;
  if (!userId) {
    throw ApiErrors.unauthorized("Authentication required");
  }
  return userId;
}

// Helper function to check TTS credentials
async function checkTtsCredentials(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: credentials, error } = await supabase
    .from("tts_credentials")
    .select("is_configured")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw ApiErrors.internal("Failed to check TTS credentials");
  }

  if (!credentials?.is_configured) {
    throw ApiErrors.validationError("TTS credentials not configured");
  }
}

// Helper function to check user voices
async function checkUserVoices(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: voices, error } = await supabase.from("user_voices").select("slot, language").eq("user_id", userId);

  if (error) {
    throw ApiErrors.internal("Failed to check user voices");
  }

  if (!voices || voices.length === 0) {
    throw ApiErrors.validationError("No voice configurations found");
  }

  // Check for required slots (at least one EN and one PL)
  const hasEn = voices.some((v) => ["EN1", "EN2", "EN3"].includes(v.slot));
  const hasPl = voices.some((v) => v.slot === "PL");

  if (!hasEn || !hasPl) {
    throw ApiErrors.validationError("Voice configuration incomplete - need at least one EN slot and PL slot");
  }
}

// Helper function to check for active jobs
async function checkActiveJobs(supabase: SupabaseClient, notebookId: string): Promise<void> {
  const { data: activeJobs, error } = await supabase
    .from("jobs")
    .select("id, state")
    .eq("notebook_id", notebookId)
    .in("state", ["queued", "running"]);

  if (error) {
    throw ApiErrors.internal("Failed to check active jobs");
  }

  if (activeJobs && activeJobs.length > 0) {
    throw ApiErrors.conflict("Job already in progress");
  }
}

export async function POST(context: APIContext) {
  try {
    const userId = getUserId(context);
    const supabase = getSupabaseClient(context);
    await ensureUserExists(supabase, userId);

    // Parse and validate path parameter
    const notebookId = context.params.notebookId;
    if (!notebookId) {
      throw ApiErrors.validationError("Notebook ID is required");
    }

    // Parse and validate request body
    const body = await context.request.json();
    const { timeout_sec } = GenerateRebuildSchema.parse(body);

    // Check TTS credentials
    await checkTtsCredentials(supabase, userId);

    // Check user voices
    await checkUserVoices(supabase, userId);

    // Check for active jobs
    await checkActiveJobs(supabase, notebookId);

    // Create job
    const jobId = randomUUID();
    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        id: jobId,
        user_id: userId,
        notebook_id: notebookId,
        type: "GENERATE_REBUILD",
        state: "queued",
        timeout_sec: timeout_sec || 1800, // Default 30 minutes
      })
      .select("id, user_id, notebook_id, type, state, started_at, ended_at, timeout_sec, error, created_at")
      .single();

    if (error) {
      throw ApiErrors.internal("Failed to create job");
    }

    // Try to process the job immediately (non-blocking)
    // This will work if the request stays alive long enough, otherwise
    // the job will be processed by /api/jobs/process-queued endpoint or cron
    try {
      // Pass Cloudflare runtime env to crypto utils if available
      const localsAny = context.locals as unknown as {
        runtime?: { env?: Record<string, string | undefined> };
      };
      if (localsAny.runtime?.env) {
        setRuntimeEnv(localsAny.runtime.env);
      }

      const { supabaseUrl, supabaseServiceKey } = getSupabaseEnvVars(context);
      if (supabaseUrl && supabaseServiceKey) {
        const worker = new JobWorker(supabaseUrl, supabaseServiceKey);
        // Process job in background (non-blocking)
        // In Cloudflare Workers, this may be interrupted, but it's worth trying
        worker.processJob(jobId).catch((error: Error) => {
          console.error(`Failed to process job ${jobId}:`, error);
          // Job will remain in queued state and can be processed later
        });
      }
    } catch (error) {
      // Ignore errors - job will be processed by /api/jobs/process-queued or cron
      console.error("Failed to start job processing:", error);
    }

    const response: JobDTO = job;

    return new Response(JSON.stringify(response), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: {
            code: "validation_error",
            message: "Invalid request data",
            details: error.errors,
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    if (error instanceof ApiError) {
      return error.toResponse();
    }
    return new Response(JSON.stringify({ error: { code: "internal", message: "Internal server error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
