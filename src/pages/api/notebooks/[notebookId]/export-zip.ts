import type { APIContext } from "astro";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../db/database.types";
import { ApiErrors, withErrorHandling } from "../../../../lib/errors";
import { getSupabaseClient, ensureUserExists } from "../../../../lib/utils";
import { canExport, markExport } from "../../../../lib/export-zip-rate-limit";
import { buildPhraseFilename, sanitizeNotebookName } from "../../../../lib/export-zip.utils";
import archiver from "archiver";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export const prerender = false;

// Get path to silence file
// File is copied to dist/assets during build (see package.json copy-silence-asset script)
// From dist/server/pages/api/notebooks/[notebookId]/ we need to go up to dist/ then to assets
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// dist/server/pages/api/notebooks/[notebookId]/ -> dist/assets
const SILENCE_FILE_PATH = join(__dirname, "../../../../../assets/silence-800ms.mp3");

type Supabase = SupabaseClient<Database>;

// Required voice slots for export
const REQUIRED_SLOTS = ["EN1", "EN2", "EN3", "PL"] as const;

// ZIP size limit: 30 MB
const ZIP_SIZE_LIMIT_BYTES = 30 * 1024 * 1024;

interface PhraseRow {
  id: string;
  position: number;
  en_text: string;
  pl_text: string;
}

interface AudioSegmentRow {
  phrase_id: string;
  voice_slot: string;
  path: string;
  size_bytes: number | null;
  status: string;
}

interface ExportablePhrase {
  phrase: PhraseRow;
  segments: Map<string, AudioSegmentRow>; // key = voice_slot
}

/**
 * Helper function to get user ID from context
 */
function getUserId(context: APIContext): string {
  const userId = context.locals.userId;
  if (!userId) {
    throw ApiErrors.unauthorized("Authentication required");
  }
  return userId;
}

/**
 * Validates notebook ID format (UUID)
 */
function validateNotebookId(notebookId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notebookId)) {
    throw ApiErrors.validationError("Invalid notebook ID format");
  }
}

/**
 * Gets storage client (service role if available, otherwise request client)
 */
function getStorageClient(context: APIContext, supabase: Supabase): Supabase {
  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseServiceKey) {
    return createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabase;
}

/**
 * Fetches notebook and validates ownership
 */
async function fetchNotebook(supabase: Supabase, notebookId: string, userId: string) {
  const { data: notebook, error } = await supabase
    .from("notebooks")
    .select("id, name, user_id, current_build_id")
    .eq("id", notebookId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw ApiErrors.notFound("Notebook not found");
    }
    console.error("[export-zip] Database error fetching notebook:", error);
    throw ApiErrors.internal("Failed to fetch notebook");
  }

  if (!notebook) {
    throw ApiErrors.notFound("Notebook not found");
  }

  if (notebook.user_id !== userId) {
    throw ApiErrors.notFound("Notebook not found"); // Don't reveal existence
  }

  if (!notebook.current_build_id) {
    throw ApiErrors.validationError("Brak gotowego buildu audio dla tego notatnika. Wygeneruj audio przed eksportem.");
  }

  return notebook;
}

/**
 * Fetches phrases for the notebook, ordered by position
 */
async function fetchPhrases(supabase: Supabase, notebookId: string): Promise<PhraseRow[]> {
  const { data: phrases, error } = await supabase
    .from("phrases")
    .select("id, position, en_text, pl_text")
    .eq("notebook_id", notebookId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[export-zip] Database error fetching phrases:", error);
    throw ApiErrors.internal("Failed to fetch phrases");
  }

  return (phrases || []) as PhraseRow[];
}

/**
 * Fetches audio segments for the build
 */
async function fetchAudioSegments(
  supabase: Supabase,
  buildId: string,
  phraseIds: string[]
): Promise<AudioSegmentRow[]> {
  if (phraseIds.length === 0) {
    return [];
  }

  const { data: segments, error } = await supabase
    .from("audio_segments")
    .select("phrase_id, voice_slot, path, size_bytes, status")
    .eq("build_id", buildId)
    .eq("status", "complete")
    .in("phrase_id", phraseIds);

  if (error) {
    console.error("[export-zip] Database error fetching audio segments:", error);
    throw ApiErrors.internal("Failed to fetch audio segments");
  }

  return (segments || []) as AudioSegmentRow[];
}

