import type { APIContext } from "astro";
import { createApiError } from "../../lib/errors";
import type { UserVoicesListResponse } from "../../types";

export const prerender = false;

// Helper function to get user ID from context
function getUserId(context: APIContext): string {
  const userId = context.locals.userId;
  if (!userId) {
    throw createApiError("unauthorized", "Authentication required");
  }
  return userId;
}

export async function GET(context: APIContext) {
  try {
    const userId = getUserId(context);
    const supabase = context.locals.supabase;

    // Get all voice slots for the user
    const { data: voices, error } = await supabase
      .from("user_voices")
      .select("id, slot, language, voice_id, created_at")
      .eq("user_id", userId)
      .order("slot");

    if (error) {
      throw createApiError("internal", "Failed to fetch user voices");
    }

    const response: UserVoicesListResponse = {
      slots: voices || [],
    };

    return new Response(JSON.stringify(response), {
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
