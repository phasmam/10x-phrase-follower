import { createHash } from "crypto";

// Encryption configuration
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 32; // 256 bits

// Get encryption key from environment or generate a default for development
function getEncryptionKey(): Uint8Array {
  const key = process.env.TTS_ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TTS_ENCRYPTION_KEY environment variable is required in production");
    }
    // Use a default key for development (DO NOT USE IN PRODUCTION)
    return new TextEncoder().encode("dev-key-32-chars-long-for-tts-encryption");
  }
  return new Uint8Array(Buffer.from(key, "hex"));
}

// Helper function to derive key from master key and salt
async function deriveKey(masterKey: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
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

/**
 * Encrypts a TTS API key using AES-GCM
 * @param plaintext The API key to encrypt
 * @returns Encrypted key as Buffer
 */
export async function encrypt(plaintext: string): Promise<Buffer> {
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

/**
 * Decrypts a TTS API key using AES-GCM
 * @param encryptedData The encrypted key as Buffer
 * @returns Decrypted API key
 */
export async function decrypt(encryptedData: Buffer): Promise<string> {
  try {
    const masterKey = getEncryptionKey();
    
    // Extract components
    const salt = encryptedData.subarray(0, SALT_LENGTH);
    const iv = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encrypted = encryptedData.subarray(SALT_LENGTH + IV_LENGTH);
    
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

/**
 * Generates a fingerprint for the API key (for display purposes only)
 * @param apiKey The API key
 * @returns SHA-256 fingerprint with "SHA256:" prefix
 */
export function generateKeyFingerprint(apiKey: string): string {
  const hash = createHash("sha256");
  hash.update(apiKey);
  return `SHA256:${hash.digest("hex").substring(0, 16)}`;
}

/**
 * Validates that the encryption/decryption is working correctly
 * @returns Promise<boolean> True if validation passes
 */
export async function validateEncryption(): Promise<boolean> {
  try {
    const testKey = "test-api-key-12345";
    const encrypted = await encrypt(testKey);
    const decrypted = await decrypt(encrypted);
    return decrypted === testKey;
  } catch {
    return false;
  }
}
