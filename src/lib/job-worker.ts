import { createClient } from "@supabase/supabase-js";
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
        console.log(`Job ${jobId} is in state: ${job.state}, skipping processing`);
        return;
      }

      // Update job state to running
      await this.updateJobState(jobId, "running", new Date().toISOString());

      // For now, skip TTS processing and just create a mock build
      // TODO: Fix TTS encryption and implement proper audio generation
      console.log("Skipping TTS processing for now - creating mock build");

      // Create build
      const buildId = await this.createBuild(job.notebook_id, jobId);

      // For now, just create a mock build without audio processing
      console.log("Creating mock build without audio processing");
      
      // Get phrases count for logging
      const { data: phrases, error: phrasesError } = await this.supabase
        .from("phrases")
        .select("id")
        .eq("notebook_id", job.notebook_id);

      if (phrasesError) {
        console.error("Failed to fetch phrases:", phrasesError);
      } else {
        console.log(`Found ${phrases?.length || 0} phrases in notebook`);
      }

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
      console.error(`Failed to update job state: ${updateError.message}`);
      // Don't throw here to avoid cascading errors
    }
  }

  private async createBuild(notebookId: string, jobId: string): Promise<string> {
    // Generate a proper UUID for the build ID
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

  private async activateNewSegments(notebookId: string, buildId: string, jobId: string): Promise<void> {
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
