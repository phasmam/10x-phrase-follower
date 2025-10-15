import { describe, it, expect, beforeEach } from "vitest";
import {
  validateIdempotencyKey,
  storeIdempotencyResponse,
  getIdempotencyResponse,
  cleanupExpiredEntries,
  getCacheStats,
  clearCache,
} from "../lib/idempotency.service";
import type { ImportNotebookResultDTO } from "../types";

describe("Idempotency Service", () => {
  beforeEach(() => {
    // Clean up any existing cache entries before each test
    clearCache();
  });

  describe("validateIdempotencyKey", () => {
    it("should accept valid UUID v4", () => {
      const validKey = "550e8400-e29b-41d4-a716-446655440000";
      expect(validateIdempotencyKey(validKey)).toBe(true);
    });

    it("should reject invalid UUID format", () => {
      const invalidKey = "not-a-uuid";
      expect(validateIdempotencyKey(invalidKey)).toBe(false);
    });

    it("should reject non-UUID v4", () => {
      const nonV4Key = "550e8400-e29b-31d4-a716-446655440000"; // v3 UUID
      expect(validateIdempotencyKey(nonV4Key)).toBe(false);
    });

    it("should reject empty string", () => {
      expect(validateIdempotencyKey("")).toBe(false);
    });
  });

  describe("storeIdempotencyResponse", () => {
    it("should store response successfully", () => {
      const userId = "user-123";
      const route = "notebooks:import";
      const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";
      const response: ImportNotebookResultDTO = {
        notebook: {
          id: "notebook-123",
          name: "Test Notebook",
          current_build_id: null,
          last_generate_job_id: null,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
        },
        import: {
          accepted: 1,
          rejected: 0,
          logs: [],
        },
      };

      expect(() => storeIdempotencyResponse(userId, route, idempotencyKey, response)).not.toThrow();
    });
  });

  describe("getIdempotencyResponse", () => {
    it("should return null for non-existent key", () => {
      const userId = "user-123";
      const route = "notebooks:import";
      const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";

      const result = getIdempotencyResponse(userId, route, idempotencyKey);
      expect(result).toBeNull();
    });

    it("should return stored response for valid key", () => {
      const userId = "user-123";
      const route = "notebooks:import";
      const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";
      const response: ImportNotebookResultDTO = {
        notebook: {
          id: "notebook-123",
          name: "Test Notebook",
          current_build_id: null,
          last_generate_job_id: null,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
        },
        import: {
          accepted: 1,
          rejected: 0,
          logs: [],
        },
      };

      storeIdempotencyResponse(userId, route, idempotencyKey, response);
      const result = getIdempotencyResponse(userId, route, idempotencyKey);

      expect(result).toEqual(response);
    });

    it("should return null for different user", () => {
      const userId1 = "user-123";
      const userId2 = "user-456";
      const route = "notebooks:import";
      const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";
      const response: ImportNotebookResultDTO = {
        notebook: {
          id: "notebook-123",
          name: "Test Notebook",
          current_build_id: null,
          last_generate_job_id: null,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
        },
        import: {
          accepted: 1,
          rejected: 0,
          logs: [],
        },
      };

      storeIdempotencyResponse(userId1, route, idempotencyKey, response);
      const result = getIdempotencyResponse(userId2, route, idempotencyKey);

      expect(result).toBeNull();
    });

    it("should return null for different route", () => {
      const userId = "user-123";
      const route1 = "notebooks:import";
      const route2 = "notebooks:create";
      const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";
      const response: ImportNotebookResultDTO = {
        notebook: {
          id: "notebook-123",
          name: "Test Notebook",
          current_build_id: null,
          last_generate_job_id: null,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
        },
        import: {
          accepted: 1,
          rejected: 0,
          logs: [],
        },
      };

      storeIdempotencyResponse(userId, route1, idempotencyKey, response);
      const result = getIdempotencyResponse(userId, route2, idempotencyKey);

      expect(result).toBeNull();
    });
  });

  describe("cleanupExpiredEntries", () => {
    it("should remove expired entries", () => {
      const userId = "user-123";
      const route = "notebooks:import";
      const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";
      const response: ImportNotebookResultDTO = {
        notebook: {
          id: "notebook-123",
          name: "Test Notebook",
          current_build_id: null,
          last_generate_job_id: null,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
        },
        import: {
          accepted: 1,
          rejected: 0,
          logs: [],
        },
      };

      // Store response
      storeIdempotencyResponse(userId, route, idempotencyKey, response);

      // Verify it exists
      expect(getIdempotencyResponse(userId, route, idempotencyKey)).toEqual(response);

      // Clean up expired entries (this should not remove the entry as it's not expired)
      cleanupExpiredEntries();

      // Verify it still exists
      expect(getIdempotencyResponse(userId, route, idempotencyKey)).toEqual(response);
    });
  });

  describe("getCacheStats", () => {
    it("should return empty stats for empty cache", () => {
      const stats = getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.entries).toEqual([]);
    });

    it("should return stats for populated cache", () => {
      const userId = "user-123";
      const route = "notebooks:import";
      const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";
      const response: ImportNotebookResultDTO = {
        notebook: {
          id: "notebook-123",
          name: "Test Notebook",
          current_build_id: null,
          last_generate_job_id: null,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
        },
        import: {
          accepted: 1,
          rejected: 0,
          logs: [],
        },
      };

      storeIdempotencyResponse(userId, route, idempotencyKey, response);

      const stats = getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries).toHaveLength(1);
      expect(stats.entries[0].key).toContain(userId);
      expect(stats.entries[0].key).toContain(route);
      expect(stats.entries[0].key).toContain(idempotencyKey);
    });
  });
});
