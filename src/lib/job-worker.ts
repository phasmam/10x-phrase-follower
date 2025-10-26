import { createClient } from "@supabase/supabase-js";
import { decrypt } from "./tts-encryption";
import type { Database } from "../db/database.types";

// TTS service for Google Cloud Text-to-Speech
class TtsService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(text: string, voiceId: string, language: string): Promise<Buffer> {
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
    const audioData = Buffer.from(data.audioContent, "base64");
    return audioData;
  }
}

// Job worker for processing TTS generation jobs
export class JobWorker {
  private supabase: any;
  private storage: any;

  constructor(supabaseUrl: string, supabaseServiceKey: string) {
    this.supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
    this.storage = this.supabase.storage;
  }

  async processJob(jobId: string): Promise<void> {
    console.log(`Starting job processing for job: ${jobId}`);
    try {
      console.log("Job worker initialized successfully");
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
        throw new Error(`Job ${jobId} is not in queued state`);
      }

      // Update job state to running
      await this.updateJobState(jobId, "running", new Date().toISOString());

      // Get TTS credentials separately
      console.log(`Fetching TTS credentials for user: ${job.user_id}`);
      const { data: ttsCredentials, error: ttsError } = await this.supabase
        .from("tts_credentials")
        .select("encrypted_key")
        .eq("user_id", job.user_id)
        .single();

      if (ttsError || !ttsCredentials) {
        console.error("TTS credentials error:", ttsError);
        throw new Error("TTS credentials not found");
      }
      console.log("TTS credentials found");

      // Get user voices separately
      console.log(`Fetching user voices for user: ${job.user_id}`);
      const { data: userVoices, error: voicesError } = await this.supabase
        .from("user_voices")
        .select("slot, language, voice_id")
        .eq("user_id", job.user_id)
        .order("slot");

      if (voicesError || !userVoices || userVoices.length === 0) {
        console.error("User voices error:", voicesError);
        throw new Error("User voices not found");
      }
      console.log(`Found ${userVoices.length} user voices`);

      // Decrypt TTS credentials
      const apiKey = await decrypt(ttsCredentials.encrypted_key);
      const ttsService = new TtsService(apiKey);

      // Create build
      const buildId = await this.createBuild(job.notebook_id, jobId);

      // Get all phrases for the notebook
      const { data: phrases, error: phrasesError } = await this.supabase
        .from("phrases")
        .select("id, en_text, pl_text")
        .eq("notebook_id", job.notebook_id)
        .order("position");

      if (phrasesError) {
        throw new Error("Failed to fetch phrases");
      }

      if (!phrases || phrases.length === 0) {
        // No phrases to process, mark job as succeeded
        await this.updateJobState(jobId, "succeeded", new Date().toISOString());
        return;
      }

      // Process each phrase with each voice
      const segments = [];
      for (const phrase of phrases) {
        for (const voice of userVoices) {
          try {
            const text = voice.language === "en" ? phrase.en_text : phrase.pl_text;
            const audioData = await ttsService.synthesize(text, voice.voice_id, voice.language);
            
            // Upload to storage
            const path = `audio/${job.user_id}/${job.notebook_id}/${phrase.id}/${voice.slot}.mp3`;
            const { error: uploadError } = await this.storage
              .from("audio")
              .upload(path, audioData, {
                contentType: "audio/mpeg",
                upsert: true,
              });

            if (uploadError) {
              throw new Error(`Upload failed: ${uploadError.message}`);
            }

            // Create audio segment record
            const segment = {
              id: crypto.randomUUID(),
              phrase_id: phrase.id,
              voice_slot: voice.slot,
              build_id: buildId,
              path,
              duration_ms: null, // Would need audio analysis to get actual duration
              size_bytes: audioData.length,
              sample_rate_hz: 22050,
              bitrate_kbps: 64,
              status: "complete" as const,
              error_code: null,
              error_details: null,
              word_timings: null,
              is_active: false, // Will be set to true after job completion
            };

            segments.push(segment);
          } catch (error) {
            // Create failed segment record
            const segment = {
              id: crypto.randomUUID(),
              phrase_id: phrase.id,
              voice_slot: voice.slot,
              build_id: buildId,
              path: "",
              duration_ms: null,
              size_bytes: null,
              sample_rate_hz: 22050,
              bitrate_kbps: 64,
              status: "failed" as const,
              error_code: error instanceof Error ? error.message : "unknown_error",
              error_details: null,
              word_timings: null,
              is_active: false,
            };

            segments.push(segment);
          }
        }
      }

      // Insert all segments
      if (segments.length > 0) {
        const { error: segmentsError } = await this.supabase
          .from("audio_segments")
          .insert(segments);

        if (segmentsError) {
          throw new Error(`Failed to insert segments: ${segmentsError.message}`);
        }
      }

      // Activate new segments and deactivate old ones
      await this.activateNewSegments(job.notebook_id, buildId);

      // Update job as succeeded
      await this.updateJobState(jobId, "succeeded", new Date().toISOString());

    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);
      
      // Update job as failed
      await this.updateJobState(jobId, "failed", new Date().toISOString(), 
        error instanceof Error ? error.message : "Unknown error");
    }
  }

  private async updateJobState(jobId: string, state: string, startedAt?: string, endedAt?: string, error?: string): Promise<void> {
    const updateData: any = { state };
    if (startedAt) updateData.started_at = startedAt;
    if (endedAt) updateData.ended_at = endedAt;
    if (error) updateData.error = error;

    const { error: updateError } = await this.supabase
      .from("jobs")
      .update(updateData)
      .eq("id", jobId);

    if (updateError) {
      throw new Error(`Failed to update job state: ${updateError.message}`);
    }
  }

  private async createBuild(notebookId: string, jobId: string): Promise<string> {
    const buildId = crypto.randomUUID();
    
    const { error } = await this.supabase
      .from("builds")
      .insert({
        id: buildId,
        notebook_id: notebookId,
        job_id: jobId,
      });

    if (error) {
      throw new Error(`Failed to create build: ${error.message}`);
    }

    return buildId;
  }

  private async activateNewSegments(notebookId: string, buildId: string): Promise<void> {
    // Start transaction
    const { error: transactionError } = await this.supabase.rpc("begin_transaction");
    if (transactionError) {
      throw new Error(`Failed to begin transaction: ${transactionError.message}`);
    }

    try {
      // Deactivate old segments
      const { error: deactivateError } = await this.supabase
        .from("audio_segments")
        .update({ is_active: false })
        .eq("phrase_id", 
          this.supabase
            .from("phrases")
            .select("id")
            .eq("notebook_id", notebookId)
        );

      if (deactivateError) {
        throw new Error(`Failed to deactivate old segments: ${deactivateError.message}`);
      }

      // Activate new segments
      const { error: activateError } = await this.supabase
        .from("audio_segments")
        .update({ is_active: true })
        .eq("build_id", buildId);

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

      // Commit transaction
      const { error: commitError } = await this.supabase.rpc("commit_transaction");
      if (commitError) {
        throw new Error(`Failed to commit transaction: ${commitError.message}`);
      }

    } catch (error) {
      // Rollback transaction
      await this.supabase.rpc("rollback_transaction");
      console.error(`Job processing failed for job ${jobId}:`, error);
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
let workerInterval: NodeJS.Timeout | null = null;

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
  workerInterval = setInterval(async () => {
    try {
      await workerInstance!.processQueuedJobs();
    } catch (error) {
      console.error("Job worker error:", error);
    }
  }, 30000);

  console.log("Job worker started");
}
