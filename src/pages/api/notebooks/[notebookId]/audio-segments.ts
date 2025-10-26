import type { APIContext } from "astro";
import { z } from "zod";
import { ApiErrors } from "../../../../lib/errors";
import type { AudioSegmentListResponse } from "../../../../types";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_USER_ID } from "../../../../db/supabase.client";

export const prerender = false;

// Validation schemas
const VoiceSlotSchema = z.enum(["EN1", "EN2", "EN3", "PL"]);
const AudioStatusSchema = z.enum(["complete", "failed", "missing"]);

// Helper function to get user ID from context
function getUserId(context: APIContext): string {
  const userId = context.locals.userId;
  if (!userId) {
    throw ApiErrors.unauthorized("Authentication required");
  }
  return userId;
}

// Helper function to parse query parameters
function parseQueryParams(url: URL) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);
  const cursor = url.searchParams.get("cursor");
  const phraseId = url.searchParams.get("phrase_id");
  const voiceSlot = url.searchParams.get("voice_slot");
  const status = url.searchParams.get("status");

  return {
    limit,
    cursor,
    phraseId,
    voiceSlot: voiceSlot ? VoiceSlotSchema.parse(voiceSlot) : undefined,
    status: status ? AudioStatusSchema.parse(status) : undefined,
  };
}

export async function GET(context: APIContext) {
  try {
    const userId = getUserId(context);

    // In development, use service role key to bypass RLS
    let supabase = context.locals.supabase;
    if (import.meta.env.NODE_ENV === "development" && userId === DEFAULT_USER_ID) {
      const supabaseUrl = import.meta.env.SUPABASE_URL;
      const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseServiceKey) {
        supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        });
      }
    }

    // Parse and validate path parameter
    const notebookId = context.params.notebookId;
    if (!notebookId) {
      throw ApiErrors.validationError("Notebook ID is required");
    }

    // Parse query parameters
    const { limit, cursor, phraseId, voiceSlot, status } = parseQueryParams(new URL(context.request.url));

    // Build query - only get active segments
    let query = supabase
      .from("audio_segments")
      .select(
        `
        id, phrase_id, voice_slot, build_id, path, duration_ms, size_bytes,
        sample_rate_hz, bitrate_kbps, status, error_code, word_timings,
        is_active, created_at, updated_at
      `
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // Get one extra to check if there are more

    // Add filters
    if (phraseId) {
      query = query.eq("phrase_id", phraseId);
    }
    if (voiceSlot) {
      query = query.eq("voice_slot", voiceSlot);
    }
    if (status) {
      query = query.eq("status", status);
    }

    if (cursor) {
      // Simple cursor-based pagination using created_at
      query = query.lt("created_at", cursor);
    }

    const { data: segments, error } = await query;

    if (error) {
      throw ApiErrors.internal("Failed to fetch audio segments");
    }

    // Check if there are more items
    const hasMore = segments && segments.length > limit;
    const items = hasMore ? segments.slice(0, limit) : segments || [];
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

    const response: AudioSegmentListResponse = {
      items,
      next_cursor: nextCursor,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: {
            code: "validation_error",
            message: "Invalid query parameters",
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
