# 1. Lista tabel z kolumnami, typami danych i ograniczeniami

> **Uwagi ogólne**
>
> * Wszystkie klucze główne: `UUID` (generowane aplikacyjnie).
> * Czas: `timestamptz` z `DEFAULT now()`.
> * Rozszerzenia: `citext` (dla unikalności case-insensitive nazw notatników), opcjonalnie `pg_trgm` (nieużywane w MVP).
> * Typy ENUM (PostgreSQL):
>
>   * `voice_slot_enum` ∈ {`EN1`,`EN2`,`EN3`,`PL`}
>   * `audio_status_enum` ∈ {`complete`,`failed`,`missing`}
>   * `job_type_enum` ∈ {`GENERATE_REBUILD`}
>   * `job_state_enum` ∈ {`queued`,`running`,`succeeded`,`failed`,`canceled`,`timeout`}

---

## `users`
This table is maganed by Supabase Auth.

* `id UUID PK` — **FK**→`auth.users(id)` (Supabase)
* `created_at timestamptz NOT NULL DEFAULT now()`
* **RLS**: owner-only (patrz §4)

> *Notka*: “users” jako profil cienki do referencji i RLS; dane uwierzytelniania w `auth.users`.

---

## `notebooks`

* `id UUID PK`
* `user_id UUID NOT NULL` — **FK**→`users(id)` ON DELETE CASCADE
* `name CITEXT NOT NULL`
* `current_build_id UUID NULL` — **FK**→`builds(id)` DEFERRABLE INITIALLY DEFERRED
* `last_generate_job_id UUID NULL` — **FK**→`jobs(id)` DEFERRABLE INITIALLY DEFERRED
* `created_at timestamptz NOT NULL DEFAULT now()`
* `updated_at timestamptz NOT NULL DEFAULT now()`
* **UNIQUE**(`user_id`,`name`)
* **CHECK**(char_length(name) BETWEEN 1 AND 100)

---

## `phrases`

* `id UUID PK`
* `notebook_id UUID NOT NULL` — **FK**→`notebooks(id)` ON DELETE CASCADE
* `position INTEGER NOT NULL`  — „kroki co 10”
* `en_text TEXT NOT NULL`
* `pl_text TEXT NOT NULL`
* `tokens JSONB NULL` — tokenizacja EN/PL dla highlight/klik-to-seek
* `created_at timestamptz NOT NULL DEFAULT now()`
* `updated_at timestamptz NOT NULL DEFAULT now()`
* **UNIQUE**(`notebook_id`,`position`)
* **CHECK**(char_length(en_text) BETWEEN 1 AND 2000)
* **CHECK**(char_length(pl_text) BETWEEN 1 AND 2000)

---

## `user_voices`

* `id UUID PK`
* `user_id UUID NOT NULL` — **FK**→`users(id)` ON DELETE CASCADE
* `slot voice_slot_enum NOT NULL`  — {EN1,EN2,EN3,PL}
* `language TEXT NOT NULL`         — oczekiwane: `en`/`pl`
* `voice_id TEXT NOT NULL`         — np. `en-GB-Standard-B`
* `created_at timestamptz NOT NULL DEFAULT now()`
* **UNIQUE**(`user_id`,`slot`)
* **CHECK**(
  `(slot IN ('EN1','EN2','EN3') AND language='en') OR (slot='PL' AND language='pl')`
  )

---

## `tts_credentials`

* `user_id UUID PK` — **FK**→`users(id)` ON DELETE CASCADE
* `encrypted_key BYTEA NOT NULL`      — klucz zaszyfrowany (aplikacyjnie)
* `key_fingerprint TEXT NULL`
* `last_validated_at timestamptz NULL`
* `is_configured BOOLEAN NOT NULL DEFAULT false`
* **RLS**: owner-only

---

## `jobs`

* `id UUID PK`
* `user_id UUID NOT NULL` — **FK**→`users(id)` ON DELETE CASCADE
* `notebook_id UUID NOT NULL` — **FK**→`notebooks(id)` ON DELETE CASCADE
* `type job_type_enum NOT NULL`              — `GENERATE_REBUILD`
* `state job_state_enum NOT NULL`            — cykl życia joba
* `started_at timestamptz NULL`
* `ended_at timestamptz NULL`
* `timeout_sec INTEGER NULL CHECK (timeout_sec IS NULL OR timeout_sec BETWEEN 1 AND 86400)`
* `error TEXT NULL`
* `created_at timestamptz NOT NULL DEFAULT now()`

---

## `builds`

* `id UUID PK`
* `notebook_id UUID NOT NULL` — **FK**→`notebooks(id)` ON DELETE CASCADE
* `job_id UUID NOT NULL` — **FK**→`jobs(id)` ON DELETE CASCADE
* `created_at timestamptz NOT NULL DEFAULT now()`

