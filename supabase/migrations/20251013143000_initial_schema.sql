-- =====================================================================
-- Migration: Initial Schema for Phrase Follower
-- =====================================================================
-- Purpose: Creates the complete database schema including:
--   - Extensions (citext for case-insensitive text)
--   - Custom ENUM types for voice slots, audio status, job types and states
--   - Core tables: users, notebooks, phrases, user_voices, tts_credentials
--   - Job management: jobs, builds, audio_segments
--   - Import tracking: import_logs
--   - All necessary indexes for performance
--   - Row Level Security policies for all tables
--
-- Tables affected: ALL (initial creation)
--
-- Special notes:
--   - users table is managed by Supabase Auth (auth.users)
--   - notebooks.current_build_id uses DEFERRABLE constraint for circular dependency
--   - audio_segments uses partial unique index for is_active flag
--   - All UUIDs are generated application-side
--   - All timestamps use timestamptz with default now()
-- =====================================================================

-- =====================================================================
-- 1. EXTENSIONS
-- =====================================================================

-- Enable citext extension for case-insensitive text comparisons
-- Used for notebook names to ensure uniqueness regardless of case
create extension if not exists citext;

-- =====================================================================
-- 2. ENUM TYPES
-- =====================================================================

-- Voice slot assignments: 3 English voices + 1 Polish voice per user
create type voice_slot_enum as enum ('EN1', 'EN2', 'EN3', 'PL');

-- Audio segment generation status
create type audio_status_enum as enum ('complete', 'failed', 'missing');

-- Background job types (currently only rebuild/generate)
create type job_type_enum as enum ('GENERATE_REBUILD');

-- Job lifecycle states
create type job_state_enum as enum ('queued', 'running', 'succeeded', 'failed', 'canceled', 'timeout');

-- =====================================================================
-- 3. TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
-- Thin profile table for references and RLS
-- Actual authentication data lives in auth.users (managed by Supabase)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Enable RLS: users can only access their own profile
alter table users enable row level security;

comment on table users is 'User profiles linked to Supabase Auth';
comment on column users.id is 'References auth.users(id) from Supabase Auth';

-- ---------------------------------------------------------------------
-- notebooks
-- ---------------------------------------------------------------------
-- User-owned collections of phrases
-- Each notebook can have multiple builds (generations)
create table notebooks (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  name citext not null,
  current_build_id uuid null, -- FK added after builds table creation
  last_generate_job_id uuid null, -- FK added after jobs table creation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Constraints
  constraint notebooks_name_length check (char_length(name) between 1 and 100),
  constraint notebooks_unique_user_name unique (user_id, name)
);

-- Enable RLS: users can only access their own notebooks
alter table notebooks enable row level security;

comment on table notebooks is 'User-owned phrase collections with build tracking';
comment on column notebooks.name is 'Case-insensitive unique name per user';
comment on column notebooks.current_build_id is 'Points to the active build (DEFERRABLE FK)';
comment on column notebooks.last_generate_job_id is 'Tracks the most recent generation job';

-- ---------------------------------------------------------------------
-- phrases
-- ---------------------------------------------------------------------
-- Bilingual phrase pairs within a notebook
-- Position determines playback order (stepped by 10 for easy reordering)
create table phrases (
  id uuid primary key,
  notebook_id uuid not null references notebooks(id) on delete cascade,
  position integer not null,
  en_text text not null,
  pl_text text not null,
  tokens jsonb null, -- EN/PL tokenization for highlight/click-to-seek (future feature)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Constraints
  constraint phrases_unique_notebook_position unique (notebook_id, position),
  constraint phrases_en_text_length check (char_length(en_text) between 1 and 2000),
  constraint phrases_pl_text_length check (char_length(pl_text) between 1 and 2000)
);

-- Enable RLS: users access phrases through their notebooks
alter table phrases enable row level security;

comment on table phrases is 'Bilingual phrase pairs within notebooks';
comment on column phrases.position is 'Sort order within notebook (stepped by 10)';
comment on column phrases.tokens is 'Tokenization data for future click-to-seek feature';

-- ---------------------------------------------------------------------
-- user_voices
-- ---------------------------------------------------------------------
-- Voice configuration for each user (4 slots: 3 EN + 1 PL)
-- Maps to Google Cloud TTS voice IDs
create table user_voices (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  slot voice_slot_enum not null,
  language text not null, -- 'en' or 'pl'
  voice_id text not null, -- e.g., 'en-GB-Standard-B'
  created_at timestamptz not null default now(),
  
  -- Constraints
  constraint user_voices_unique_user_slot unique (user_id, slot),
  constraint user_voices_slot_language_match check (
    (slot in ('EN1', 'EN2', 'EN3') and language = 'en') or 
    (slot = 'PL' and language = 'pl')
  )
);

