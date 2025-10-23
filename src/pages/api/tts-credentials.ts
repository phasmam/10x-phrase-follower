import type { APIContext } from "astro";
import { z } from "zod";
import { createApiError, ApiErrorCode } from "../../lib/errors";
import type { TtsCredentialsStateDTO, TestTtsCredentialsCommand, SaveTtsCredentialsCommand } from "../../types";
import { encrypt, decrypt, generateKeyFingerprint } from "../../lib/tts-encryption";

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
    throw createApiError("unauthorized", "Authentication required");
  }
  return userId;
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
        throw createApiError("invalid_key", "Google TTS key is invalid");
      }
      if (response.status === 402) {
        throw createApiError("quota_exceeded", "TTS provider quota exhausted");
      }
      if (response.status === 504) {
        throw createApiError("tts_timeout", "TTS provider timed out");
      }
      throw createApiError("internal", "TTS test failed");
    }

    const data = await response.json();
    const voices = data.voices || [];
    const voiceSampled = voices.length > 0 ? voices[0].name : "en-US-Standard-A";

    return { ok: true, voice_sampled: voiceSampled };
  } catch (error) {
    if (error instanceof Error && error.message.includes("timeout")) {
      throw createApiError("tts_timeout", "TTS provider timed out");
    }
    throw error;
  }
}

export async function GET(context: APIContext) {
  try {
    const userId = getUserId(context);
    const supabase = context.locals.supabase;

    // Get current TTS credentials state
    const { data: credentials, error } = await supabase
      .from("tts_credentials")
      .select("is_configured, last_validated_at, key_fingerprint")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw createApiError("internal", "Failed to fetch TTS credentials");
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
    const supabase = context.locals.supabase;

    // Parse and validate request body
    const body = await context.request.json();
    const { google_api_key } = SaveTtsCredentialsSchema.parse(body);

    // Test the credentials first
    const testResult = await testTtsCredentials(google_api_key);
    if (!testResult.ok) {
      throw createApiError("invalid_key", "TTS credentials test failed");
    }

    // Encrypt the API key
    const encryptedKey = await encrypt(google_api_key);
    const keyFingerprint = generateKeyFingerprint(google_api_key);

    // Save or update credentials
    const { error } = await supabase
      .from("tts_credentials")
      .upsert({
        user_id: userId,
        encrypted_key: encryptedKey,
        key_fingerprint: keyFingerprint,
        last_validated_at: new Date().toISOString(),
        is_configured: true,
      });

    if (error) {
      throw createApiError("internal", "Failed to save TTS credentials");
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
    const supabase = context.locals.supabase;

    // Delete TTS credentials
    const { error } = await supabase.from("tts_credentials").delete().eq("user_id", userId);

    if (error) {
      throw createApiError("internal", "Failed to delete TTS credentials");
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