---

## `audio_segments`

* `id UUID PK`
* `phrase_id UUID NOT NULL` — **FK**→`phrases(id)` ON DELETE CASCADE
* `voice_slot voice_slot_enum NOT NULL`
* `build_id UUID NOT NULL` — **FK**→`builds(id)` ON DELETE CASCADE
* `path TEXT NOT NULL`      — `audio/{user_id}/{notebook_id}/{phrase_id}/{voice_slot}.mp3`
* `duration_ms INTEGER NULL CHECK (duration_ms IS NULL OR duration_ms BETWEEN 1 AND 10_000_000)`
* `size_bytes BIGINT NULL CHECK (size_bytes IS NULL OR size_bytes >= 0)`
* `sample_rate_hz INTEGER NOT NULL DEFAULT 22050 CHECK (sample_rate_hz IN (22050))`
* `bitrate_kbps INTEGER NOT NULL DEFAULT 64 CHECK (bitrate_kbps IN (64))`
* `status audio_status_enum NOT NULL`
* `error_code TEXT NULL`          — np. `quota`,`invalid_key`,`tts_timeout`,`network`,`text_too_long`
* `error_details JSONB NULL`
* `word_timings JSONB NULL`       — synchronizacja słów (opcjonalnie)
* `is_active BOOLEAN NOT NULL DEFAULT false`
* `created_at timestamptz NOT NULL DEFAULT now()`
* `updated_at timestamptz NOT NULL DEFAULT now()`
* **UNIQUE**(`phrase_id`,`voice_slot`,`build_id`)

> *Semantyka*: `is_active=true` oznacza segment należący do bieżącego buildu notatnika; zapewnione przez logikę + indeks/unikalność częściową (patrz §3).

---

## `import_logs`

* `id UUID PK`
* `user_id UUID NOT NULL` — **FK**→`users(id)` ON DELETE CASCADE
* `notebook_id UUID NOT NULL` — **FK**→`notebooks(id)` ON DELETE CASCADE
* `line_no INTEGER NOT NULL CHECK (line_no >= 1)`
* `raw_text TEXT NOT NULL`
* `reason TEXT NOT NULL`   — opis odrzutu
* `created_at timestamptz NOT NULL DEFAULT now()`

---

## (opcjonalnie) Materialized View: `notebook_audio_statuses`

* `notebook_id UUID`
* `build_id UUID`
* `complete_count BIGINT`
* `failed_count BIGINT`
* `missing_count BIGINT`
* `updated_at timestamptz`

> Definicja (logiczna): agregacja po `audio_segments` z `is_active=true`, grupowana po `notebook_id, build_id`. Odświeżana po zakończeniu joba.

---

# 2. Relacje między tabelami

* `users 1:N notebooks`
* `notebooks 1:N phrases` (frazy **nie** współdzielone)
* `users 1:N user_voices` (dokładnie 4 sloty na użytkownika)
* `users 1:1 tts_credentials`
* `users 1:N jobs`
* `notebooks 1:N jobs`
* `notebooks 1:N builds`
* `jobs 1:N builds` (każdy build powiązany z jobem generacji)
* `phrases 1:N audio_segments`
* `builds 1:N audio_segments`
* `users 1:N import_logs`, `notebooks 1:N import_logs`

Kardynalności:

* `notebooks—phrases`: 1:N
* `phrases—audio_segments`: 1:N
* `builds—audio_segments`: 1:N
* `notebooks—builds`: 1:N
* `jobs—builds`: 1:N

Usuwanie (hard delete):

* Usunięcie `notebook` kaskadowo usuwa: `phrases`, `audio_segments` (przez `phrases`/`builds`), `builds`, `jobs`, `import_logs`.
* Usunięcie `phrase` usuwa jej `audio_segments`.

---

# 3. Indeksy

**Wymagane dla głównych przepływów**

* `notebooks_idx_user_updated`: `ON notebooks(user_id, updated_at DESC)`

* `notebooks_uq_user_name`: **UNIQUE**(`user_id`,`name`) (na `CITEXT`)

* `phrases_idx_notebook_position`: `ON phrases(notebook_id, position)`

* `phrases_idx_notebook_created`: `ON phrases(notebook_id, created_at)`

* `audio_segments_uq_active_slot`: **PARTIAL UNIQUE**(`phrase_id`,`voice_slot`) WHERE `is_active=true`

* `audio_segments_idx_phrase_slot_active`: `ON audio_segments(phrase_id, voice_slot) WHERE is_active`

* `audio_segments_idx_build`: `ON audio_segments(build_id)`

