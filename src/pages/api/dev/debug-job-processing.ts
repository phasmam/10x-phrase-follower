import { APIContext } from "astro";
import { createClient } from "@supabase/supabase-js";
import { JobWorker } from "../../../lib/job-worker";

const DEFAULT_USER_ID = "0a1f3212-c55f-4a62-bc0f-4121a7a72283";

export async function POST(context: APIContext) {
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

    // Get all jobs for the user
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("*")
      .eq("user_id", DEFAULT_USER_ID)
      .order("created_at", { ascending: false });

    if (jobsError) {
      throw new Error(`Failed to fetch jobs: ${jobsError.message}`);
    }

    // Get TTS credentials
    const { data: ttsCredentials, error: ttsError } = await supabase
      .from("tts_credentials")
      .select("*")
      .eq("user_id", DEFAULT_USER_ID)
      .single();

    // Get user voices
    const { data: userVoices, error: voicesError } = await supabase
      .from("user_voices")
      .select("*")
      .eq("user_id", DEFAULT_USER_ID)
      .order("slot");

    // Get phrases for all notebooks
    const { data: phrasesData, error: phrasesError } = await supabase.from("phrases").select("*").order("position");

    const phrases = phrasesData || [];

    return new Response(
      JSON.stringify({
        success: true,
        debug_info: {
          jobs_count: jobs?.length || 0,
          jobs: jobs || [],
          tts_configured: !!ttsCredentials,
          tts_error: ttsError?.message,
          voices_count: userVoices?.length || 0,
          voices: userVoices || [],
          voices_error: voicesError?.message,
          phrases_count: phrases.length,
          phrases: phrases,
          supabase_url: supabaseUrl ? "configured" : "missing",
          service_key: supabaseServiceKey ? "configured" : "missing",
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Debug job processing error:", error);

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
