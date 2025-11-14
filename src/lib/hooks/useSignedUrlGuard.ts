import { useState, useEffect } from "react";

interface UseSignedUrlGuardProps {
  expiresAt?: string;
}

export function useSignedUrlGuard({ expiresAt }: UseSignedUrlGuardProps) {
  const [needsRefresh, setNeedsRefresh] = useState(false);

  useEffect(() => {
    if (!expiresAt) {
      setNeedsRefresh(false);
      return;
    }

    const expiryTime = new Date(expiresAt).getTime();
    const now = Date.now();

    // Validate that expiryTime is a valid number
    if (isNaN(expiryTime)) {
      console.error("[useSignedUrlGuard] Invalid expiresAt date:", expiresAt);
      setNeedsRefresh(false);
      return;
    }

    const timeUntilExpiry = expiryTime - now;

    // Debug logging (only in development or when there's an issue)
    if (timeUntilExpiry < 0 || timeUntilExpiry < 10 * 60000) {
      console.log("[useSignedUrlGuard] Expiry check:", {
        expiresAt,
        expiryTime: new Date(expiryTime).toISOString(),
        now: new Date(now).toISOString(),
        timeUntilExpiryMs: timeUntilExpiry,
        timeUntilExpiryMinutes: Math.round(timeUntilExpiry / 60000),
        needsRefresh: timeUntilExpiry <= 5 * 60000,
      });
    }

    // If already expired or expires within 5 minutes, mark as needing refresh
    if (timeUntilExpiry <= 5 * 60000) {
      setNeedsRefresh(true);
      return;
    }

    // Set up a timer to check when we're close to expiry
    const checkInterval = Math.min(timeUntilExpiry - 5 * 60000, 300000); // Check at least every 5 minutes
    const timer = setTimeout(() => {
      setNeedsRefresh(true);
    }, checkInterval);

    return () => clearTimeout(timer);
  }, [expiresAt]);

  return { needsRefresh };
}
