import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { createClient } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import type { Database } from "../db/database.types";
import { ApiErrors } from "./errors";
import { DEFAULT_USER_ID } from "../db/supabase.client";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Gets the appropriate Supabase client for the current request context.
 * In development with DEFAULT_USER_ID, uses service role key to bypass RLS.
 * In production, creates an authenticated client with the user's JWT token.
 * This is required for RLS policies to work (they check auth.uid()).
 *
 * @param context - Astro API context
 * @returns Supabase client instance
 */
export function getSupabaseClient(context: APIContext): ReturnType<typeof createClient<Database>> {
  const userId = context.locals.userId;

  // In development mode with DEFAULT_USER_ID, use service role key to bypass RLS
  if (import.meta.env.NODE_ENV === "development" && userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseServiceKey) {
      return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  // For authenticated users, create a client with their token for RLS
  // This is required for RLS policies to work (they check auth.uid())
  if (userId) {
    const authHeader = context.request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_KEY || import.meta.env.SUPABASE_KEY;

      if (supabaseUrl && supabaseAnonKey) {
        // Create an authenticated client with the user's token
        // The Authorization header in global.headers allows PostgREST to extract the JWT
        // and make auth.uid() available to RLS policies
        const client = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });
        
        // Also set the token directly in the auth state for RLS
        // This ensures the client is properly authenticated
        client.auth.setSession({
          access_token: token,
          refresh_token: '',
        }).catch(() => {
          // Ignore errors - the global header should still work
        });
        
        return client;
      }
    }
  }

  // Fallback to the regular client from context
  return context.locals.supabase;
}

/**
 * Ensures a user exists in the users table.
 * This is needed because users are created in auth.users by Supabase Auth,
 * but we need a corresponding row in the public.users table for foreign key constraints.
 *
 * @param supabase - Supabase client instance
 * @param userId - The user ID to ensure exists
 * @throws {ApiError} If there's an error checking or creating the user
 */
export async function ensureUserExists(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string
): Promise<void> {
  // Check if user exists
  const { data: existingUser, error: selectError } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .single();

  // If user exists, we're done
  if (existingUser) {
    return;
  }

  // If error is not "not found", something else went wrong
  if (selectError && selectError.code !== "PGRST116") {
    // eslint-disable-next-line no-console
    console.error("Error checking user existence:", selectError);
    throw ApiErrors.internal("Failed to verify user existence");
  }

  // User doesn't exist, create them
  // The created_at column has a default value, so we only need to provide id
  const { error: insertError } = await supabase.from("users").insert({
    id: userId,
  });

  if (insertError) {
    // If it's a unique constraint violation, the user was created between our check and insert
    // This is fine, we can ignore it
    if (insertError.code === "23505") {
      return;
    }
    // eslint-disable-next-line no-console
    console.error("Error creating user:", insertError);
    throw ApiErrors.internal(`Failed to create user record: ${insertError.message}`);
  }
}
