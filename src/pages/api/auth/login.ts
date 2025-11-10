import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { LoginRequest, LoginResponse } from '../../../types';
import { ApiErrors, withErrorHandling } from '../../../lib/errors';
import type { Database } from '../../../db/database.types';

export const prerender = false;

// Validation schema
const LoginRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginHandler = async (context: { request: Request }): Promise<Response> => {
  // In development, return 404 to not interfere with DEV_JWT flow
  if (import.meta.env.NODE_ENV === 'development') {
    return new Response(
      JSON.stringify({
        error: {
          code: 'not_found',
          message: 'Endpoint not available in development mode',
        },
      }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  // Parse request body
  let body: unknown;
  try {
    body = await context.request.json();
  } catch (error) {
    throw ApiErrors.invalidBody('Request body is required and must be valid JSON');
  }

  // Validate request body
  let loginData: LoginRequest;
  try {
    loginData = LoginRequestSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw ApiErrors.validationError('Invalid request data', error.errors);
    }
    throw ApiErrors.validationError('Invalid request data');
  }

  // Get Supabase client with anon key
  const supabaseUrl = import.meta.env.SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw ApiErrors.internal('Supabase configuration is missing');
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Attempt to sign in with password
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: loginData.email,
    password: loginData.password,
  });

  if (authError) {
    // Handle specific Supabase auth errors
    if (authError.status === 429) {
      throw ApiErrors.tooManyRequests('Too many login attempts. Please try again later.');
    }

    if (authError.status === 400 || authError.status === 401) {
      throw ApiErrors.invalidCredentials('Invalid email or password');
    }

    // Log unexpected errors
    // eslint-disable-next-line no-console
    console.error('Supabase auth error:', authError);

    throw ApiErrors.internal('Authentication failed');
  }

  if (!authData.session || !authData.user) {
    throw ApiErrors.internal('Authentication failed - no session returned');
  }

  const { session, user } = authData;

  // Calculate expires_in in seconds
  // session.expires_at is already in seconds (Unix timestamp)
  const expiresIn = session.expires_at ? Math.max(0, session.expires_at - Math.floor(Date.now() / 1000)) : 3600; // Default to 1 hour if not provided

  const response: LoginResponse = {
    access_token: session.access_token,
    expires_in: expiresIn,
    refresh_token: session.refresh_token,
    user: {
      id: user.id,
      email: user.email || '',
    },
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

export const POST: APIRoute = withErrorHandling(loginHandler);
