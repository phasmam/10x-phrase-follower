// Test Encryption with Environment Variables
// This script tests encryption/decryption using the same approach as your app
// Run with: node src/test-encryption-with-env.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Copy the encryption functions from tts-encryption.ts
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 32; // 256 bits

// Get encryption key from environment or generate a default for development
function getEncryptionKey() {
  const key = process.env.TTS_ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TTS_ENCRYPTION_KEY environment variable is required in production");
    }
    // Use a default key for development (DO NOT USE IN PRODUCTION)
    return new TextEncoder().encode("dev-key-32-chars-long-for-tts-encryption");
  }
  // Convert hex string to Uint8Array
  const bytes = new Uint8Array(key.length / 2);
  for (let i = 0; i < key.length; i += 2) {
    bytes[i / 2] = parseInt(key.substr(i, 2), 16);
  }
  return bytes;
}

// Helper function to derive key from master key and salt
async function deriveKey(masterKey, salt) {
  const keyMaterial = await crypto.subtle.importKey("raw", masterKey, { name: "PBKDF2" }, false, ["deriveKey"]);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt function
async function encrypt(plaintext) {
  try {
    const masterKey = getEncryptionKey();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Derive key from master key and salt
    const derivedKey = await deriveKey(masterKey, salt);

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      derivedKey,
      new TextEncoder().encode(plaintext)
    );

    // Combine salt + iv + encrypted data
    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);

    return Buffer.from(result);
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Decrypt function
async function decrypt(encryptedData) {
  try {
    const masterKey = getEncryptionKey();

    // Convert to Buffer if needed
    let buffer;
    if (typeof encryptedData === "string") {
      buffer = Buffer.from(encryptedData, "base64");
    } else if (encryptedData instanceof Uint8Array) {
      buffer = Buffer.from(encryptedData);
    } else {
      buffer = encryptedData;
    }

    // Extract components
    const salt = buffer.subarray(0, SALT_LENGTH);
    const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH);

    // Derive key from master key and salt
    const derivedKey = await deriveKey(masterKey, salt);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      derivedKey,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Test function
async function testEncryptionWithEnv() {
  console.log("=== Encryption Test with Environment Variables ===");
  console.log("Testing encryption/decryption with your app's environment...");

  try {
    // Check environment variables
    console.log(`\n--- Environment Check ---`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV || "undefined"}`);
    console.log(`TTS_ENCRYPTION_KEY: ${process.env.TTS_ENCRYPTION_KEY ? "SET" : "NOT SET"}`);

    // Test with your actual Google API key
    const testApiKey = process.env.GOOGLE_API_KEY;

    if (!testApiKey) {
      console.error("❌ GOOGLE_API_KEY environment variable not found!");
      console.log("Please set your Google API key:");
      console.log("set GOOGLE_API_KEY=your_actual_google_api_key_here");
      return;
    }

    console.log(`Google API Key: ${testApiKey.substring(0, 10)}...`);

    console.log(`\n--- Step 1: Encryption ---`);
    console.log(`Encrypting your actual Google API key...`);

    const encrypted = await encrypt(testApiKey);
    console.log(`Encrypted data type: ${typeof encrypted}`);
    console.log(`Encrypted data length: ${encrypted.length} bytes`);
    console.log(`Encrypted data (first 50 chars): ${encrypted.toString("hex").substring(0, 50)}...`);

    // Save encrypted data to file for inspection
    const encryptedPath = path.join(__dirname, "real-encrypted.bin");
    fs.writeFileSync(encryptedPath, encrypted);
    console.log(`Encrypted data saved to: ${encryptedPath}`);

    console.log(`\n--- Step 2: Decryption ---`);
    console.log(`Attempting to decrypt the encrypted data...`);

    const decrypted = await decrypt(encrypted);
    console.log(`Decrypted API key: ${decrypted.substring(0, 10)}...`);

    console.log(`\n--- Step 3: Verification ---`);
    if (decrypted === testApiKey) {
      console.log(`✅ SUCCESS! Encryption/Decryption working correctly!`);
      console.log(`Original: ${testApiKey.substring(0, 10)}...`);
      console.log(`Decrypted: ${decrypted.substring(0, 10)}...`);
      console.log(`Match: ${decrypted === testApiKey}`);

      // Test if the decrypted key works with TTS
      console.log(`\n--- Step 4: TTS API Test ---`);
      console.log(`Testing decrypted key with Google TTS API...`);

      const testResponse = await fetch("https://texttospeech.googleapis.com/v1/voices", {
        headers: {
          "X-goog-api-key": decrypted,
        },
      });

      if (testResponse.ok) {
        console.log(`✅ TTS API key is valid and working!`);
        console.log(`This proves the encryption/decryption is working correctly.`);
        console.log(`The issue in your main app must be elsewhere.`);
      } else {
        console.log(`❌ TTS API key test failed: ${testResponse.status}`);
      }
    } else {
      console.log(`❌ FAILED! Decrypted data doesn't match original!`);
      console.log(`Original: ${testApiKey.substring(0, 10)}...`);
      console.log(`Decrypted: ${decrypted.substring(0, 10)}...`);
    }
  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Run the test
testEncryptionWithEnv().catch(console.error);
