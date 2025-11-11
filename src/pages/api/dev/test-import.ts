export async function GET() {
  try {
    // Test importing the job worker
    const { JobWorker } = await import("../../../lib/job-worker");

    return new Response(
      JSON.stringify({
        success: true,
        message: "JobWorker imported successfully",
        workerClass: typeof JobWorker,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Import test failed:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
