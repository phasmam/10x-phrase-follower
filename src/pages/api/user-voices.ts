import type { APIContext } from "astro";
import { createClient } from "@supabase/supabase-js";
import { createApiError } from "../../lib/errors";
import { DEFAULT_USER_ID } from "../../db/supabase.client";
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
    let supabase = context.locals.supabase;

    // In development mode, use service role key to bypass RLS
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
