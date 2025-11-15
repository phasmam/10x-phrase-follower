import { createClient } from "@supabase/supabase-js";
import { JobWorker } from "../../../lib/job-worker";

const DEFAULT_USER_ID = "0a1f3212-c55f-4a62-bc0f-4121a7a72283";

export async function POST() {
  try {
    const supabaseUrl = import.meta.env.SUPABASE_URL || (typeof process !== "undefined" && process.env.SUPABASE_URL);
    const supabaseServiceKey =
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
      (typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY);

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get the latest job for the user
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("*")
      .eq("user_id", DEFAULT_USER_ID)
      .order("created_at", { ascending: false })
      .limit(1);

    if (jobsError) {
      throw new Error(`Failed to fetch jobs: ${jobsError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No jobs found",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const job = jobs[0];
    console.log("Testing job processing for job:", job.id);

    // Test the job worker
    const worker = new JobWorker(supabaseUrl, supabaseServiceKey);

    try {
      await worker.processJob(job.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Job ${job.id} processed successfully`,
          job_state: job.state,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Job processing error:", error);

      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          job_id: job.id,
          job_state: job.state,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Failed to test job processing:", error);

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
