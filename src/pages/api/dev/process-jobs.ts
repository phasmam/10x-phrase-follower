import { APIContext } from "astro";
import { startJobWorker } from "../../../lib/job-worker";

export async function POST(context: APIContext) {
  try {
    // Start the job worker
    await startJobWorker();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Job worker started",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Failed to start job worker:", error);

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
