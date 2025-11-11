import { createClient } from "@supabase/supabase-js";

const DEFAULT_USER_ID = "0a1f3212-c55f-4a62-bc0f-4121a7a72283";

export async function POST() {
  try {
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

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

    // Clear all jobs for the default user
    const { error } = await supabase.from("jobs").delete().eq("user_id", DEFAULT_USER_ID);

    if (error) {
      throw new Error(`Failed to clear jobs: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "All jobs cleared",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Failed to clear jobs:", error);

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
