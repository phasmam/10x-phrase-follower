import type { APIContext } from "astro";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { ApiErrors, ApiErrorCode } from "../../lib/errors";
import type { TtsCredentialsStateDTO, TestTtsCredentialsCommand, SaveTtsCredentialsCommand } from "../../types";
import { encrypt, decrypt, generateKeyFingerprint } from "../../lib/tts-encryption";
import { DEFAULT_USER_ID } from "../../db/supabase.client";

export const prerender = false;

// Validation schemas
const TestTtsCredentialsSchema = z.object({
  google_api_key: z.string().min(1, "API key is required"),
});

const SaveTtsCredentialsSchema = z.object({
  google_api_key: z.string().min(1, "API key is required"),
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

// Helper function to test TTS credentials with Google
async function testTtsCredentials(apiKey: string): Promise<{ ok: boolean; voice_sampled: string }> {
  try {
    // Make a minimal test request to Google TTS API
    const response = await fetch("https://texttospeech.googleapis.com/v1/voices", {
      method: "GET",
      headers: {
        "X-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 400) {
        throw ApiErrors.invalidKey("Google TTS key is invalid");
      }
      if (response.status === 402) {
        throw ApiErrors.quotaExceeded("TTS provider quota exhausted");
      }
      if (response.status === 504) {
        throw ApiErrors.ttsTimeout("TTS provider timed out");
      }
      throw ApiErrors.internal("TTS test failed");
    }

    const data = await response.json();
    const voices = data.voices || [];
    const voiceSampled = voices.length > 0 ? voices[0].name : "en-US-Standard-A";

    return { ok: true, voice_sampled: voiceSampled };
  } catch (error) {
    if (error instanceof Error && error.message.includes("timeout")) {
      throw ApiErrors.ttsTimeout("TTS provider timed out");
    }
    throw error;
  }
}

export async function GET(context: APIContext) {
  try {
    const userId = getUserId(context);
    const supabase = getSupabaseClient(context);

    // Get current TTS credentials state
    const { data: credentials, error } = await supabase
      .from("tts_credentials")
      .select("is_configured, last_validated_at, key_fingerprint")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw ApiErrors.internal("Failed to fetch TTS credentials");
    }

    const state: TtsCredentialsStateDTO = credentials || {
      is_configured: false,
      last_validated_at: null,
      key_fingerprint: null,
    };

    return new Response(JSON.stringify(state), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return new Response(JSON.stringify({ error: { code: (error as any).code, message: error.message } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: { code: "internal", message: "Internal server error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function PUT(context: APIContext) {
  try {
    const userId = getUserId(context);
    const supabase = getSupabaseClient(context);

    // Parse and validate request body
    const body = await context.request.json();
    const { google_api_key } = SaveTtsCredentialsSchema.parse(body);

    // Test the credentials first (skip in development with mock keys)
    if (import.meta.env.NODE_ENV === "development" && google_api_key.startsWith("AIzaSyA-4j")) {
      // Skip TTS test in development mode with mock keys
    } else {
      try {
        const testResult = await testTtsCredentials(google_api_key);
        
        if (!testResult.ok) {
          throw ApiErrors.invalidKey("TTS credentials test failed");
        }
      } catch (error) {
        // Re-throw API errors as-is
        if (error instanceof Error && "code" in error) {
          throw error;
        }
        // Handle unexpected errors
        throw ApiErrors.invalidKey("TTS credentials test failed");
      }
    }

    // Encrypt the API key
    const encryptedKey = await encrypt(google_api_key);
    const keyFingerprint = generateKeyFingerprint(google_api_key);

    // Convert Buffer to base64 string for storage
    const encryptedKeyBase64 = encryptedKey.toString('base64');

    // Save or update credentials
    const { error } = await supabase
      .from("tts_credentials")
      .upsert({
        user_id: userId,
        encrypted_key: encryptedKeyBase64,
        key_fingerprint: keyFingerprint,
        last_validated_at: new Date().toISOString(),
        is_configured: true,
      });

    if (error) {
      throw ApiErrors.internal("Failed to save TTS credentials");
    }

    const state: TtsCredentialsStateDTO = {
      is_configured: true,
      last_validated_at: new Date().toISOString(),
      key_fingerprint: keyFingerprint,
    };

    return new Response(JSON.stringify(state), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: {
            code: "validation_error" as ApiErrorCode,
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
      const status = (error as any).code === "unauthorized" ? 401 : 400;
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

export async function DELETE(context: APIContext) {
  try {
    const userId = getUserId(context);
    const supabase = getSupabaseClient(context);

    // Delete TTS credentials
    const { error } = await supabase.from("tts_credentials").delete().eq("user_id", userId);

    if (error) {
      throw ApiErrors.internal("Failed to delete TTS credentials");
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return new Response(JSON.stringify({ error: { code: (error as any).code, message: error.message } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: { code: "internal", message: "Internal server error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
