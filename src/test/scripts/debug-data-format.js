// Debug Data Format
// This script examines the exact format of the encrypted data
// Run with: node src/debug-data-format.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test function
async function debugDataFormat() {
  console.log("=== Debug Data Format ===");
  console.log("Examining the exact format of the encrypted data...");

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
    const rawPath = path.join(__dirname, "raw-encrypted.txt");
    fs.writeFileSync(rawPath, credentials.encrypted_key);
    console.log(`Raw data saved to: ${rawPath}`);

    // Try different conversion methods
    console.log(`\n--- Conversion Attempts ---`);

    // Method 1: Direct unescape
    try {
      const unescaped1 = credentials.encrypted_key.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
      console.log(`Method 1 - Unescaped first 100 chars: ${unescaped1.substring(0, 100)}...`);

      const parsed1 = JSON.parse(unescaped1);
      console.log(`Method 1 - Parsed JSON:`, parsed1);

      if (parsed1.type === "Buffer" && Array.isArray(parsed1.data)) {
        const buffer1 = Buffer.from(parsed1.data);
        console.log(`Method 1 - Buffer length: ${buffer1.length} bytes`);
        console.log(`Method 1 - Buffer first 20 bytes:`, Array.from(buffer1.subarray(0, 20)));
      }
    } catch (e) {
      console.log(`Method 1 failed: ${e.message}`);
    }

    // Method 2: Try base64 decode first
    try {
      const base64Decoded = Buffer.from(credentials.encrypted_key, "base64");
      console.log(`Method 2 - Base64 decoded length: ${base64Decoded.length} bytes`);
      console.log(`Method 2 - Base64 decoded first 20 bytes:`, Array.from(base64Decoded.subarray(0, 20)));
    } catch (e) {
      console.log(`Method 2 failed: ${e.message}`);
    }

    // Method 3: Try hex decode
    try {
      const hexDecoded = Buffer.from(credentials.encrypted_key, "hex");
      console.log(`Method 3 - Hex decoded length: ${hexDecoded.length} bytes`);
      console.log(`Method 3 - Hex decoded first 20 bytes:`, Array.from(hexDecoded.subarray(0, 20)));
    } catch (e) {
      console.log(`Method 3 failed: ${e.message}`);
    }

    // Method 4: Try as raw string
    try {
      const rawString = credentials.encrypted_key;
      console.log(`Method 4 - Raw string first 20 chars:`, rawString.substring(0, 20));
      console.log(
        `Method 4 - Raw string char codes:`,
        Array.from(rawString.substring(0, 20)).map((c) => c.charCodeAt(0))
      );
    } catch (e) {
      console.log(`Method 4 failed: ${e.message}`);
    }
  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Run the debug
debugDataFormat().catch(console.error);
