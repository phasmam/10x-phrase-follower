import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  try {
    // Simple test endpoint
    const body = await request.json();
    
    return new Response(JSON.stringify({
      message: "Import endpoint working",
      received: body,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: "Import failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
};
