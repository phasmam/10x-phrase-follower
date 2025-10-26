// Fix JSON Buffer Issue
// This script fixes the JSON-encoded Buffer issue in your database
// Run with: node src/fix-json-buffer.js

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

// Decrypt function
async function decrypt(encryptedData) {
  try {
    const masterKey = getEncryptionKey();
    
    // Convert to Buffer if needed
    let buffer;
    if (typeof encryptedData === 'string') {
      buffer = Buffer.from(encryptedData, 'base64');
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

// Function to convert JSON-encoded Buffer back to binary
function convertJsonBufferToBinary(jsonBufferString) {
  try {
    // The string starts with \x7b which is the escaped version of {
    // We need to unescape it first
    const unescaped = jsonBufferString.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    
    // Now parse the JSON
    const bufferObj = JSON.parse(unescaped);
    
    // Convert the data array back to Buffer
    const buffer = Buffer.from(bufferObj.data);
    
    return buffer;
  } catch (error) {
    console.error(`Failed to convert JSON buffer: ${error.message}`);
    return null;
  }
}

// Test function
async function fixJsonBuffer() {
  console.log("=== Fix JSON Buffer Issue ===");
  console.log("Fixing the JSON-encoded Buffer issue in your database...");
  
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

    console.log(`Supabase URL: ${supabaseUrl.substring(0, 30)}...`);
    console.log(`Service Key: ${supabaseServiceKey.substring(0, 20)}...`);

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

    console.log(`\n--- Current Database Data ---`);
    console.log(`Is configured: ${credentials.is_configured}`);
    console.log(`Key fingerprint: ${credentials.key_fingerprint}`);
    console.log(`Encrypted key type: ${typeof credentials.encrypted_key}`);
    console.log(`Encrypted key length: ${credentials.encrypted_key?.length}`);
    console.log(`Encrypted key first 50 chars: ${credentials.encrypted_key?.substring(0, 50)}...`);

    // Check if the data is JSON-encoded Buffer
    if (credentials.encrypted_key.startsWith('\\x7b2274797065223a22427566666572222c2264617461223a')) {
      console.log(`\n--- Converting JSON Buffer to Binary ---`);
      
      // Convert JSON-encoded Buffer back to binary
      const binaryData = convertJsonBufferToBinary(credentials.encrypted_key);
      
      if (!binaryData) {
        console.error(`❌ Failed to convert JSON buffer to binary!`);
        return;
      }
      
      console.log(`Converted to binary data length: ${binaryData.length} bytes`);
      
      // Try to decrypt the converted data
      try {
        const decryptedKey = await decrypt(binaryData);
        console.log(`✅ SUCCESS! Decryption worked with converted data!`);
        console.log(`Decrypted key: ${decryptedKey.substring(0, 10)}...`);
        
        // Test if this key works with TTS
        console.log(`\n--- Testing Decrypted Key with TTS ---`);
        const testResponse = await fetch("https://texttospeech.googleapis.com/v1/voices", {
          headers: {
            "X-goog-api-key": decryptedKey,
          },
        });
        
        if (testResponse.ok) {
          console.log(`✅ TTS API key is valid and working!`);
          
          // Now update the database with properly formatted encrypted data
          console.log(`\n--- Updating Database with Proper Format ---`);
          
          // Re-encrypt the key with proper format
          const properlyEncrypted = await encrypt(decryptedKey);
          console.log(`Re-encrypted data length: ${properlyEncrypted.length} bytes`);
          
          // Update the database
          const { error: updateError } = await supabase
            .from("tts_credentials")
            .update({ 
              encrypted_key: properlyEncrypted,
              key_fingerprint: `SHA256:${decryptedKey.substring(0, 16)}`
            })
            .eq("user_id", "0a1f3212-c55f-4a62-bc0f-4121a7a72283");
          
          if (updateError) {
            console.error(`❌ Failed to update database: ${updateError.message}`);
            return;
          }
          
          console.log(`✅ Database updated with properly formatted encrypted data!`);
          console.log(`Your job worker should now work correctly.`);
          
        } else {
          console.log(`❌ TTS API key test failed: ${testResponse.status}`);
        }
        
      } catch (decryptError) {
        console.error(`❌ Still failed to decrypt converted data: ${decryptError.message}`);
      }
      
    } else {
      console.log(`\n--- Data Format Analysis ---`);
      console.log(`The encrypted data is not in the expected JSON format.`);
      console.log(`This might be a different type of corruption.`);
    }

  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Run the fix
fixJsonBuffer().catch(console.error);
