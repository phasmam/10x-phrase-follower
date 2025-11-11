import type { APIContext } from "astro";
import { z } from "zod";
import { ApiError, ApiErrors } from "../../../lib/errors";

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
      if (response.status === 401) {
        throw ApiErrors.invalidKey("Google TTS key is invalid or unauthorized");
      }
      if (response.status === 402) {
        throw ApiErrors.quotaExceeded("TTS provider quota exhausted");
      }
      if (response.status === 504) {
        throw ApiErrors.ttsTimeout("TTS provider timed out");
      }
      // Log the actual error for debugging
      console.error("Google TTS API error:", response.status, response.statusText);
      throw ApiErrors.internal(`TTS test failed with status ${response.status}`);
    }

    const data = await response.json();
    const voices = data.voices || [];
    const voiceSampled = voices.length > 0 ? voices[0].name : "en-US-Standard-A";

    return { ok: true, voice_sampled: voiceSampled };
  } catch (error) {
    if (error instanceof Error && error.message.includes("timeout")) {
      throw ApiErrors.ttsTimeout("TTS provider timed out");
    }
    // Re-throw API errors as-is
    if (error instanceof Error && "code" in error) {
      throw error;
    }
    // Log unexpected errors
    console.error("Unexpected error in testTtsCredentials:", error);
    throw ApiErrors.internal("TTS test failed due to unexpected error");
  }
}

export async function POST(context: APIContext) {
  try {
    const userId = getUserId(context);
    console.log("TTS test endpoint called by user:", userId);

    // Parse and validate request body
    const body = await context.request.json();
    console.log("Request body received");

    const { api_key, provider } = TestTtsCredentialsSchema.parse(body);
    console.log("Parsed data:", { api_key: api_key.substring(0, 10) + "...", provider });

    if (provider !== "google") {
      throw ApiErrors.validationError("Only Google TTS is supported");
    }

    console.log("About to test TTS credentials...");
    // Test the credentials
    const result = await testTtsCredentials(api_key);
    console.log("TTS test result:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("TTS test endpoint error:", error);

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
    if (error instanceof ApiError) {
      return error.toResponse();
    }
    return new Response(JSON.stringify({ error: { code: "internal", message: "Internal server error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
