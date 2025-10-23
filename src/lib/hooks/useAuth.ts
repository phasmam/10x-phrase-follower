import { useState, useEffect } from "react";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  userId: string | null;
  logout: () => void;
}

interface DevJwtResponse {
  token: string;
  expires_in: number;
  user_id: string;
}

/**
 * Hook for managing authentication state
 * In development, automatically provides DEV_JWT
 * In production, integrates with Supabase Auth
 */
export function useAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    token: null,
    userId: null,
    logout: () => {},
  });

  const logout = () => {
    // Clear localStorage
    localStorage.removeItem("dev_jwt_token");
    localStorage.removeItem("dev_user_id");
    localStorage.removeItem("dev_jwt_expiry");
    
    // Reset auth state
    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      token: null,
      userId: null,
      logout,
    });
    
    // Redirect to login
    window.location.href = "/login";
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Check if we're in browser environment
        if (typeof window === "undefined") {
          console.log("Not in browser environment, skipping auth init");
          setAuthState({
            isAuthenticated: false,
            isLoading: false,
            token: null,
            userId: null,
            logout,
          });
          return;
        }
        
        console.log("useAuth: Starting auth initialization");
        
        // Check if we already have a valid token in localStorage
        const storedToken = localStorage.getItem("dev_jwt_token");
        const storedUserId = localStorage.getItem("dev_user_id");
        const storedExpiry = localStorage.getItem("dev_jwt_expiry");
        
        // Check if stored token is still valid (not expired)
        if (storedToken && storedUserId && storedExpiry) {
          const now = Date.now();
          const expiry = parseInt(storedExpiry, 10);
          
          if (now < expiry) {
            // Token is still valid
            console.log("Using stored DEV_JWT token");
            setAuthState({
              isAuthenticated: true,
              isLoading: false,
              token: storedToken,
              userId: storedUserId,
              logout,
            });
            return;
          } else {
            // Token expired, clear storage
            console.log("Stored DEV_JWT token expired, clearing storage");
            localStorage.removeItem("dev_jwt_token");
            localStorage.removeItem("dev_user_id");
            localStorage.removeItem("dev_jwt_expiry");
          }
        }
        
        // Try to get new DEV_JWT from API
        console.log("Fetching DEV_JWT from /api/dev/jwt");
        const response = await fetch("/api/dev/jwt", {
          headers: { "Accept": "application/json" },
        });
        
        console.log("DEV_JWT response status:", response.status);
        
        if (response.ok) {
          const data: DevJwtResponse = await response.json();
          console.log("Generated new DEV_JWT token");
          
          // Store token in localStorage with expiry
          const expiry = Date.now() + (data.expires_in * 1000);
          localStorage.setItem("dev_jwt_token", data.token);
          localStorage.setItem("dev_user_id", data.user_id);
          localStorage.setItem("dev_jwt_expiry", expiry.toString());
          
          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            token: data.token,
            userId: data.user_id,
            logout,
          });
        } else {
          console.error("Failed to get DEV_JWT:", response.status, response.statusText);
          const errorText = await response.text();
          console.error("Error response:", errorText);
          setAuthState({
            isAuthenticated: false,
            isLoading: false,
            token: null,
            userId: null,
            logout,
          });
        }
      } catch (error) {
        console.error("Auth initialization failed:", error);
        console.error("Error details:", {
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        });
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          token: null,
          userId: null,
          logout,
        });
      }
    };

    initAuth();
  }, []);

  return authState;
}
