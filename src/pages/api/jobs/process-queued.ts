import type { APIContext } from "astro";
import { getSupabaseEnvVars } from "../../../lib/utils";
import { JobWorker } from "../../../lib/job-worker";
import { setRuntimeEnv } from "../../../lib/tts-encryption";

export const prerender = false;

/**
 * Process queued jobs
 * This endpoint can be called by:
 * - Cloudflare Cron Trigger (recommended)
 * - Manual API call
 * - Frontend polling (not recommended for production)
 */
export async function POST(context: APIContext) {
  try {
    // Pass Cloudflare runtime env to crypto utils if available (adapter puts it on locals.runtime.env)
    const localsAny = context.locals as unknown as {
      runtime?: { env?: Record<string, string | undefined> };
    };
    if (localsAny.runtime?.env) {
      setRuntimeEnv(localsAny.runtime.env);
    }

    // Read Supabase env vars from multiple sources (including Cloudflare runtime)
    const { supabaseUrl, supabaseServiceKey } = getSupabaseEnvVars(context);

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Supabase configuration",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const worker = new JobWorker(supabaseUrl, supabaseServiceKey);
    await worker.processQueuedJobs();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Queued jobs processed",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Failed to process queued jobs:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Also support GET for easier testing
export async function GET(context: APIContext) {
  return POST(context);
}
