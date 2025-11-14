import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../db/database.types";

// Minimal Buffer compatibility layer for environments without Node Buffer (e.g., Cloudflare Workers)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BufferCompat: any =
  typeof Buffer !== "undefined"
    ? Buffer
    : {
        from(input: string | ArrayBuffer | Uint8Array | ArrayLike<number>, encoding?: string) {
          if (typeof input === "string") {
            if (encoding === "base64") {
              const binary = atob(input);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              return bytes;
            }
            if (encoding === "hex") {
              const len = input.length / 2;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = parseInt(input.substr(i * 2, 2), 16);
              }
              return bytes;
            }
            const encoder = new TextEncoder();
            return encoder.encode(input);
          }

          if (input instanceof ArrayBuffer) {
            return new Uint8Array(input);
          }

          if (input instanceof Uint8Array) {
            return input;
          }

          return new Uint8Array(input as ArrayLike<number>);
        },
      };

// TTS service for Google Cloud Text-to-Speech
class TtsService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(text: string, voiceId: string, language: string): Promise<Uint8Array> {
    const requestBody = {
      input: { text },
      voice: {
        languageCode: language,
        name: voiceId,
      },
      audioConfig: {
        audioEncoding: "MP3",
        sampleRateHertz: 22050,
        speakingRate: 1.0,
      },
    };

    const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: {
        "X-goog-api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 400) {
        throw new Error("invalid_key");
      }
      if (response.status === 402) {
        throw new Error("quota_exceeded");
      }
      if (response.status === 504) {
        throw new Error("tts_timeout");
      }
      throw new Error("tts_error");
    }

    const data = await response.json();
    const audioData = BufferCompat.from(data.audioContent, "base64");
    return audioData;
  }
}

// Job worker for processing TTS generation jobs
export class JobWorker {
  private supabase: SupabaseClient<Database>;
  private storage: SupabaseClient<Database>["storage"];

  constructor(supabaseUrl: string, supabaseServiceKey: string) {
    this.supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
    this.storage = this.supabase.storage;
  }

