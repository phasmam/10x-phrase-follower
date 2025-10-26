// Encryption/Decryption Test Script
// This script tests the encryption and decryption process step by step
// Run with: node src/test-encryption.js

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

// Test function
async function testEncryption() {
  console.log("=== Encryption/Decryption Test ===");
  console.log("Testing encryption and decryption process...");
  
  try {
    // Test with a sample API key
    const testApiKey = "AIzaSyA-4j1234567890abcdefghijklmnopqrstuvwxyz";
    
    console.log(`\n--- Step 1: Encryption ---`);
    console.log(`Original API key: ${testApiKey.substring(0, 10)}...`);
    
    const encrypted = await encrypt(testApiKey);
    console.log(`Encrypted data type: ${typeof encrypted}`);
    console.log(`Encrypted data length: ${encrypted.length} bytes`);
    console.log(`Encrypted data (first 50 chars): ${encrypted.toString('hex').substring(0, 50)}...`);
    
    // Save encrypted data to file for inspection
    const encryptedPath = path.join(__dirname, "test-encrypted.bin");
    fs.writeFileSync(encryptedPath, encrypted);
    console.log(`Encrypted data saved to: ${encryptedPath}`);
    
    console.log(`\n--- Step 2: Decryption ---`);
    console.log(`Attempting to decrypt the encrypted data...`);
    
    const decrypted = await decrypt(encrypted);
    console.log(`Decrypted API key: ${decrypted.substring(0, 10)}...`);
    
    console.log(`\n--- Step 3: Verification ---`);
    if (decrypted === testApiKey) {
      console.log(`✅ SUCCESS! Encryption/Decryption working correctly!`);
      console.log(`Original: ${testApiKey}`);
      console.log(`Decrypted: ${decrypted}`);
      console.log(`Match: ${decrypted === testApiKey}`);
    } else {
      console.log(`❌ FAILED! Decrypted data doesn't match original!`);
      console.log(`Original: ${testApiKey}`);
      console.log(`Decrypted: ${decrypted}`);
    }
    
  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Run the test
testEncryption().catch(console.error);
