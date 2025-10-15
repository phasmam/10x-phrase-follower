import type { APIRoute } from "astro";
import type { HealthStatusDTO } from "../../types";
import { withErrorHandling } from "../../lib/errors";

export const prerender = false;

const getHealthStatus = async ({ locals }: { locals: any }): Promise<Response> => {
  // Test database connectivity
  const { data, error } = await locals.supabase
    .from("users")
    .select("id")
    .limit(1);

  const dbStatus = error ? "down" : "ok";
  
  const response: HealthStatusDTO = {
    status: "ok",
    db: dbStatus,
    time: new Date().toISOString(),
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const GET: APIRoute = withErrorHandling(getHealthStatus);
