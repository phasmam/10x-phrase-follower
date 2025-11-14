.ai/audio-loop-view-implementation-plan.md

# Plan implementacji widoku Audio Loop (Player)

## 1. Przegląd

Widok **Audio Loop (Player)** służy do minimalnego odsłuchu fraz w sekwencji **EN1 → EN2 → EN3 → PL** z wymuszonymi pauzami **800 ms** oraz auto-advance między frazami. Zapewnia klik-to-seek per słowo, podświetlanie tokenów on/off, kontrolę prędkości odtwarzania, oraz ręczne „Odśwież manifest”, gdy podpisane URL-e wygasną. Wymaga wcześniejszej konfiguracji TTS (klucz + sloty głosów) oraz wygenerowanych segmentów audio (pełny rebuild notatnika). :contentReference[oaicite:0]{index=0} :contentReference[oaicite:1]{index=1}

## 2. Routing widoku

- **Ścieżka:** `/player/:notebookId?start_phrase_id=<uuid>`
- **Ochrona trasy:** prywatna (Supabase Auth JWT), redirect do `/login` przy braku/wygaśnięciu sesji. :contentReference[oaicite:2]{index=2}

## 3. Struktura komponentów

PlayerPage (route)
└─ PlayerShell
├─ PlayerControls
├─ SegmentSequenceBar
├─ PhraseViewer
│ └─ Token (wielokrotnie)
├─ KeyboardShortcutsHandler
└─ RefreshManifestButton

- Integracje globalne: Topbar (nawigacja, gear do `/settings`), toasty błędów/stanu. :contentReference[oaicite:3]{index=3}

## 4. Szczegóły komponentów

### PlayerPage

- **Opis:** Kontener routingu. Pobiera `notebookId` i opcjonalny `start_phrase_id`, montuje `PlayerShell`.
- **Główne elementy:** `<main>`, `PlayerShell`.
- **Zdarzenia:** `onAuthStateChange` (redirect do `/login`).
- **Walidacja:** `notebookId` i `start_phrase_id` jako UUID (format), ochrona sesji. :contentReference[oaicite:4]{index=4}
- **Typy:** `RouteParams`, `QueryParams`.
- **Propsy:** brak (używa hooków routingu).

### PlayerShell

- **Opis:** Orkiestracja pobrania **Playback Manifest**, ustawienie początkowej frazy i sterowanie state machine odtwarzania.
- **Główne elementy:** `PlayerControls`, `PhraseViewer`, `SegmentSequenceBar`, `RefreshManifestButton`.
- **Zdarzenia:** `onPlay`, `onPause`, `onStop`, `onRestartPhrase`, `onSpeedChange`, `onToggleHighlight`, `onSeekToToken`, `onAdvanceNext`, `onAdvancePrev`, `onRefreshManifest`.
- **Walidacja:** obecność co najmniej jednego segmentu `complete` dla bieżącej frazy; w przeciwnym razie pominięcie segmentu/frazy zgodnie z PRD. Pauzy **800 ms** między segmentami i frazami. Auto-advance aktywne po PL + 800 ms. :contentReference[oaicite:5]{index=5}
- **Typy:** `PlaybackManifest`, `PlaybackSequenceItem`, `Segment`, `PlayerState`, `PlaybackSpeed`, `HighlightMode`.
- **Propsy:** `{ notebookId: UUID, startPhraseId?: UUID }`.

### PlayerControls

- **Opis:** Panel sterowania odtwarzaniem.
- **Główne elementy:** przyciski **Play/Pause**, **Stop**, **Restart frazy**, selektor prędkości (0.75/0.9/1.0/1.25), przełącznik **Highlight on/off**.
- **Zdarzenia:** `onPlay`, `onPause`, `onStop`, `onRestart`, `onSpeedChange`, `onToggleHighlight`.
- **Walidacja:** prędkości zgodne z PRD; blokada Play gdy brak segmentów. :contentReference[oaicite:6]{index=6}
- **Typy:** `PlaybackSpeed`.
- **Propsy:** `{ playing: boolean, speed: PlaybackSpeed, highlight: boolean, hasPlayable: boolean, onPlay():void, ... }`.

### SegmentSequenceBar

