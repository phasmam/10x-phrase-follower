import { vi } from "vitest";

// Mock environment variables
vi.stubGlobal("import.meta.env", {
  NODE_ENV: "test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_KEY: "test-anon-key",
  SUPABASE_JWT_SECRET: "test-jwt-secret",
  PUBLIC_APP_URL: "http://localhost:4321",
});

// Mock Supabase client
vi.mock("../db/supabase.client", () => ({
  supabaseClient: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
        limit: vi.fn(),
      })),
    })),
  },
  DEFAULT_USER_ID: "0a1f3212-c55f-4a62-bc0f-4121a7a72283",
}));