/**
 * Filters phrases to only those with all required segments
 */
function selectExportablePhrases(phrases: PhraseRow[], segments: AudioSegmentRow[]): ExportablePhrase[] {
  // Group segments by phrase_id
  const segmentsByPhrase = new Map<string, Map<string, AudioSegmentRow>>();

  for (const segment of segments) {
    if (!segmentsByPhrase.has(segment.phrase_id)) {
      segmentsByPhrase.set(segment.phrase_id, new Map());
    }
    const phraseSegments = segmentsByPhrase.get(segment.phrase_id);
    if (phraseSegments) {
      phraseSegments.set(segment.voice_slot, segment);
    }
  }

  // Filter phrases that have all required slots
  const exportable: ExportablePhrase[] = [];

  for (const phrase of phrases) {
    const phraseSegments = segmentsByPhrase.get(phrase.id);
    if (!phraseSegments) {
      continue; // No segments for this phrase
    }

    // Check if all required slots are present
    const hasAllSlots = REQUIRED_SLOTS.every((slot) => phraseSegments.has(slot));

    if (hasAllSlots) {
      exportable.push({
        phrase,
        segments: phraseSegments,
      });
    }
  }

  return exportable;
}

/**
 * Estimates ZIP size based on audio segment sizes
 */
function estimateZipSize(exportablePhrases: ExportablePhrase[]): number {
  let totalAudioBytes = 0;

  for (const { segments } of exportablePhrases) {
    for (const slot of REQUIRED_SLOTS) {
      const segment = segments.get(slot);
      if (segment?.size_bytes) {
        totalAudioBytes += segment.size_bytes;
      }
    }
  }

  // Add overhead: 1% + 1 MB for ZIP structure
  const estimatedZipBytes = totalAudioBytes * 1.01 + 1_000_000;

  return estimatedZipBytes;
}

/**
 * Downloads an audio segment from Supabase Storage
 */
