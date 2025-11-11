import type { APIContext } from "astro";
import { ApiError, ApiErrors } from "../../../lib/errors";
import type { AudioSegmentDTO, WordTiming } from "../../../types";

export const prerender = false;

// Helper function to get user ID from context
function getUserId(context: APIContext): string {
  const userId = context.locals.userId;
  if (!userId) {
    throw ApiErrors.unauthorized("Authentication required");
  }
  return userId;
}

export async function GET(context: APIContext) {
  try {
    getUserId(context); // Verify authentication
    const supabase = context.locals.supabase;

    // Parse and validate path parameter
    const audioSegmentId = context.params.audioSegmentId;
    if (!audioSegmentId) {
      throw ApiErrors.validationError("Audio segment ID is required");
    }

    // Get the audio segment (with RLS ensuring user can only access their own segments)
    const { data: segment, error } = await supabase
      .from("audio_segments")
      .select(
        `
        id, phrase_id, voice_slot, build_id, path, duration_ms, size_bytes,
        sample_rate_hz, bitrate_kbps, status, error_code, word_timings,
        is_active, created_at, updated_at
      `
      )
      .eq("id", audioSegmentId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw ApiErrors.notFound("Audio segment not found");
      }
      throw ApiErrors.internal("Failed to fetch audio segment");
    }

    const response: AudioSegmentDTO = {
      ...segment,
      word_timings: segment.word_timings as WordTiming[] | null,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return error.toResponse();
    }
    return new Response(JSON.stringify({ error: { code: "internal", message: "Internal server error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
