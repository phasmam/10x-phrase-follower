<analysis>
1) **Cel etapu (powiązanie z PRD/UC):**  
Etap 2 domyka pętlę wartości „fraza → audio → odsłuch”: zapis i test klucza Google TTS (bez ekspozycji do klienta), konfiguracja 4 slotów głosów (EN1/EN2/EN3/PL) bez duplikatów EN, pełny **rebuild** audio (job + build + segmenty), **Playback Manifest** z krótkimi **signed URL** do odtwarzania, minimalny player (Play/Pause, sekwencja EN1→EN2→EN3→PL, prędkości, auto-advance). Akceptacja pokrywa UC-02/03/06/07 + komunikat błędu generate (UC-10). :contentReference[oaicite:0]{index=0} :contentReference[oaicite:1]{index=1}

2. **Zakres API etapu (z @api-plan.md):**
   Zasoby/endpointy dotknięte:

* **TTS Credentials**: `GET /api/tts-credentials` (*nowy*), `POST /api/tts-credentials:test` (*nowy*), `PUT /api/tts-credentials` (*nowy*), `DELETE /api/tts-credentials` (*nowy*).
* **User Voices**: `GET /api/user-voices` (*nowy*), `PUT /api/user-voices/:slot` (*nowy*).
* **Jobs**: `POST /api/notebooks/:notebookId/jobs:generate-rebuild` (*nowy*), `GET /api/notebooks/:notebookId/jobs` (*nowy*), `GET /api/jobs/:jobId` (*nowy*), `POST /api/jobs/:jobId:cancel` (*nowy*).
* **Builds**: `GET /api/notebooks/:notebookId/builds` (*nowy*), `GET /api/builds/:buildId` (*nowy*).
* **Audio Segments**: `GET /api/notebooks/:notebookId/audio-segments` (*nowy*), `GET /api/audio-segments/:audioSegmentId` (*nowy*).
* **Playback Manifest**: `GET /api/notebooks/:notebookId/playback-manifest` (*nowy*).
* **Notebooks/Phrases**: tylko **odczyty** na potrzeby manifestu/relacji (*bez zmian*).
* **Import**: *poza zakresem etapu* (Etap 1).
* **Users/Health**: *bez zmian*. 

3. **Zależności i kolejność wdrożenia:**

* **Auth/JWT & RLS:** Etap 0 już aktywował RLS. W DEV używamy mechanizmu **DEV_JWT** i serwisowego klucza do działań serwerowych (TTS test, signing), w PROD tylko standardowe JWT i RLS egzekwowane na wszystkich zapytaniach. 
* **CORS:** ograniczony do origin aplikacji (@api-plan). 
* **Storage signing:** wymagane do manifestu; krótkie TTL. 
* **Job worker:** potrzebny do GENERATE_REBUILD (kolejka/worker, może być cron/queue); finalizacja aktywności segmentów i GC plików. 
* **MV (opcjonalnie):** `notebook_audio_statuses` (refresh po jobie); nie jest krytyczne dla Etapu 2, ale wspiera metryki/statusy. 

4. **Model danych (kluczowe tabele/relacje/indeksy):**
   `t t s_credentials (1:1 user)`, `user_voices (4 sloty/user)`, `jobs (GENERATE_REBUILD lifecycle)`, `builds (N:1 jobs)`, `audio_segments (phrase×slot×build, is_active)`, `notebooks.current_build_id` wskazuje aktywny build. Krytyczne indeksy: `audio_segments_uq_active_slot` (partial unique), `audio_segments_idx_phrase_slot_active`, `jobs_idx_*`, `builds_idx_notebook_created`, `notebooks_idx_user_updated`, `phrases_idx_notebook_position`. 

5. **Typy/DTO/komendy (odwołania):**

* ENUM: `voice_slot_enum{EN1,EN2,EN3,PL}`, `audio_status_enum{complete,failed,missing}`, `job_type_enum{GENERATE_REBUILD}`, `job_state_enum{queued,running,succeeded,failed,canceled,timeout}`.
* DTO: `TtsCredentialsState`, `TtsCredentialsTestRequest`, `UserVoiceSlot`, `GenerateRebuildJobRequest`, `Job`, `Build`, `AudioSegment`, `PlaybackManifest`. Patrz nazwy i kształty z @api-plan.md oraz definicje typów w `@database.types.ts` dla kolumn/enumów. 