* `audio_segments_idx_status`: `ON audio_segments(status)` (częściowy: `WHERE status <> 'complete'`)

* `jobs_idx_user_started`: `ON jobs(user_id, started_at DESC)`

* `jobs_idx_notebook_started`: `ON jobs(notebook_id, started_at DESC)`

* `jobs_idx_state`: `ON jobs(state)`

* `builds_idx_notebook_created`: `ON builds(notebook_id, created_at DESC)`

* `import_logs_idx_notebook_created`: `ON import_logs(notebook_id, created_at DESC)`

* `tts_credentials_idx_configured`: `ON tts_credentials(is_configured)`

---

# 4. Zasady PostgreSQL (RLS)

> Zakładamy Supabase z `auth.uid()`; wszystkie tabele mają `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`

**users**

* *USING*: `id = auth.uid()`
* *WITH CHECK*: `id = auth.uid()`

**notebooks**

* *USING*: `user_id = auth.uid()`
* *WITH CHECK*: `user_id = auth.uid()`

**phrases**

* *USING*: `EXISTS (SELECT 1 FROM notebooks n WHERE n.id = phrases.notebook_id AND n.user_id = auth.uid())`
* *WITH CHECK*: jak wyżej

**audio_segments**

* *USING*:
  `EXISTS (SELECT 1 FROM phrases p JOIN notebooks n ON n.id=p.notebook_id WHERE p.id=audio_segments.phrase_id AND n.user_id=auth.uid())`
* *WITH CHECK*: jak wyżej

**user_voices**

* *USING*: `user_id = auth.uid()`
* *WITH CHECK*: `user_id = auth.uid()`

**tts_credentials**

* *USING*: `user_id = auth.uid()`
* *WITH CHECK*: `user_id = auth.uid()`

**jobs**

* *USING*: `user_id = auth.uid()`
* *WITH CHECK*: `user_id = auth.uid()`

**builds**

* *USING*:
  `EXISTS (SELECT 1 FROM notebooks n WHERE n.id = builds.notebook_id AND n.user_id = auth.uid())`
* *WITH CHECK*: jak wyżej

**import_logs**

* *USING*: `user_id = auth.uid()`
* *WITH CHECK*: `user_id = auth.uid()`

**Materialized view `notebook_audio_statuses` (opcjonalnie)**

* Utwórz jako `SECURITY INVOKER` i/lub widok zależny z zapytaniem ograniczającym do notatników użytkownika, albo udostępniaj poprzez funkcję `STABLE` z kontrolą `auth.uid()`.

---

# 5. Dodatkowe uwagi / decyzje projektowe

* **Statusy audio**: przechowywane, nie wyliczane. Player może pomijać brakujące/failed segmenty.
* **Rebuild**: nowy `builds` tworzony w ramach `jobs(GENERATE_REBUILD)`; po sukcesie logika:

  1. oznacza jako `is_active=false` stare segmenty danego notatnika,
  2. ustawia `is_active=true` dla segmentów z nowego buildu,
  3. aktualizuje `notebooks.current_build_id`,
  4. fizycznie usuwa stare pliki MP3 w storage (poza DB).
* **Spójność `is_active`**: częściowa unikalność (`phrase_id`,`voice_slot`) WHERE `is_active=true` gwarantuje jeden aktywny segment na slot; `current_build_id` w `notebooks` umożliwia szybkie filtrowanie.
* **Walidacje importu (limity)**: egzekwowane w warstwie aplikacji; w DB minimalne `CHECK` długości EN/PL.
* **Ścieżki storage**: przechowywane w `audio_segments.path`; RLS/URL pre-signed po stronie serwera (klucz TTS nigdy nie trafia do klienta).
* **CITEXT**: zapewnia unikalność nazw notatników per użytkownik niezależnie od wielkości liter.
* **TTL logów**: retencja `import_logs` i `jobs` pozostaje parametryzowana w aplikacji (np. zadania cron).
* **Błędy TTS**: `error_code` i `error_details` gromadzone w `audio_segments` i `jobs.error`; słownik kodów utrzymywany w aplikacji.
* **Brak FTS/trgm** w MVP (brak wymagań wyszukiwania).
* **Brak partycjonowania** w MVP; kolumny czasowe i indeksy odciążają wzrost; ewentualna przyszła partycjonacja po `created_at` w `audio_segments`.
* **Integracja z Supabase**: wszystkie polityki zakładają `auth.uid()`; migracje powinny dodać `CREATE EXTENSION IF NOT EXISTS citext;`.

> Ten schemat jest gotowy jako podstawa do migracji (SQL) i implementacji logiki generowania/odtwarzania audio w stacku Astro/React + Supabase.
