import type { APIRoute, APIContext } from "astro";
import type { NotebookListResponse, CreateNotebookCommand } from "../../../types";
import type { LocalsWithAuth } from "../../../lib/types";
import { withErrorHandling, requireAuth, ApiErrors } from "../../../lib/errors";
import {
  validatePaginationParams,
  validateSortParams,
  validateSearchQuery,
  validateJsonBody,
  validateNonEmptyText,
  validateRateLimit,
} from "../../../lib/validation.service";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_USER_ID } from "../../../db/supabase.client";

export const prerender = false;

// GET /api/notebooks - List notebooks for authenticated user
const getNotebooks = async (context: APIContext): Promise<Response> => {
  const { locals, url } = context;
  const userId = (locals as LocalsWithAuth).userId;
  let supabase = (locals as LocalsWithAuth).supabase;
  requireAuth(userId);

  // In development, use service role key to bypass RLS
  if (import.meta.env.NODE_ENV === "development" && userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  // Validate query parameters
  const { limit, cursor } = validatePaginationParams(url);
  const { sort, order } = validateSortParams(url, ["updated_at", "created_at", "name"], "updated_at");
  const q = validateSearchQuery(url);

  // Build query
  let query = supabase
    .from("notebooks")
    .select("id, name, current_build_id, last_generate_job_id, created_at, updated_at")
    .eq("user_id", userId)
    .order(sort, { ascending: order === "asc" })
    .limit(limit + 1); // Get one extra to check if there are more

  // Apply search filter
  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  // Apply cursor pagination
  if (cursor) {
    // For cursor-based pagination, we need to decode the cursor
    // For now, using simple offset-based pagination
    const offset = parseInt(cursor) || 0;
    query = query.range(offset, offset + limit);
  }

  const { data, error } = await query;

  if (error) {
    // eslint-disable-next-line no-console
    console.error("Database error:", error);
    throw ApiErrors.internal("Failed to fetch notebooks");
  }

  // Check if there are more results
  const hasMore = data && data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data || [];
  const nextCursor = hasMore ? (parseInt(cursor || "0") + limit).toString() : null;

  const response: NotebookListResponse = {
    items,
    next_cursor: nextCursor,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

// POST /api/notebooks - Create a new notebook
const createNotebook = async (context: APIContext): Promise<Response> => {
  const { locals, request } = context;
  const userId = (locals as LocalsWithAuth).userId;
  let supabase = (locals as LocalsWithAuth).supabase;
  requireAuth(userId);

  // In development, use service role key to bypass RLS
  if (import.meta.env.NODE_ENV === "development" && userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  // Rate limiting for notebook creation
  validateRateLimit(`create_notebook:${userId}`, 10, 60000); // 10 per minute

  const body = await request.json();
  validateJsonBody(body, ["name"]);

  const { name }: CreateNotebookCommand = body;

  // Validate and sanitize input
  const sanitizedName = validateNonEmptyText(name, "Name");
  if (sanitizedName.length > 100) {
    throw ApiErrors.validationError("Name must be at most 100 characters");
  }

  // Create notebook
  const { data, error } = await supabase
    .from("notebooks")
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      name: sanitizedName,
    })
    .select("id, name, current_build_id, last_generate_job_id, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Unique violation - notebook name already exists for this user
      throw ApiErrors.uniqueViolation("Notebook name already exists");
    }
    // eslint-disable-next-line no-console
    console.error("Database error:", error);
    throw ApiErrors.internal("Failed to create notebook");
  }

  return new Response(JSON.stringify(data), {
    status: 201,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const GET: APIRoute = withErrorHandling(getNotebooks);
export const POST: APIRoute = withErrorHandling(createNotebook);
