import type { APIContext } from "astro";
import { ApiError, ApiErrors } from "../../lib/errors";
import { getSupabaseClient } from "../../lib/utils";
import type { UserVoicesListResponse } from "../../types";

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
    const userId = getUserId(context);
    console.log("[user-voices GET] userId:", userId);
    const supabase = getSupabaseClient(context);

    // Get all voice slots for the user
    const { data: voices, error } = await supabase
      .from("user_voices")
      .select("id, slot, language, voice_id, created_at")
      .eq("user_id", userId)
      .order("slot");

    console.log("[user-voices GET] Query result - voices:", voices, "error:", error);

    if (error) {
      throw ApiErrors.internal("Failed to fetch user voices");
    }

    const response: UserVoicesListResponse = {
      slots: voices || [],
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