6. **Walidacje i limity:**

* **TTS credentials:** POST `:test` mapuje błędy na `invalid_key|quota_exceeded|tts_timeout`; `PUT` dopiero po udanym teście; klucz szyfrowany; nigdy nie zwracamy surowego klucza.  
* **User voices:** slot∈EN1/EN2/EN3/PL; język zgodny; brak duplikatów w obrębie EN; conflict 409.  
* **Jobs:** jeden aktywny job per notebook; `timeout_sec` null lub 1..86400; `409 job_in_progress`.  
* **Audio:** MP3 22.05 kHz/64 kbps; `status ∈ complete|failed|missing`; dur/size CHECK; manifest pomija missing/failed.   

7. **Bezpieczeństwo:**

* **Uwierzytelnianie:** Supabase JWT (PROD), **DEV_JWT** w DEV (5 min, `DEFAULT_USER_ID`), middleware odcina w PROD. DEV może użyć service role do obejścia RLS tylko w dev-flow. 
* **Autoryzacja:** RLS owner-only na wszystkich tabelach; dodatkowe asercje własności w ścieżkach jobs/manifest/signing. 
* **Sekrety:** klucz TTS wyłącznie na serwerze, przechowywany jako `encrypted_key`; URL-e storage wyłącznie signed (krótkie TTL).  

8. **Scenariusze błędów:**

* Katalog: `400 validation_error|invalid_key`, `402 quota_exceeded`, `404 not_found`, `409 job_in_progress|conflict|unique_violation`, `413 limit_exceeded`, `422 cannot_cancel`, `500 internal`, `504 tts_timeout`. Idempotency dla POST (import/generate). 
* Retry: klient może ponowić `generate` tylko z `Idempotency-Key`; 409 blokuje równoległość. 

9. **Wydajność:**

* Wąskie gardła: generacja TTS (zew. provider) i budowa manifestu. Indeksy aktywnych segmentów i filtrowanie po `phrase_id/slot` optymalizują manifest. GC plików poza transakcją. MV dla statusów (opcjonalnie).  

10. **Testy jednostkowe (max 10):**

1) `tts-credentials:test` mapowanie błędów (`invalid_key`, `quota_exceeded`, `tts_timeout`). 
2) `tts-credentials:put` odrzuca zapis bez wcześniejszego pozytywnego testu. 
3) `user-voices:put` — walidacja slot↔language oraz `409 conflict` przy duplikacie EN. 
4) `jobs:generate-rebuild` — `400` gdy brak TTS/voices, `409` gdy job aktywny. 
5) Pipeline joba: po sukcesie nowy build aktywuje segmenty (`is_active=true`), poprzednie dezaktywowane; `current_build_id` ustawione. 
6) Manifest pomija `failed/missing`, zachowuje kolejność EN1→EN2→EN3→PL, generuje signed URLs. 
7) RLS: użytkownik A nie widzi segmentów/manifestu notatnika użytkownika B (404/403). 
8) Indempotency: powtórny `POST jobs:generate-rebuild` z tym samym `Idempotency-Key` zwraca tę samą odpowiedź. 
9) Walidacja parametrów audio segmentu (`sample_rate_hz=22050`, `bitrate_kbps=64`). 
10) DEV auth: w DEV ścieżka TTS test działa przy bypassie RLS; w PROD bez JWT 401/403. 

    </analysis>

---

# stage-implementation-plan.md

# Stage Implementation Plan: Etap 2 — „Audio loop” (TTS konfiguracja → generowanie → minimalny odsłuch)

## 1) Przegląd etapu

**Cel i zakres — cytat ze @stages-plan.md:**

> **Etap 2 — „Audio loop” (TTS konfiguracja → generowanie → minimalny odsłuch)**
> **Cel:** domknięta pętla wartości: fraza → audio → odsłuch.
> **Zakres:** zapis/test klucza TTS (bez ekspozycji do klienta); konfiguracja EN1/EN2/EN3/PL (bez duplikatów EN); pełny rebuild notatnika (po sukcesie dezaktywacja starych segmentów i GC plików); **Playback Manifest** ze **signed URL** (pomija missing/failed). Minimalny player: Play/Pause, sekwencja EN1→EN2→EN3→PL, prędkości, auto-advance.
> **Akceptacja (UC-02/03/06/07 + UC-10 generate):** klucz TTS zweryfikowany; pojedynczy aktywny job; manifest działa (krótkie URL, brak failed/missing); player gra pełną sekwencję; w razie niepowodzenia generowania jasny komunikat błędu („Nie udało się wygenerować audio. Spróbuj ponownie.”). 