async function downloadSegment(storageClient: Supabase, path: string): Promise<Buffer> {
  const { data, error } = await storageClient.storage.from("audio").download(path);

  if (error || !data) {
    throw new Error(`Failed to download segment: ${path} - ${error?.message || "Unknown error"}`);
  }

  // Convert Blob to Buffer
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Loads the silence MP3 file (800ms)
 * Cached to avoid reading from disk for each phrase
 */
let cachedSilenceBuffer: Buffer | null = null;

function getSilenceMp3(): Buffer {
  if (cachedSilenceBuffer) {
    return cachedSilenceBuffer;
  }

  try {
    cachedSilenceBuffer = readFileSync(SILENCE_FILE_PATH);
    return cachedSilenceBuffer;
  } catch (error) {
    throw new Error(`Failed to load silence file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Creates a combined MP3 from segments with 800ms silence between them
 * Uses simple MP3 concatenation (MP3 format supports direct byte concatenation)
 */
async function createPhraseMp3(storageClient: Supabase, exportablePhrase: ExportablePhrase): Promise<Buffer> {
  // Download all segments in order
  const segmentBuffers: Buffer[] = [];

  for (const slot of REQUIRED_SLOTS) {
    const segment = exportablePhrase.segments.get(slot);
    if (!segment) {
      throw new Error(`Missing segment for slot ${slot} in phrase ${exportablePhrase.phrase.id}`);
    }

    const buffer = await downloadSegment(storageClient, segment.path);
    segmentBuffers.push(buffer);
  }

  // Load silence MP3 (cached)
  const silenceBuffer = getSilenceMp3();

  // Concatenate: segment0 + silence + segment1 + silence + segment2 + silence + segment3
  const result: Buffer[] = [];
  for (let i = 0; i < segmentBuffers.length; i++) {
    result.push(segmentBuffers[i]);
    if (i < segmentBuffers.length - 1) {
      result.push(silenceBuffer);
    }
  }

  return Buffer.concat(result);
}

/**
 * Main export handler
 */
async function handleExport(context: APIContext): Promise<Response> {
  const userId = getUserId(context);
  const notebookId = context.params.notebookId;

  if (!notebookId) {
    throw ApiErrors.validationError("Notebook ID is required");
  }

  validateNotebookId(notebookId);

  // Check rate limit
  if (!canExport(userId, notebookId)) {
    throw ApiErrors.tooManyRequests("Eksport dla tego notatnika był niedawno wykonany. Spróbuj ponownie za 30 sekund.");
  }

  const supabase = getSupabaseClient(context);
  await ensureUserExists(supabase, userId);

  // Fetch notebook
  const notebook = await fetchNotebook(supabase, notebookId, userId);
  const buildId = notebook.current_build_id;
  if (!buildId) {
    throw ApiErrors.validationError("Brak gotowego buildu audio dla tego notatnika. Wygeneruj audio przed eksportem.");
  }

  // Fetch phrases
  const phrases = await fetchPhrases(supabase, notebookId);

  if (phrases.length === 0) {
    // Return empty ZIP
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.finalize();

    // Convert archiver stream to Web ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        archive.on("data", (chunk: Buffer) => {
          controller.enqueue(chunk);
        });
        archive.on("end", () => {
          controller.close();
        });
        archive.on("error", (err) => {
          controller.error(err);
        });
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${sanitizeNotebookName(notebook.name)}.zip"`,
      },
    });
  }

  // Fetch audio segments
  const phraseIds = phrases.map((p) => p.id);
  const segments = await fetchAudioSegments(supabase, buildId, phraseIds);

  // Filter exportable phrases
  const exportablePhrases = selectExportablePhrases(phrases, segments);

  if (exportablePhrases.length === 0) {
    throw ApiErrors.validationError(
      "Brak fraz z kompletnymi segmentami audio. Wygeneruj audio dla wszystkich fraz przed eksportem."
    );
  }

  // Estimate ZIP size
  const estimatedSize = estimateZipSize(exportablePhrases);
  if (estimatedSize > ZIP_SIZE_LIMIT_BYTES) {
    throw ApiErrors.limitExceeded("Eksport przekracza limit 30 MB. Zmniejsz liczbę fraz lub skróć notatnik.");
  }

  // Mark export (rate limiting)
  markExport(userId, notebookId);

  // Get storage client
  const storageClient = getStorageClient(context, supabase);

  // Create ZIP archive
  const archive = archiver("zip", { zlib: { level: 9 } });
  const exportDate = new Date();

  // Process each exportable phrase
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < exportablePhrases.length; i++) {
    const exportablePhrase = exportablePhrases[i];
    const indexInZip = i + 1; // 1-based index

    try {
      console.log(`[export-zip] Processing phrase ${i + 1}/${exportablePhrases.length}: ${exportablePhrase.phrase.id}`);

      // Create combined MP3
      const mp3Buffer = await createPhraseMp3(storageClient, exportablePhrase);

      if (!mp3Buffer || mp3Buffer.length === 0) {
        console.error(`[export-zip] Empty MP3 buffer for phrase ${exportablePhrase.phrase.id}`);
        errorCount++;
        continue;
      }

      // Build filename
      const filename = buildPhraseFilename(indexInZip, exportablePhrase.phrase.en_text, exportDate);
      console.log(`[export-zip] Adding to ZIP: ${filename} (${mp3Buffer.length} bytes)`);

      // Add to ZIP
      archive.append(mp3Buffer, { name: filename });
      successCount++;
    } catch (error) {
      console.error(`[export-zip] Error processing phrase ${exportablePhrase.phrase.id}:`, error);
      errorCount++;
      // Skip this phrase and continue with others
      continue;
    }
  }

  console.log(`[export-zip] Processed ${successCount} phrases successfully, ${errorCount} errors`);

  if (successCount === 0) {
    throw ApiErrors.internal("Nie udało się wygenerować żadnego pliku MP3. Sprawdź logi serwera.");
  }

  // Finalize archive
  archive.finalize();

  // Convert archiver stream to Web ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      archive.on("data", (chunk: Buffer) => {
        controller.enqueue(chunk);
      });
      archive.on("end", () => {
        controller.close();
      });
      archive.on("error", (err) => {
        controller.error(err);
      });
    },
  });

  // Return streaming response
  const notebookNameSanitized = sanitizeNotebookName(notebook.name);

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${notebookNameSanitized}.zip"`,
    },
  });
}

export const GET = withErrorHandling(handleExport);