- **Opis:** Wskaźnik postępu przez sekwencję EN1→EN2→EN3→PL dla bieżącej frazy (ikonki slotów + stan).
- **Główne elementy:** lista 4 pozycji (EN1..PL), stan `playing/queued/omitted`.
- **Zdarzenia:** klik na slot (opcjonalny seek do początku slotu, jeśli obecny).
- **Walidacja:** sloty obecne tylko, gdy w manifeście dany segment ma `status=complete`. :contentReference[oaicite:7]{index=7}
- **Typy:** `VoiceSlot`.
- **Propsy:** `{ sequenceForPhrase: Segment[], activeSlot?: VoiceSlot, onJumpToSlot(slot):void }`.

### PhraseViewer

- **Opis:** Wyświetla EN/PL z tokenizacją i podświetlaniem, obsługuje klik-to-seek od początku słowa w aktywnym segmencie.
- **Główne elementy:** kontenery `EN`, `PL`, lista `Token`.
- **Zdarzenia:** `onTokenClick(tokenIndex)`.
- **Walidacja:** reguły klik-to-seek: klik pierwszego słowa startuje frazę; po PL klik w EN → restart od EN1; token = słowo + przyległa interpunkcja; docelowy desync highlight ≤ ~80 ms (best effort). :contentReference[oaicite:8]{index=8}
- **Typy:** `Token`, `TokenTimingsHint`.
- **Propsy:** `{ phrase: PhraseVM, activeLang: 'en'|'pl'|null, highlight: boolean, onSeekToToken(index:number):void }`.

### KeyboardShortcutsHandler

- **Opis:** Rejestruje skróty: **Space/K**, **S**, **R**, **←/→**, **Shift+←/→**, **P/N** (wyłączone w polach input).
- **Główne elementy:** `useEffect` + event listeners.
- **Zdarzenia:** wywołania callbacków sterujących odtwarzaniem i nawigacją fraz.
- **Walidacja:** focus-visible / dostępność. :contentReference[oaicite:9]{index=9}
- **Typy:** brak specyficznych.
- **Propsy:** `{ onPlayPause, onStop, onRestart, onSeekSmall, onSeekLarge, onPrevPhrase, onNextPhrase }`.

### RefreshManifestButton

- **Opis:** Manualne odświeżenie Playback Manifest (np. 403/410/URL expired).
- **Główne elementy:** przycisk w panelu kontrolnym lub banner.
- **Zdarzenia:** `onClick` → refetch manifestu.
- **Walidacja:** obsługa błędów sieciowych; retry z eksponowaniem komunikatu. :contentReference[oaicite:10]{index=10}
- **Typy:** brak specyficznych.
- **Propsy:** `{ loading: boolean, onRefresh():Promise<void> }`.

## 5. Typy

**DTO (z API):**

- `PlaybackManifest` (GET `/api/notebooks/:id/playback-manifest`)
  - `notebook_id: UUID`
  - `build_id: UUID`
  - `sequence: PlaybackSequenceItem[]`
  - `expires_at: ISO8601` (TTL podpisanych URL-i) :contentReference[oaicite:11]{index=11}
- `PlaybackSequenceItem`
  - `phrase: { id: UUID, position: number, en_text: string, pl_text: string, tokens?: { en: TokenDTO[], pl: TokenDTO[] } }`
  - `segments: SegmentDTO[]`
- `SegmentDTO`
  - `slot: 'EN1'|'EN2'|'EN3'|'PL'`
  - `status: 'complete'`
  - `url: string` (signed)
  - `duration_ms?: number`
  - `word_timings?: WordTimingDTO[]` (opcjonalne) :contentReference[oaicite:12]{index=12}
- `WordTimingDTO`:
  - `{ word: string, start_ms: number, end_ms: number }`

**ViewModel (frontend, nowe):**

- `PhraseVM`:
  - `{ id: UUID, position: number, en: string, pl: string, tokens: { en: Token[], pl: Token[] } }`
- `Token`:
  - `{ text: string, charStart: number, charEnd: number, timing?: { startMs: number, endMs: number } }`
- `Segment`:
  - `{ slot: VoiceSlot, url: string, durationMs?: number, timings?: Token['timing'][] }`
