import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { useApi } from "../lib/hooks/useApi";
import { useToast } from "./ui/toast";
import type { TtsCredentialsStateDTO, UserVoicesListResponse, JobDTO } from "../types";

interface GenerateAudioButtonProps {
  notebookId: string;
  onJobCreated?: (job: JobDTO) => void;
}

interface GenerationState {
  isGenerating: boolean;
  canGenerate: boolean;
  ttsConfigured: boolean;
  voicesConfigured: boolean;
  error: string | null;
}

export default function GenerateAudioButton({ notebookId, onJobCreated }: GenerateAudioButtonProps) {
  const { apiCall } = useApi();
  const { addToast } = useToast();
  const [state, setState] = useState<GenerationState>({
    isGenerating: false,
    canGenerate: false,
    ttsConfigured: false,
    voicesConfigured: false,
    error: null,
  });

  const hasCheckedPrerequisites = useRef(false);

  // Memoize the checkPrerequisites function to prevent infinite loops
  const checkPrerequisites = useCallback(async () => {
    if (hasCheckedPrerequisites.current) {
      console.log("Prerequisites already checked, skipping...");
      return;
    }

    hasCheckedPrerequisites.current = true;

    try {
      console.log("Checking prerequisites...");
      // Check TTS credentials
      const ttsResponse = await apiCall<TtsCredentialsStateDTO>("/api/tts-credentials", {
        method: "GET",
      });

      // Check user voices
      const voicesResponse = await apiCall<UserVoicesListResponse>("/api/user-voices", {
        method: "GET",
      });

      const ttsConfigured = ttsResponse.is_configured;
      const voicesConfigured = voicesResponse.slots && voicesResponse.slots.length > 0;

      setState((prev) => ({
        ...prev,
        ttsConfigured,
        voicesConfigured,
        canGenerate: ttsConfigured && voicesConfigured,
        error: null,
      }));

      console.log("Prerequisites checked:", { ttsConfigured, voicesConfigured });
    } catch (err) {
      console.error("Failed to check prerequisites:", err);
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to check prerequisites",
      }));
      hasCheckedPrerequisites.current = false; // Allow retry on error
    }
  }, [apiCall]);

  // Check prerequisites for audio generation
  useEffect(() => {
    checkPrerequisites();
  }, [checkPrerequisites]);

  const handleGenerateAudio = async () => {
    if (!state.canGenerate || state.isGenerating) return;

    setState((prev) => ({ ...prev, isGenerating: true, error: null }));

    try {
      // Generate idempotency key
      const idempotencyKey = crypto.randomUUID();

      const job = await apiCall<JobDTO>(`/api/notebooks/${notebookId}/jobs/generate-rebuild`, {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          timeout_sec: 1800, // 30 minutes
        }),
      });

      setState((prev) => ({ ...prev, isGenerating: false }));

      addToast({
        type: "success",
        title: "Audio generation started",
        description: "Your audio is being generated. This may take a few minutes.",
      });

      if (onJobCreated) {
        onJobCreated(job);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to start audio generation";

      setState((prev) => ({
        ...prev,
        isGenerating: false,
        error: errorMessage,
      }));

      addToast({
        type: "error",
        title: "Generation failed",
        description: errorMessage,
      });
    }
  };

  const getButtonText = () => {
    if (state.isGenerating) return "Generating...";
    if (!state.ttsConfigured) return "Configure TTS First";
    if (!state.voicesConfigured) return "Configure Voices First";
    return "Generate Audio";
  };

  const getButtonVariant = () => {
    if (state.isGenerating) return "secondary";
    if (!state.canGenerate) return "outline";
    return "default";
  };

  const getButtonDisabled = () => {
    return state.isGenerating || !state.canGenerate;
  };

  const getTooltipText = () => {
    if (state.isGenerating) return "Audio generation in progress...";
    if (!state.ttsConfigured) return "Please configure TTS credentials in Settings first";
    if (!state.voicesConfigured) return "Please configure voice slots in Settings first";
    return "Generate audio for all phrases in this notebook";
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleGenerateAudio}
        disabled={getButtonDisabled()}
        variant={getButtonVariant()}
        title={getTooltipText()}
        className="min-w-[140px]"
      >
        {getButtonText()}
      </Button>

      {state.error && <p className="text-xs text-destructive">{state.error}</p>}

      {!state.canGenerate && !state.isGenerating && (
        <div className="text-xs text-muted-foreground">
          {!state.ttsConfigured && <p>• Configure TTS credentials in Settings</p>}
          {!state.voicesConfigured && <p>• Configure voice slots in Settings</p>}
        </div>
      )}
    </div>
  );
}
