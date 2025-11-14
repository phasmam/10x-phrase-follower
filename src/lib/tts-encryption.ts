// Using Web Crypto API instead of Node.js crypto

// Encryption configuration
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 32; // 256 bits

// Attempt to read Cloudflare bindings via Astro runtime at runtime
async function getAstroRuntimeEnv(): Promise<Record<string, string | undefined> | undefined> {
  try {
    // Build the module id without a static string so bundlers don't try to resolve it.
    const id = ["astro", "runtime", "server"].join("/");
    // Use eval-based dynamic import to avoid Rollup/Vite resolution at build time.
    const dynImport: (m: string) => Promise<unknown> = new Function("m", "return import(m);") as never;
    const mod = (await dynImport(id)) as { getRuntime?: () => { env?: Record<string, string | undefined> } };
    const runtime = typeof mod?.getRuntime === "function" ? mod.getRuntime() : undefined;
    return (runtime?.env ?? {}) as Record<string, string | undefined>;
  } catch {
    return undefined;
  }
}

type MaybeValue = string | undefined;

// Allow request handlers to provide runtime env explicitly (e.g., Cloudflare bindings)
let runtimeEnvOverride: Record<string, string | undefined> | null = null;
export function setRuntimeEnv(env: Record<string, string | undefined> | undefined): void {
  runtimeEnvOverride = env ?? null;
}

function isJsonBuffer(value: unknown): value is { type: "Buffer"; data: number[] } {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  );
}

type EnvSource = "astro-runtime" | "import-meta" | "process" | "globalThis" | "none";
interface EnvTrace {
  source: EnvSource;
  value: MaybeValue;
  lengths: Record<Exclude<EnvSource, "none">, number | null>;
}

async function readEnvWithTrace(key: string): Promise<EnvTrace> {
  // Optional override provided by request handlers (e.g., Cloudflare runtime bind)
  if (runtimeEnvOverride && runtimeEnvOverride[key]) {
    const value = runtimeEnvOverride[key];
    return {
      source: "astro-runtime",
      value,
      lengths: {
        "astro-runtime": typeof value === "string" ? value.length : null,
        "import-meta": null,
        process: null,
        globalThis: null,
      },
    };
  }

  const lengths: EnvTrace["lengths"] = {
    "astro-runtime": null,
    "import-meta": null,
    process: null,
    globalThis: null,
  };

  // 1) Cloudflare bindings via Astro runtime (preferred on CF Pages)
  const runtimeEnv = await getAstroRuntimeEnv();
  const runtimeVal = runtimeEnv?.[key];
  lengths["astro-runtime"] = typeof runtimeVal === "string" ? runtimeVal.length : null;
  if (runtimeVal) {
    return { source: "astro-runtime", value: runtimeVal, lengths };
  }

  // 2) Astro's import.meta.env (works in both build and runtime)
  // Note: Vite only inlines variables that are accessed statically like import.meta.env.MY_VAR.
  // Dynamic indexing won't be replaced. Handle TTS_ENCRYPTION_KEY explicitly.
  const envFromImportMeta = (import.meta as unknown as { env?: Record<string, MaybeValue> }).env;
  const importMetaStatic =
    key === "TTS_ENCRYPTION_KEY"
      ? (import.meta as unknown as { env: { TTS_ENCRYPTION_KEY?: string } }).env.TTS_ENCRYPTION_KEY
      : undefined;
  const importMetaVal = importMetaStatic ?? envFromImportMeta?.[key];
  lengths["import-meta"] = typeof importMetaVal === "string" ? importMetaVal.length : null;
  if (importMetaVal) {
    return { source: "import-meta", value: importMetaVal, lengths };
  }

  // 3) Traditional Node.js runtime environment (fallback for Cloudflare Workers/Pages)
  const processEnv = typeof process !== "undefined" ? process.env : undefined;
  const processVal = processEnv?.[key];
  lengths.process = typeof processVal === "string" ? processVal.length : null;
  if (processVal) {
    return { source: "process", value: processVal, lengths };
  }

  // 4) Try accessing Cloudflare runtime env directly (if available)
  try {
    // @ts-expect-error - Cloudflare runtime may expose env via globalThis.env at runtime
    const globalThisVal = typeof globalThis !== "undefined" ? globalThis?.env?.[key] : undefined;
    lengths.globalThis = typeof globalThisVal === "string" ? globalThisVal.length : null;
    if (globalThisVal) {
      return { source: "globalThis", value: globalThisVal, lengths };
    }
  } catch {
    // Ignore - not in Cloudflare runtime
  }

  return { source: "none", value: undefined, lengths };
}

