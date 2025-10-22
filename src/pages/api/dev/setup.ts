import type { APIRoute } from "astro";
import { createDevUser, generateSupabaseToken } from "../../../lib/create-dev-user";

/**
 * Development endpoint to set up a proper Supabase user for testing
 * This creates a real user in auth.users that will work with RLS policies
 */
export const POST: APIRoute = async ({ request }) => {
  if (import.meta.env.NODE_ENV !== "development") {
    return new Response(
      JSON.stringify({
        error: {
          code: "not_available",
          message: "This endpoint is only available in development mode",
        },
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Create the dev user
    const { authUser, publicUser } = await createDevUser();

    // Generate a proper Supabase token
    const token = await generateSupabaseToken();

    return new Response(
      JSON.stringify({
        success: true,
        authUser: {
          id: authUser?.id,
          email: authUser?.email,
        },
        publicUser: {
          id: publicUser?.id,
        },
        token,
        message: "Dev user created and token generated successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Failed to set up dev user:", error);

    return new Response(
      JSON.stringify({
        error: {
          code: "setup_failed",
          message: "Failed to set up dev user",
          details: error instanceof Error ? error.message : "Unknown error",
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
