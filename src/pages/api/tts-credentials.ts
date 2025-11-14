import type { APIContext } from "astro";
import { z } from "zod";
import { ApiErrors } from "../../lib/errors";
import type { ApiErrorCode, TtsCredentialsStateDTO } from "../../types";
import { encrypt, generateKeyFingerprint, setRuntimeEnv } from "../../lib/tts-encryption";
import { ensureUserExists, getSupabaseClient } from "../../lib/utils";

export const prerender = false;

type ErrorWithCode = Error & { code: ApiErrorCode };

function isErrorWithCode(error: unknown): error is ErrorWithCode {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as Error & { code?: unknown };
  return typeof candidate.code === "string";
}

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
    // Pass Cloudflare runtime env to crypto utils if available (adapter puts it on locals.runtime.env)
    const localsAny = context.locals as unknown as {
      runtime?: { env?: Record<string, string | undefined> };
    };
    if (localsAny.runtime?.env) {
      setRuntimeEnv(localsAny.runtime.env);
    }
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
    if (isErrorWithCode(error)) {
      return new Response(JSON.stringify({ error: { code: error.code, message: error.message } }), {
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
    // Pass Cloudflare runtime env to crypto utils if available (adapter puts it on locals.runtime.env)
    const localsAny = context.locals as unknown as {
      runtime?: { env?: Record<string, string | undefined> };
    };
    if (localsAny.runtime?.env) {
      setRuntimeEnv(localsAny.runtime.env);
    }
    const userId = getUserId(context);
    const supabase = getSupabaseClient(context);

    // Ensure user exists in the users table before saving credentials
    // This is needed because users are created in auth.users by Supabase Auth,
    // but we need a corresponding row in the public.users table for foreign key constraints
    await ensureUserExists(supabase, userId);

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
    let encryptedKey: Buffer;
    try {
      encryptedKey = await encrypt(google_api_key);
    } catch (encryptError) {
      // eslint-disable-next-line no-console
      console.error("Encryption failed:", encryptError);
      const errorMessage = encryptError instanceof Error ? encryptError.message : "Encryption failed";
      throw ApiErrors.internal(`Failed to encrypt TTS credentials: ${errorMessage}`);
    }

    const keyFingerprint = await generateKeyFingerprint(google_api_key);

    // Convert encrypted bytes to base64 string for storage
    let encryptedKeyBase64: string;
    if (typeof Buffer !== "undefined" && encryptedKey instanceof Buffer) {
      encryptedKeyBase64 = encryptedKey.toString("base64");
    } else if (encryptedKey instanceof Uint8Array) {
      let binary = "";
      for (const byte of encryptedKey) {
        binary += String.fromCharCode(byte);
      }
      encryptedKeyBase64 = btoa(binary);
    } else {
      // Fallback – should not normally happen
      encryptedKeyBase64 = String(encryptedKey);
    }

    // Save or update credentials
    const { error } = await supabase.from("tts_credentials").upsert({
      user_id: userId,
      encrypted_key: encryptedKeyBase64,
      key_fingerprint: keyFingerprint,
      last_validated_at: new Date().toISOString(),
      is_configured: true,
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Supabase upsert error:", error);
      throw ApiErrors.internal(`Failed to save TTS credentials: ${error.message || "Database error"}`);
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
    if (isErrorWithCode(error)) {
      const status = error.code === "unauthorized" ? 401 : 400;
      return new Response(JSON.stringify({ error: { code: error.code, message: error.message } }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Log unexpected errors for debugging
    // eslint-disable-next-line no-console
    console.error("Unexpected error in PUT /api/tts-credentials:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({
        error: {
          code: "internal",
          message: import.meta.env.MODE === "development" ? errorMessage : "Internal server error",
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function DELETE(context: APIContext) {
  try {
    // Pass Cloudflare runtime env to crypto utils if available (adapter puts it on locals.runtime.env)
    const localsAny = context.locals as unknown as {
      runtime?: { env?: Record<string, string | undefined> };
    };
    if (localsAny.runtime?.env) {
      setRuntimeEnv(localsAny.runtime.env);
    }
    const userId = getUserId(context);
    const supabase = getSupabaseClient(context);

    // Delete TTS credentials
    const { error } = await supabase.from("tts_credentials").delete().eq("user_id", userId);

    if (error) {
      throw ApiErrors.internal("Failed to delete TTS credentials");
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    if (isErrorWithCode(error)) {
      return new Response(JSON.stringify({ error: { code: error.code, message: error.message } }), {
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
