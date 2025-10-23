# stage-implementation-plan.md

# Stage Implementation Plan: Etap 3 — Klik-to-seek + highlight + statusy

## 1) Przegląd etapu

**Fragment ze @stages-plan.md (dokładny):**
**Etap 3 — Klik-to-seek + highlight + statusy**

**Cel:** lepsza kontrola nauki i widoczność postępu.
**Zakres:** klik-to-seek po słowie (heurystyka), highlight on/off; agregat **audio status** (complete/failed/missing) w tabeli fraz; player pomija braki zgodnie z manifestem. 

**Powiązanie z PRD (UC-08/UC-09):** klik w słowo ustawia odtwarzanie, highlight działa; statusy spójne z aktywnym buildem; player pomija brakujące/failed segmenty. 

**Zależności między komponentami:**

* **Auth/RLS:** egzekwowane na wszystkich tabelach; w DEV tryb `DEV_JWT` z obejściem RLS *tylko lokalnie* (middleware + service-role). W PROD wyłącznie JWT Supabase + RLS. (Źródło wewn.: `<auth>`; oraz polityki RLS w DB planie). 
* **Storage signing:** manifest zwraca krótkotrwałe **signed URLs**; brak bezpośredniego dostępu do ścieżek. 
* **Jobs/Builds:** statusy i manifest opierają się na **aktywnym** buildzie (`is_active=true`). 
* **(Opcjonalnie) MV:** `notebook_audio_statuses` odświeżane po zakończeniu joba; fallback na live aggregate. 

## 2) Zakres API w tym etapie

| Endpoint                                           | Operacja                                                                                                                                                  | Status                                                                                       | Walidacje kluczowe                                                              | Kody błędów                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/notebooks/:notebookId/playback-manifest` | Wygenerowanie manifestu z kolejnością EN1→EN2→EN3→PL, **omitującego** failed/missing; dołącza `word_timings` (jeśli dostępne); opcje `speed`, `highlight` | **Modyfikowany** (rozszerzenie o semantykę click-to-seek/`word_timings` & hinty `highlight`) | `notebookId` = UUID; user owner; TTL signed URL; opcjonalny subset `phrase_ids` | 404 `not_found` (RLS), 400 `validation_error`, 500 `internal`    |
| `GET /api/notebooks/:notebookId/audio-status`      | Zwraca agregaty `complete/failed/missing` dla **aktywnego** buildu                                                                                        | **Nowy (wdrożeniowo w tym etapie)**                                                          | `notebookId` = UUID; owner; spójność z `current_build_id`                       | 404 `not_found`, 500 `internal`                                  |
| `PATCH /api/phrases/:phraseId`                     | Aktualizacja `tokens` (EN/PL) do click-to-seek; aktualizacja tekstu/pozycji                                                                               | **Modyfikowany** (w tym etapie egzekwujemy schemat `tokens`)                                 | JSON schema `tokens`; `position` unikalny w notatniku                           | 400 `validation_error`, 409 `unique_violation`, 404 `not_found`  |
| `GET /api/notebooks/:notebookId/phrases`           | Pobranie fraz (z `tokens` jeżeli ustawione)                                                                                                               | Bez zmian (używane)                                                                          | Paginacja; sort po `position`                                                   | 404 `not_found`                                                  |
| `GET /api/notebooks/:notebookId/audio-segments`    | Lista **aktywnych** segmentów; filtr `status`, `phrase_id`, `voice_slot`                                                                                  | Bez zmian (używane diagnostycznie)                                                           | Filtry opcjonalne; status ∈ {complete,failed,missing}                           | 404 `not_found`                                                  |

**Konwencje (bez zmian):** Idempotency-Key (dla POST), paginacja kursorowa, katalog błędów/format JSON. 

## 3) Model danych i RLS

**Tabele/kolumny używane (krytyczne):**

* `phrases(tokens JSONB)` — tokenizacja słów/znaków do click-to-seek i highlight. 
* `audio_segments(status, word_timings JSONB, is_active)` — status segmentów, opcjonalna synchronizacja słów w ms. 
* `notebooks(current_build_id)` — szybkie filtrowanie aktywnych segmentów. 
* (opcjonalnie) MV `notebook_audio_statuses` — agregaty statusów. 

**RLS:** owner-only wg §4 planu DB na `notebooks`, `phrases`, `audio_segments`; MV udostępniamy przez zapytanie ograniczone do notatników użytkownika / funkcję STABLE. 

**Indeksy wymagane (istniejące):**

* `phrases_idx_notebook_position` (listy/odtwarzanie) 
* `audio_segments_uq_active_slot` (spójność jednego aktywnego slotu) 
* `audio_segments_idx_phrase_slot_active`, `audio_segments_idx_status`, `audio_segments_idx_build` (manifest/statusy) 

## 4) Typy i kontrakty

**DTO/Response (odwołania, bez duplikacji):**

* **Phrase** z `tokens` (EN/PL): patrz kontrakty Phrases. 
* **AudioSegment** z `status`, opcj. `word_timings`. 
* **PlaybackManifest**: `sequence[] { phrase, segments[slot, status, url, duration_ms, word_timings?] }` + `expires_at`. 
* **NotebookAudioStatus**: `complete_count`, `failed_count`, `missing_count`. 

**Reguły serializacji:** ISO-8601 dla timestamptz; ID jako UUID; ETag/If-None-Match dla list jak w API planie. 

**Typy w kodzie:** korzystamy z `@database.types.ts` / `@types` dla `PhraseTokens`, `WordTiming`, `AudioStatus`, `VoiceSlot`, `PlaybackManifest`. (Odwołanie: plik dostarczony przez użytkownika).

## 5) Walidacja i limity

* **`PATCH /api/phrases/:id` — tokens**:
  `tokens.en|pl = Array<{ text: string; start: number; end: number }>`; `start/end` to indeksy znaków w tekście (nie czas!). Walidacja spójności z `en_text`/`pl_text` (zakresy, brak nachodzenia). 
* **Limit tekstów**: EN/PL 1..2000 znaków; egzekwowane CHECK + warstwa aplikacyjna. 
* **Manifest**: `highlight=on|off`, `speed ∈ {0.75,0.9,1,1.25}` — walidacja wartości. Segmenty `failed/missing` **omijane** w odpowiedzi. 
* **Statusy**: enum `complete|failed|missing` zdefiniowany w DB. 

## 6) Przepływy (E2E) w ramach etapu

**A) Odtwarzanie z click-to-seek i highlight (EN→PL):**  

```
UI Player ──GET /playback-manifest──> API ──sign──> Storage
   │                                         │
   │<──sequence(+URLs, word_timings)─────────┘
   │
   ├─ user clicks word (w EN/PL segment) ──► compute ms from word_timings / heurystyka
   │                                         (gdy brak timings → heurystyka znakowa)
   └─ auto-advance: EN1→EN2→EN3→PL, 800 ms pauzy, pomijanie braków
