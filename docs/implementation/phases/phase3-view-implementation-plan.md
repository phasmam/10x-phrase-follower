.ai/player-view-implementation-plan.md

```markdown
# Plan implementacji widoku Player (Etap 3 — Klik-to-seek + highlight + statusy)

## 1. Przegląd

Widok **Player** odpowiada za odtwarzanie fraz w sekwencji **EN1 → EN2 → EN3 → PL** z kontrolowanymi pauzami **800 ms**, funkcją **klik-to-seek per słowo**, przełączanym **podświetlaniem tokenów** oraz prezentacją **statusów audio** (complete/failed/missing). Wspiera skróty klawiaturowe, auto-advance i ręczne odświeżanie manifestu odtwarzania (krótkotrwałe URL-e). Wymagania funkcjonalne i UX wynikają z PRD i planu UI/API. :contentReference[oaicite:0]{index=0} :contentReference[oaicite:1]{index=1} :contentReference[oaicite:2]{index=2}

## 2. Routing widoku

- **Ścieżka:** `/player/:notebookId?start_phrase_id=<uuid>`
- **Dostęp:** prywatny (po zalogowaniu), JWT Supabase; 403/404 dla zasobów innych użytkowników (RLS). :contentReference[oaicite:3]{index=3}

## 3. Struktura komponentów
```

PlayerPage
└─ PlayerLayout
├─ PlayerControls
├─ SegmentSequenceBar
├─ PhraseViewer
│ └─ Token (wiele)
├─ KeyboardShortcutsHandler
└─ RefreshManifestButton

