// Test Decryption via API
// This script tests the decryption using the existing dev API endpoint
// Run with: node src/test-decryption-via-api.js

async function testDecryptionViaAPI() {
  console.log("=== Testing Decryption via API ===");
  console.log("Using the existing dev API endpoint to test decryption...");

  try {
    // Use the existing dev test endpoint
    const response = await fetch("http://localhost:3000/api/dev/test-tts-credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log(`Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API call failed: ${response.status} - ${errorText}`);
      return;
    }

    const result = await response.json();
    console.log(`\n--- API Response ---`);
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log(`\n✅ SUCCESS! Decryption is working via API!`);
      console.log(`Key length: ${result.key_length}`);
      console.log(`Key preview: ${result.key_preview}`);
    } else {
      console.log(`\n❌ FAILED! Decryption failed via API!`);
      console.log(`Error: ${result.error}`);
      if (result.encrypted_type) {
        console.log(`Encrypted data type: ${result.encrypted_type}`);
        console.log(`Encrypted data length: ${result.encrypted_length}`);
        console.log(`Encrypted data preview: ${result.encrypted_preview}`);
      }
    }
  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
    console.log(`\nMake sure your Astro server is running on http://localhost:3000`);
  }
}

// Run the test
testDecryptionViaAPI().catch(console.error);
