import type { APIRoute } from "astro";
import type { UserDTO } from "../../../types";
import type { LocalsWithAuth } from "../../../lib/types";
import { ApiErrors, withErrorHandling, requireAuth } from "../../../lib/errors";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_USER_ID } from "../../../db/supabase.client";

export const prerender = false;

const getUserProfile = async ({ locals }: { locals: LocalsWithAuth }): Promise<Response> => {
  requireAuth(locals.userId);

  // In development, use service role key to bypass RLS
  let supabase = locals.supabase;
  if (import.meta.env.NODE_ENV === "development" && locals.userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL || (typeof process !== "undefined" && process.env.SUPABASE_URL);
    const supabaseServiceKey =
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
      (typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  // Query user profile
  const { data: user, error } = await supabase.from("users").select("id, created_at").eq("id", locals.userId).single();

  if (error || !user) {
    throw ApiErrors.notFound("User not found");
  }

  const response: UserDTO = {
    id: user.id,
    created_at: user.created_at,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const GET: APIRoute = withErrorHandling(getUserProfile);
