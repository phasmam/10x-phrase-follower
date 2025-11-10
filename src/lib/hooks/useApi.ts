import { useAuth } from "./useAuth";
import { useCallback, useMemo } from "react";

interface ApiOptions extends RequestInit {
  requireAuth?: boolean;
}

/**
 * Hook for making authenticated API calls
 * Automatically adds Authorization header with JWT token
 */
export function useApi() {
  const { token, isAuthenticated, userId } = useAuth();

  // Fallback: try to get token from localStorage if useAuth doesn't have it
  const getTokenFromStorage = () => {
    if (typeof window === "undefined") return null;

    // Check for Supabase token first (production)
    const sbAccessToken = localStorage.getItem("sb_access_token");
    const sbExpiresAt = localStorage.getItem("sb_expires_at");

    if (sbAccessToken && sbExpiresAt) {
      const now = Date.now();
      const expiresAt = parseInt(sbExpiresAt, 10);

      if (now < expiresAt) {
        return sbAccessToken;
      } else {
        // Token expired, clear storage
        localStorage.removeItem("sb_access_token");
        localStorage.removeItem("sb_refresh_token");
        localStorage.removeItem("sb_expires_at");
        localStorage.removeItem("sb_user_id");
      }
    }

    // Check for DEV_JWT token (development)
    const storedToken = localStorage.getItem("dev_jwt_token");
    const storedExpiry = localStorage.getItem("dev_jwt_expiry");

    if (storedToken && storedExpiry) {
      const now = Date.now();
      const expiry = parseInt(storedExpiry, 10);

      if (now < expiry) {
        return storedToken;
      } else {
        // Token expired, clear storage
        localStorage.removeItem("dev_jwt_token");
        localStorage.removeItem("dev_user_id");
        localStorage.removeItem("dev_jwt_expiry");
      }
    }

    return null;
  };

  // Use token from useAuth or fallback to localStorage
  const effectiveToken = token || getTokenFromStorage();
  const effectiveIsAuthenticated = isAuthenticated || !!effectiveToken;

  const apiCall = useCallback(async <T>(endpoint: string, options: ApiOptions = {}): Promise<T> => {
    const { requireAuth = true, headers = {}, ...restOptions } = options;

    // Check authentication requirement
    if (requireAuth && !effectiveIsAuthenticated) {
      throw new Error("Authentication required");
    }

    // Prepare headers
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers as Record<string, string>,
    };

    // Add authorization header if token is available
    if (effectiveToken) {
      // DEV_JWT tokens already have "dev_" prefix, Supabase tokens don't
      // The middleware expects DEV_JWT tokens to have the prefix
      requestHeaders["Authorization"] = `Bearer ${effectiveToken}`;
    }

    // Make the request
    const response = await fetch(endpoint, {
      ...restOptions,
      headers: requestHeaders,
    });

    // Handle response
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
        // If not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }

      throw new Error(errorMessage);
    }

    // Parse JSON response
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return response.json();
    }

    // Return text for non-JSON responses
    return response.text() as unknown as T;
  }, [effectiveToken, effectiveIsAuthenticated]);

  return useMemo(() => ({ apiCall, isAuthenticated: effectiveIsAuthenticated, token: effectiveToken, userId }), [apiCall, effectiveIsAuthenticated, effectiveToken, userId]);
}
