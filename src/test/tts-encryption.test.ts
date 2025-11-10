import { describe, it, expect } from "vitest";
import { encrypt, decrypt, generateKeyFingerprint, validateEncryption } from "../lib/tts-encryption";

describe("TTS Encryption", () => {
  it("should encrypt and decrypt a test key", async () => {
    const testKey = "test-api-key-12345";
    const encrypted = await encrypt(testKey);
    const decrypted = await decrypt(encrypted);

    expect(decrypted).toBe(testKey);
  });

  it("should generate consistent fingerprints", async () => {
    const apiKey = "test-api-key-12345";
    const fingerprint1 = await generateKeyFingerprint(apiKey);
    const fingerprint2 = await generateKeyFingerprint(apiKey);

    expect(fingerprint1).toBe(fingerprint2);
    expect(fingerprint1).toMatch(/^SHA256:[a-f0-9]{16}$/);
  });

  it("should validate encryption is working", async () => {
    const isValid = await validateEncryption();
    expect(isValid).toBe(true);
  });

  it("should handle different key lengths", async () => {
    const shortKey = "short";
    const longKey = "a".repeat(1000);

    const encryptedShort = await encrypt(shortKey);
    const encryptedLong = await encrypt(longKey);

    const decryptedShort = await decrypt(encryptedShort);
    const decryptedLong = await decrypt(encryptedLong);

    expect(decryptedShort).toBe(shortKey);
    expect(decryptedLong).toBe(longKey);
  });

  it("should generate different encrypted data for same input", async () => {
    const apiKey = "test-api-key-12345";
    const encrypted1 = await encrypt(apiKey);
    const encrypted2 = await encrypt(apiKey);

    // Should be different due to random salt/IV
    expect(encrypted1).not.toEqual(encrypted2);

    // But both should decrypt to the same value
    const decrypted1 = await decrypt(encrypted1);
    const decrypted2 = await decrypt(encrypted2);

    expect(decrypted1).toBe(apiKey);
    expect(decrypted2).toBe(apiKey);
  });
});
