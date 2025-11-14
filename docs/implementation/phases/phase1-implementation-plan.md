# Phase Implementation Plan: Etap 1 — Notatnik + Import (CRUD, limity, raport odrzuceń)

## 1) Przegląd etapu

**Fragment z @phases-plan.md (dokładny):**
**Etap 1 — Notatnik + Import (CRUD, limity, raport odrzuceń)**

**Cel:** wprowadzić dane do nauki, gwarantując walidacje.
**Zakres:** CRUD notatników/fraz; import `EN ::: PL` z normalizacją; limity (frazy/notatnik, długość frazy, max notatników/użytkownik); log odrzuceń. Widok listy i notatnika w GUI.
**Akceptacja (UC-04/05 + UC-10 import):** poprawne utworzenie notatnika z importu, zachowanie kolejności/pozycji, jasno zwrócone odrzucenia (lista odrzuconych z powodem).

**Powiązanie z PRD (kluczowe UC):** UC-04 (Import), UC-05 (Zarządzanie frazami), UC-10 (Spójne komunikaty błędów). Limity i normalizacja wejścia, raport odrzuceń oraz prywatność notatników wynikają z §3.1, §3.2, §3.6 PRD.

**Zależności między komponentami (Auth/RLS/Storage/Jobs):**

- Auth/JWT + RLS — wymagane z Etapu 0 (already-on). Wszystkie operacje na `notebooks/phrases/import_logs` działają wyłącznie w kontekście właściciela.
- Storage/Jobs — **poza zakresem** tego etapu (wchodzą w Etap 2+).

---

## 2) Zakres API w tym etapie

**Źródło kontraktów:** @api-plan.md §2.2–2.4 (Notebooks, Phrases, Import) oraz §2.12 Health (informacyjnie).

| Endpoint                                     | Operacja | Status        | Walidacje kluczowe                                                                                                              | Kody błędów (przykłady)                             |                  |          |
| -------------------------------------------- | -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------- | -------- |
| `/api/notebooks`                             | GET      | **nowy**      | Paginacja `limit/cursor`; sort `updated_at                                                                                      | created_at                                          | name`; filtr `q` | 401, 200 |
| `/api/notebooks`                             | POST     | **nowy**      | `name` 1..100, unikalny per user (CITEXT)                                                                                       | 400 `validation_error`, 409 `unique_violation`, 201 |                  |          |
| `/api/notebooks/:notebookId`                 | GET      | **nowy**      | UUID path, RLS właściciela                                                                                                      | 404 `not_found`, 200                                |                  |          |
| `/api/notebooks/:notebookId`                 | PATCH    | **nowy**      | `name` 1..100, unikalność per user                                                                                              | 400, 409, 200                                       |                  |          |
| `/api/notebooks/:notebookId`                 | DELETE   | **nowy**      | Kaskada w DB (frazy, import_logs, …)                                                                                            | 404, 204                                            |                  |          |
| `/api/notebooks/:notebookId/phrases`         | GET      | **nowy**      | Paginacja, sort po `position                                                                                                    | created_at`                                         | 200              |          |
| `/api/notebooks/:notebookId/phrases`         | POST     | **nowy**      | `en_text`/`pl_text` 1..2000, `position` unikalny w notatniku                                                                    | 400, 409, 201                                       |                  |          |
| `/api/phrases/:phraseId`                     | PATCH    | **nowy**      | Zmiana `position` (unikalność), tekstów, `tokens` schema                                                                        | 400, 409, 200                                       |                  |          |
| `/api/phrases/:phraseId`                     | DELETE   | **nowy**      | Usuwa frazę (+kaskada segmentów, future)                                                                                        | 204                                                 |                  |          |
| `/api/notebooks/:notebookId/phrases:reorder` | POST     | **nowy**      | Spójność i unikalność `position` po ruchach                                                                                     | 400, 200                                            |                  |          |
| `/api/notebooks:import`                      | POST     | **nowy**      | Format `EN ::: PL`, normalizacja, limity ≤100 fraz/notatnik, ≤2000 znaków/strona, ≤500 notatników/użytkownik; `Idempotency-Key` | 400 `validation_error`, 413 `limit_exceeded`, 201   |                  |          |
| `/api/notebooks/:notebookId/import-logs`     | GET      | **nowy**      | Paginacja logów odrzuceń                                                                                                        | 200                                                 |                  |          |
| `/api/health`                                | GET      | **bez zmian** | Liveness                                                                                                                        | 200                                                 |                  |          |