**Powiązanie z PRD (kluczowe UC):** UC-02 (konfiguracja klucza TTS), UC-03 (konfiguracja lektorów), UC-06 (generowanie audio), UC-07 (odtwarzanie sekwencji), UC-10 (spójny komunikat błędu generate). Parametry audio: MP3 22.05 kHz / 64 kbps; sekwencja EN1→EN2→EN3→PL, pauzy, auto-advance. 

**Zależności:** Auth/JWT+RLS (Etap 0), CORS, Storage signing, worker jobs, opcjonalna MV statusów. W DEV obowiązuje opisany **DEV_JWT** i serwisowy bypass RLS, bez wpływu na PROD. (Sekcja `<auth>` + Etap 0). 

## 2) Zakres API w tym etapie

**Tabela (pełny katalog tylko dla dotkniętych):**

| Endpoint                                   | Operacja | Status | Walidacje kluczowe                                             | Kody błędów                      |                          |
| ------------------------------------------ | -------- | ------ | -------------------------------------------------------------- | -------------------------------- | ------------------------ |
| `/api/tts-credentials`                     | GET      | nowy   | nigdy nie zwraca klucza; tylko stan                            | 401, 200                         |                          |
| `/api/tts-credentials:test`                | POST     | nowy   | minimalny dry-run do Google TTS; mapowanie błędów              | 400 `invalid_key`, 402, 504, 200 |                          |
| `/api/tts-credentials`                     | PUT      | nowy   | zapis wyłącznie po udanym teście; szyfrowanie                  | 400, 200                         |                          |
| `/api/tts-credentials`                     | DELETE   | nowy   | usunięcie konfiguracji                                         | 204                              |                          |
| `/api/user-voices`                         | GET      | nowy   | 4 sloty max                                                    | 200                              |                          |
| `/api/user-voices/:slot`                   | PUT      | nowy   | slot∈EN1/EN2/EN3/PL; język zgodny; brak duplikatu EN           | 400, 409 `conflict`, 200         |                          |
| `/api/notebooks/:id/jobs:generate-rebuild` | POST     | nowy   | weryfikacja TTS i głosów; jeden aktywny job                    | 400, 409 `job_in_progress`, 202  |                          |
| `/api/notebooks/:id/jobs`                  | GET      | nowy   | filtrowanie po `state`                                         | 200                              |                          |
| `/api/jobs/:jobId`                         | GET      | nowy   | —                                                              | 200, 404                         |                          |
| `/api/jobs/:jobId:cancel`                  | POST     | nowy   | cancel tylko `queued                                           | running`                         | 422 `cannot_cancel`, 202 |
| `/api/notebooks/:id/builds`                | GET      | nowy   | —                                                              | 200                              |                          |
| `/api/builds/:buildId`                     | GET      | nowy   | —                                                              | 200, 404                         |                          |
| `/api/notebooks/:id/audio-segments`        | GET      | nowy   | tylko **active**; filtry `phrase_id/voice_slot/status`         | 200                              |                          |
| `/api/audio-segments/:audioSegmentId`      | GET      | nowy   | —                                                              | 200, 404                         |                          |
| `/api/notebooks/:id/playback-manifest`     | GET      | nowy   | signed URLs; pomija `failed/missing`; kolejność EN1→EN2→EN3→PL | 200                              |                          |

Kontrakty i przykłady payloadów: @api-plan.md §2.5–2.11. 

## 3) Model danych i RLS

**Tabele/relacje krytyczne:** `tts_credentials (1:1 users)`, `user_voices (4× user)`, `jobs`, `builds`, `audio_segments (phrase×slot×build, is_active)`, `notebooks.current_build_id`. Relacje i CASCADE zgodnie z @plan-db.md §1–2. 

**Indeksy (wymagane/nadzorcze):**

* *Required:* `audio_segments_uq_active_slot` (partial unique), `audio_segments_idx_phrase_slot_active`, `jobs_idx_notebook_started`, `jobs_idx_state`, `builds_idx_notebook_created`.
* *Istniejące dla list:* `notebooks_idx_user_updated`, `phrases_idx_notebook_position`. 

