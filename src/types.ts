import type {
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  Json,
} from "./db/database.types";

/**
 * Shared DTO and Command Model types for the API, derived from Supabase DB models.
 *
 * Conventions:
 * - DTO types reflect API response shapes and are tied to DB entities via `Pick<Tables<...>>`.
 * - Command models reflect API request bodies; they intentionally include only client-provided fields.
 * - Where the API uses structured JSON (e.g., `tokens`, `word_timings`), we expose strong TS types,
 *   even though the DB persists them as `Json`.
 */

// ------------------------------------
// Enums (re-exported for convenience)
// ------------------------------------
export type VoiceSlot = Enums<"voice_slot_enum">;
export type AudioStatus = Enums<"audio_status_enum">;
export type JobState = Enums<"job_state_enum">;
export type JobType = Enums<"job_type_enum">;

// ------------------------------------
// Common helpers
// ------------------------------------
export type UUID = string;

export type Paginated<T> = {
  items: T[];
  next_cursor: string | null;
};

export type ApiErrorCode =
  | "validation_error"
  | "invalid_key"
  | "quota_exceeded"
  | "not_found"
  | "unique_violation"
  | "job_in_progress"
  | "conflict"
  | "limit_exceeded"
  | "cannot_cancel"
  | "internal"
  | "tts_timeout";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Json;
  };
};

// ------------------------------------
// Users
// ------------------------------------
export type UserDTO = Pick<Tables<"users">, "id" | "created_at">;

// ------------------------------------
// Notebooks
// ------------------------------------
export type NotebookDTO = Pick<
  Tables<"notebooks">,
  | "id"
  | "name"
  | "current_build_id"
  | "last_generate_job_id"
  | "created_at"
  | "updated_at"
>;

export type CreateNotebookCommand = Pick<TablesInsert<"notebooks">, "name">;

export type UpdateNotebookCommand = Pick<TablesUpdate<"notebooks">, "name">;

export type NotebookListResponse = Paginated<NotebookDTO>;

// ------------------------------------
// Phrases
// ------------------------------------
/**
 * Tokenization structure stored in `phrases.tokens` (DB Json), but exposed strongly via DTOs.
 * Example element: { text: "I'm", start: 0, end: 2 }
 */
export type PhraseToken = {
  text: string;
  start: number;
  end: number;
};

export type PhraseTokens = {
  en: PhraseToken[];
  pl: PhraseToken[];
};

export type PhraseDTO = Pick<
  Tables<"phrases">,
  | "id"
  | "position"
  | "en_text"
  | "pl_text"
  | "created_at"
  | "updated_at"
> & {
  // Strongly typed version of DB Json
  tokens: PhraseTokens | null;
};

export type CreatePhraseCommand = Pick<
  TablesInsert<"phrases">,
  "position" | "en_text" | "pl_text"
> & {
  tokens?: PhraseTokens | null;
};

export type UpdatePhraseCommand = Partial<
  Pick<TablesUpdate<"phrases">, "position" | "en_text" | "pl_text">
> & {
  tokens?: PhraseTokens | null;
};

export type PhraseListResponse = Paginated<PhraseDTO>;

export type ReorderPhrasesCommand = {
  moves: Array<{
    phrase_id: UUID;
    position: number;
  }>;
};

export type ReorderPhrasesResultDTO = {
  updated: number;
};

// ------------------------------------
// Import
// ------------------------------------
export type ImportNotebookCommand = {
  name: string;
  lines: string[];
  normalize: boolean;
};

export type ImportLogDTO = Pick<
  Tables<"import_logs">,
  "id" | "line_no" | "raw_text" | "reason" | "created_at"
>;

export type ImportNotebookResultDTO = {
  notebook: NotebookDTO;
  import: {
    accepted: number;
    rejected: number;
    logs: ImportLogDTO[];
  };
};

export type ImportLogsListResponse = Paginated<ImportLogDTO>;

