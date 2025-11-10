import { APIContext } from "astro";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../../../lib/tts-encryption";

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

    // Get TTS credentials
    const { data: ttsCredentials, error: ttsError } = await supabase
      .from("tts_credentials")
      .select("encrypted_key")
      .eq("user_id", DEFAULT_USER_ID)
      .single();

    if (ttsError || !ttsCredentials) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `TTS credentials error: ${ttsError?.message}`,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log("TTS credentials found, testing decryption...");
    console.log("Encrypted key type:", typeof ttsCredentials.encrypted_key);
    console.log("Encrypted key length:", ttsCredentials.encrypted_key?.length);
    console.log("Encrypted key first 50 chars:", ttsCredentials.encrypted_key?.substring(0, 50));

    try {
      const decryptedKey = await decrypt(ttsCredentials.encrypted_key);
      console.log("Decryption successful!");
      console.log("Decrypted key length:", decryptedKey.length);
      console.log("Decrypted key first 10 chars:", decryptedKey.substring(0, 10));

      return new Response(
        JSON.stringify({
          success: true,
          message: "TTS decryption successful",
          key_length: decryptedKey.length,
          key_preview: decryptedKey.substring(0, 10) + "...",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (decryptError) {
      console.error("Decryption failed:", decryptError);

      return new Response(
        JSON.stringify({
          success: false,
          error: `Decryption failed: ${decryptError instanceof Error ? decryptError.message : "Unknown error"}`,
          encrypted_type: typeof ttsCredentials.encrypted_key,
          encrypted_length: ttsCredentials.encrypted_key?.length,
          encrypted_preview: ttsCredentials.encrypted_key?.substring(0, 50),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Test TTS credentials error:", error);

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