**RLS:** owner-only na wszystkich tabelach w ścieżce użytkownika; `audio_segments` oraz `builds` egzekwują dostęp przez powiązane `phrases/notebooks`. Dla MV statusów — wystawienie przez funkcję/VIEW ograniczającą do `auth.uid()`. 

## 4) Typy i kontrakty

**DTO/Responses (nazwy jak w @api-plan.md):**

* `TtsCredentialsState`, `TtsCredentialsTestRequest`, `TtsCredentialsPutRequest`.
* `UserVoiceSlot` (PUT), `UserVoicesResponse` (GET).
* `GenerateRebuildJobRequest`, `Job`, `Build`.
* `AudioSegment`, `PlaybackManifest`.
  **Reguły serializacji:** czasy ISO-8601 `timestamptz`; UUID; dla GET list — `next_cursor`; eTag/If-None-Match dla cache’owalnych list (wg @api-plan.md §10). 

## 5) Walidacja i limity

* **TTS**: `:test` wykonuje minimalne żądanie; mapuje błędy `invalid_key|quota_exceeded|tts_timeout`; `PUT` dozwolony tylko po PASS teście; klucz szyfrowany (`encrypted_key`).  
* **Voices**: `(EN1..EN3 ⇒ language='en')`, `(PL ⇒ 'pl')`, unikalność slotu per user i brak duplikatu EN w 4-slotowym zbiorze; `409 conflict`.  
* **Jobs**: 1 aktywny/job; `timeout_sec` null lub 1..86400; `Idempotency-Key` wspierany; `409 job_in_progress`. 
* **Manifest**: tylko `status=complete`; pomija `failed/missing`; krótkie signed URLs. 
* **Audio parametry**: `sample_rate_hz=22050`, `bitrate_kbps=64`, trwałość w `audio_segments`. 

## 6) Przepływy (E2E) w ramach etapu

**A) Konfiguracja TTS (UC-02)**

```
Client ──PUT /api/tts-credentials (po udanym POST :test)──▶ API ──encrypt & store──▶ tts_credentials
Client ◀────────── GET /api/tts-credentials (stan) ──────────── API
```

**B) Konfiguracja głosów (UC-03)**

```
Client ──PUT /api/user-voices/EN1..PL──▶ API ──RLS assert user──▶ user_voices (unikalność slotu; brak duplikatu EN)
```

**C) Generowanie (UC-06) — full rebuild & aktywacja**

```
Client ──POST /notebooks/:id/jobs:generate-rebuild──▶ API
   1) validate TTS + voices + 1 active job
   2) create job(state=queued) → enqueue
Worker: queued→running → TTS calls per (phrase×slot) → upload Storage → insert audio_segments(status)
   SUCCESS: mark new is_active=true; old is_active=false; set notebooks.current_build_id; GC old MP3 (async)
Client ──GET /jobs/:jobId (poll)──▶ API
```

(Odwzorowanie stanów i aktywacji wg @plan-db.md §5, @api-plan.md §4.3).  

**D) Odtwarzanie (UC-07) — manifest & player**

```
Client ──GET /notebooks/:id/playback-manifest?speed=...──▶ API ──sign URLs (short TTL)──▶ Storage
Client ◀──────── manifest (EN1→EN2→EN3→PL; only complete) ──────── API
Player: Play/Pause; prędkości 0.75/0.9/1/1.25; auto-advance po PL (+800ms pauzy)
```

(Parametry i sekwencja wg PRD).  

**Transakcje & idempotency:**

* Tworzenie `jobs` i `builds` w kontrolowanych transakcjach; `Idempotency-Key` stabilizuje odpowiedź POST generate. 

## 7) Bezpieczeństwo

* **JWT/RLS:** PROD — wyłącznie Supabase JWT + RLS; DEV — **DEV_JWT** (5 min) i serwisowy klient do operacji serwerowych; brak przecieków do buildów prod. (Etap 0 + `<auth>`). 
* **Storage:** wyłącznie signed URLs z krótkim TTL (manifest). Brak surowych ścieżek w kliencie poza informacyjnymi. 
* **Sekrety:** `encrypted_key` w DB; klucz TTS nigdy nie wraca do klienta; brak logowania sekretów. 
* **CORS:** tylko origin aplikacji. Rate-limiting na `tts:test` i `jobs:generate-rebuild` (rekomendacja). 
* **Brak metadanych w 404/403:** cross-user → 404/403 bez ujawniania szczegółów. (PRD UC-01). 

