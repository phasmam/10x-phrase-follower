import type { APIContext } from "astro";
import { z } from "zod";
import { ApiErrors } from "../../../../lib/errors";
import type { PlaybackManifestDTO } from "../../../../types";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_USER_ID } from "../../../../db/supabase.client";

export const prerender = false;

// Validation schemas
const PlaybackSpeedSchema = z.enum(["0.75", "0.9", "1", "1.25"]);
const HighlightSchema = z.enum(["on", "off"]);

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
  const phraseIds = url.searchParams.get("phrase_ids");
  const speed = url.searchParams.get("speed");
  const highlight = url.searchParams.get("highlight");
  
  return {
    phraseIds: phraseIds ? phraseIds.split(",") : undefined,
    speed: speed ? PlaybackSpeedSchema.parse(speed) : undefined,
    highlight: highlight ? HighlightSchema.parse(highlight) : undefined,
  };
}

// Helper function to generate signed URLs for storage
async function generateSignedUrls(supabase: any, segments: any[]): Promise<any[]> {
  const signedSegments = [];
  
  for (const segment of segments) {
    if (segment.status === "complete") {
      try {
        // Generate signed URL with 5 minute TTL
        const { data: signedUrl, error } = await supabase.storage
          .from("audio")
          .createSignedUrl(segment.path, 300); // 5 minutes
        
        if (error) {
          console.error(`Failed to generate signed URL for ${segment.path}:`, error);
          continue; // Skip this segment
        }
        
        signedSegments.push({
          ...segment,
          url: signedUrl.signedUrl,
        });
      } catch (error) {
        console.error(`Error generating signed URL for ${segment.path}:`, error);
        continue; // Skip this segment
      }
    }
  }
  
  return signedSegments;
}

// Helper function to order segments by voice slot (EN1→EN2→EN3→PL)
function orderSegmentsBySlot(segments: any[]): any[] {
  const slotOrder = ["EN1", "EN2", "EN3", "PL"];
  return segments.sort((a, b) => {
    const aIndex = slotOrder.indexOf(a.voice_slot);
    const bIndex = slotOrder.indexOf(b.voice_slot);
    return aIndex - bIndex;
  });
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
    const { phraseIds, speed, highlight } = parseQueryParams(new URL(context.request.url));

    // Get the current build for the notebook
    const { data: notebook, error: notebookError } = await supabase
      .from("notebooks")
      .select("current_build_id")
      .eq("id", notebookId)
      .single();

    if (notebookError) {
      if (notebookError.code === "PGRST116") {
        throw ApiErrors.notFound("Notebook not found");
      }
      throw ApiErrors.internal("Failed to fetch notebook");
    }

    if (!notebook.current_build_id) {
      // No active build, return empty manifest
      const response: PlaybackManifestDTO = {
        notebook_id: notebookId,
        build_id: null,
        sequence: [],
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes from now
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get phrases for the notebook
    let phrasesQuery = supabase
      .from("phrases")
      .select("id, position, en_text, pl_text, tokens")
      .eq("notebook_id", notebookId)
      .order("position");

    if (phraseIds && phraseIds.length > 0) {
      phrasesQuery = phrasesQuery.in("id", phraseIds);
    }

    const { data: phrases, error: phrasesError } = await phrasesQuery;

    if (phrasesError) {
      throw ApiErrors.internal("Failed to fetch phrases");
    }

    if (!phrases || phrases.length === 0) {
      // No phrases, return empty manifest
      const response: PlaybackManifestDTO = {
        notebook_id: notebookId,
        build_id: notebook.current_build_id,
        sequence: [],
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get active audio segments for the current build
    const { data: segments, error: segmentsError } = await supabase
      .from("audio_segments")
      .select(`
        id, phrase_id, voice_slot, build_id, path, duration_ms, size_bytes,
        sample_rate_hz, bitrate_kbps, status, error_code, word_timings
      `)
      .eq("build_id", notebook.current_build_id)
      .eq("is_active", true)
      .in("phrase_id", phrases.map(p => p.id));

    if (segmentsError) {
      throw ApiErrors.internal("Failed to fetch audio segments");
    }

    // Generate signed URLs for complete segments
    const signedSegments = await generateSignedUrls(supabase, segments || []);

    // Group segments by phrase
    const segmentsByPhrase = new Map<string, any[]>();
    for (const segment of signedSegments) {
      if (!segmentsByPhrase.has(segment.phrase_id)) {
        segmentsByPhrase.set(segment.phrase_id, []);
      }
      segmentsByPhrase.get(segment.phrase_id)!.push(segment);
    }

    // Build the sequence
    const sequence = phrases.map(phrase => {
      const phraseSegments = segmentsByPhrase.get(phrase.id) || [];
      const orderedSegments = orderSegmentsBySlot(phraseSegments);
      
      return {
        phrase: {
          id: phrase.id,
          position: phrase.position,
          en_text: phrase.en_text,
          pl_text: phrase.pl_text,
          tokens: phrase.tokens,
        },
        segments: orderedSegments.map(segment => ({
          slot: segment.voice_slot,
          status: segment.status,
          url: segment.url,
          duration_ms: segment.duration_ms,
          word_timings: segment.word_timings,
        })),
      };
    });

    const response: PlaybackManifestDTO = {
      notebook_id: notebookId,
      build_id: notebook.current_build_id,
      sequence,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes from now
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
      const status = (error as any).code === "unauthorized" ? 401 : 
                    (error as any).code === "not_found" ? 404 : 400;
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
