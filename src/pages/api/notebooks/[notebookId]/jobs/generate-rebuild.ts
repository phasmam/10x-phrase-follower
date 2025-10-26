import type { APIContext } from "astro";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { ApiErrors } from "../../../../../lib/errors";
import type { JobDTO } from "../../../../../types";
import { DEFAULT_USER_ID } from "../../../../../db/supabase.client";

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

// Helper function to get the appropriate Supabase client
function getSupabaseClient(context: APIContext) {
  const userId = context.locals.userId;
  
  // In development mode with DEFAULT_USER_ID, use service role key to bypass RLS
  if (import.meta.env.NODE_ENV === "development" && userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (supabaseServiceKey) {
      return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }
  
  // Otherwise, use the regular client from context
  return context.locals.supabase;
}

// Helper function to check TTS credentials
async function checkTtsCredentials(supabase: any, userId: string): Promise<void> {
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
async function checkUserVoices(supabase: any, userId: string): Promise<void> {
  const { data: voices, error } = await supabase
    .from("user_voices")
    .select("slot, language")
    .eq("user_id", userId);

  if (error) {
    throw ApiErrors.internal("Failed to check user voices");
  }

  if (!voices || voices.length === 0) {
    throw ApiErrors.validationError("No voice configurations found");
  }

  // Check for required slots (at least one EN and one PL)
  const hasEn = voices.some((v: any) => ["EN1", "EN2", "EN3"].includes(v.slot));
  const hasPl = voices.some((v: any) => v.slot === "PL");

  if (!hasEn || !hasPl) {
    throw ApiErrors.validationError("Voice configuration incomplete - need at least one EN slot and PL slot");
  }
}

// Helper function to check for active jobs
async function checkActiveJobs(supabase: any, notebookId: string): Promise<void> {
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
    const jobId = crypto.randomUUID();
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
      .select("id, type, state, notebook_id, started_at, ended_at, timeout_sec, created_at")
      .single();

    if (error) {
      throw ApiErrors.internal("Failed to create job");
    }

    // Process the job immediately
    try {
      const { JobWorker } = await import("../../../../lib/job-worker");
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseServiceKey) {
        const worker = new JobWorker(supabaseUrl, supabaseServiceKey);
        // Process the job in the background (non-blocking)
        worker.processJob(jobId).catch((error) => {
          console.error("Failed to process job:", error);
          // Update job state to failed
          supabase
            .from("jobs")
            .update({ 
              state: "failed", 
              error: error.message,
              ended_at: new Date().toISOString()
            })
            .eq("id", jobId)
            .then(() => {
              console.log(`Job ${jobId} marked as failed: ${error.message}`);
            })
            .catch((updateError) => {
              console.error("Failed to update job state:", updateError);
            });
        });
      } else {
        console.error("Missing Supabase configuration for job processing");
      }
    } catch (error) {
      console.error("Failed to import or start job processing:", error);
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
    if (error instanceof Error && "code" in error) {
      const status = (error as any).code === "unauthorized" ? 401 : 
                    (error as any).code === "conflict" ? 409 : 400;
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
