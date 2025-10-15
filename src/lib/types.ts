import type { Database } from "../db/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Type for locals with custom properties added by middleware
export interface LocalsWithAuth {
  userId: string | null;
  supabase: SupabaseClient<Database>;
}

export interface LocalsWithSupabase {
  supabase: SupabaseClient<Database>;
}