-- Enable RLS: users can only manage their own voice settings
alter table user_voices enable row level security;

comment on table user_voices is 'User voice preferences for TTS generation';
comment on column user_voices.slot is 'Voice slot assignment (3 EN + 1 PL)';
comment on column user_voices.voice_id is 'Google Cloud TTS voice identifier';

-- ---------------------------------------------------------------------
-- tts_credentials
-- ---------------------------------------------------------------------
-- Encrypted storage for user TTS API keys
-- Keys are encrypted application-side before storage
create table tts_credentials (
  user_id uuid primary key references users(id) on delete cascade,
  encrypted_key bytea not null,
  key_fingerprint text null,
  last_validated_at timestamptz null,
  is_configured boolean not null default false
);

-- Enable RLS: users can only access their own credentials
alter table tts_credentials enable row level security;

comment on table tts_credentials is 'Encrypted TTS API credentials per user';
comment on column tts_credentials.encrypted_key is 'Application-encrypted API key';
comment on column tts_credentials.is_configured is 'Whether valid credentials are set';

-- ---------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------
-- Background job tracking for audio generation/rebuild
-- Manages job lifecycle and error handling
create table jobs (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  notebook_id uuid not null references notebooks(id) on delete cascade,
  type job_type_enum not null,
  state job_state_enum not null,
  started_at timestamptz null,
  ended_at timestamptz null,
  timeout_sec integer null,
  error text null,
  created_at timestamptz not null default now(),
  
  -- Constraints
  constraint jobs_timeout_range check (timeout_sec is null or timeout_sec between 1 and 86400)
);

-- Enable RLS: users can only view their own jobs
alter table jobs enable row level security;

comment on table jobs is 'Background job tracking for audio generation';
comment on column jobs.type is 'Job type (currently only GENERATE_REBUILD)';
comment on column jobs.state is 'Job lifecycle state';
comment on column jobs.timeout_sec is 'Optional timeout in seconds (1-86400)';