Linki do kontraktów: @api-plan.md §2.2 Notebooks, §2.3 Phrases, §2.4 Import, §2.12 Health.

**Poza zakresem etapu:** TTS, User Voices, Jobs, Builds, Audio Segments, Playback Manifest (Etap 2–3).

---

## 3) Model danych i RLS

**Tabele/kolumny używane:** `users`, `notebooks(id,user_id,name,…)`, `phrases(id,notebook_id,position,en_text,pl_text,tokens,…)`, `import_logs(id,user_id,notebook_id,line_no,raw_text,reason,…)`.

**Relacje krytyczne:** `users 1:N notebooks`, `notebooks 1:N phrases`, `users 1:N import_logs` oraz `notebooks 1:N import_logs`.

**Indeksy wymagane (istniejące w planie DB):**

- `notebooks_idx_user_updated` — listowanie/sort `updated_at`.
- `phrases_idx_notebook_position` (+ `phrases_idx_notebook_created`) — listowanie fraz i utrzymanie kolejności.
- `import_logs_idx_notebook_created` — przegląd logów odrzuceń.

**RLS i asercje własności:** Polityki owner-only dla `notebooks`, `phrases`, `import_logs` zgodnie z §4 DB (warunki `auth.uid()` i join przez notebook). Mutacje muszą dodatkowo asercyjnie sprawdzić przynależność zasobu do użytkownika przed operacją.

---

## 4) Typy i kontrakty

- DTO zgodne z @api-plan.md (Notebooks, Phrases, Import). Kluczowe pola:
  - Notebook: `{ id, name, current_build_id?, last_generate_job_id?, created_at, updated_at }`
  - Phrase: `{ id, position, en_text, pl_text, tokens?, created_at, updated_at }`
  - Import response: `{ notebook:{…}, import:{ accepted, rejected, logs[] } }`

- Typy/ENUM z DB: `voice_slot_enum`, `audio_status_enum` (na przyszłość), `job_*` (poza zakresem w Etap 1).
- Reguły serializacji: ISO-8601 `timestamptz`, UUID jako string. ETag/If-None-Match — jak w @api-plan.md §10 (zalecane, nie krytyczne dla Etap 1).
- Odniesienie do definicji typów: @database.types.ts (mapowanie TS na DTO).

---

## 5) Walidacja i limity

- **Notebooks:** `name` 1..100, unikalny per user (CITEXT). Błędy: `400 validation_error`, `409 unique_violation`.
- **Phrases:** `en_text`/`pl_text` 1..2000; `position` unikalny w notatniku; opcjonalne `tokens` zgodne ze schematem (indeksy znakowe start/end). Błędy: `400`, `409`.
- **Import:**
  - Format: dokładnie jeden separator `:::`; brak wielu separatorów; EN/PL niepuste po `trim`.
  - Normalizacja (włączana `normalize=true`): usunięcie zero-width/sterujących, konwersja „inteligentnych” cudzysłowów na proste, redukcja ≥2 spacji do pojedynczej (pojedyncze spacje zostają), `trim`; **nie** zmieniamy `-` ani `—`.
  - Limity: ≤100 fraz/notatnik; ≤2000 znaków na część; ≤500 notatników/użytkownik.
  - Raport: wyłącznie odrzucone linie z numerem i powodem; zapis do `import_logs`.
  - Błędy: `400 validation_error`, `413 limit_exceeded`.
    (PRD §3.2 i dodatek <dod>; API §2.4; DB `import_logs`).

