import { createClient } from "@supabase/supabase-js";
import { DEFAULT_USER_ID } from "../db/supabase.client";

/**
 * Development utility to create a proper Supabase user for testing
 * This creates a real user in auth.users that will work with RLS policies
 */
export async function createDevUser() {
  if (import.meta.env.NODE_ENV !== "development") {
    throw new Error("createDevUser is only available in development mode");
  }

  const supabaseUrl = import.meta.env.SUPABASE_URL || (typeof process !== "undefined" && process.env.SUPABASE_URL);
  const supabaseServiceKey =
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
    (typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseServiceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for user creation");
  }

  // Create admin client with service role key
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Create user in auth.users
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      user_id: DEFAULT_USER_ID,
      email: "dev@example.com",
      password: "password",
      email_confirm: true,
    });

    if (authError && !authError.message.includes("already")) {
      console.warn("Auth user creation failed:", authError.message);
    }

    // Create user in public.users table
    const { data: publicUser, error: publicError } = await adminClient
      .from("users")
      .insert({
        id: DEFAULT_USER_ID,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (publicError && !publicError.message.includes("already")) {
      console.warn("Public user creation failed:", publicError.message);
    }

    return {
      authUser: authUser.user,
      publicUser: publicUser,
    };
  } catch (error) {
    console.error("Failed to create dev user:", error);
    throw error;
  }
}

/**
 * Generate a proper Supabase JWT token for the dev user
 * This will work with RLS policies because it's a real Supabase token
 */
export async function generateSupabaseToken() {
  if (import.meta.env.NODE_ENV !== "development") {
    throw new Error("generateSupabaseToken is only available in development mode");
  }

  const supabaseUrl = import.meta.env.SUPABASE_URL || (typeof process !== "undefined" && process.env.SUPABASE_URL);
  const supabaseAnonKey = import.meta.env.SUPABASE_KEY || (typeof process !== "undefined" && process.env.SUPABASE_KEY);

  // Create client with anon key
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // Sign in with the dev user credentials
    const { data, error } = await supabase.auth.signInWithPassword({
      email: "dev@example.com",
      password: "password",
    });

    if (error) {
      throw new Error(`Failed to sign in: ${error.message}`);
    }

    if (!data.session?.access_token) {
      throw new Error("No access token received");
    }

    return data.session.access_token;
  } catch (error) {
    console.error("Failed to generate Supabase token:", error);
    throw error;
  }
}
