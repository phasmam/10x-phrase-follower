// Job Worker Simulation Test
// This script simulates exactly what the job worker does
// Run with: node src/test-job-worker-simulation.js

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

// Decrypt function (exact copy from tts-encryption.ts)
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

// TTS Service (exact copy from job-worker.ts)
class TtsService {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async synthesize(text, voiceId, language) {
    const requestBody = {
      input: { text },
      voice: {
        languageCode: language,
        name: voiceId,
      },
      audioConfig: {
        audioEncoding: "MP3",
        sampleRateHertz: 22050,
        speakingRate: 1.0,
      },
    };

    console.log(`Making TTS request for: "${text}"`);
    console.log(`Voice: ${voiceId}, Language: ${language}`);
    console.log(`API Key: ${this.apiKey.substring(0, 10)}...`);

    const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: {
        "X-goog-api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`TTS API Error: ${response.status} - ${errorText}`);

      if (response.status === 400) {
        throw new Error("invalid_key");
      }
      if (response.status === 402) {
        throw new Error("quota_exceeded");
      }
      if (response.status === 504) {
        throw new Error("tts_timeout");
      }
      throw new Error("tts_error");
    }

    const data = await response.json();
    const audioData = Buffer.from(data.audioContent, "base64");

    console.log(`Audio generated successfully!`);
    console.log(`Audio size: ${audioData.length} bytes`);

    return audioData;
  }
}

// Test function
async function testJobWorkerSimulation() {
  console.log("=== Job Worker Simulation Test ===");
  console.log("Simulating exactly what the job worker does...");

  try {
    // Step 1: Test encryption/decryption with a known key
    console.log(`\n--- Step 1: Test Encryption/Decryption ---`);
    const testApiKey = process.env.GOOGLE_API_KEY;

    if (!testApiKey) {
      console.error("❌ GOOGLE_API_KEY environment variable not found!");
      return;
    }

    console.log(`Original API key: ${testApiKey.substring(0, 10)}...`);

    // Encrypt the key (simulating what happens when user saves credentials)
    const encrypted = await encrypt(testApiKey);
    console.log(`Encrypted data length: ${encrypted.length} bytes`);

    // Save encrypted data to file
    const encryptedPath = path.join(__dirname, "simulation-encrypted.bin");
    fs.writeFileSync(encryptedPath, encrypted);
    console.log(`Encrypted data saved to: ${encryptedPath}`);

    // Step 2: Simulate what job worker does - decrypt the key
    console.log(`\n--- Step 2: Simulate Job Worker Decryption ---`);
    console.log(`Attempting to decrypt the encrypted data (like job worker does)...`);

    const decryptedKey = await decrypt(encrypted);
    console.log(`Decrypted key: ${decryptedKey.substring(0, 10)}...`);

    if (decryptedKey !== testApiKey) {
      console.error(`❌ Decryption failed! Keys don't match!`);
      return;
    }

    console.log(`✅ Decryption successful!`);

    // Step 3: Test TTS service with decrypted key
    console.log(`\n--- Step 3: Test TTS Service ---`);
    console.log(`Testing TTS service with decrypted key...`);

    const ttsService = new TtsService(decryptedKey);

    // Test with a simple phrase
    const testPhrase = "Hello world, this is a test";
    const voiceId = "en-GB-Standard-B";
    const language = "en";

    console.log(`Testing TTS with phrase: "${testPhrase}"`);

    try {
      const audioBuffer = await ttsService.synthesize(testPhrase, voiceId, language);

      // Save audio to file
      const audioPath = path.join(__dirname, "simulation-output.mp3");
      fs.writeFileSync(audioPath, audioBuffer);

      console.log(`\n✅ SUCCESS! Job worker simulation completed successfully!`);
      console.log(`Audio file saved to: ${audioPath}`);
      console.log(`File size: ${audioBuffer.length} bytes`);
    } catch (ttsError) {
      console.error(`❌ TTS generation failed: ${ttsError.message}`);
      console.error(`This might be the same error you're seeing in your job worker.`);
    }
  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Encrypt function (needed for the test)
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

// Run the test
testJobWorkerSimulation().catch(console.error);