- `VoiceSlot` = `'EN1'|'EN2'|'EN3'|'PL'`
- `PlaybackSpeed` = `0.75 | 0.9 | 1 | 1.25`
- `PlayerState`:
  - `{ playing: boolean, currentPhraseIndex: number, currentSlot: VoiceSlot|null, speed: PlaybackSpeed, highlight: boolean, clockMs: number }`

## 6. Zarządzanie stanem

- **Lokalny state (React):**
  - `manifest: PlaybackManifest | null`
  - `phraseIndex: number` (wyznaczany z `start_phrase_id` lub 0)
  - `currentSlot: VoiceSlot | null` (aktualny segment w sekwencji)
  - `playing: boolean`
  - `speed: PlaybackSpeed`
  - `highlight: boolean`
  - `clockMs: number` (postęp w bieżącym segmencie)
- **Hooki niestandardowe:**
  - `usePlaybackEngine(manifest, phraseIndex, speed)`
    - Steruje kolejką EN1→EN2→EN3→PL, wstrzykuje pauzy **800 ms** pomiędzy segmentami/frazami, implementuje auto-advance, emituje `onEndSegment/onEndPhrase`. :contentReference[oaicite:13]{index=13}
  - `useSignedUrlGuard(expiresAt)`
    - Wykrywa zbliżający się expiry manifestu; wystawia `needsRefresh`, integruje się z `RefreshManifestButton`. :contentReference[oaicite:14]{index=14}
  - `useClickToSeek(tokens, timings)`
    - Mapuje kliknięty token → czas początkowy słowa (z heurystyką, jeśli brak per-word timings). :contentReference[oaicite:15]{index=15}

## 7. Integracja API

- **Pobranie manifestu:**
  - `GET /api/notebooks/:notebookId/playback-manifest?phrase_ids=<subset>&speed=<0.75|0.9|1|1.25>&highlight=<on|off>`
  - **200**: `PlaybackManifest` (tylko `status=complete` segmenty; segmenty `failed/missing` pominięte) :contentReference[oaicite:16]{index=16}
- **Warunek uruchomienia odsłuchu (przed wejściem do playera):**
  - Konfiguracja TTS: `GET /api/tts-credentials` → `is_configured` (badge, ewentualny redirect do `/settings`) :contentReference[oaicite:17]{index=17}
  - Sloty głosów: `GET /api/user-voices` (walidacja trójek EN bez duplikatów + PL) :contentReference[oaicite:18]{index=18}
  - Status audio (opcjonalne pre-check): `GET /api/notebooks/:id/audio-status` (brak blokady – player i tak pominie brakujące) :contentReference[oaicite:19]{index=19}

## 8. Interakcje użytkownika

- **Play/Pause:** start/stop bieżącego segmentu. Po `Play` rozpoczyna się od `currentSlot` lub od EN1, jeśli nic nie gra.
- **Stop:** zatrzymuje i resetuje do początku aktualnej frazy.
- **Restart frazy:** ustawia `currentSlot=EN1`, `clockMs=0`, `playing=true`.
- **Zmiana prędkości:** przeskalowanie odtwarzania od kolejnego rozpoczęcia segmentu (bez resamplingu serwerowego).
- **Highlight on/off:** włącza/wyłącza podświetlanie tokenów.
- **Klik-to-seek:** klik w token aktywnego segmentu → seek od początku tokenu; klik pierwszego słowa → start frazy; po PL klik w EN → start od EN1. :contentReference[oaicite:20]{index=20}
- **Strzałki:** `←/→` mały seek; `Shift+←/→` duży seek.
- **P/N:** nawigacja frazami; auto-advance po PL + 800 ms. :contentReference[oaicite:21]{index=21}

## 9. Warunki i walidacja

- **Prędkość:** {0.75, 0.9, 1.0, 1.25} – inne wartości odrzucone (UI nie pozwala). :contentReference[oaicite:22]{index=22}
- **Sekwencja slotów:** EN1→EN2→EN3→PL, z pominięciem brakujących/failed (UI pokazuje `omitted`). :contentReference[oaicite:23]{index=23}
- **Pauzy:** stałe **800 ms** między segmentami i między frazami. :contentReference[oaicite:24]{index=24}
- **Klik-to-seek:** tylko w aktywnym segmencie (lub restart przy EN). :contentReference[oaicite:25]{index=25}
- **Dostęp/Autoryzacja:** wszystkie żądania z JWT; RLS izoluje zasoby. Błędy 403/404 nie ujawniają metadanych. :contentReference[oaicite:26]{index=26}

