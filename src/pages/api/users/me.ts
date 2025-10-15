import type { APIRoute } from "astro";
import type { UserDTO } from "../../../types";
import { ApiErrors, withErrorHandling, requireAuth } from "../../../lib/errors";

export const prerender = false;

const getUserProfile = async ({ locals }: { locals: any }): Promise<Response> => {
  requireAuth(locals.userId);

  // Query user profile through RLS
  const { data: user, error } = await locals.supabase
    .from("users")
    .select("id, created_at")
    .eq("id", locals.userId)
    .single();

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
