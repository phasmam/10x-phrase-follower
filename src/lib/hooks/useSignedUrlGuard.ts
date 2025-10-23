import { useState, useEffect } from 'react';

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
    const timeUntilExpiry = expiryTime - now;

    // If already expired or expires within 1 minute, mark as needing refresh
    if (timeUntilExpiry <= 60000) {
      setNeedsRefresh(true);
      return;
    }

    // Set up a timer to check when we're close to expiry
    const checkInterval = Math.min(timeUntilExpiry - 60000, 300000); // Check at least every 5 minutes
    const timer = setTimeout(() => {
      setNeedsRefresh(true);
    }, checkInterval);

    return () => clearTimeout(timer);
  }, [expiresAt]);

  return { needsRefresh };
}