  async processJob(jobId: string): Promise<void> {
    console.log(`[processJob] Starting job processing for job: ${jobId}`);
    try {
      console.log("[processJob] Job worker initialized successfully");
      // Get job details
      const { data: job, error: jobError } = await this.supabase
        .from("jobs")
        .select("id, user_id, notebook_id, type, state, timeout_sec")
        .eq("id", jobId)
        .single();

      if (jobError || !job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      if (job.state !== "queued") {
        console.log(`Job ${jobId} is in state: ${job.state}, skipping processing`);
        return;
      }

      // Update job state to running
      console.log(`[processJob] Updating job ${jobId} state to running...`);
      await this.updateJobState(jobId, "running", new Date().toISOString());
      console.log(`[processJob] Job ${jobId} state updated to running`);

      // Get TTS credentials for the user
      const { data: credentials, error: credError } = await this.supabase
        .from("tts_credentials")
        .select("encrypted_key, is_configured")
        .eq("user_id", job.user_id)
        .single();

      if (credError || !credentials || !credentials.is_configured) {
        throw new Error("TTS credentials not configured");
      }

      // Decrypt the TTS API key
      const { decrypt } = await import("./tts-encryption");
      const apiKey = await decrypt(credentials.encrypted_key);

      // Get user voices
      const { data: voices, error: voicesError } = await this.supabase
        .from("user_voices")
        .select("slot, language, voice_id")
        .eq("user_id", job.user_id)
        .order("slot");

      if (voicesError || !voices || voices.length === 0) {
        throw new Error("User voices not configured");
      }

      // Get phrases for the notebook
      const { data: phrases, error: phrasesError } = await this.supabase
        .from("phrases")
        .select("id, en_text, pl_text")
        .eq("notebook_id", job.notebook_id)
        .order("position");

      if (phrasesError || !phrases || phrases.length === 0) {
        throw new Error("No phrases found in notebook");
      }

      console.log(`Found ${phrases.length} phrases in notebook`);
      console.log(`Found ${voices.length} voice slots configured`);

      // Create build
      const buildId = await this.createBuild(job.notebook_id, jobId);

      // Initialize TTS service
      const ttsService = new TtsService(apiKey);

      // Process each phrase with each voice slot
      const audioSegments: {
        id: string;
        phrase_id: string;
        build_id: string;
        voice_slot: "EN1" | "EN2" | "EN3" | "PL";
        status: "complete" | "failed" | "missing";
        error_code: string | null;
        path: string;
        size_bytes: number | null;
        duration_ms: number | null;
        sample_rate_hz: number;
        bitrate_kbps: number;
        is_active: boolean;
      }[] = [];
      for (const phrase of phrases) {
        for (const voice of voices) {
          try {
            console.log(`Processing phrase ${phrase.id} with voice ${voice.slot} (${voice.voice_id})`);

            // Determine text based on language
            const text = voice.language === "en" ? phrase.en_text : phrase.pl_text;
            if (!text || text.trim() === "") {
              console.log(`Skipping empty text for phrase ${phrase.id}, voice ${voice.slot}`);
              continue;
            }

            // Generate audio using TTS
            const audioBuffer = await ttsService.synthesize(text, voice.voice_id, voice.language);

            // Upload to storage using structured path: audio/{userId}/{notebookId}/{phraseId}/{voice}.mp3
            const storagePath = `${job.user_id}/${job.notebook_id}/${phrase.id}`;
            const fileName = `${storagePath}/${voice.slot}.mp3`;
            console.log(
              `[job-worker] Uploading audio to storage: bucket=audio, path=${fileName}, size=${audioBuffer.length} bytes`
            );

            const { data: uploadData, error: uploadError } = await this.storage
              .from("audio")
              .upload(fileName, audioBuffer, {
                contentType: "audio/mpeg",
                cacheControl: "3600",
                upsert: true, // Overwrite if exists
              });

            if (uploadError) {
              console.error(
                `[job-worker] Failed to upload audio for phrase ${phrase.id}, voice ${voice.slot}:`,
                uploadError
              );
              // Create failed segment with a placeholder path
              audioSegments.push({
                id: crypto.randomUUID(),
                phrase_id: phrase.id,
                build_id: buildId,
                voice_slot: voice.slot,
                status: "failed",
                error_code: "upload_failed",
                path: `failed/${job.user_id}/${job.notebook_id}/${phrase.id}/${voice.slot}.mp3`, // Placeholder path for failed uploads
                size_bytes: null,
                duration_ms: null,
                sample_rate_hz: 22050, // Use default value instead of null
                bitrate_kbps: 64, // Use default value instead of null
                is_active: false,
              });
              continue;
            }

            console.log(
              `[job-worker] Upload successful for phrase ${phrase.id}, voice ${voice.slot}. Upload data:`,
              uploadData
            );

            // Verify the file exists in storage
            const { data: fileCheck, error: checkError } = await this.storage.from("audio").list(storagePath, {
              limit: 10,
              offset: 0,
            });

            if (checkError) {
              console.warn(`[job-worker] Could not verify file existence for phrase ${phrase.id}:`, checkError);
            } else {
              const uploadedFile = fileCheck?.find((f) => f.name === `${voice.slot}.mp3`);
              if (!uploadedFile) {
                console.error(`[job-worker] WARNING: File ${fileName} was uploaded but not found in storage listing!`);
              } else {
                console.log(
                  `[job-worker] Verified file exists in storage: ${fileName}, size: ${uploadedFile.metadata?.size || "unknown"}`
                );
              }
            }

            // Create successful segment
            audioSegments.push({
              id: crypto.randomUUID(),
              phrase_id: phrase.id,
              build_id: buildId,
              voice_slot: voice.slot,
              status: "complete",
              error_code: null,
              path: fileName,
              size_bytes: audioBuffer.length,
              duration_ms: null, // Could be calculated from audio buffer
              sample_rate_hz: 22050,
              bitrate_kbps: 64,
              is_active: false, // Will be activated after all segments are created
            });

            console.log(`[job-worker] Successfully processed phrase ${phrase.id} with voice ${voice.slot}`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "unknown_error";
            const errorDetails = error instanceof Error ? error.stack : String(error);
            console.error(`Failed to process phrase ${phrase.id} with voice ${voice.slot}:`, errorMessage);
            console.error(`Error details:`, errorDetails);
            // Create failed segment with placeholder path (path is NOT NULL in schema)
            audioSegments.push({
              id: crypto.randomUUID(),
              phrase_id: phrase.id,
              build_id: buildId,
              voice_slot: voice.slot,
              status: "failed",
              error_code: errorMessage,
              path: `failed/${job.user_id}/${job.notebook_id}/${phrase.id}/${voice.slot}.mp3`, // Placeholder path for failed TTS
              size_bytes: null,
              duration_ms: null,
              sample_rate_hz: 22050, // Use default value instead of null
              bitrate_kbps: 64, // Use default value instead of null
              is_active: false,
            });
          }
        }
      }

      // Insert all audio segments
      if (audioSegments.length > 0) {
        const { error: segmentsError } = await this.supabase.from("audio_segments").insert(audioSegments);

        if (segmentsError) {
          throw new Error(`Failed to insert audio segments: ${segmentsError.message}`);
        }
      }

      // Activate new segments and deactivate old ones
      await this.activateNewSegments(job.notebook_id, buildId, jobId);

      console.log(`Job ${jobId} completed successfully with ${audioSegments.length} audio segments`);

      // Update job as succeeded
      await this.updateJobState(jobId, "succeeded", undefined, new Date().toISOString());
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);

      // Update job as failed
      await this.updateJobState(
        jobId,
        "failed",
        undefined,
        new Date().toISOString(),
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  private async updateJobState(
    jobId: string,
    state: "queued" | "running" | "succeeded" | "failed" | "canceled" | "timeout",
    startedAt?: string,
    endedAt?: string,
    error?: string
  ): Promise<void> {
    const updateData: {
      state: "queued" | "running" | "succeeded" | "failed" | "canceled" | "timeout";
      started_at?: string;
      ended_at?: string;
      error?: string;
    } = { state };
    if (startedAt) updateData.started_at = startedAt;
    if (endedAt) updateData.ended_at = endedAt;
    if (error) updateData.error = error;

    const { error: updateError } = await this.supabase.from("jobs").update(updateData).eq("id", jobId);

    if (updateError) {
      console.error(`Failed to update job state: ${updateError.message}`);
      // Don't throw here to avoid cascading errors
    }
  }

  private async createBuild(notebookId: string, jobId: string): Promise<string> {
    // Generate a proper UUID for the build ID
    const buildId = crypto.randomUUID();

    const { error } = await this.supabase.from("builds").insert({
      id: buildId,
      notebook_id: notebookId,
      job_id: jobId,
    });

    if (error) {
      throw new Error(`Failed to create build: ${error.message}`);
    }

    return buildId;
  }

  private async activateNewSegments(notebookId: string, buildId: string, jobId: string): Promise<void> {
    try {
      // Get all phrase IDs for this notebook
      const { data: phrases, error: phrasesError } = await this.supabase
        .from("phrases")
        .select("id")
        .eq("notebook_id", notebookId);

      if (phrasesError) {
        throw new Error(`Failed to fetch phrases: ${phrasesError.message}`);
      }

      if (!phrases || phrases.length === 0) {
        console.log("No phrases found for notebook, skipping segment activation");
        return;
      }

      const phraseIds = phrases.map((p: { id: string }) => p.id);

      // Deactivate old segments for this notebook's phrases
      const { error: deactivateError } = await this.supabase
        .from("audio_segments")
        .update({ is_active: false })
        .in("phrase_id", phraseIds);

      if (deactivateError) {
        throw new Error(`Failed to deactivate old segments: ${deactivateError.message}`);
      }

      // Activate new segments for this build
      const { error: activateError } = await this.supabase
        .from("audio_segments")
        .update({ is_active: true })
        .eq("build_id", buildId)
        .eq("status", "complete"); // Only activate successful segments

      if (activateError) {
        throw new Error(`Failed to activate new segments: ${activateError.message}`);
      }

      // Update notebook current_build_id
      const { error: updateNotebookError } = await this.supabase
        .from("notebooks")
        .update({ current_build_id: buildId })
        .eq("id", notebookId);

      if (updateNotebookError) {
        throw new Error(`Failed to update notebook: ${updateNotebookError.message}`);
      }

      console.log(`Activated segments for build ${buildId} and updated notebook ${notebookId}`);
    } catch (error) {
      console.error(`Failed to activate new segments for job ${jobId}:`, error);
      throw error;
    }
  }

  // Process all queued jobs
  async processQueuedJobs(): Promise<void> {
    const { data: queuedJobs, error } = await this.supabase
      .from("jobs")
      .select("id")
      .eq("state", "queued")
      .order("created_at");

    if (error) {
      throw new Error(`Failed to fetch queued jobs: ${error.message}`);
    }

    if (!queuedJobs || queuedJobs.length === 0) {
      return;
    }

    // Process jobs sequentially to avoid overwhelming the TTS service
    for (const job of queuedJobs) {
      await this.processJob(job.id);
    }
  }
}

// Singleton to prevent multiple worker instances
let workerInstance: JobWorker | null = null;

// Export a function to start the worker
export async function startJobWorker(): Promise<void> {
  // Prevent multiple instances
  if (workerInstance) {
    console.log("Job worker already running");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase configuration");
  }

  workerInstance = new JobWorker(supabaseUrl, supabaseServiceKey);

  // Process jobs every 30 seconds
  setInterval(async () => {
    try {
      if (workerInstance) {
        await workerInstance.processQueuedJobs();
      }
    } catch (error) {
      console.error("Job worker error:", error);
    }
  }, 30000);

  console.log("Job worker started");
}
