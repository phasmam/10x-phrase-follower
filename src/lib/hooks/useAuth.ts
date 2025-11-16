import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseClient } from "../../db/supabase.client";

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
 * In development, automatically provides DEV_JWT (prioritized)
 * In production, integrates with Supabase Auth
 */
export function useAuth(): AuthState {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const logout = useCallback(async () => {
    // Clear DEV JWT from localStorage
    localStorage.removeItem("dev_jwt_token");
    localStorage.removeItem("dev_user_id");
    localStorage.removeItem("dev_jwt_expiry");

    // Clear Supabase session from localStorage
    localStorage.removeItem("sb_access_token");
    localStorage.removeItem("sb_refresh_token");
    localStorage.removeItem("sb_expires_at");
    localStorage.removeItem("sb_user_id");

    // Sign out from Supabase (in production)
    try {
      await supabaseClient.auth.signOut();
    } catch (error) {
      // Ignore signOut errors - we're clearing state anyway (especially in dev with dummy client)
      // eslint-disable-next-line no-console
      console.warn("Sign out error (ignored):", error);
    }

    // Reset auth state
    if (isMountedRef.current) {
      setIsAuthenticated(false);
      setIsLoading(false);
      setToken(null);
      setUserId(null);
    }

    // Redirect to login
    // eslint-disable-next-line react-compiler/react-compiler
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Check if we're in browser environment
        if (typeof window === "undefined") {
          if (isMountedRef.current) {
            setIsAuthenticated(false);
            setIsLoading(false);
            setToken(null);
            setUserId(null);
          }
          return;
        }

        // PRIORITIZE DEV MODE: Check for DEV_JWT first (development mode)
        const storedToken = localStorage.getItem("dev_jwt_token");
        const storedUserId = localStorage.getItem("dev_user_id");
        const storedExpiry = localStorage.getItem("dev_jwt_expiry");

        // Check if stored DEV_JWT token is still valid (not expired)
        if (storedToken && storedUserId && storedExpiry) {
          const now = Date.now();
          const expiry = parseInt(storedExpiry, 10);

          if (now < expiry) {
            // Token is still valid
            if (isMountedRef.current) {
              setIsAuthenticated(true);
              setIsLoading(false);
              setToken(storedToken);
              setUserId(storedUserId);
            }
            return;
          } else {
            // Token expired, clear storage
            localStorage.removeItem("dev_jwt_token");
            localStorage.removeItem("dev_user_id");
            localStorage.removeItem("dev_jwt_expiry");
          }
        }

        // Try to get new DEV_JWT from API (development mode)
        try {
          const devResponse = await fetch("/api/dev/jwt", {
            headers: { Accept: "application/json" },
          });

          if (devResponse.ok) {
            const data: DevJwtResponse = await devResponse.json();

            // Store token in localStorage with expiry
            const expiry = Date.now() + data.expires_in * 1000;
            localStorage.setItem("dev_jwt_token", data.token);
            localStorage.setItem("dev_user_id", data.user_id);
            localStorage.setItem("dev_jwt_expiry", expiry.toString());

            if (isMountedRef.current) {
              setIsAuthenticated(true);
              setIsLoading(false);
              setToken(data.token);
              setUserId(data.user_id);
            }
            return;
          }
        } catch {
          // Continue to check Supabase session as fallback
        }

        // DEV_JWT not available - check for Supabase session (production mode)
        // Only check Supabase if DEV_JWT failed (we're in production)
        const sbAccessToken = localStorage.getItem("sb_access_token");
        const sbRefreshToken = localStorage.getItem("sb_refresh_token");
        const sbExpiresAt = localStorage.getItem("sb_expires_at");
        const sbUserId = localStorage.getItem("sb_user_id");

        if (sbAccessToken && sbRefreshToken && sbExpiresAt && sbUserId) {
          const now = Date.now();
          const expiresAt = parseInt(sbExpiresAt, 10);

          // Check if token is still valid (with 5 minute buffer for refresh)
          if (now < expiresAt - 300000) {
            // Token is still valid
            if (isMountedRef.current) {
              setIsAuthenticated(true);
              setIsLoading(false);
              setToken(sbAccessToken);
              setUserId(sbUserId);
            }
            return;
          } else if (now < expiresAt) {
            // Token is close to expiry, try to refresh
            try {
              const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession({
                refresh_token: sbRefreshToken,
              });

              if (!refreshError && refreshData.session) {
                const newExpiresAt = refreshData.session.expires_at
                  ? refreshData.session.expires_at * 1000
                  : Date.now() + 3600000;

                localStorage.setItem("sb_access_token", refreshData.session.access_token);
                localStorage.setItem("sb_refresh_token", refreshData.session.refresh_token);
                localStorage.setItem("sb_expires_at", newExpiresAt.toString());

                if (isMountedRef.current) {
                  setIsAuthenticated(true);
                  setIsLoading(false);
                  setToken(refreshData.session.access_token);
                  setUserId(refreshData.session.user.id);
                }
                return;
              }
            } catch (refreshErr) {
              // eslint-disable-next-line no-console
              console.warn("Failed to refresh Supabase session:", refreshErr);
              // Fall through to clear session
            }

            // Refresh failed, clear Supabase session
            localStorage.removeItem("sb_access_token");
            localStorage.removeItem("sb_refresh_token");
            localStorage.removeItem("sb_expires_at");
            localStorage.removeItem("sb_user_id");
          } else {
            // Token expired, clear Supabase session
            localStorage.removeItem("sb_access_token");
            localStorage.removeItem("sb_refresh_token");
            localStorage.removeItem("sb_expires_at");
            localStorage.removeItem("sb_user_id");
          }
        }

        // No valid session found
        if (isMountedRef.current) {
          setIsAuthenticated(false);
          setIsLoading(false);
          setToken(null);
          setUserId(null);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Auth initialization failed:", error);
        if (isMountedRef.current) {
          setIsAuthenticated(false);
          setIsLoading(false);
          setToken(null);
          setUserId(null);
        }
      }
    };

    initAuth();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    isAuthenticated,
    isLoading,
    token,
    userId,
    logout,
  };
}
