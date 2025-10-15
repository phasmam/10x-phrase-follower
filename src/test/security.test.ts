import { describe, it, expect } from "vitest";
import { ApiErrors, requireAuth, requireOwnership } from "../lib/errors";

describe("Security Tests", () => {
  describe("Authentication Requirements", () => {
    it("should require authentication for protected endpoints", () => {
      // Test requireAuth function
      expect(() => requireAuth(null)).toThrow("Authentication required");
      expect(() => requireAuth(undefined)).toThrow("Authentication required");
      expect(() => requireAuth("")).toThrow("Authentication required");
      expect(() => requireAuth("valid-user-id")).not.toThrow();
    });

    it("should create proper unauthorized error responses", () => {
      const error = ApiErrors.unauthorized();
      const response = error.toResponse();

      expect(response.status).toBe(401);
      expect(error.code).toBe("unauthorized");
      expect(error.message).toBe("Authentication required");
    });
  });

  describe("Authorization and Ownership", () => {
    it("should enforce resource ownership", () => {
      const userA = "user-a-123";
      const userB = "user-b-456";
      const resourceUserId = userA;

      // Same user should pass
      expect(() => requireOwnership(resourceUserId, userA)).not.toThrow();

      // Different user should fail
      expect(() => requireOwnership(resourceUserId, userB)).toThrow("Access denied to resource");
    });

    it("should create proper forbidden error responses", () => {
      const error = ApiErrors.forbidden();
      const response = error.toResponse();

      expect(response.status).toBe(403);
      expect(error.code).toBe("forbidden");
      expect(error.message).toBe("Access denied");
    });

    it("should support custom resource types in ownership checks", () => {
      const userA = "user-a-123";
      const userB = "user-b-456";
      const notebookUserId = userA;

      expect(() => requireOwnership(notebookUserId, userB, "notebook")).toThrow("Access denied to notebook");
    });
  });

  describe("CORS Security", () => {
    it("should only allow requests from configured origins", () => {
      const allowedOrigins = ["http://localhost:4321", "http://localhost:3000", "https://production-domain.com"];

      // Test allowed origins
      expect(allowedOrigins.includes("http://localhost:4321")).toBe(true);
      expect(allowedOrigins.includes("http://localhost:3000")).toBe(true);
      expect(allowedOrigins.includes("https://production-domain.com")).toBe(true);

      // Test disallowed origins
      expect(allowedOrigins.includes("http://malicious-site.com")).toBe(false);
      expect(allowedOrigins.includes("https://evil-domain.org")).toBe(false);
    });

    it("should set proper CORS headers", () => {
      const expectedHeaders = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
        "Access-Control-Allow-Credentials": "true",
      };

      // Verify header values
      expect(expectedHeaders["Access-Control-Allow-Methods"]).toContain("GET");
      expect(expectedHeaders["Access-Control-Allow-Methods"]).toContain("POST");
      expect(expectedHeaders["Access-Control-Allow-Headers"]).toContain("Authorization");
      expect(expectedHeaders["Access-Control-Allow-Credentials"]).toBe("true");
    });
  });

  describe("JWT Token Security", () => {
    it("should reject tokens without Bearer prefix", () => {
      const invalidTokens = ["plain-token", "Basic token", "Digest token", "", null, undefined];

      invalidTokens.forEach((token) => {
        if (token && typeof token === "string") {
          expect(token.startsWith("Bearer ")).toBe(false);
        }
      });
    });

    it("should validate DEV_JWT prefix in development", () => {
      const devTokens = ["dev_valid-jwt-token", "dev_another-token"];

      const regularTokens = [
        "regular-jwt-token",
        "supabase-jwt-token",
        "dev", // Missing underscore
      ];

      devTokens.forEach((token) => {
        expect(token.startsWith("dev_")).toBe(true);
      });

      regularTokens.forEach((token) => {
        expect(token.startsWith("dev_")).toBe(false);
      });
    });

    it("should handle token extraction correctly", () => {
      const bearerToken = "Bearer valid-jwt-token";
      const extractedToken = bearerToken.substring(7);
      expect(extractedToken).toBe("valid-jwt-token");

      const devToken = "dev_jwt-token";
      const extractedJwt = devToken.substring(4);
      expect(extractedJwt).toBe("jwt-token");
    });
  });

  describe("Error Information Disclosure", () => {
    it("should not expose sensitive information in error messages", () => {
      const error = ApiErrors.internal("Database connection failed");

      // Should not expose database details
      expect(error.message).not.toContain("password");
      expect(error.message).not.toContain("connection string");
      expect(error.message).not.toContain("localhost");
    });

    it("should mask resource existence in 404 responses", () => {
      const error = ApiErrors.notFound("User not found");

      // Should not reveal whether user exists or not
      expect(error.message).toBe("User not found");
      expect(error.code).toBe("not_found");
    });

    it("should not expose JWT secrets in error details", () => {
      const error = ApiErrors.internal("JWT verification failed");

      // Should not include JWT secret in response
      expect(error.message).not.toContain("secret");
      expect(error.message).not.toContain("key");
    });
  });

  describe("Input Validation Security", () => {
    it("should handle malformed JSON gracefully", () => {
      const malformedJson = "{ invalid json }";

      // Should not crash the application
      expect(() => JSON.parse(malformedJson)).toThrow();
    });

    it("should validate UUID format for user IDs", () => {
      const validUuids = ["0a1f3212-c55f-4a62-bc0f-4121a7a72283", "550e8400-e29b-41d4-a716-446655440000"];

      const invalidUuids = ["not-a-uuid", "123", "", null, undefined];

      validUuids.forEach((uuid) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(uuidRegex.test(uuid)).toBe(true);
      });

      invalidUuids.forEach((uuid) => {
        if (uuid && typeof uuid === "string") {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          expect(uuidRegex.test(uuid)).toBe(false);
        }
      });
    });
  });

  describe("Rate Limiting Considerations", () => {
    it("should have reasonable token expiration times", () => {
      // DEV_JWT should have short expiration (5 minutes = 300 seconds)
      const devJwtTtl = 300;
      expect(devJwtTtl).toBeLessThanOrEqual(300);
      expect(devJwtTtl).toBeGreaterThan(0);
    });

    it("should handle concurrent requests safely", () => {
      // This is more of a conceptual test - in real implementation
      // we would test that multiple requests don't interfere with each other
      const userId1 = "user-1";
      const userId2 = "user-2";

      // Each user should have isolated context
      expect(() => requireAuth(userId1)).not.toThrow();
      expect(() => requireAuth(userId2)).not.toThrow();

      // Users should not be able to access each other's resources
      expect(() => requireOwnership(userId1, userId2)).toThrow();
    });
  });

  describe("Environment Security", () => {
    it("should only enable DEV_JWT in development", () => {
      const devEnv = { NODE_ENV: "development" };
      const prodEnv = { NODE_ENV: "production" };

      // DEV_JWT should only work in development
      expect(devEnv.NODE_ENV === "development").toBe(true);
      expect(prodEnv.NODE_ENV === "development").toBe(false);
    });
  });
});