---

## 6) Przepływy (E2E) w ramach etapu

**A) Import → utworzenie notatnika + fraz + log odrzuceń**

```
Client
  └─ POST /api/notebooks:import (name, lines[], normalize, Idempotency-Key)
       ├─ Auth (JWT) → RLS context
       ├─ Walidacja globalna limitów (≤100 fraz; ≤500 notatników/użytk.)
       ├─ For each line:
       │    - Normalize (opcjonalnie) → validate `EN ::: PL`
       │    - If invalid → push rejection (line_no, reason) → persist to import_logs
       │    - If valid   → create Phrase {position=10*k}
       ├─ Create Notebook (CITEXT uniqueness)
       ├─ Bulk insert Phrases (ordered positions)
       └─ 201 { notebook, import:{accepted,rejected,logs[]} }
```

**B) CRUD fraz i notatników**

```
List notebooks → GET /api/notebooks (owner-only via RLS)
Create notebook → POST /api/notebooks (validate name)
List phrases   → GET /api/notebooks/:id/phrases (sort by position)
Add phrase     → POST /api/notebooks/:id/phrases (validate lengths, position)
Update phrase  → PATCH /api/phrases/:id (position uniqueness, text lengths)
Reorder bulk   → POST /api/notebooks/:id/phrases:reorder (no duplicates)
Delete phrase  → DELETE /api/phrases/:id
Delete notebook→ DELETE /api/notebooks/:id (DB cascade)
```

**Idempotency:** Obsłużyć `Idempotency-Key` dla `POST /api/notebooks:import` (powtórzenie zwraca identyczną odpowiedź).

---

## 7) Bezpieczeństwo

- **JWT + RLS:** wszystkie zapytania wymagają ważnego Bearer JWT; RLS właściciela na `notebooks/phrases/import_logs`. Brak przecieków metadanych przy cross-user (404/403 wg §3 API i §4 DB).
- **CORS:** wyłącznie origin aplikacji.
- **Sekrety:** brak sekretów w tym etapie (TTS klucz w Etap 2).
- **Storage URLs:** niedotyczy (Etap 2).
- **Rate limiting (zalecenie):** 60 req/min ogólne; 10 req/min dla mutacji; import objęty limitem rozmiaru body (np. 256 KB).

---

## 8) Obsługa błędów

**Katalog błędów (@api-plan.md §6, uzupełnienie Etap 1):**

- 400 `validation_error` (np. brak separatora, puste EN/PL, złe długości, zły `name`).
- 401 `unauthorized` (brak/nieprawidłowy JWT).
- 404 `not_found` (RLS blokuje obcy zasób).
- 409 `unique_violation` (duplikat nazwy notatnika), `conflict` (zajęta pozycja przy PATCH/POST frazy mapowane na 409).
- 413 `limit_exceeded` (frazy>100).
- 500 `internal`.

**Retry/idempotency:** `POST /api/notebooks:import` wspiera `Idempotency-Key`. Inne POST-y w tym etapie nie muszą (opcjonalnie wg @api-plan.md rekomendacji cross-cutting).

**409 vs 422:** Konflikty unikalności → 409; błędy walidacji schematu/pól → 400. (422 nieużywane w Etap 1 poza ewentualnymi rozszerzeniami — zgodnie z katalogiem @api-plan.md).

---

## 9) Wydajność

- **Wąskie gardła:** masowy insert fraz (do 100) oraz walidacja linii — rozwiązać batchowaniem i minimalną liczbą round-tripów do DB (transakcja: create notebook + bulk insert phrases + bulk insert import_logs).
- **Krytyczne zapytania:** listowanie notatników (indeks po `user_id, updated_at`), listowanie fraz po `notebook_id, position`.
- **Paginacja:** kursorowa (`limit`≤100) wg @api-plan.md.
- **Budżet latencji:** cel < 150 ms p95 dla GET list (poza siecią), < 300 ms p95 dla POST/patch/delete (bez generacji).
- **Fallback/MV:** niedotyczy (statusy audio w Etap 3).