## 10. Obsługa błędów

- **Wygaśnięcie URL-i (403/410):** banner + `RefreshManifestButton` (ponowne `GET /playback-manifest`). :contentReference[oaicite:27]{index=27}
- **Brak konfiguracji TTS/slotów:** komunikat „Skonfiguruj TTS w Ustawieniach” + link do `/settings`. :contentReference[oaicite:28]{index=28}
- **Brak segmentów w frazie:** mini-toast „Brak dostępnych segmentów – pomijam frazę”.
- **Błędy sieci:** retry exponential (x3) dla `GET /playback-manifest`; po tym ErrorBanner.
- **Błędy odtwarzania audio (MediaError):** fallback do pauzy i toast „Nie udało się odtworzyć segmentu – pomijam”.
- **Spójne komunikaty:** zgodnie z katalogiem błędów API (np. `internal`, `validation_error`), copy wg PRD „Nie udało się wygenerować audio. Spróbuj ponownie.” dla kontekstu generate (jeśli widok otwarty po nieudanym buildzie). :contentReference[oaicite:29]{index=29} :contentReference[oaicite:30]{index=30}

## 11. Kroki implementacji

1. **Routing i ochrona trasy:** dodaj trasę `/player/:notebookId`, guard JWT (redirect do `/login`). :contentReference[oaicite:31]{index=31}
2. **Szkielet strony:** stwórz `PlayerPage` i `PlayerShell` z placeholderami komponentów.
3. **Typy i adaptery:** zaimplementuj DTO → VM (`PlaybackManifest` → `PhraseVM`, `Segment`), z mapowaniem `word_timings` do `Token.timing`. :contentReference[oaicite:32]{index=32}
4. **Pobranie manifestu:** hook do `GET /playback-manifest` z obsługą `start_phrase_id`, TTL (`expires_at`) i refetch.
5. **Engine odtwarzania (`usePlaybackEngine`):** logika kolejkowania slotów, pauzy **800 ms**, auto-advance fraz, sygnały cyklu życia (segment start/end, phrase end). :contentReference[oaicite:33]{index=33}
6. **Odtwarzacz audio:** pojedynczy `<audio>` lub WebAudio; sterowanie `src` zgodnie z `currentSlot`, obsługa `timeupdate`, `ended`, błędów.
7. **PhraseViewer:** render tokenów EN/PL, highlight on/off, klik-to-seek (z heurystyką gdy brak `word_timings`).
8. **Controls & Shortcuts:** `PlayerControls`, `KeyboardShortcutsHandler`, `SegmentSequenceBar`.
9. **Obsługa błędów i odświeżania:** `RefreshManifestButton`, bannery/ toast’y, retry dla 403/410 i sieci.
10. **Testy e2e/scenariusze:**
    - sekwencja EN→PL z pauzami,
    - auto-advance po PL + 800 ms,
    - klik-to-seek tokenu (różne pozycje),
    - brak segmentów/segment failed → pominięcie,
    - wygaśnięcie manifestu → odświeżenie,
    - prędkości 0.75/0.9/1/1.25. :contentReference[oaicite:34]{index=34}
11. **Dostępność:** aria-live dla zmian stanu odtwarzania, focus management, kontrast (dark-only). :contentReference[oaicite:35]{index=35}

---

**Mapowanie na PRD/Stories:**

- UC-07/UC-08/UC-09: sekwencja odtwarzania, klik-to-seek, highlight, statusy segmentów (pomijanie brakujących), metryki timingu. :contentReference[oaicite:36]{index=36}
- Integracje: `/api/notebooks/:id/playback-manifest` (rdzeń), `/api/tts-credentials`, `/api/user-voices`, opcjonalnie `/api/notebooks/:id/audio-status`. :contentReference[oaicite:37]{index=37}

**Załączniki i referencje**:

- PRD: @prd.md
- Opis widoku: ui-plan.md
- Endpointy: @api-plan.md
- Etapy: phases-plan.md
- Typy DTO: @types.ts (lokalny plik, źródło prawdy dla kontraktów)
