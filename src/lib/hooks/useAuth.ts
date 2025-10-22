import { useState, useEffect } from "react";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  userId: string | null;
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
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (import.meta.env.NODE_ENV === "development") {
          // In development, get DEV_JWT from API
          const response = await fetch("/api/dev/jwt", {
            headers: { "Accept": "application/json" },
          });
          
          if (response.ok) {
            const data: DevJwtResponse = await response.json();
            setAuthState({
              isAuthenticated: true,
              isLoading: false,
              token: data.token,
              userId: data.user_id,
            });
          } else {
            setAuthState({
              isAuthenticated: false,
              isLoading: false,
              token: null,
              userId: null,
            });
          }
        } else {
          // TODO: Implement Supabase Auth integration for production
          setAuthState({
            isAuthenticated: false,
            isLoading: false,
            token: null,
            userId: null,
          });
        }
      } catch (error) {
        console.error("Auth initialization failed:", error);
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          token: null,
          userId: null,
        });
      }
    };

    initAuth();
  }, []);

  return authState;
}
