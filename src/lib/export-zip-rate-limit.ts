/**
 * Rate limiting service for ZIP exports
 * Prevents users from exporting the same notebook too frequently
 * In-memory implementation (for MVP); can be replaced with Redis in production
 */

// Cooldown period: 30 seconds
const EXPORT_COOLDOWN_MS = 30 * 1000;

// In-memory map: key = `${userId}:${notebookId}`, value = timestamp of last export
const lastExportTimestamps = new Map<string, number>();

/**
 * Checks if a user can export a notebook (not rate-limited)
 * @param userId - User ID
 * @param notebookId - Notebook ID
 * @returns true if export is allowed, false if rate-limited
 */
export function canExport(userId: string, notebookId: string): boolean {
  const key = `${userId}:${notebookId}`;
  const lastExport = lastExportTimestamps.get(key);

  if (!lastExport) {
    return true; // No previous export, allow
  }

  const now = Date.now();
  const timeSinceLastExport = now - lastExport;

  return timeSinceLastExport >= EXPORT_COOLDOWN_MS;
}

/**
 * Marks that an export was performed for a user+notebook combination
 * @param userId - User ID
 * @param notebookId - Notebook ID
 */
export function markExport(userId: string, notebookId: string): void {
  const key = `${userId}:${notebookId}`;
  lastExportTimestamps.set(key, Date.now());
}

/**
 * Gets the time remaining until the next export is allowed (in milliseconds)
 * @param userId - User ID
 * @param notebookId - Notebook ID
 * @returns Time remaining in milliseconds, or 0 if export is allowed
 */
export function getTimeUntilNextExport(userId: string, notebookId: string): number {
  const key = `${userId}:${notebookId}`;
  const lastExport = lastExportTimestamps.get(key);

  if (!lastExport) {
    return 0; // Export is allowed
  }

  const now = Date.now();
  const timeSinceLastExport = now - lastExport;
  const remaining = EXPORT_COOLDOWN_MS - timeSinceLastExport;

  return Math.max(0, remaining);
}

/**
 * Clears all rate limit entries (for testing)
 */
export function clearRateLimits(): void {
  lastExportTimestamps.clear();
}
