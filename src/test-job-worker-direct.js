// Direct Job Worker Test
// This script tests the job worker directly with a mock scenario
// Run with: node src/test-job-worker-direct.js

import { JobWorker } from "./lib/job-worker.js";

async function testJobWorkerDirect() {
  console.log("=== Direct Job Worker Test ===");
  console.log("Testing job worker with mock TTS credentials...");

  try {
    // Get environment variables (you'll need to set these)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Missing Supabase configuration!");
      console.log("Please set these environment variables:");
      console.log("SUPABASE_URL=your_supabase_url");
      console.log("SUPABASE_SERVICE_ROLE_KEY=your_service_key");
      console.log("\nYou can find these values in your Astro app configuration.");
      return;
    }

    console.log(`Supabase URL: ${supabaseUrl.substring(0, 30)}...`);
    console.log(`Service Key: ${supabaseServiceKey.substring(0, 20)}...`);

    // Create job worker
    const worker = new JobWorker(supabaseUrl, supabaseServiceKey);

    console.log(`\n--- Testing Job Worker ---`);
    console.log("Job worker created successfully!");

    // Test with a specific job ID (you'll need to provide a real job ID)
    const testJobId = "a65454a7-e8ce-4942-9820-70c27082b050"; // From your error log

    console.log(`Testing with job ID: ${testJobId}`);
    console.log("This will attempt to process the actual job that failed...");

    try {
      await worker.processJob(testJobId);
      console.log(`✅ Job processed successfully!`);
    } catch (error) {
      console.log(`❌ Job processing failed (as expected):`);
      console.log(`Error: ${error.message}`);
      console.log(`Full error:`, error);

      // This will show us the exact error that's happening
      if (error.message.includes("Decryption failed")) {
        console.log(`\n🔍 DECRYPTION ERROR DETECTED!`);
        console.log(`This confirms the issue is with TTS credentials decryption.`);
        console.log(`The encrypted data in the database might be corrupted or incompatible.`);
      }
    }
  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Run the test
testJobWorkerDirect().catch(console.error);
