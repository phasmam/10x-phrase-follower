// Isolated TTS Test Script
// This script bypasses encryption and tests only the TtsService class
// Run with: node src/test-tts-isolated.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// TTS service for Google Cloud Text-to-Speech (copied from job-worker.ts)
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
async function testTtsGeneration() {
  console.log("=== TTS Isolated Test ===");
  console.log("Testing TTS generation without encryption...");

  // Get Google API key from Windows environment variable
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

  if (!GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY environment variable not found!");
    console.log("Please set your Google API key as an environment variable:");
    console.log("set GOOGLE_API_KEY=your_actual_api_key_here");
    return;
  }

  try {
    // Initialize TTS service
    const ttsService = new TtsService(GOOGLE_API_KEY);

    // Test with a simple phrase
    const testPhrase = "Hello world, this is a test";
    const voiceId = "en-GB-Standard-B"; // English voice
    const language = "en";

    console.log(`\n--- Testing TTS Generation ---`);
    console.log(`Phrase: "${testPhrase}"`);
    console.log(`Voice: ${voiceId}`);
    console.log(`Language: ${language}`);

    // Generate audio
    const audioBuffer = await ttsService.synthesize(testPhrase, voiceId, language);

    // Save to file for verification
    const outputPath = path.join(__dirname, "test-output.mp3");

    fs.writeFileSync(outputPath, audioBuffer);

    console.log(`\n✅ SUCCESS!`);
    console.log(`Audio file saved to: ${outputPath}`);
    console.log(`File size: ${audioBuffer.length} bytes`);
    console.log(`You can play this file to verify the TTS is working correctly.`);
  } catch (error) {
    console.error(`\n❌ FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(`Full error:`, error);
  }
}

// Run the test
testTtsGeneration().catch(console.error);