---

## 10) Testy jednostkowe

> Tylko unit (bez e2e), do 10 szt.

1. **Import: poprawna linia** → parsowanie, normalizacja zgodna z <dod>, poprawny insert frazy i pozycjonowanie.
2. **Import: odrzucone linie** → wielokrotny separator / brak separatora / puste EN lub PL; zapis do `import_logs` z właściwym `reason`.
3. **Import: limity** → >100 linii → `413 limit_exceeded`; >2000 znaków w EN/PL → `400 validation_error`; >500 notatników/użytkownika → `400/402` (wg implementacji biznesowej limitu).
4. **Idempotency importu** → powtórny `Idempotency-Key` zwraca identyczny rezultat (bez duplikatów).
5. **Notebook: unikalność nazwy** (CITEXT) → konflikt „Daily” vs „daily” → `409 unique_violation`.
6. **Phrase: limity długości** (1..2000) → `400 validation_error`.
7. **Phrase: konflikt pozycji** → duplicate `position` w notatniku przy POST/PATCH → `409`.
8. **RLS: dostęp właściciela** → select/update na cudzym `notebookId` → `404/403`.
9. **Reorder bulk** → wykrycie duplikatów w `moves` → `400 validation_error`; poprawne zliczenie `updated`.
10. **Lista import-logs** → kolejność domyślna, paginacja kursorem, tylko logi właściciela.

---

## 11) Kroki wdrożenia (kolejność)

1. **Migracje DB (Etap 1):** upewnij `citext`; tabele `notebooks`, `phrases`, `import_logs` + indeksy + RLS jak w @plan-db.md (§1, §3, §4).
2. **Warstwa RLS/Policies:** wdrożenie i test polityk owner-only dla ww. tabel (quick smoke przez `auth.uid()`).
3. **Kontrakty API:** implementacja endpointów §2.2–2.4 z @api-plan.md (schematy walidacji, paginacja, błędy).
4. **Parser importu + normalizacja:** zgodnie z <dod> oraz PRD §3.2/§3.6; zapisy do `import_logs`.
5. **Idempotency-Key:** cache per user+route dla `/api/notebooks:import`.
6. **UI (minimal):** lista notatników, ekran importu z raportem odrzuceń, widok notatnika z tabelą fraz i CRUD (zgodnie z PRD §3.6 stron).
7. **Observability:** structured logs (route, user_id, latency), metryki odrzuceń importu; mapowanie wyjątków na `error.code`.
8. **Hardening:** CORS do origin, limity rozmiaru body (np. 256 KB) na import, rozsądny rate-limit mutacji.
9. **Testy jednostkowe (10):** uruchom i utrwal w CI.
10. **Go-live Etapu 1:** włączenie widoków GUI, monitorowanie metryk sukcesu PRD (§6).

---

**Wymagania stałe:** statusy 200/201/400/401/404/409/422/500 (+ ewentualne `402 quota_exceeded` tylko dla TTS — poza Etap 1); ścisła zgodność z RLS i regułami implementacji (@shared.mdc, @backend.mdc, @astro.mdc); dostosowanie do stacku (Astro/TS/React/Tailwind/Supabase); zgodność z konwencjami API (idempotency, paginacja, katalog błędów).

**Uwaga dot. <dod> (Import `EN ::: PL`):** implementacja parsera i raportu odrzuceń musi ściśle przestrzegać zasad separatora, normalizacji, limitów i raportowania wyłącznie odrzuconych linii (z numerem i powodem), bez modyfikacji `-`/`—`. (Zgodnie z dodatkiem i PRD §3.2/§3.6).

---
