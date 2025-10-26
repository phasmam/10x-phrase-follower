// Test API Key Length
// This script tests what happens when we send a full Google API key to the API
// Run with: node src/test-api-key-length.js

async function testApiKeyLength() {
  console.log("=== Test API Key Length ===");
  console.log("Testing what happens when we send a full Google API key to the API...");
  
  try {
    // Get the Google API key from environment
    const googleApiKey = process.env.GOOGLE_API_KEY;
    
    if (!googleApiKey) {
      console.error("❌ GOOGLE_API_KEY environment variable not found!");
      return;
    }
    
    console.log(`\n--- API Key Analysis ---`);
    console.log(`API Key length: ${googleApiKey.length} characters`);
    console.log(`API Key first 20 chars: ${googleApiKey.substring(0, 20)}...`);
    console.log(`API Key last 20 chars: ...${googleApiKey.substring(googleApiKey.length - 20)}`);
    
    // Test the API endpoint directly
    console.log(`\n--- Testing API Endpoint ---`);
    
    // First get a JWT token
    const jwtResponse = await fetch("http://localhost:3000/api/dev/jwt");
    const jwtData = await jwtResponse.json();
    const token = jwtData.token;
    
    console.log(`JWT token: ${token.substring(0, 20)}...`);
    
    // Test the TTS credentials endpoint
    const testResponse = await fetch("http://localhost:3000/api/tts-credentials", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        google_api_key: googleApiKey
      }),
    });
    
    console.log(`Response status: ${testResponse.status}`);
    console.log(`Response headers:`, Object.fromEntries(testResponse.headers.entries()));
    
    if (testResponse.ok) {
      const responseData = await testResponse.json();
      console.log(`✅ SUCCESS! API accepted the full key`);
      console.log(`Response data:`, responseData);
      
      // Now test if we can decrypt it
      console.log(`\n--- Testing Decryption ---`);
      const decryptResponse = await fetch("http://localhost:3000/api/dev/test-tts-credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      });
      
      if (decryptResponse.ok) {
        const decryptData = await decryptResponse.json();
        console.log(`✅ SUCCESS! Decryption worked!`);
        console.log(`Decrypt response:`, decryptData);
      } else {
        const decryptError = await decryptResponse.text();
        console.log(`❌ Decryption failed: ${decryptResponse.status} - ${decryptError}`);
      }
      
    } else {
      const errorText = await testResponse.text();
      console.log(`❌ API call failed: ${testResponse.status} - ${errorText}`);
    }
    
  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Run the test
testApiKeyLength().catch(console.error);
