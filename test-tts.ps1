# PowerShell script to run the isolated TTS test
# This script tests TTS generation without encryption/decryption

Write-Host "=== TTS Isolated Test ===" -ForegroundColor Green
Write-Host "Testing TTS generation without encryption..." -ForegroundColor Yellow

# Check if Node.js is available
try {
    $nodeVersion = node --version
    Write-Host "Using Node.js version: $nodeVersion" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Node.js not found! Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Run the test script
Write-Host "`nRunning TTS test..." -ForegroundColor Yellow
node src/test-tts-isolated.js

Write-Host "`n=== Test Complete ===" -ForegroundColor Green
Write-Host "Check the output above for results." -ForegroundColor Yellow
Write-Host "If successful, you should see a 'test-output.mp3' file created." -ForegroundColor Yellow
