/// <reference types="astro/client" />

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./db/database.types";

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient<Database>;
      userId: string | null;
    }
  }
}

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_KEY: string;
  readonly OPENROUTER_API_KEY: string;
  readonly TTS_ENCRYPTION_KEY?: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Minimal type for Astro runtime helper so ESLint/TS can resolve it
declare module "astro/runtime/server" {
  export function getRuntime():
    | {
        env?: Record<string, string | undefined>;
      }
    | undefined;
}
