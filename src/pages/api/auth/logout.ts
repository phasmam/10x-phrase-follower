import type { APIRoute } from "astro";

export const prerender = false;

const logoutHandler = async (): Promise<Response> => {
  // In development, return 204 no-op (doesn't interfere with DEV_JWT flow)
  // In production, return 204 no-op (actual signOut is handled client-side via supabase.auth.signOut())
  // This endpoint is an optional wrapper for consistency with the API contract
  return new Response(null, {
    status: 204,
  });
};

export const POST: APIRoute = logoutHandler;