## 8) Obsługa błędów

* **Katalog błędów (HTTP + `error.code`):** 200/201/204/202/400 `validation_error|invalid_key`, 401, 404 `not_found`, 409 `job_in_progress|conflict|unique_violation`, 413 `limit_exceeded`, 422 `cannot_cancel`, 500 `internal`, 504 `tts_timeout`. Identycznie z @api-plan.md §6. 
* **Edge cases:**

  * Generate bez TTS/voices → 400.
  * Równoległy generate → 409.
  * Manifest przy braku aktywnego buildu → sekwencje puste (200, `sequence: []`).
  * Cancel job w stanie terminalnym → 422 `cannot_cancel`.

## 9) Wydajność

* **Krytyczne zapytania:** manifest (join po aktywnych segmentach). Użycie: `audio_segments_idx_phrase_slot_active` i partial unique dla `is_active`. 
* **Budżet latencji:** manifest ≤ 150 ms P50 dla 100 fraz; podpisanie URL-i partiami.
* **Batchowanie/paginacja:** listy jobs/builds/segments z `limit/cursor` (default 25, max 100). 
* **MV statusów (opcjonalnie):** odświeżana po zakończeniu joba; fallback do live agregacji. 

## 10) Testy jednostkowe

1. `POST /api/tts-credentials:test` — mapowanie `invalid_key`/`quota_exceeded`/`tts_timeout`.
2. `PUT /api/tts-credentials` — odmowa zapisu bez wcześniejszego udanego testu; zapis z szyfrowaniem.
3. `PUT /api/user-voices/:slot` — walidacja slot↔language i `409 conflict` przy duplikacie EN.
4. `POST jobs:generate-rebuild` — `400` bez TTS/voices; `409 job_in_progress`.
5. Worker — po SUCCEED aktywuje nowe segmenty (`is_active=true`), dezaktywuje stare, ustawia `current_build_id`.
6. Worker — po FAIL nie zmienia `is_active`; zapis `error_code` w segmentach.
7. `GET playback-manifest` — pomija `failed/missing`, zachowuje EN1→EN2→EN3→PL, generuje ważne signed URLs.
8. RLS — dostęp do cudzych zasobów blokowany (404/403).
9. Parametry audio — enforce `sample_rate_hz=22050`, `bitrate_kbps=64`.
10. Idempotency — powtórny POST generate z tym samym `Idempotency-Key` zwraca identyczną odpowiedź.

## 11) Kroki wdrożenia (kolejność)

1. **DB migracje:** tabele `tts_credentials`, `user_voices`, `jobs`, `builds`, `audio_segments`; ENUM-y; indeksy i RLS (wg @plan-db.md). 
2. **Warstwa serwerowa (Astro API):** implementacja endpointów §2.5–2.11 z @api-plan.md; podpisywanie URL; mapowanie błędów; Idempotency-Key. 
3. **Worker jobs:** kolejka i proces GENERATE_REBUILD (TTS → Storage → `audio_segments` → flip `is_active` → GC). 
4. **DEV auth integracja:** włączenie przepływu **DEV_JWT** tylko w DEV; serwisowy klient do operacji uprzywilejowanych; brak w buildach PROD (zgodnie z Etap 0 i `<auth>`). 
5. **Frontend (minimalny player + ustawienia):** UI TTS credentials (test→save), UI wyboru głosów (4 sloty), przycisk Generate, player z sekwencją i prędkościami (bazuje na manifest). (PRD). 
6. **Observability:** logi ustrukturyzowane; metryki jobów; alerty na porażki TTS/generacji (rekomendacje @api-plan.md §11). 
7. **Hardening:** CORS do origin; rate-limiting na `tts:test` i `generate`; weryfikacja braku ekspozycji sekretów (inspekcja sieci). 

**Wymagania stałe:** kody statusu zgodnie ze specyfikacją, pełna zgodność z RLS i regułami implementacji (@shared.mdc/@backend.mdc/@astro.mdc), stack Astro/TS/React/Tailwind/Supabase, i nie duplikujemy definicji — odwołujemy się do @…
