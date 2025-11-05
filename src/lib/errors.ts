import type { ApiErrorResponse, ApiErrorCode } from "../types";

/**
 * Standardized error handling for API endpoints.
 * Provides consistent error responses with proper HTTP status codes.
 */

export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toResponse(): Response {
    const errorResponse: ApiErrorResponse = {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };

    return new Response(JSON.stringify(errorResponse), {
      status: this.statusCode,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}

// Predefined error constructors for common scenarios
export const ApiErrors = {
  // Authentication errors
  unauthorized: (message = "Authentication required") => new ApiError("unauthorized", message, 401),

  // Authorization errors
  forbidden: (message = "Access denied") => new ApiError("forbidden", message, 403),

  // Not found errors
  notFound: (message = "Resource not found") => new ApiError("not_found", message, 404),

  // Validation errors
  validationError: (message: string, details?: unknown) => new ApiError("validation_error", message, 400, details),

  // Conflict errors
  uniqueViolation: (message = "Resource already exists") => new ApiError("unique_violation", message, 409),

  conflict: (message = "Resource conflict") => new ApiError("conflict", message, 409),

  // Business logic errors
  jobInProgress: (message = "Job already in progress") => new ApiError("job_in_progress", message, 409),

  cannotCancel: (message = "Cannot cancel job in current state") => new ApiError("cannot_cancel", message, 422),

  limitExceeded: (message = "Resource limit exceeded") => new ApiError("limit_exceeded", message, 413),

  // External service errors
  invalidKey: (message = "Invalid API key") => new ApiError("invalid_key", message, 400),

  quotaExceeded: (message = "Quota exceeded") => new ApiError("quota_exceeded", message, 402),

  ttsTimeout: (message = "TTS service timeout") => new ApiError("tts_timeout", message, 504),

  // Internal errors
  internal: (message = "Internal server error", details?: unknown) => new ApiError("internal", message, 500, details),

  // Authentication errors
  invalidCredentials: (message = "Invalid credentials") => new ApiError("invalid_credentials", message, 401),

  // Rate limiting errors
  tooManyRequests: (message = "Too many requests") => new ApiError("too_many_requests", message, 429),

  // Request validation errors
  invalidBody: (message = "Invalid request body") => new ApiError("invalid_body", message, 400),
};

/**
 * Error handler for async API route functions.
 * Catches ApiError instances and returns proper HTTP responses.
 * Logs unexpected errors and returns generic 500 responses.
 */
export function withErrorHandling<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      // If it's already an ApiError, return its response
      if (error instanceof ApiError) {
        return error.toResponse();
      }

      // Log unexpected errors
      // eslint-disable-next-line no-console
      console.error("Unexpected API error:", error);

      // Return generic internal error
      return ApiErrors.internal(
        "An unexpected error occurred",
        import.meta.env.NODE_ENV === "development" ? error : undefined
      ).toResponse();
    }
  };
}

/**
 * Validates that a user is authenticated.
 * Throws ApiError.unauthorized if not authenticated.
 */
export function requireAuth(userId: string | null | undefined): asserts userId is string {
  if (!userId) {
    throw ApiErrors.unauthorized();
  }
}

/**
 * Validates that a resource belongs to the authenticated user.
 * Used for additional security checks beyond RLS.
 */
export function requireOwnership(resourceUserId: string, authenticatedUserId: string, resourceType = "resource"): void {
  if (resourceUserId !== authenticatedUserId) {
    throw ApiErrors.forbidden(`Access denied to ${resourceType}`);
  }
}
