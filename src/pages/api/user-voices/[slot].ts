import type { APIContext } from "astro";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "../../../db/database.types";
import { ApiError, ApiErrors } from "../../../lib/errors";
import type { UserVoiceDTO } from "../../../types";
import { ensureUserExists, getSupabaseClient } from "../../../lib/utils";

type SupabaseClient = ReturnType<typeof createClient<Database>>;

export const prerender = false;

// Validation schemas
const SlotParamSchema = z.enum(["EN1", "EN2", "EN3", "PL"]);
const UpsertUserVoiceSchema = z.object({
  language: z.string().min(1, "Language is required"),
  voice_id: z.string().min(1, "Voice ID is required"),
});

// Helper function to get user ID from context
function getUserId(context: APIContext): string {
  const userId = context.locals.userId;
  if (!userId) {
    throw ApiErrors.unauthorized("Authentication required");
  }
  return userId;
}

// Helper function to validate slot-language consistency
function validateSlotLanguage(slot: string, language: string): void {
  const isEnglishSlot = ["EN1", "EN2", "EN3"].includes(slot);
  const isPolishSlot = slot === "PL";

  if (isEnglishSlot && language !== "en") {
    throw ApiErrors.validationError(`Slot ${slot} requires language 'en'`);
  }
  if (isPolishSlot && language !== "pl") {
    throw ApiErrors.validationError(`Slot ${slot} requires language 'pl'`);
  }
}

// Helper function to check for duplicate EN voices
async function checkDuplicateEnVoices(
  supabase: SupabaseClient,
  userId: string,
  slot: "EN1" | "EN2" | "EN3" | "PL",
  voiceId: string
): Promise<void> {
  if (!["EN1", "EN2", "EN3"].includes(slot)) {
    return; // Only check for EN slots
  }

  const { data: existingVoices, error } = await supabase
    .from("user_voices")
    .select("slot, voice_id")
    .eq("user_id", userId)
    .in("slot", ["EN1", "EN2", "EN3"])
    .neq("slot", slot); // Exclude current slot

  if (error) {
    throw ApiErrors.internal("Failed to check for duplicate voices");
  }

  const duplicateVoice = existingVoices?.find((v) => v.voice_id === voiceId);
  if (duplicateVoice) {
    throw ApiErrors.conflict(`Voice ${voiceId} is already used in slot ${duplicateVoice.slot}`);
  }
}

export async function PUT(context: APIContext) {
  try {
    const userId = getUserId(context);
    const supabase = getSupabaseClient(context);

    // Ensure user exists in the users table before saving voice configuration
    // This is needed because users are created in auth.users by Supabase Auth,
    // but we need a corresponding row in the public.users table for foreign key constraints
    await ensureUserExists(supabase, userId);

    // Parse and validate path parameter
    const slot = context.params.slot;
    if (!slot) {
      throw ApiErrors.validationError("Slot parameter is required");
    }
    const validatedSlot = SlotParamSchema.parse(slot);

    // Parse and validate request body
    const body = await context.request.json();
    const { language, voice_id } = UpsertUserVoiceSchema.parse(body);

    // Validate slot-language consistency
    validateSlotLanguage(validatedSlot, language);

    // Check for duplicate EN voices
    await checkDuplicateEnVoices(supabase, userId, validatedSlot, voice_id);

    // Upsert the voice configuration
    const { data: voice, error } = await supabase
      .from("user_voices")
      .upsert(
        {
          id: randomUUID(),
          user_id: userId,
          slot: validatedSlot,
          language,
          voice_id,
        },
        {
          onConflict: "user_id,slot",
        }
      )
      .select("id, slot, language, voice_id, created_at")
      .single();

    if (error) {
      console.error("Database error:", error);
      if (error.code === "23505") {
        throw ApiErrors.conflict("Voice configuration conflict");
      }
      throw ApiErrors.internal(`Failed to save voice configuration: ${error.message}`);
    }

    const response: UserVoiceDTO = voice;

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
