import type { ImportNotebookResultDTO } from "../types";

/**
 * Idempotency service for handling duplicate requests
 * Stores responses by user + route + idempotency key
 */

interface IdempotencyEntry {
  response: ImportNotebookResultDTO;
  timestamp: number;
  expiresAt: number;
}

// In-memory cache for idempotency (in production, use Redis or similar)
const idempotencyCache = new Map<string, IdempotencyEntry>();

// Cache TTL: 1 hour
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Generates a cache key for idempotency
 */
function generateCacheKey(userId: string, route: string, idempotencyKey: string): string {
  return `${userId}:${route}:${idempotencyKey}`;
}

/**
 * Validates idempotency key format (UUID v4)
 */
export function validateIdempotencyKey(key: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(key);
}

/**
 * Stores an idempotency response
 */
export function storeIdempotencyResponse(
  userId: string,
  route: string,
  idempotencyKey: string,
  response: ImportNotebookResultDTO
): void {
  const cacheKey = generateCacheKey(userId, route, idempotencyKey);
  const now = Date.now();

  const entry: IdempotencyEntry = {
    response,
    timestamp: now,
    expiresAt: now + CACHE_TTL_MS,
  };

  idempotencyCache.set(cacheKey, entry);
}

/**
 * Retrieves an idempotency response if it exists and is not expired
 */
export function getIdempotencyResponse(
  userId: string,
  route: string,
  idempotencyKey: string
): ImportNotebookResultDTO | null {
  const cacheKey = generateCacheKey(userId, route, idempotencyKey);
  const entry = idempotencyCache.get(cacheKey);

  if (!entry) {
    return null;
  }

  // Check if expired
  if (Date.now() > entry.expiresAt) {
    idempotencyCache.delete(cacheKey);
    return null;
  }

  return entry.response;
}

/**
 * Cleans up expired entries from the cache
 * Should be called periodically in production
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();

  for (const [key, entry] of idempotencyCache.entries()) {
    if (now > entry.expiresAt) {
      idempotencyCache.delete(key);
    }
  }
}

/**
 * Clears all entries from the cache (for testing)
 */
export function clearCache(): void {
  idempotencyCache.clear();
}

/**
 * Gets cache statistics for monitoring
 */
export function getCacheStats(): { size: number; entries: { key: string; expiresAt: number }[] } {
  const entries = Array.from(idempotencyCache.entries()).map(([key, entry]) => ({
    key,
    expiresAt: entry.expiresAt,
  }));

  return {
    size: idempotencyCache.size,
    entries,
  };
}