-- ---------------------------------------------------------------------
-- builds
-- ---------------------------------------------------------------------
-- Audio build versions for notebooks
-- Each successful generation job creates a new build
create table builds (
  id uuid primary key,
  notebook_id uuid not null references notebooks(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Enable RLS: users access builds through their notebooks
alter table builds enable row level security;

comment on table builds is 'Audio build versions linked to generation jobs';
comment on column builds.job_id is 'The generation job that created this build';

-- ---------------------------------------------------------------------
-- audio_segments
-- ---------------------------------------------------------------------
-- Generated audio files for each phrase + voice slot combination
-- Tracks generation status, file location, and audio metadata
create table audio_segments (
  id uuid primary key,
  phrase_id uuid not null references phrases(id) on delete cascade,
  voice_slot voice_slot_enum not null,
  build_id uuid not null references builds(id) on delete cascade,
  path text not null, -- storage path: audio/{user_id}/{notebook_id}/{phrase_id}/{voice_slot}.mp3
  duration_ms integer null,
  size_bytes bigint null,
  sample_rate_hz integer not null default 22050,
  bitrate_kbps integer not null default 64,
  status audio_status_enum not null,
  error_code text null, -- e.g., 'quota', 'invalid_key', 'tts_timeout', 'network', 'text_too_long'
  error_details jsonb null,
  word_timings jsonb null, -- word-level synchronization data (optional)
  is_active boolean not null default false, -- true = belongs to current notebook build
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Constraints
  constraint audio_segments_unique_phrase_slot_build unique (phrase_id, voice_slot, build_id),
  constraint audio_segments_duration_range check (duration_ms is null or duration_ms between 1 and 10000000),
  constraint audio_segments_size_positive check (size_bytes is null or size_bytes >= 0),
  constraint audio_segments_sample_rate check (sample_rate_hz in (22050)),
  constraint audio_segments_bitrate check (bitrate_kbps in (64))
);

-- Enable RLS: users access segments through their phrases/notebooks
alter table audio_segments enable row level security;

comment on table audio_segments is 'Generated audio files with metadata and status';
comment on column audio_segments.path is 'Storage path for MP3 file';
comment on column audio_segments.is_active is 'Whether this segment belongs to current build';
comment on column audio_segments.error_code is 'Standardized error code for failures';
comment on column audio_segments.word_timings is 'Optional word-level timing for click-to-seek';

-- ---------------------------------------------------------------------
-- import_logs
-- ---------------------------------------------------------------------
-- Tracks rejected lines during CSV import
-- Helps users understand why certain phrases were not imported
create table import_logs (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  notebook_id uuid not null references notebooks(id) on delete cascade,
  line_no integer not null,
  raw_text text not null,
  reason text not null, -- description of why the line was rejected
  created_at timestamptz not null default now(),
  
  -- Constraints
  constraint import_logs_line_no_positive check (line_no >= 1)
);

-- Enable RLS: users can only view their own import logs
alter table import_logs enable row level security;

comment on table import_logs is 'Audit log for rejected CSV import lines';
comment on column import_logs.line_no is 'Line number in the source CSV file';
comment on column import_logs.reason is 'Human-readable rejection reason';

-- =====================================================================
-- 4. DEFERRED FOREIGN KEYS
-- =====================================================================

-- Add circular FK from notebooks to builds and jobs
-- These are DEFERRABLE to allow creation in any order within transaction
alter table notebooks
  add constraint notebooks_current_build_fk
  foreign key (current_build_id) references builds(id)
  deferrable initially deferred;

alter table notebooks
  add constraint notebooks_last_generate_job_fk
  foreign key (last_generate_job_id) references jobs(id)
  deferrable initially deferred;

comment on constraint notebooks_current_build_fk on notebooks is 'DEFERRABLE to handle circular dependency with builds';
comment on constraint notebooks_last_generate_job_fk on notebooks is 'DEFERRABLE to handle circular dependency with jobs';

-- =====================================================================
-- 5. INDEXES
-- =====================================================================

-- notebooks: list user notebooks sorted by recent updates
create index notebooks_idx_user_updated on notebooks(user_id, updated_at desc);

-- phrases: fetch phrases for a notebook in position order
create index phrases_idx_notebook_position on phrases(notebook_id, position);

-- phrases: fetch phrases by creation time (for chronological views)
create index phrases_idx_notebook_created on phrases(notebook_id, created_at);

-- audio_segments: enforce single active segment per phrase+slot
-- This partial unique index ensures only one segment can be active for each phrase/slot combination
create unique index audio_segments_uq_active_slot 
  on audio_segments(phrase_id, voice_slot) 
  where is_active = true;

-- audio_segments: find active segments for a phrase+slot
create index audio_segments_idx_phrase_slot_active 
  on audio_segments(phrase_id, voice_slot) 
  where is_active = true;

-- audio_segments: list all segments in a build
create index audio_segments_idx_build on audio_segments(build_id);

-- audio_segments: find problematic segments (failed/missing)
-- Partial index for non-complete statuses to save space
create index audio_segments_idx_status 
  on audio_segments(status) 
  where status <> 'complete';

-- jobs: list user jobs by start time
create index jobs_idx_user_started on jobs(user_id, started_at desc);

-- jobs: list jobs for a notebook by start time
create index jobs_idx_notebook_started on jobs(notebook_id, started_at desc);

-- jobs: find jobs by state (for job queue processing)
create index jobs_idx_state on jobs(state);

-- builds: list builds for a notebook chronologically
create index builds_idx_notebook_created on builds(notebook_id, created_at desc);

-- import_logs: view import errors for a notebook
create index import_logs_idx_notebook_created on import_logs(notebook_id, created_at desc);

-- tts_credentials: find unconfigured accounts (admin/support queries)
create index tts_credentials_idx_configured on tts_credentials(is_configured);

-- =====================================================================
-- 6. ROW LEVEL SECURITY POLICIES
-- =====================================================================

-- ---------------------------------------------------------------------
-- users: owner-only access
-- ---------------------------------------------------------------------

-- SELECT: users can view their own profile
create policy users_select_own
  on users for select
  to authenticated
  using (id = auth.uid());

-- INSERT: users can create their own profile
create policy users_insert_own
  on users for insert
  to authenticated
  with check (id = auth.uid());

-- UPDATE: users can update their own profile
create policy users_update_own
  on users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- DELETE: users can delete their own profile
create policy users_delete_own
  on users for delete
  to authenticated
  using (id = auth.uid());

-- ---------------------------------------------------------------------
-- notebooks: owner-only access
-- ---------------------------------------------------------------------

-- SELECT: users can view their own notebooks
create policy notebooks_select_own
  on notebooks for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT: users can create notebooks for themselves
create policy notebooks_insert_own
  on notebooks for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE: users can update their own notebooks
create policy notebooks_update_own
  on notebooks for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: users can delete their own notebooks
create policy notebooks_delete_own
  on notebooks for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- phrases: access through notebook ownership
-- ---------------------------------------------------------------------

-- SELECT: users can view phrases in their notebooks
create policy phrases_select_own
  on phrases for select
  to authenticated
  using (
    exists (
      select 1 from notebooks n
      where n.id = phrases.notebook_id
        and n.user_id = auth.uid()
    )
  );

-- INSERT: users can create phrases in their notebooks
create policy phrases_insert_own
  on phrases for insert
  to authenticated
  with check (
    exists (
      select 1 from notebooks n
      where n.id = phrases.notebook_id
        and n.user_id = auth.uid()
    )
  );

-- UPDATE: users can update phrases in their notebooks
create policy phrases_update_own
  on phrases for update
  to authenticated
  using (
    exists (
      select 1 from notebooks n
      where n.id = phrases.notebook_id
        and n.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from notebooks n
      where n.id = phrases.notebook_id
        and n.user_id = auth.uid()
    )
  );

-- DELETE: users can delete phrases from their notebooks
create policy phrases_delete_own
  on phrases for delete
  to authenticated
  using (
    exists (
      select 1 from notebooks n
      where n.id = phrases.notebook_id
        and n.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- user_voices: owner-only access
-- ---------------------------------------------------------------------

-- SELECT: users can view their own voice settings
create policy user_voices_select_own
  on user_voices for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT: users can create their own voice settings
create policy user_voices_insert_own
  on user_voices for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE: users can update their own voice settings
create policy user_voices_update_own
  on user_voices for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: users can delete their own voice settings
create policy user_voices_delete_own
  on user_voices for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- tts_credentials: owner-only access (sensitive data)
-- ---------------------------------------------------------------------

-- SELECT: users can view their own credentials
create policy tts_credentials_select_own
  on tts_credentials for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT: users can create their own credentials
create policy tts_credentials_insert_own
  on tts_credentials for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE: users can update their own credentials
create policy tts_credentials_update_own
  on tts_credentials for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: users can delete their own credentials
create policy tts_credentials_delete_own
  on tts_credentials for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- jobs: owner-only access
-- ---------------------------------------------------------------------

-- SELECT: users can view their own jobs
create policy jobs_select_own
  on jobs for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT: users can create jobs for themselves
create policy jobs_insert_own
  on jobs for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE: users can update their own jobs
create policy jobs_update_own
  on jobs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: users can delete their own jobs
create policy jobs_delete_own
  on jobs for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- builds: access through notebook ownership
-- ---------------------------------------------------------------------

-- SELECT: users can view builds for their notebooks
create policy builds_select_own
  on builds for select
  to authenticated
  using (
    exists (
      select 1 from notebooks n
      where n.id = builds.notebook_id
        and n.user_id = auth.uid()
    )
  );

-- INSERT: users can create builds for their notebooks
create policy builds_insert_own
  on builds for insert
  to authenticated
  with check (
    exists (
      select 1 from notebooks n
      where n.id = builds.notebook_id
        and n.user_id = auth.uid()
    )
  );

-- UPDATE: users can update builds for their notebooks
create policy builds_update_own
  on builds for update
  to authenticated
  using (
    exists (
      select 1 from notebooks n
      where n.id = builds.notebook_id
        and n.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from notebooks n
      where n.id = builds.notebook_id
        and n.user_id = auth.uid()
    )
  );

-- DELETE: users can delete builds for their notebooks
create policy builds_delete_own
  on builds for delete
  to authenticated
  using (
    exists (
      select 1 from notebooks n
      where n.id = builds.notebook_id
        and n.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- audio_segments: access through phrase/notebook ownership
-- ---------------------------------------------------------------------

-- SELECT: users can view audio segments for their phrases
create policy audio_segments_select_own
  on audio_segments for select
  to authenticated
  using (
    exists (
      select 1 from phrases p
      join notebooks n on n.id = p.notebook_id
      where p.id = audio_segments.phrase_id
        and n.user_id = auth.uid()
    )
  );

-- INSERT: users can create audio segments for their phrases
create policy audio_segments_insert_own
  on audio_segments for insert
  to authenticated
  with check (
    exists (
      select 1 from phrases p
      join notebooks n on n.id = p.notebook_id
      where p.id = audio_segments.phrase_id
        and n.user_id = auth.uid()
    )
  );

-- UPDATE: users can update audio segments for their phrases
create policy audio_segments_update_own
  on audio_segments for update
  to authenticated
  using (
    exists (
      select 1 from phrases p
      join notebooks n on n.id = p.notebook_id
      where p.id = audio_segments.phrase_id
        and n.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from phrases p
      join notebooks n on n.id = p.notebook_id
      where p.id = audio_segments.phrase_id
        and n.user_id = auth.uid()
    )
  );

-- DELETE: users can delete audio segments for their phrases
create policy audio_segments_delete_own
  on audio_segments for delete
  to authenticated
  using (
    exists (
      select 1 from phrases p
      join notebooks n on n.id = p.notebook_id
      where p.id = audio_segments.phrase_id
        and n.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- import_logs: owner-only access
-- ---------------------------------------------------------------------

-- SELECT: users can view their own import logs
create policy import_logs_select_own
  on import_logs for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT: users can create import logs for themselves
create policy import_logs_insert_own
  on import_logs for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE: users can update their own import logs
create policy import_logs_update_own
  on import_logs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: users can delete their own import logs
create policy import_logs_delete_own
  on import_logs for delete
  to authenticated
  using (user_id = auth.uid());

-- =====================================================================
-- END OF MIGRATION
-- =====================================================================

