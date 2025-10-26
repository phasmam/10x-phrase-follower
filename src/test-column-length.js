// Test Column Length
// This script tests if the database column is truncating the encrypted data
// Run with: node src/test-column-length.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

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
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    masterKey,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

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

// Test function
async function testColumnLength() {
  console.log("=== Test Column Length ===");
  console.log("Testing if the database column is truncating the encrypted data...");
  
  try {
    // Load environment variables from .env file
    const envPath = path.join(__dirname, "..", ".env");
    
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envLines = envContent.split('\n');
      
      for (const line of envLines) {
        if (line.trim() && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
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

    // Test with a known API key
    const testApiKey = process.env.GOOGLE_API_KEY;
    
    if (!testApiKey) {
      console.error("❌ GOOGLE_API_KEY environment variable not found!");
      return;
    }
    
    console.log(`\n--- Encryption Test ---`);
    console.log(`Original API key: ${testApiKey.substring(0, 10)}...`);
    console.log(`Original API key length: ${testApiKey.length} characters`);
    
    // Encrypt the key
    const encrypted = await encrypt(testApiKey);
    console.log(`Encrypted data length: ${encrypted.length} bytes`);
    console.log(`Encrypted data (first 20 bytes):`, Array.from(encrypted.subarray(0, 20)));
    
    // Convert to different formats
    const base64String = encrypted.toString('base64');
    const hexString = encrypted.toString('hex');
    const jsonObject = { type: "Buffer", data: Array.from(encrypted) };
    
    console.log(`\n--- Format Analysis ---`);
    console.log(`Base64 string length: ${base64String.length} characters`);
    console.log(`Hex string length: ${hexString.length} characters`);
    console.log(`JSON object data length: ${jsonObject.data.length} elements`);
    
    // Test storing different formats
    console.log(`\n--- Database Storage Test ---`);
    
    // Test 1: Store as base64 string
    try {
      const { error: error1 } = await supabase
        .from("tts_credentials")
        .upsert({
          user_id: "0a1f3212-c55f-4a62-bc0f-4121a7a72283",
          encrypted_key: base64String,
          key_fingerprint: "test-base64",
          last_validated_at: new Date().toISOString(),
          is_configured: true,
        });
      
      if (error1) {
        console.log(`❌ Base64 storage failed: ${error1.message}`);
      } else {
        console.log(`✅ Base64 storage succeeded`);
        
        // Retrieve and check
        const { data: data1 } = await supabase
          .from("tts_credentials")
          .select("encrypted_key")
          .eq("user_id", "0a1f3212-c55f-4a62-bc0f-4121a7a72283")
          .single();
        
        console.log(`Retrieved base64 length: ${data1?.encrypted_key?.length || 0} characters`);
        console.log(`Base64 match: ${data1?.encrypted_key === base64String ? 'YES' : 'NO'}`);
      }
    } catch (e) {
      console.log(`❌ Base64 storage error: ${e.message}`);
    }
    
    // Test 2: Store as JSON object
    try {
      const { error: error2 } = await supabase
        .from("tts_credentials")
        .upsert({
          user_id: "0a1f3212-c55f-4a62-bc0f-4121a7a72283",
          encrypted_key: jsonObject,
          key_fingerprint: "test-json",
          last_validated_at: new Date().toISOString(),
          is_configured: true,
        });
      
      if (error2) {
        console.log(`❌ JSON storage failed: ${error2.message}`);
      } else {
        console.log(`✅ JSON storage succeeded`);
        
        // Retrieve and check
        const { data: data2 } = await supabase
          .from("tts_credentials")
          .select("encrypted_key")
          .eq("user_id", "0a1f3212-c55f-4a62-bc0f-4121a7a72283")
          .single();
        
        console.log(`Retrieved JSON type: ${typeof data2?.encrypted_key}`);
        console.log(`Retrieved JSON length: ${JSON.stringify(data2?.encrypted_key).length} characters`);
        console.log(`JSON match: ${JSON.stringify(data2?.encrypted_key) === JSON.stringify(jsonObject) ? 'YES' : 'NO'}`);
      }
    } catch (e) {
      console.log(`❌ JSON storage error: ${e.message}`);
    }

  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Run the test
testColumnLength().catch(console.error);
