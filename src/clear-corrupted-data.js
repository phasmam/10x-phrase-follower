// Clear Corrupted Data
// This script clears the corrupted encrypted data so you can re-save your TTS credentials
// Run with: node src/clear-corrupted-data.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test function
async function clearCorruptedData() {
  console.log("=== Clear Corrupted Data ===");
  console.log("Clearing the corrupted encrypted data so you can re-save your TTS credentials...");
  
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

    // Clear the corrupted TTS credentials
    console.log(`\n--- Clearing Corrupted Data ---`);
    const { error: deleteError } = await supabase
      .from("tts_credentials")
      .delete()
      .eq("user_id", "0a1f3212-c55f-4a62-bc0f-4121a7a72283");
    
    if (deleteError) {
      console.error(`❌ Failed to clear corrupted data: ${deleteError.message}`);
      return;
    }
    
    console.log(`✅ Corrupted TTS credentials cleared from database!`);
    console.log(`\n--- Next Steps ---`);
    console.log(`1. Go to your app: http://localhost:3000`);
    console.log(`2. Navigate to Settings or TTS configuration`);
    console.log(`3. Re-enter your Google API key and save it`);
    console.log(`4. The app will encrypt and store it properly`);
    console.log(`5. Try generating a build again`);
    
    console.log(`\n--- Verification ---`);
    console.log(`After re-saving your credentials, you can run:`);
    console.log(`node src/test-with-astro-env.js`);
    console.log(`to verify the encryption is working correctly.`);

  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Run the clear
clearCorruptedData().catch(console.error);
