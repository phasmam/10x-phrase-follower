# Stage 2 Implementation - Audio Loop

This document describes the implementation of Stage 2 of the Phrase Follower application, which provides the complete audio generation and playback functionality.

## Overview

Stage 2 implements the "Audio loop" that closes the value chain: phrase → audio → playback. It includes:

- TTS credentials management (secure storage and testing)
- User voice configuration (4 slots: EN1, EN2, EN3, PL)
- Full audio generation and rebuild jobs
- Playback manifest with signed URLs
- Minimal player functionality

## API Endpoints Implemented

### TTS Credentials

- `GET /api/tts-credentials` - Get credentials state
- `POST /api/tts-credentials:test` - Test TTS credentials
- `PUT /api/tts-credentials` - Save TTS credentials (after successful test)
- `DELETE /api/tts-credentials` - Remove TTS credentials

### User Voices

- `GET /api/user-voices` - List user voice configurations
- `PUT /api/user-voices/:slot` - Configure voice for specific slot

### Jobs

- `POST /api/notebooks/:id/jobs:generate-rebuild` - Start audio generation job
- `GET /api/notebooks/:id/jobs` - List jobs for notebook
- `GET /api/jobs/:jobId` - Get job details
- `POST /api/jobs/:jobId:cancel` - Cancel job

### Builds

- `GET /api/notebooks/:id/builds` - List builds for notebook
- `GET /api/builds/:buildId` - Get build details

### Audio Segments

- `GET /api/notebooks/:id/audio-segments` - List active audio segments
- `GET /api/audio-segments/:audioSegmentId` - Get segment details

### Playback Manifest

- `GET /api/notebooks/:id/playback-manifest` - Get playback manifest with signed URLs

## Key Features

### Security

- TTS API keys are encrypted before storage
- Signed URLs with short TTL (5 minutes) for audio access
- RLS policies ensure users can only access their own data
- No raw API keys are ever returned to the client

### Audio Generation

- Full rebuild of all phrases × voice slots
- MP3 format: 22.05 kHz, 64 kbps mono
- Automatic cleanup of old audio files
- Error handling with detailed status tracking

### Playback

- Ordered sequence: EN1 → EN2 → EN3 → PL
- Only complete segments included in manifest
- Signed URLs for secure access
- Support for word-level timing (future feature)

## Database Schema

All required tables are already created in the initial migration:

- `tts_credentials` - Encrypted TTS API keys
- `user_voices` - Voice slot configurations
- `jobs` - Background job tracking
- `builds` - Audio build versions
- `audio_segments` - Generated audio files with metadata

## Job Worker

The job worker processes TTS generation jobs:

- Fetches queued jobs from database
- Decrypts TTS credentials
- Generates audio for each phrase × voice combination
- Uploads to Supabase Storage
- Activates new segments and deactivates old ones
- Handles errors gracefully with detailed logging

## Testing

Unit tests are included for:

- TTS encryption/decryption functionality
- Job worker basic operations
- Error handling scenarios

## Environment Variables

Required environment variables:

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for job worker
- `TTS_ENCRYPTION_KEY` - Key for encrypting TTS credentials (optional in dev)

## Usage

1. Configure TTS credentials via `/api/tts-credentials:test` and `/api/tts-credentials`
2. Set up voice slots via `/api/user-voices/:slot`
3. Start generation via `/api/notebooks/:id/jobs:generate-rebuild`
4. Get playback manifest via `/api/notebooks/:id/playback-manifest`
5. Use signed URLs for audio playback

## Next Steps

Stage 3 will add:

- Click-to-seek functionality
- Word highlighting
- Audio status indicators
- Enhanced player controls
