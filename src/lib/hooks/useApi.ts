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
  
  // Fallback: try to get token from localStorage if useAuth doesn't have it
  const getTokenFromStorage = () => {
    if (typeof window === "undefined") return null;
    
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

  const apiCall = async <T>(
    endpoint: string, 
    options: ApiOptions = {}
  ): Promise<T> => {
    const { requireAuth = true, headers = {}, ...restOptions } = options;

    // Check authentication requirement
    if (requireAuth && !effectiveIsAuthenticated) {
      throw new Error("Authentication required");
    }

    // Prepare headers
    const requestHeaders: HeadersInit = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...headers,
    };

    // Add authorization header if token is available
    if (effectiveToken) {
      requestHeaders.Authorization = `Bearer ${effectiveToken}`;
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

  return { apiCall, isAuthenticated: effectiveIsAuthenticated, token: effectiveToken, userId };
}
