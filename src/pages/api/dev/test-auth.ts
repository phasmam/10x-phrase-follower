import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../db/database.types";

export const prerender = false;

/**
 * Test endpoint to check Supabase users and verify credentials
 * Usage: POST /api/dev/test-auth
 * Body: { email?: string, password?: string, action: "list" | "test" | "create" }
 */
export const POST: APIRoute = async (context) => {
  // Allow this endpoint in any mode for testing purposes
  // (it's a dev utility endpoint)

  try {
    const supabaseUrl =
      import.meta.env.SUPABASE_URL ||
      import.meta.env.PUBLIC_SUPABASE_URL ||
      (typeof process !== "undefined" && process.env.SUPABASE_URL) ||
      (typeof process !== "undefined" && process.env.PUBLIC_SUPABASE_URL);
    const supabaseServiceKey =
      import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
      (typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY);
    const supabaseAnonKey =
      import.meta.env.SUPABASE_KEY ||
      import.meta.env.PUBLIC_SUPABASE_KEY ||
      (typeof process !== "undefined" && process.env.SUPABASE_KEY) ||
      (typeof process !== "undefined" && process.env.PUBLIC_SUPABASE_KEY);

    if (!supabaseUrl) {
      return new Response(
        JSON.stringify({
          error: "SUPABASE_URL or PUBLIC_SUPABASE_URL is not set",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const body = await context.request.json().catch(() => ({}));
    const { action = "list", email, password } = body;

    // Create admin client for user management
    if (action === "list" || action === "create") {
      if (!supabaseServiceKey) {
        return new Response(
          JSON.stringify({
            error: "SUPABASE_SERVICE_ROLE_KEY is required for this action",
            hint: "Set SUPABASE_SERVICE_ROLE_KEY in your .env file",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const adminClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      if (action === "list") {
        // List all users
        const { data: users, error: listError } = await adminClient.auth.admin.listUsers();

        if (listError) {
          return new Response(
            JSON.stringify({
              error: "Failed to list users",
              details: listError.message,
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            count: users.users.length,
            users: users.users.map((user) => ({
              id: user.id,
              email: user.email,
              email_confirmed_at: user.email_confirmed_at,
              created_at: user.created_at,
              last_sign_in_at: user.last_sign_in_at,
            })),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      if (action === "create") {
        // Create a test user
        if (!email || !password) {
          return new Response(
            JSON.stringify({
              error: "email and password are required for create action",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: email,
          password: password,
          email_confirm: true, // Auto-confirm email
        });

        if (createError) {
          return new Response(
            JSON.stringify({
              error: "Failed to create user",
              details: createError.message,
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            user: {
              id: newUser.user?.id,
              email: newUser.user?.email,
              created_at: newUser.user?.created_at,
            },
            message: "User created successfully. You can now login with these credentials.",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // Test credentials
    if (action === "test") {
      if (!supabaseAnonKey) {
        return new Response(
          JSON.stringify({
            error: "SUPABASE_KEY or PUBLIC_SUPABASE_KEY is required for testing credentials",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      if (!email || !password) {
        return new Response(
          JSON.stringify({
            error: "email and password are required for test action",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      const { data: authData, error: authError } = await client.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (authError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid credentials",
            details: authError.message,
            status: authError.status,
          }),
          {
            status: 200, // Return 200 so we can see the error details
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Credentials are valid!",
          user: {
            id: authData.user?.id,
            email: authData.user?.email,
          },
          session: {
            access_token: authData.session?.access_token?.substring(0, 20) + "...",
            expires_at: authData.session?.expires_at,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: `Unknown action: ${action}. Use "list", "test", or "create"`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Test auth error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