// ------------------------------------
// User Voices (TTS selection)
// ------------------------------------
export type UserVoiceDTO = Pick<
  Tables<"user_voices">,
  "id" | "slot" | "language" | "voice_id" | "created_at"
>;

export type UpsertUserVoiceBySlotCommand = {
  language: string;
  voice_id: string;
};

export type UserVoicesListResponse = {
  slots: UserVoiceDTO[];
};

// ------------------------------------
// TTS Credentials
// ------------------------------------
export type TtsCredentialsStateDTO = Pick<
  Tables<"tts_credentials">,
  "is_configured" | "last_validated_at" | "key_fingerprint"
>;

export type TestTtsCredentialsCommand = {
  google_api_key: string;
};

export type TestTtsCredentialsResultDTO = {
  ok: boolean;
  voice_sampled: string;
};

export type SaveTtsCredentialsCommand = {
  google_api_key: string;
};

// ------------------------------------
// Jobs (Generate / Rebuild)
// ------------------------------------
export type JobDTO = Pick<
  Tables<"jobs">,
  | "id"
  | "user_id"
  | "notebook_id"
  | "type"
  | "state"
  | "started_at"
  | "ended_at"
  | "timeout_sec"
  | "error"
  | "created_at"
>;

export type GenerateRebuildJobCommand = {
  timeout_sec: number;
};

export type GenerateRebuildAcceptedDTO = {
  job: Pick<
    Tables<"jobs">,
    | "id"
    | "type"
    | "state"
    | "notebook_id"
    | "started_at"
    | "ended_at"
    | "timeout_sec"
    | "created_at"
  >;
};

export type JobListResponse = Paginated<JobDTO>;

export type CancelJobResponseDTO = Pick<Tables<"jobs">, "id" | "state">;

// ------------------------------------
// Builds
// ------------------------------------
export type BuildDTO = Pick<
  Tables<"builds">,
  "id" | "job_id" | "notebook_id" | "created_at"
>;

export type BuildListResponse = Paginated<BuildDTO>;

// ------------------------------------
// Audio Segments
// ------------------------------------
/**
 * Word timing structure persisted as Json in DB but exposed strongly in DTOs.
 */
export type WordTiming = {
  word: string;
  start_ms: number;
  end_ms: number;
};

export type AudioSegmentDTO = Pick<
  Tables<"audio_segments">,
  | "id"
  | "phrase_id"
  | "voice_slot"
  | "build_id"
  | "path"
  | "duration_ms"
  | "size_bytes"
  | "sample_rate_hz"
  | "bitrate_kbps"
  | "status"
  | "error_code"
  | "is_active"
  | "created_at"
  | "updated_at"
> & {
  // Strongly typed version of DB Json
  word_timings: WordTiming[] | null;
};

export type AudioSegmentListResponse = Paginated<AudioSegmentDTO>;

// ------------------------------------
// Notebook Audio Status (aggregated / MV)
// ------------------------------------
export type NotebookAudioStatusDTO = {
  notebook_id: UUID;
  build_id: UUID;
  complete_count: number;
  failed_count: number;
  missing_count: number;
  updated_at: string;
};

// ------------------------------------
// Playback Manifest (virtual)
// ------------------------------------
export type PlaybackManifestSegment =
  | {
      slot: VoiceSlot;
      status: Extract<AudioStatus, "complete">;
      url: string;
      duration_ms?: number | null;
      word_timings?: WordTiming[] | null;
    }
  | {
      slot: VoiceSlot;
      status: Exclude<AudioStatus, "complete">;
    };

export type PlaybackManifestItem = {
  phrase: Pick<
    PhraseDTO,
    "id" | "position" | "en_text" | "pl_text" | "tokens"
  >;
  segments: PlaybackManifestSegment[];
};

export type PlaybackManifestDTO = {
  notebook_id: UUID;
  build_id: UUID;
  sequence: PlaybackManifestItem[];
  expires_at: string;
};

// ------------------------------------
// Health
// ------------------------------------
export type HealthStatusDTO = {
  status: "ok";
  db: "ok" | "degraded" | "down";
  time: string;
};


