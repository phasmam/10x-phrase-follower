// Database Encryption Test Script
// This script tests the actual encrypted data from your database
// Run with: node src/test-database-encryption.js

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Copy the decryption function from tts-encryption.ts
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 32; // 256 bits

// Get encryption key from environment or generate a default for development
function getEncryptionKey() {
  const key = process.env.PHRASE_TTS_ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PHRASE_TTS_ENCRYPTION_KEY environment variable is required in production");
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
async function testDatabaseEncryption() {
  console.log("=== Database Encryption Test ===");
  console.log("Testing actual encrypted data from your database...");

  try {
    // Get Supabase configuration
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Missing Supabase configuration!");
      console.log("Please set these environment variables:");
      console.log("SUPABASE_URL=your_supabase_url");
      console.log("SUPABASE_SERVICE_ROLE_KEY=your_service_key");
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get TTS credentials from database
    const { data: credentials, error } = await supabase
      .from("tts_credentials")
      .select("encrypted_key, is_configured, key_fingerprint")
      .eq("user_id", "0a1f3212-c55f-4a62-bc0f-4121a7a72283") // Default user ID
      .single();

    if (error || !credentials) {
      console.error(`❌ Failed to fetch TTS credentials: ${error?.message}`);
      return;
    }

    console.log(`\n--- Database Data Analysis ---`);
    console.log(`Is configured: ${credentials.is_configured}`);
    console.log(`Key fingerprint: ${credentials.key_fingerprint}`);
    console.log(`Encrypted key type: ${typeof credentials.encrypted_key}`);
    console.log(`Encrypted key length: ${credentials.encrypted_key?.length}`);
    console.log(`Encrypted key first 50 chars: ${credentials.encrypted_key?.substring(0, 50)}...`);

    // Save the encrypted data to file for inspection
    const encryptedPath = path.join(__dirname, "database-encrypted.bin");
    fs.writeFileSync(encryptedPath, credentials.encrypted_key);
    console.log(`Database encrypted data saved to: ${encryptedPath}`);

    console.log(`\n--- Attempting Decryption ---`);
    try {
      const decryptedKey = await decrypt(credentials.encrypted_key);
      console.log(`✅ SUCCESS! Decryption worked!`);
      console.log(`Decrypted key length: ${decryptedKey.length}`);
      console.log(`Decrypted key first 10 chars: ${decryptedKey.substring(0, 10)}...`);

      // Test if this key works with TTS
      console.log(`\n--- Testing Decrypted Key with TTS ---`);
      const testResponse = await fetch("https://texttospeech.googleapis.com/v1/voices", {
        headers: {
          "X-goog-api-key": decryptedKey,
        },
      });

      if (testResponse.ok) {
        console.log(`✅ TTS API key is valid and working!`);
      } else {
        console.log(`❌ TTS API key test failed: ${testResponse.status}`);
      }
    } catch (decryptError) {
      console.error(`❌ Decryption failed: ${decryptError.message}`);
      console.error(`Full error:`, decryptError);
    }
  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Run the test
testDatabaseEncryption().catch(console.error);
