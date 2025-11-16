import { useCallback, useEffect, useRef } from "react";
import type { PlaybackManifestVM, VoiceSlot, PlaybackSpeed } from "../../types";

interface UsePlaybackEngineProps {
  manifest: PlaybackManifestVM | null;
  phraseIndex: number;
  speed: PlaybackSpeed;
  setCurrentSlot: (slot: VoiceSlot | null) => void;
  setClockMs: (ms: number) => void;
  setPhraseIndex: (index: number) => void;
}

const SLOT_SEQUENCE: VoiceSlot[] = ["EN1", "EN2", "EN3", "PL"];
const PAUSE_DURATION_MS = 800;

export function usePlaybackEngine({
  manifest,
  phraseIndex,
  speed,
  setCurrentSlot,
  setClockMs,
  setPhraseIndex,
}: UsePlaybackEngineProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentSegmentRef = useRef<VoiceSlot | null>(null);
  const manifestRef = useRef<PlaybackManifestVM | null>(manifest);
  const phraseIndexRef = useRef<number>(phraseIndex);

  // Keep refs in sync with latest values to avoid stale closures
  useEffect(() => {
    manifestRef.current = manifest;
  }, [manifest]);

  useEffect(() => {
    phraseIndexRef.current = phraseIndex;
  }, [phraseIndex]);

  // Clean up timeouts
  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const pausePlayback = useCallback(() => {
    clearTimeouts();
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [clearTimeouts]);

  const resumePlayback = useCallback(async () => {
    if (audioRef.current) {
      try {
        await audioRef.current.play();
      } catch (error) {
        console.error("Failed to resume audio:", error);
      }
    }
  }, []);

  const stopPlayback = useCallback(() => {
    clearTimeouts();
    if (audioRef.current) {
      audioRef.current.pause();
      try {
        audioRef.current.currentTime = 0;
        // eslint-disable-next-line no-empty
      } catch {}
    }
    currentSegmentRef.current = null;
    setCurrentSlot(null);
    setClockMs(0);
  }, [clearTimeouts, setCurrentSlot, setClockMs]);

  // Handle segment end logic using refs for fresh state
  const handleSegmentEnd = useCallback(() => {
    const currentManifest = manifestRef.current;
    const idx = phraseIndexRef.current;

    if (!currentManifest || idx >= currentManifest.sequence.length) return;

    const currentPhrase = currentManifest.sequence[idx];
    const currentSlot = currentSegmentRef.current;
    if (!currentSlot) return;

    const currentSlotIndex = SLOT_SEQUENCE.indexOf(currentSlot);
    const nextSlot = SLOT_SEQUENCE[currentSlotIndex + 1];

    const nextSegment = currentPhrase.segments.find((s) => s.slot === nextSlot);

    if (nextSegment) {
      timeoutRef.current = setTimeout(() => {
        playSegment(nextSlot, nextSegment.url);
      }, PAUSE_DURATION_MS);
    } else {
      timeoutRef.current = setTimeout(() => {
        handlePhraseEnd();
      }, PAUSE_DURATION_MS);
    }
  }, []);

  // Handle phrase end logic using refs for fresh state
  const handlePhraseEnd = useCallback(() => {
    const currentManifest = manifestRef.current;
    const idx = phraseIndexRef.current;

    if (!currentManifest || idx >= currentManifest.sequence.length - 1) {
      setCurrentSlot(null);
      setClockMs(0);
      return;
    }

    const nextPhraseIndex = idx + 1;
    setPhraseIndex(nextPhraseIndex);

    const nextPhrase = currentManifest.sequence[nextPhraseIndex];
    const en1Segment = nextPhrase.segments.find((s) => s.slot === "EN1");

    if (en1Segment) {
      timeoutRef.current = setTimeout(() => {
        playSegment("EN1", en1Segment.url);
      }, PAUSE_DURATION_MS);
    }
  }, [setPhraseIndex, setCurrentSlot, setClockMs]);

  // Play audio segment
  const playSegment = useCallback(
    async (slot: VoiceSlot, url: string) => {
      if (!url || url.trim() === "") {
        console.error("[usePlaybackEngine] Invalid URL provided:", url);
        handleSegmentEnd();
        return;
      }

      if (!audioRef.current) {
        audioRef.current = new Audio();

        // Set up event listeners
        audioRef.current.addEventListener("ended", handleSegmentEnd);
        audioRef.current.addEventListener("error", (e) => {
          console.error("[usePlaybackEngine] Audio element error:", e, {
            error: audioRef.current?.error,
            networkState: audioRef.current?.networkState,
            readyState: audioRef.current?.readyState,
            src: audioRef.current?.src,
          });
          handleSegmentEnd();
        });
        audioRef.current.addEventListener("timeupdate", () => {
          if (audioRef.current) {
            setClockMs(audioRef.current.currentTime * 1000);
          }
        });
      }

      const audio = audioRef.current;
      audio.src = url;
      audio.playbackRate = speed;

      try {
        await audio.play();
        currentSegmentRef.current = slot;
        setCurrentSlot(slot);
      } catch (error) {
        console.error("[usePlaybackEngine] Failed to play audio segment:", error, {
          errorCode: error && typeof error === "object" && "code" in error ? String(error.code) : undefined,
          errorMessage: error instanceof Error ? error.message : String(error),
          src: audio.src,
        });
        handleSegmentEnd();
      }
    },
    [speed, setCurrentSlot, setClockMs, handleSegmentEnd]
  );

  // Advance to next phrase
  const onAdvanceNext = useCallback(() => {
    const currentManifest = manifestRef.current;
    const idx = phraseIndexRef.current;
    if (!currentManifest || idx >= currentManifest.sequence.length - 1) return;

    clearTimeouts();
    setCurrentSlot(null);
    setClockMs(0);
    setPhraseIndex(idx + 1);
  }, [setPhraseIndex, setCurrentSlot, setClockMs, clearTimeouts]);

  // Advance to previous phrase
  const onAdvancePrev = useCallback(() => {
    const idx = phraseIndexRef.current;
    if (idx <= 0) return;

    clearTimeouts();
    setCurrentSlot(null);
    setClockMs(0);
    setPhraseIndex(idx - 1);
  }, [setPhraseIndex, setCurrentSlot, setClockMs, clearTimeouts]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearTimeouts();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, [clearTimeouts]);

  // Update audio playback rate when speed changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Seek functionality
  const seekSmall = useCallback((direction: "left" | "right") => {
    if (!audioRef.current) return;
    const offset = direction === "left" ? -2 : 2; // 2 seconds
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + offset);
  }, []);

  const seekLarge = useCallback((direction: "left" | "right") => {
    if (!audioRef.current) return;
    const offset = direction === "left" ? -5 : 5; // 5 seconds
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + offset);
  }, []);

  const seekToTime = useCallback((timeMs: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = timeMs / 1000;
  }, []);

  return {
    onEndSegment: handleSegmentEnd,
    onEndPhrase: handlePhraseEnd,
    onAdvanceNext,
    onAdvancePrev,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    playSegment,
    seekSmall,
    seekLarge,
    seekToTime,
    getAudioElement: () => audioRef.current,
  };
}
