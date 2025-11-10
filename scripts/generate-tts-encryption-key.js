#!/usr/bin/env node
/**
 * Helper script to generate a secure TTS_ENCRYPTION_KEY
 *
 * Usage:
 *   node scripts/generate-tts-encryption-key.js
 *   npm run generate:tts-key
 *
 * This generates a 64-character hex string (32 bytes) that can be used
 * as the TTS_ENCRYPTION_KEY environment variable.
 */

import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { resolve } from "path";

const KEY_LENGTH = 32; // 32 bytes = 256 bits
const HEX_LENGTH = KEY_LENGTH * 2; // 64 hex characters

function generateKey() {
  const keyBytes = randomBytes(KEY_LENGTH);
  const keyHex = keyBytes.toString("hex");

  if (keyHex.length !== HEX_LENGTH) {
    throw new Error(`Generated key has invalid length: ${keyHex.length} (expected ${HEX_LENGTH})`);
  }

  return keyHex;
}

function validateKey(key) {
  if (typeof key !== "string") {
    return { valid: false, error: "Key must be a string" };
  }

  if (key.length !== HEX_LENGTH) {
    return {
      valid: false,
      error: `Key must be exactly ${HEX_LENGTH} characters (got ${key.length})`,
    };
  }

  if (!/^[0-9a-f]+$/i.test(key)) {
    return { valid: false, error: "Key must contain only hexadecimal characters (0-9, a-f)" };
  }

  return { valid: true };
}

function main() {
  console.log("=".repeat(60));
  console.log("TTS Encryption Key Generator");
  console.log("=".repeat(60));
  console.log();

  try {
    const key = generateKey();
    const validation = validateKey(key);

    if (!validation.valid) {
      console.error("❌ Generated key failed validation:", validation.error);
      process.exit(1);
    }

    console.log("✅ Generated secure TTS encryption key:");
    console.log();
    console.log(key);
    console.log();
    console.log("=".repeat(60));
    console.log("Add this to your .env file:");
    console.log("=".repeat(60));
    console.log();
    console.log(`TTS_ENCRYPTION_KEY=${key}`);
    console.log();
    console.log("⚠️  IMPORTANT:");
    console.log("  - Keep this key secret and secure");
    console.log("  - Never commit it to version control");
    console.log("  - Use the same key for encryption and decryption");
    console.log("  - If you lose this key, encrypted data cannot be recovered");
    console.log("  - If you change this key, all encrypted TTS credentials will be invalid");
    console.log();
  } catch (error) {
    console.error("❌ Failed to generate key:", error.message);
    process.exit(1);
  }
}

// Run if executed directly (not imported)
// In ES modules, check if this file is the main entry point
const __filename = fileURLToPath(import.meta.url);
const scriptPath = resolve(process.argv[1] || "");

// Run main if this script is executed directly
if (__filename === scriptPath || scriptPath.includes("generate-tts-encryption-key.js")) {
  main();
}

export { generateKey, validateKey };
