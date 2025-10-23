import type { APIContext } from "astro";
import { z } from "zod";
import { createApiError } from "../../../lib/errors";

export const prerender = false;

// Validation schema
const TestTtsCredentialsSchema = z.object({
  api_key: z.string().min(1, "API key is required"),
  provider: z.enum(["google"]),
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

export async function POST(context: APIContext) {
  try {
    const userId = getUserId(context);

    // Parse and validate request body
    const body = await context.request.json();
    const { api_key, provider } = TestTtsCredentialsSchema.parse(body);

    if (provider !== "google") {
      throw createApiError("unsupported_provider", "Only Google TTS is supported");
    }

    // Test the credentials
    const result = await testTtsCredentials(api_key);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: {
            code: "validation_error",
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
