# Phrase Follower

![Version](https://img.shields.io/badge/version-0.0.1-blue)
![Status](https://img.shields.io/badge/status-MVP_in_progress-yellow)
![Node](https://img.shields.io/badge/node-22.14.0-339933?logo=node.js)
![Astro](https://img.shields.io/badge/astro-5.13.7-FF5D01?logo=astro)
![React](https://img.shields.io/badge/react-19-61DAFB?logo=react)
![License](https://img.shields.io/badge/license-Unspecified-lightgrey)

A minimal MVP to help learners practice English phrases via sequential EN→PL playback with multiple English voices, precise click-to-seek per word, optional highlighting, and low-cost Google Text-to-Speech.

---

## Table of contents
- [1. Project name](#1-project-name)
- [2. Project description](#2-project-description)
- [3. Tech stack](#3-tech-stack)
- [4. Getting started locally](#4-getting-started-locally)
- [5. Available scripts](#5-available-scripts)
- [6. Project scope](#6-project-scope)
- [7. Project status](#7-project-status)
- [8. License](#8-license)

---

## 1. Project name
Phrase Follower

## 2. Project description
Phrase Follower is an Astro-based web app that streamlines learning English phrases through an optimized playback loop:
- EN1 → EN2 → EN3 → PL sequence with 800 ms pauses between segments and phrases
- Multiple English voices plus one Polish voice per user
- Click-to-seek per word in the active segment and optional token-based highlighting
- Import phrases via simple `EN sentence ::: PL sentence` files
- Generate and store MP3 per phrase × voice using Google TTS (cost-conscious settings)

See the Product Requirements Document for full details: [.ai/prd.md](./.ai/prd.md)

## 3. Tech stack
- Astro 5 (Node adapter)
- TypeScript 5
- React 19
- Tailwind CSS 4
- shadcn/ui
- Node.js 22.14.0
- Supporting deps: `@astrojs/react`, `@astrojs/sitemap`, `lucide-react`, `clsx`, `class-variance-authority`

## 4. Getting started locally
Prerequisites:
- Node.js 22.14.0 (see `.nvmrc`)
- Git

Install and run:
```bash
# 1) Use the project Node version
nvm use 22.14.0

# 2) Install dependencies
npm install

# 3) Start the dev server (Astro defaults to http://localhost:4321)
npm run dev
```

Build and preview:
```bash
npm run build
npm run preview
```

Quality:
```bash
npm run lint        # report issues
npm run lint:fix    # fix issues where possible
npm run format      # format with Prettier
```

TTS setup (for audio generation):
- Add your Google TTS API key in the app's Settings screen. The key is validated on save and never exposed to the client.
- Configure three EN voices (ordered) and one PL voice per your preference. Duplicates within a language are disallowed.

## 5. Available scripts
- `dev`: Run the Astro dev server.
- `build`: Build the production site.
- `preview`: Preview the production build locally.
- `astro`: Direct access to the Astro CLI.
- `lint`: Lint TypeScript/React/Astro sources.
- `lint:fix`: Lint with autofix enabled.
- `format`: Format the repository with Prettier.

## 6. Project scope
MVP capabilities (high-level):
- Notebooks: create via import, rename, delete (removes related MP3s); per-user privacy with login required
- Phrases within notebooks: add, reorder, delete (deletes MP3s); tabular view with audio status `complete/failed/missing`
- Import: line-by-line `EN ::: PL` with validation; normalization (quotes, zero-width chars, spaces); limits: ≤100 phrases/notebook, ≤2000 chars/phrase; up to 500 notebooks per user; clear rejection report
- TTS & voices: per-user Google TTS key (server-only); 3×EN ordered + 1×PL; no duplicates within a language
- Audio generation: `Generate` triggers MP3 per phrase × voice at 22.05 kHz / 64 kbps mono; full rebuild replaces old MP3; failed segments marked; global error message on failure
- Playback: EN1 → EN2 → EN3 → PL with 800 ms pauses; speeds 0.75/0.9/1.0/1.25; click-to-seek on words; highlight on/off (token = word + adjacent punctuation); heuristically synced
- Error UX: consistent messages (import rejections listed; generate shows "Nie udało się wygenerować audio. Spróbuj ponownie.")

Out of scope for MVP:
- PWA/offline, hotkeys, hover-jump
- EN↔PL translation features beyond imports
- Public API, SSO, telemetry
- Manual word-level sync editing
- ZIP export and prefetching (planned)

Assumptions and constraints:
- Online-only, single-tenant; TTS secrets remain server-side
- Storage layout (informational): `storage/audio/{notebookId}/{phraseId}/{voice}.mp3`; `storage/meta/...`
- Deletions are hard deletes; no auto-retries; regeneration is manual

Planned next steps:
- ZIP export of concatenated EN(1..3)→PL with pauses (size < 30 MB, auto-clean)
- Prefetching strategy for current/next phrase with bounded concurrency

## 7. Project status
- Version: 0.0.1 (pre-release)
- Status: MVP in progress; not production-ready
- CI: not configured in this repository
- Documentation: primary spec in [.ai/prd.md](./.ai/prd.md)

## 8. License
No license has been specified yet. Consider adding a LICENSE file (e.g., MIT). Until then, all rights are reserved by default.
