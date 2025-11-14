// Debug Hex Data
// This script examines the hex-encoded encrypted data
// Run with: node src/debug-hex-data.js

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

// Test function
async function debugHexData() {
  console.log("=== Debug Hex Data ===");
  console.log("Examining the hex-encoded encrypted data...");

  try {
    // Load environment variables from .env file
    const envPath = path.join(__dirname, "..", ".env");

    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf8");
      const envLines = envContent.split("\n");

      for (const line of envLines) {
        if (line.trim() && !line.startsWith("#")) {
          const [key, ...valueParts] = line.split("=");
          if (key && valueParts.length > 0) {
            const value = valueParts.join("=").trim();
            process.env[key.trim()] = value;
          }
        }
      }
    }

    // Get Supabase configuration
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Missing Supabase configuration!");
      return;
    }

    // Import Supabase client
    const { createClient } = await import("@supabase/supabase-js");

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
      .eq("user_id", "0a1f3212-c55f-4a62-bc0f-4121a7a72283")
      .single();

    if (error || !credentials) {
      console.error(`❌ Failed to fetch TTS credentials: ${error?.message}`);
      return;
    }

    console.log(`\n--- Raw Data Analysis ---`);
    console.log(`Encrypted key type: ${typeof credentials.encrypted_key}`);
    console.log(`Encrypted key length: ${credentials.encrypted_key?.length}`);
    console.log(`Encrypted key first 100 chars: ${credentials.encrypted_key?.substring(0, 100)}...`);

    // Save the raw data to file for inspection
    const rawPath = path.join(__dirname, "raw-hex-encrypted.txt");
    fs.writeFileSync(rawPath, credentials.encrypted_key);
    console.log(`Raw data saved to: ${rawPath}`);

    // Try different conversion methods
    console.log(`\n--- Conversion Attempts ---`);

    // Method 1: Direct hex conversion
    try {
      const hexString = credentials.encrypted_key.replace(/\\x/g, "");
      const buffer1 = Buffer.from(hexString, "hex");
      console.log(`Method 1 - Hex string length: ${hexString.length}`);
      console.log(`Method 1 - Buffer length: ${buffer1.length} bytes`);
      console.log(`Method 1 - Buffer first 20 bytes:`, Array.from(buffer1.subarray(0, 20)));

      // Check if it has the right structure (salt + iv + encrypted)
      if (buffer1.length >= SALT_LENGTH + IV_LENGTH) {
        const salt = buffer1.subarray(0, SALT_LENGTH);
        const iv = buffer1.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const encrypted = buffer1.subarray(SALT_LENGTH + IV_LENGTH);

        console.log(`Method 1 - Salt (first 10 bytes):`, Array.from(salt.subarray(0, 10)));
        console.log(`Method 1 - IV (first 10 bytes):`, Array.from(iv.subarray(0, 10)));
        console.log(`Method 1 - Encrypted length: ${encrypted.length} bytes`);
      }
    } catch (e) {
      console.log(`Method 1 failed: ${e.message}`);
    }

    // Method 2: Try base64 first
    try {
      const buffer2 = Buffer.from(credentials.encrypted_key, "base64");
      console.log(`Method 2 - Base64 buffer length: ${buffer2.length} bytes`);
      console.log(`Method 2 - Buffer first 20 bytes:`, Array.from(buffer2.subarray(0, 20)));
    } catch (e) {
      console.log(`Method 2 failed: ${e.message}`);
    }

    // Method 3: Try as raw string
    try {
      const rawString = credentials.encrypted_key;
      console.log(`Method 3 - Raw string first 20 chars:`, rawString.substring(0, 20));
      console.log(
        `Method 3 - Raw string char codes:`,
        Array.from(rawString.substring(0, 20)).map((c) => c.charCodeAt(0))
      );
    } catch (e) {
      console.log(`Method 3 failed: ${e.message}`);
    }
  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Run the debug
debugHexData().catch(console.error);