```
- Widok korzysta z wysp **Astro + React** i stylowania **Tailwind 4** oraz komponentów **shadcn/ui**. :contentReference[oaicite:4]{index=4}

## 4. Szczegóły komponentów

### PlayerPage
- **Opis:** Kontener widoku. Pobiera i utrzymuje manifest odtwarzania, inicjuje start frazy (opcja `start_phrase_id`), koordynuje maszynę stanu odtwarzacza.
- **Główne elementy:** `PlayerLayout`, provider’y kontekstu (`PlaybackProvider`, `HighlightProvider`), HOC ochrony trasy (sprawdzenie sesji).
- **Obsługiwane interakcje:** inicjalne pobranie manifestu; restart sesji od `start_phrase_id`; przełączanie highlight.
- **Walidacja:** `notebookId` i `start_phrase_id` muszą być UUID; brak start_phrase_id ⇒ zaczynamy od pierwszej frazy z manifestu.
- **Typy:** `PlaybackManifestDto`, `PhraseEntry`, `SegmentEntry`, `WordTiming`; `PlaybackState`, `HighlightState` (patrz sekcja 5).
- **Propsy:** brak (routingowe `params` wewnątrz).

### PlayerControls
- **Opis:** Sterowanie odtwarzaniem i ustawieniami.
- **Elementy:** przyciski **Play/Pause**, **Stop**, **Restart frazy**, **Toggle Highlight**, selektor prędkości `0.75/0.9/1/1.25`.
- **Interakcje:** kliknięcia przycisków, zmiana prędkości.
- **Walidacja:** prędkość należy do zbioru {0.75, 0.9, 1, 1.25}; blokada przycisków gdy brak aktywnego segmentu.
- **Typy:** `PlaybackSpeed` (union literal), akcje maszyny `play`, `pause`, `stop`, `restart`, `setSpeed`, `toggleHighlight`.
- **Propsy:** `{ state, onPlay, onPause, onStop, onRestart, speed, onSpeedChange, highlight, onToggleHighlight }`.

### SegmentSequenceBar
- **Opis:** Wizualny pasek sekwencji segmentów frazy (EN1→EN2→EN3→PL) z oznaczeniem stanu `playing/queued/omitted`.
- **Elementy:** cztery „sloty” z ikonami, tooltipami, mikro-statusami (complete/failed/missing).
- **Interakcje:** klik slotu (opcjonalny *jump to segment* jeśli segment istnieje).
- **Walidacja:** slot klikalny tylko przy `status=complete` i istniejącym URL; brak segmentu ⇒ disabled.
- **Typy:** `VoiceSlot` union (`'EN1' | 'EN2' | 'EN3' | 'PL'`), `SegmentStatus`.
- **Propsy:** `{ segments: SegmentEntry[], activeSlot?: VoiceSlot, onJumpToSlot?: (slot: VoiceSlot) => void }`.

### PhraseViewer
- **Opis:** Renderuje tekst EN/PL z tokenizacją, highlight on/off i **klik-to-seek** per token.
- **Elementy:** kontenery EN i PL; lista `Token` (spany z a11y), aria-live dla ogłaszania zmian.
- **Interakcje:** klik w token → seek do `start_ms` słowa w **aktualnie grającym segmencie**; klik pierwszego słowa uruchamia frazę; **po PL** klik w EN ⇒ start od EN1. :contentReference[oaicite:5]{index=5}
- **Walidacja:** token = słowo + przyległa interpunkcja; jeżeli brak `word_timings`, stosujemy heurystykę (fallback mapowania znaków do czasu; desync docelowo ≤ ~80 ms). :contentReference[oaicite:6]{index=6}
- **Typy:** `Token`, `TokenWithTiming`, `SeekTarget` (ms).
- **Propsy:** `{ phrase: PhraseEntry, activeSlot: VoiceSlot|null, highlight: boolean, onTokenClick: (tokenIdx: number) => void }`.

### Token
- **Opis:** Pojedynczy token wyrazu z możliwością highlight.
- **Elementy:** `<span>` z klasami Tailwind (`data-active`, `data-playing`).
- **Interakcje:** `onClick`, `onKeyDown(Enter/Space)` dla dostępności.
- **Walidacja:** focus-visible; tylko gdy `clickable = true`.
- **Typy:** `{ text: string, startChar: number, endChar: number, startMs?: number, endMs?: number }`.
- **Propsy:** `{ token: TokenWithTiming, clickable: boolean, isActive: boolean, onClick: () => void }`.

### KeyboardShortcutsHandler
- **Opis:** Globalny handler skrótów: **Space/K** (play/pause), **S** (stop), **R** (restart), **←/→** (seek -1s/+1s), **Shift+←/→** (seek -5s/+5s), **P/N** (prev/next fraza).
- **Elementy:** niewizualny komponent z `useEffect`.
- **Interakcje:** nasłuch keydown; wyłączony w polach input.
- **Walidacja:** eventy tylko gdy fokus nie w input/textarea.
- **Typy/Propsy:** `{ onPlayPause, onStop, onRestart, onSeek, onPrev, onNext }`. :contentReference[oaicite:7]{index=7}

### RefreshManifestButton
- **Opis:** Odświeżenie manifestu po wygaśnięciu URL (HTTP 403/410) lub ręcznie.
- **Elementy:** przycisk + spinner; komunikaty toast.
- **Interakcje:** `onClick → refetch manifest`.
- **Walidacja:** debounce (min. 1s); blokada podczas pobierania.
- **Typy/Propsy:** `{ loading: boolean, onRefresh: () => void }`. :contentReference[oaicite:8]{index=8}

## 5. Typy
> Nazwy DTO odpowiadają planowi API; ViewModel-e są lokalne dla widoku.

### DTO (API)
- **PlaybackManifestDto**
  - `notebook_id: UUID`
  - `build_id: UUID`
  - `sequence: PhraseSequenceEntry[]`
  - `expires_at: ISO8601` (TTL podpisanych URL-i) :contentReference[oaicite:9]{index=9}
- **PhraseSequenceEntry**
  - `phrase: PhraseEntry`
  - `segments: SegmentEntry[]` (tylko `status=complete`) :contentReference[oaicite:10]{index=10}
- **PhraseEntry**
  - `id: UUID`
  - `position: number`
  - `en_text: string`
  - `pl_text: string`
  - `tokens?: { en: Token[]; pl: Token[] }` (indeksy znaków) :contentReference[oaicite:11]{index=11}
- **SegmentEntry**
  - `slot: VoiceSlot` (`'EN1' | 'EN2' | 'EN3' | 'PL'`)
  - `status: 'complete'`
  - `url: string` (signed)
  - `duration_ms: number`
  - `word_timings?: WordTiming[]` (ms) :contentReference[oaicite:12]{index=12}
- **WordTiming**
  - `word: string`
  - `start_ms: number`
  - `end_ms: number` :contentReference[oaicite:13]{index=13}

### ViewModel (UI)
- **PlaybackState**
  - `currentPhraseIdx: number`
  - `currentSlot: VoiceSlot | null`
  - `isPlaying: boolean`
  - `positionMs: number` (w aktywnym segmencie)
  - `speed: PlaybackSpeed`
  - `autoAdvance: boolean` (true)
- **HighlightState**
  - `enabled: boolean`
  - `activeTokenIdx?: number` (per segment)
- **PhraseWithRuntime**
  - `entry: PhraseEntry`
  - `segments: SegmentWithAudio[]` (połączone z Audio elementem)
- **SegmentWithAudio**
  - `meta: SegmentEntry`
  - `audio: HTMLAudioElement`
  - `status: 'ready' | 'error'`
- **SeekTarget**
  - `{ ms: number }`

## 6. Zarządzanie stanem
- **Maszyna stanu odtwarzacza** (`usePlaybackMachine`):
  - Stany: `idle` → `ready` → `playing` ↔ `paused` → `stopped`; przejście `segmentEnded` → `pause800ms` → `nextSegmentOrPhrase` → `playing`.
  - Kontekst: `currentPhraseIdx`, `slotOrder = ['EN1','EN2','EN3','PL']`, `currentSlot`, `speed`, `positionMs`.
  - Efekty: tworzenie/zarządzanie `HTMLAudioElement` dla każdego segmentu (on-demand, bez prefetch w MVP). Pauzy 800 ms realizowane timerem. Auto-advance po PL + pauza. :contentReference[oaicite:14]{index=14}
- **Manifest i dane** (`usePlaybackManifest`):
  - `load(notebookId, { phraseIds?, speed?, highlight? })` → GET `/playback-manifest`.
  - Obsługa wygaśnięcia URL (HTTP 403/410) → sygnał do UI z przyciskiem `Refresh`. :contentReference[oaicite:15]{index=15}
- **Highlight i tokenizacja** (`useHighlight`):
  - Mapowanie tokenów → `WordTiming` (kiedy dostępne) lub heurystyka znakowa (fallback).
  - Utrzymuje `activeTokenIdx` na podstawie `positionMs` i `word_timings`.
- **Statusy audio**:
  - W Playerze statusy pochodzą z **manifestu** (tylko `complete` są obecne); do podglądu brakujących/failed w kontekście frazy korzystamy z paska `SegmentSequenceBar` (slot disabled/omitted). UC-09. :contentReference[oaicite:16]{index=16}

## 7. Integracja API
- **GET** `/api/notebooks/:notebookId/playback-manifest`
  - **Query:** `phrase_ids?`, `speed=0.75|0.9|1|1.25`, `highlight=on|off` (hint; nie wpływa na odpowiedź poza ewentualnymi metadanymi).
  - **Response:** `PlaybackManifestDto` (tylko segmenty `status=complete`; brakujące/failed pominięte). URL-e **podpisane** z krótkim TTL (`expires_at`). :contentReference[oaicite:17]{index=17}
- **GET** `/api/notebooks/:notebookId/audio-status` (opcjonalne w Player, pomocne do odznaczeń UI) — agregaty complete/failed/missing. :contentReference[oaicite:18]{index=18}
- **Błędy:** `401 unauthorized`, `404 not_found` (RLS), `410 gone`/`403` (wygasłe URL-e), `500 internal`. W razie `410/403` pokazujemy CTA „Odśwież manifest”. :contentReference[oaicite:19]{index=19}

> **Implementacje endpointów do wglądu:** `@api-plan.md` (kontrakt), kod serwerowy: **@index.ts**, **@import.ts** (ścieżki API/worker orchestration, wg repo); typy wspólne: **@types.ts**.

## 8. Interakcje użytkownika
- **Play/Pause**: startuje/pauzuje aktualny segment; jeśli brak aktywnego segmentu, startuje od pierwszego dostępnego (EN1 lub następny).
- **Stop**: zatrzymuje i resetuje pozycję do początku bieżącej frazy (pierwszy dostępny segment).
- **Restart frazy**: zatrzymuje, ustawia `currentSlot` na EN1 i uruchamia odtwarzanie od początku.
- **Zmiana prędkości**: natychmiast stosuje `playbackRate` do aktywnego/nowych segmentów; dopuszczalne wartości tylko z predefiniowanego zbioru. :contentReference[oaicite:20]{index=20}
- **Klik-to-seek (PhraseViewer)**:
  - Klik tokenu → seek do `start_ms` w **aktualnym segmencie**.
  - Klik pierwszego tokenu uruchamia frazę (jeśli była zatrzymana).
  - Po zakończeniu PL: klik tokenu EN ⇒ start od EN1. :contentReference[oaicite:21]{index=21}
- **Auto-advance**: po PL i pauzie 800 ms automatycznie przejście do kolejnej frazy. :contentReference[oaicite:22]{index=22}
- **Skróty klawiaturowe**: Space/K, S, R, ←/→, Shift+←/→, P/N. :contentReference[oaicite:23]{index=23}
- **Odśwież manifest**: ręczne pobranie nowych URL-i po 403/410. :contentReference[oaicite:24]{index=24}

## 9. Warunki i walidacja
- **Parametry routingu:** `:notebookId` (UUID) obowiązkowy; `start_phrase_id` (UUID) opcjonalny. Nieprawidłowe wartości → redirect do `/_404`. :contentReference[oaicite:25]{index=25}
- **Prędkość odtwarzania:** dozwolone tylko {0.75, 0.9, 1, 1.25}; w innych przypadkach reset do `1.0`. :contentReference[oaicite:26]{index=26}
- **Klik-to-seek:** aktywne tylko dla segmentów `status=complete` (tj. obecnych w manifescie).
- **Highlight:** token = słowo + przyległa interpunkcja; gdy brak `word_timings`, heurystyka znakowa (best effort, cel desync ≤ ~80 ms). :contentReference[oaicite:27]{index=27}
- **URL-e audio:** po `expires_at` lub błędach 403/410 wymagane odświeżenie manifestu. :contentReference[oaicite:28]{index=28}
- **Dostęp:** sesja ważna; zasoby innych użytkowników → 404/403 bez metadanych. :contentReference[oaicite:29]{index=29}

## 10. Obsługa błędów
- **Brak sesji / 401**: redirect do `/login`.
- **404/403 (RLS)**: przejście do `/_404` lub `/_403` (bez ujawniania metadanych). :contentReference[oaicite:30]{index=30}
- **410/403 (URL wygasł)**: toast „URL wygasł. Odśwież manifest” + przycisk `Refresh`.
- **Błąd ładowania manifestu**: retry z backoff (3 próby), komunikat banerem i CTA do odświeżenia.
- **Błąd audio (network/media)**: fallback do kolejnego segmentu; jeśli wszystkie segmenty frazy niedostępne → auto-advance do kolejnej frazy; toast z informacją.
- **Błędy walidacji prędkości/parametrów**: reset do wartości domyślnych.

## 11. Kroki implementacji

1. **Routing i ochrona trasy**
   - Dodaj trasę `/player/:notebookId` (Astro → React island).
   - Guard sprawdzający sesję Supabase; obsłuż `start_phrase_id`.

2. **Kontrakty typów**
   - Zdefiniuj DTO wg rozdz. 5 (TypeScript), współdzielone w module `@types.ts`.
   - Zaimplementuj ViewModel-e (`PlaybackState`, `PhraseWithRuntime`, itd.).

3. **Hooki stanu**
   - `usePlaybackManifest(notebookId)`:
     - Pobiera `/api/notebooks/:id/playback-manifest` (opcjonalnie `phrase_ids`, `speed`, `highlight`).
     - Utrzymuje `manifest`, `expires_at`, `loading`, `error`, `refresh()`.
   - `usePlaybackMachine(manifest)`:
     - Steruje `HTMLAudioElement`, prędkością, kolejnością slotów, pauzami 800 ms, auto-advance.
     - Zdarzenia: `play/pause/stop/restart/seek/next/prev/segmentEnded/urlExpired`.
   - `useHighlight(manifest, state)`:
     - Mapuje `positionMs` → `activeTokenIdx`; fallback heurystyki gdy brak `word_timings`.

4. **Warstwa prezentacji**
   - **PlayerControls**: przyciski, selektor prędkości (shadcn/ui), ARIA.
   - **SegmentSequenceBar**: 4 sloty, stany, tooltipy.
   - **PhraseViewer**: render tokenów EN/PL z `Token`; obsługa klik-to-seek; tryb highlight.
   - **KeyboardShortcutsHandler**: obsługa skrótów globalnie.

5. **Obsługa audio**
   - Tworzenie `Audio` na żądanie; eventy `canplay`, `timeupdate`, `ended`, `error`.
   - Ustawianie `playbackRate` po zmianie prędkości.
   - Obsługa `ended` → 800 ms pauza → następny segment / fraza.

6. **Odświeżanie manifestu**
   - Błędy 403/410 i upływ `expires_at` → pokaż `RefreshManifestButton` i wywołaj `refresh()`.

7. **A11y i UX**
   - Focus management dla przycisków; `aria-live` dla zmian stanu.
   - `Token` dostępny klawiaturą (`tabindex=0`, `Enter/Space`).

8. **Testy**
   - Jednostkowe: maszyna stanu, mapowanie tokenów, parsowanie manifestu.
   - Integracyjne: klik-to-seek, auto-advance, obsługa błędów 403/410.
   - E2E: ścieżka „od pierwszej frazy do auto-advance” i skróty klawiaturowe.

9. **Optymalizacje (po MVP)**
   - Prefetch segmentów bieżącej i następnej frazy; anulowanie pobrań przy zmianie frazy (z PRD – future). :contentReference[oaicite:31]{index=31}

10. **Zależności i stack**
    - **Astro 5 + React 19 + Tailwind 4 + shadcn/ui**, **Supabase Auth**; supporting deps: `@astrojs/react`, `lucide-react`, `clsx`, `cva`. (zgodnie z architekturą UI/stack) :contentReference[oaicite:32]{index=32}

---

### Mapowanie user stories → implementacja
- **UC-07** Odtwarzanie EN→PL, pauzy 800 ms, auto-advance → `usePlaybackMachine`, `PlayerControls`, `SegmentSequenceBar`. :contentReference[oaicite:33]{index=33}
- **UC-08** Klik-to-seek, highlight on/off → `PhraseViewer`, `Token`, `useHighlight`. :contentReference[oaicite:34]{index=34}
- **UC-09** Statusy audio w tabeli / pomijanie braków → w Playerze `SegmentSequenceBar` pokazuje obecność segmentów (manifest pomija non-complete); odtwarzacz pomija brakujące. :contentReference[oaicite:35]{index=35}

```

**Załączniki i referencje**:

- PRD: @prd.md
- Opis widoku: ui-plan.md
- Endpointy: @api-plan.md
- Etapy: phases-plan.md
- Typy DTO: @types.ts (lokalny plik, źródło prawdy dla kontraktów)
