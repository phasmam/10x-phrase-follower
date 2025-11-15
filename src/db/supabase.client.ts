import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

// Use PUBLIC_ prefix for client-side access in Astro
// Fallback to non-prefixed for server-side compatibility
// In Node.js runtime, also check process.env as fallback
const supabaseUrl =
  import.meta.env.PUBLIC_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  (typeof process !== "undefined" && process.env.PUBLIC_SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env.SUPABASE_URL);
const supabaseAnonKey =
  import.meta.env.PUBLIC_SUPABASE_KEY ||
  import.meta.env.SUPABASE_KEY ||
  (typeof process !== "undefined" && process.env.PUBLIC_SUPABASE_KEY) ||
  (typeof process !== "undefined" && process.env.SUPABASE_KEY);

// In development mode, Supabase client is optional (we use DEV_JWT instead)
// Only throw error in production or if explicitly needed
let supabaseClientInstance: ReturnType<typeof createClient<Database>> | null = null;

if (supabaseUrl && supabaseAnonKey) {
  supabaseClientInstance = createClient<Database>(supabaseUrl, supabaseAnonKey);
} else if (import.meta.env.NODE_ENV === "production") {
  // Only throw in production - in dev we can use DEV_JWT
  throw new Error(
    "Supabase configuration is missing. Please set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_KEY (or SUPABASE_URL and SUPABASE_KEY for server-side)."
  );
} else {
  // In development, create a dummy client to avoid null issues
  // It won't work for actual auth, but prevents import errors
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase client not configured. Using DEV_JWT for authentication. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_KEY for Supabase features."
  );
  // Create a dummy client with placeholder values (won't work for real operations)
  supabaseClientInstance = createClient<Database>("https://placeholder.supabase.co", "placeholder-key");
}

export const supabaseClient = supabaseClientInstance;

export const DEFAULT_USER_ID = "0a1f3212-c55f-4a62-bc0f-4121a7a72283";
