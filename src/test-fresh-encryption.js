// Test Fresh Encryption
// This script tests encryption/decryption with fresh data to verify the process works
// Run with: node src/test-fresh-encryption.js

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

// Decrypt function
async function decrypt(encryptedData) {
  try {
    const masterKey = getEncryptionKey();
    
    // Convert to Buffer if needed
    let buffer;
    if (typeof encryptedData === 'string') {
      // Check if it's hex encoded (starts with \x)
      if (encryptedData.startsWith('\\x')) {
        // Remove \x prefix and convert hex to buffer
        const hexString = encryptedData.replace(/\\x/g, '');
        buffer = Buffer.from(hexString, 'hex');
      } else {
        // Try base64 first, then hex
        try {
          buffer = Buffer.from(encryptedData, 'base64');
        } catch {
          buffer = Buffer.from(encryptedData, 'hex');
        }
      }
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
async function testFreshEncryption() {
  console.log("=== Test Fresh Encryption ===");
  console.log("Testing encryption/decryption with fresh data...");
  
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
    
    // Test with a fresh API key
    const testApiKey = process.env.GOOGLE_API_KEY;
    
    if (!testApiKey) {
      console.error("❌ GOOGLE_API_KEY environment variable not found!");
      return;
    }
    
    console.log(`\n--- Step 1: Fresh Encryption ---`);
    console.log(`Original API key: ${testApiKey.substring(0, 10)}...`);
    
    // Encrypt the key
    const encrypted = await encrypt(testApiKey);
    console.log(`Encrypted data length: ${encrypted.length} bytes`);
    console.log(`Encrypted data (first 20 bytes):`, Array.from(encrypted.subarray(0, 20)));
    
    // Save encrypted data to file
    const encryptedPath = path.join(__dirname, "fresh-encrypted.bin");
    fs.writeFileSync(encryptedPath, encrypted);
    console.log(`Encrypted data saved to: ${encryptedPath}`);
    
    // Convert to hex string (like Supabase does)
    const hexString = '\\x' + encrypted.toString('hex');
    console.log(`Hex string length: ${hexString.length}`);
    console.log(`Hex string first 50 chars: ${hexString.substring(0, 50)}...`);
    
    // Save hex string to file
    const hexPath = path.join(__dirname, "fresh-hex.txt");
    fs.writeFileSync(hexPath, hexString);
    console.log(`Hex string saved to: ${hexPath}`);
    
    console.log(`\n--- Step 2: Test Decryption ---`);
    console.log(`Attempting to decrypt the hex string...`);
    
    try {
      const decrypted = await decrypt(hexString);
      console.log(`✅ SUCCESS! Decryption worked!`);
      console.log(`Decrypted key: ${decrypted.substring(0, 10)}...`);
      
      if (decrypted === testApiKey) {
        console.log(`✅ Keys match! Encryption/decryption is working correctly.`);
        
        // Test if this key works with TTS
        console.log(`\n--- Step 3: Test TTS API ---`);
        const testResponse = await fetch("https://texttospeech.googleapis.com/v1/voices", {
          headers: {
            "X-goog-api-key": decrypted,
          },
        });
        
        if (testResponse.ok) {
          console.log(`✅ TTS API key is valid and working!`);
          console.log(`\n🎉 CONCLUSION:`);
          console.log(`The encryption/decryption process works correctly.`);
          console.log(`The issue is with the data stored in your database.`);
          console.log(`You need to re-save your TTS credentials through the app.`);
        } else {
          console.log(`❌ TTS API key test failed: ${testResponse.status}`);
        }
        
      } else {
        console.log(`❌ Keys don't match! Something is wrong with the encryption.`);
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
testFreshEncryption().catch(console.error);