```

**B) Tabela fraz ze statusami:** 

```
UI Notebook Table ──GET /audio-status──> API ──(MV or live agg)──> DB
         │
         └─ render: complete/failed/missing (zgodnie z aktywnym buildem)
```

**Idempotency & transakcje:** manifest jest bezmutacyjny; `PATCH phrases` atomowy (single row); brak side-effectów w Storage.

## 7) Bezpieczeństwo

* **JWT & RLS:** Wszystkie SELECT/UPDATE przez RLS; manifest i statusy ograniczone do ownera. DEV: `DEV_JWT` w `NODE_ENV=development` z service-role **tylko lokalnie**; PROD bez DEV ścieżek. (Źródło: `<auth>`, DB RLS). 
* **CORS:** tylko origin aplikacji (jak w planie API). 
* **Storage URLs:** wyłącznie **short-lived signed URLs** zwracane przez manifest; ścieżki raw nie są używane w kliencie. 
* **Sekrety:** brak ekspozycji kluczy TTS; wszystko serwer-side. 
* **Brak wycieków metadanych:** 404/403 dla cudzych zasobów (zgodnie z PRD UC-01). 

## 8) Obsługa błędów

* **Katalog błędów (wybrane):** `400 validation_error`, `404 not_found`, `409 unique_violation|conflict`, `500 internal`. Dla TTS/Generate pozostają `402 quota_exceeded`, `504 tts_timeout` (nie dotyczy manifestu). 
* **Edge cases:**

  * Manifest: brak aktywnego buildu → sekwencja pusta; 200 z `sequence: []`.
  * `tokens` niespójne z tekstem → `400 validation_error` (szczegół: niepoprawne zakresy).
  * Phrase bez `word_timings` → click-to-seek korzysta z heurystyki znakowej po stronie UI, manifest bez timings.
  * Statusy: MV nie istnieje → fallback na live aggregate (wydajnościowo ograniczać do danego notebooka). 

## 9) Wydajność

* **Zapytania krytyczne:**

  * Manifest: filtrowanie po **aktywnych** segmentach (`is_active=true`) i sort EN1→EN2→EN3→PL; użyć indeksów `audio_segments_idx_phrase_slot_active`, `audio_segments_idx_build`. 
  * Agregaty statusów: MV `notebook_audio_statuses` (preferowane), inaczej `COUNT(*) FILTER (status=...)` po aktywnych segmentach. 
* **Budżet latencji:** manifest < 150 ms P95 dla 25 fraz (lokalny Storage signing); tabela statusów < 80 ms przy MV.
* **Batchowanie/paginacja:** `phrase_ids` subset w manifeście dla długich list; listy fraz paginowane. 
* **Fallback:** brak timings → UI heurystyka, bez obciążeń serwera.

## 10) Testy jednostkowe

1. **Manifest omits missing/failed:** dla kombinacji statusów zwraca tylko `complete`. (API manifest) 
2. **Ordering EN1→EN2→EN3→PL:** niezależnie od braków utrzymuje kolejność. (API manifest) 
3. **Signed URL TTL present:** `expires_at` w przyszłości, URL niepusty. (API manifest) 
4. **Tokens schema validation:** odrzuca nachodzące zakresy i out-of-bounds. (Phrases PATCH) 
5. **RLS ownership enforcement:** cross-user notebook → 404 w manifest/status. (RLS) 
6. **Audio status aggregation:** poprawne `complete/failed/missing` dla aktywnego buildu. (MV/live agg) 
7. **No timings path:** manifest bez `word_timings`, UI hint `highlight` nie zmienia payloadu. (API manifest) 
8. **Phrase update position uniqueness:** konflikt pozycji → `409 unique_violation`. (Phrases) 
9. **Notebook without build:** manifest ze `sequence: []`. (API manifest) 
10. **Status endpoint ownership & shape:** 200 i wartości liczbowe, lub 404 gdy notebook niedostępny. (Audio-status) 

## 11) Kroki wdrożenia (kolejność)

1. **DB/MV:**

   * Upewnij się, że kolumny `tokens` (w `phrases`) i `word_timings`, `status`, `is_active` (w `audio_segments`) są obecne i zgodne z planem DB; dodaj brakujące **indeksy** wg §3 (idempotentne migracje).
   * Utwórz/odśwież logikę **MV `notebook_audio_statuses`** oraz procedurę odświeżania po zakończeniu joba (hook w workerze). 
2. **API:**

   * Rozszerz `GET /playback-manifest` o wstrzykiwanie `word_timings` (jeśli istnieją), param `highlight` (hint, bez wpływu na wynik) i zachowanie „omit failed/missing”.
   * Zaimplementuj `GET /notebooks/:id/audio-status` (MV → fallback).
   * W `PATCH /phrases/:id` dołóż walidację schematu `tokens`. 
3. **Security:**

   * Egzekwuj RLS/ownership na wszystkich selektach; w DEV obsłuż `DEV_JWT` zgodnie z middleware (tylko lokalnie). (Źródło: `<auth>`, DB RLS). 
4. **Frontend (Astro/React/Tailwind):**

   * Player: obsługa click-to-seek z `word_timings`; fallback heurystyczny (po znakach/tokenach) gdy timings brak.
   * Przełącznik **Highlight on/off** (UI-state; hint przekazywany do manifestu).
   * Tabela fraz: kolumny `status` (complete/failed/missing) z `GET /audio-status`; pomijanie braków w sekwencji odtwarzania. 
5. **Observability & błędy:**

   * Loguj metryki: czas generowania manifestu, udział fraz bez `word_timings`, spójność statusów.
   * Mapuj wyjątki do katalogu błędów (format JSON jak w API planie). 
6. **Review & hardening:**

   * CORS tylko origin aplikacji; brak ekspozycji sekretnych kluczy; test 404/403 dla cudzych zasobów. 
7. **Unit tests:** uruchom zestaw z §10 (bez e2e).

---

**Zgodność stała:**
Statusy 200/201/400/401/404/409/422/500 (+ ewentualne `402 quota_exceeded` wg API), pełna zgodność z RLS i regułami implementacji, stack Astro/TS/React/Tailwind/Supabase. (Odwołania: @shared.mdc, @backend.mdc, @astro.mdc, @api-plan.md, @plan-db.md, @prd.md).   

**Koniec planu.**
