import { useAuth } from "./useAuth";

interface ApiOptions extends RequestInit {
  requireAuth?: boolean;
}

/**
 * Hook for making authenticated API calls
 * Automatically adds Authorization header with JWT token
 */
export function useApi() {
  const { token, isAuthenticated, userId } = useAuth();

  const apiCall = async <T>(
    endpoint: string, 
    options: ApiOptions = {}
  ): Promise<T> => {
    const { requireAuth = true, headers = {}, ...restOptions } = options;

    // Check authentication requirement
    if (requireAuth && !isAuthenticated) {
      throw new Error("Authentication required");
    }

    // Prepare headers
    const requestHeaders: HeadersInit = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...headers,
    };

    // Add authorization header if token is available
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
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
  };

  return { apiCall, isAuthenticated, token, userId };
}
