import { defineMiddleware } from "astro:middleware";
import { jwtVerify } from "jose";

import { supabaseClient } from "../db/supabase.client";
import { DEFAULT_USER_ID } from "../db/supabase.client";

export const onRequest = defineMiddleware(async (context, next) => {
  // Set up Supabase client
  context.locals.supabase = supabaseClient;

  // Handle preflight requests
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": context.request.headers.get("origin") || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }

  // Extract and verify JWT token
  const authHeader = context.request.headers.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);

    try {
      // In development, check for DEV_JWT
      if (import.meta.env.NODE_ENV === "development" && token.startsWith("dev_")) {
        const devJwtSecret = import.meta.env.SUPABASE_JWT_SECRET;
        if (devJwtSecret) {
          const actualJwt = token.substring(4); // Remove "dev_" prefix
          const { payload } = await jwtVerify(actualJwt, new TextEncoder().encode(devJwtSecret));
          if (payload.sub === DEFAULT_USER_ID) {
            userId = DEFAULT_USER_ID;
          }
        }
      } else {
        // Verify Supabase JWT
        const {
          data: { user },
          error,
        } = await supabaseClient.auth.getUser(token);
        if (!error && user) {
          userId = user.id;
        }
      }
    } catch (error) {
      // Invalid token - will be handled by individual endpoints
      // eslint-disable-next-line no-console
      console.warn("JWT verification failed:", error);
    }
  }

  // Set user context
  context.locals.userId = userId;

  // Call next() to get the response
  const response = await next();

  // Add CORS headers to the response
  const origin = context.request.headers.get("origin");
  const allowedOrigins = [
    "http://localhost:3000", // Alternative dev port
    import.meta.env.PUBLIC_APP_URL, // Production URL
  ].filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
  response.headers.set("Access-Control-Allow-Credentials", "true");

  return response;
});