// Get encryption key from environment or generate a default for development
async function getEncryptionKey(): Promise<Uint8Array<ArrayBuffer>> {
  const { value: key, source, lengths } = await readEnvWithTrace("TTS_ENCRYPTION_KEY");
  const mode = import.meta.env.MODE || import.meta.env.NODE_ENV || "development";
  const isProduction = mode === "production";

  if (!key) {
    if (isProduction) {
      // eslint-disable-next-line no-console
      console.error("TTS_ENCRYPTION_KEY lookup diagnostics:", {
        mode,
        nodeEnv: import.meta.env.NODE_ENV,
        foundIn: source,
        lengths,
      });
      throw new Error(
        "TTS_ENCRYPTION_KEY environment variable is required in production (see server logs for source diagnostics)"
      );
    }
    // Use a default key for development (DO NOT USE IN PRODUCTION)
    // eslint-disable-next-line no-console
    console.warn("Using default development encryption key. DO NOT USE IN PRODUCTION!");
    return Uint8Array.from(new TextEncoder().encode("dev-key-32-chars-long-for-tts-encryption"));
  }

  if (key.length !== KEY_LENGTH * 2) {
    // eslint-disable-next-line no-console
    console.error(
      `TTS_ENCRYPTION_KEY has invalid length: ${key.length} (expected ${KEY_LENGTH * 2} for hex string). Source: ${source}. Lengths by source:`,
      lengths
    );
    throw new Error(`TTS_ENCRYPTION_KEY must be a 64-character hex string (got ${key.length}). Source: ${source}`);
  }

  // Convert hex string to Uint8Array
  const bytes = new Uint8Array(key.length / 2);
  for (let i = 0; i < key.length; i += 2) {
    const hexByte = key.substr(i, 2);
    const byteValue = parseInt(hexByte, 16);
    if (isNaN(byteValue)) {
      throw new Error(`TTS_ENCRYPTION_KEY contains invalid hex character at position ${i}: "${hexByte}"`);
    }
    bytes[i / 2] = byteValue;
  }
  return Uint8Array.from(bytes);
}

// Helper function to derive key from master key and salt
async function deriveKey(masterKey: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
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

/**
 * Encrypts a TTS API key using AES-GCM
 * @param plaintext The API key to encrypt
 * @returns Encrypted key as Buffer
 */
export async function encrypt(plaintext: string): Promise<Buffer> {
  try {
    const masterKey = await getEncryptionKey();
    const salt = Uint8Array.from(crypto.getRandomValues(new Uint8Array(SALT_LENGTH)));
    const iv = Uint8Array.from(crypto.getRandomValues(new Uint8Array(IV_LENGTH)));

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
export async function decrypt(encryptedData: Buffer | Uint8Array | string | unknown): Promise<string> {
  try {
    const masterKey = await getEncryptionKey();

    // Convert to Buffer if needed
    let buffer: Buffer;
    if (typeof encryptedData === "string") {
      // Check if it's hex encoded (starts with \x)
      if (encryptedData.startsWith("\\x")) {
        // Remove \x prefix and convert hex to buffer
        const hexString = encryptedData.replace(/\\x/g, "");
        buffer = Buffer.from(hexString, "hex");
      } else {
        // Try base64 first, then hex
        try {
          buffer = Buffer.from(encryptedData, "base64");
        } catch {
          buffer = Buffer.from(encryptedData, "hex");
        }
      }
    } else if (encryptedData instanceof Uint8Array) {
      buffer = Buffer.from(encryptedData);
    } else if (isJsonBuffer(encryptedData)) {
      // Handle JSON Buffer format
      buffer = Buffer.from(encryptedData.data);
    } else {
      buffer = encryptedData as Buffer;
    }

    // Extract components
    const salt = Uint8Array.from(buffer.subarray(0, SALT_LENGTH));
    const iv = Uint8Array.from(buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH));
    const encrypted = Uint8Array.from(buffer.subarray(SALT_LENGTH + IV_LENGTH));

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
export async function generateKeyFingerprint(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `SHA256:${hashHex.substring(0, 16)}`;
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
