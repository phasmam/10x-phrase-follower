import { useState, useEffect, useCallback } from "react";
import type {
  PlaybackManifestVM,
  PlaybackManifestDTO,
  PlaybackManifestItem,
  PlaybackManifestSegment,
  WordTiming,
  VoiceSlot,
  PlaybackSpeed,
} from "../types";
import PlayerControls from "./PlayerControls";
import SegmentSequenceBar from "./SegmentSequenceBar";
import PhraseViewer from "./PhraseViewer";
import KeyboardShortcutsHandler from "./KeyboardShortcutsHandler";
import RefreshManifestButton from "./RefreshManifestButton";
import { usePlaybackEngine } from "../lib/hooks/usePlaybackEngine";
import { useSignedUrlGuard } from "../lib/hooks/useSignedUrlGuard";
import { useClickToSeek } from "../lib/hooks/useClickToSeek";
import { useAuth } from "../lib/hooks/useAuth";
import { useApi } from "../lib/hooks/useApi";

interface PlayerShellProps {
  notebookId: string;
  startPhraseId?: string;
}

export default function PlayerShell({ notebookId, startPhraseId }: PlayerShellProps) {
  // Authentication
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { apiCall } = useApi();

  // Core state
  const [manifest, setManifest] = useState<PlaybackManifestVM | null>(null);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [currentSlot, setCurrentSlot] = useState<VoiceSlot | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [highlight, setHighlight] = useState(true);
  const [, setClockMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Find initial phrase index from startPhraseId
  useEffect(() => {
    if (manifest && startPhraseId) {
      const index = manifest.sequence.findIndex((item) => item.phrase.id === startPhraseId);
      if (index !== -1) {
        setPhraseIndex(index);
      }
    }
  }, [manifest, startPhraseId]);

  // Fetch playback manifest
  const fetchManifest = useCallback(async () => {
    if (!isAuthenticated) {
      setError("Authentication required");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await apiCall<PlaybackManifestDTO>(
        `/api/notebooks/${notebookId}/playback-manifest?highlight=${highlight ? "on" : "off"}&speed=${speed}`
      );

      // eslint-disable-next-line no-console
      console.log("[PlayerShell] Playback manifest loaded:", data);
      // eslint-disable-next-line no-console
      console.log("[PlayerShell] Sequence items:", data.sequence?.length || 0);
      if (data.sequence && data.sequence.length > 0) {
        // eslint-disable-next-line no-console
        console.log("[PlayerShell] First phrase segments:", data.sequence[0]?.segments?.length || 0);
        // eslint-disable-next-line no-console
        console.log("[PlayerShell] First phrase segments details:", data.sequence[0]?.segments);
      }

      // Transform DTO to VM
      const manifestVM: PlaybackManifestVM = {
        notebookId: data.notebook_id,
        buildId: data.build_id,
        sequence: data.sequence.map((item: PlaybackManifestItem) => ({
          phrase: {
            id: item.phrase.id,
            position: item.phrase.position,
            en: item.phrase.en_text,
            pl: item.phrase.pl_text,
            tokens: {
              en: item.phrase.tokens?.en || [],
              pl: item.phrase.tokens?.pl || [],
            },
          },
          segments: item.segments.map((segment: PlaybackManifestSegment) => ({
            slot: segment.slot,
            status: segment.status,
            url: segment.url,
            durationMs: segment.duration_ms,
            timings: segment.word_timings?.map((wt: WordTiming) => ({
              startMs: wt.start_ms,
              endMs: wt.end_ms,
            })),
          })),
        })),
        expiresAt: data.expires_at,
      };

      // eslint-disable-next-line no-console
      console.log("[PlayerShell] Manifest VM created:", manifestVM);
      setManifest(manifestVM);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[PlayerShell] Failed to fetch playback manifest:", err);
      setError(err instanceof Error ? err.message : "Failed to load playback manifest");
    } finally {
      setLoading(false);
    }
  }, [notebookId, highlight, speed, isAuthenticated, apiCall]);

  // Initial manifest fetch
  useEffect(() => {
    fetchManifest();
  }, [fetchManifest]);

  // URL expiry guard
  const { needsRefresh } = useSignedUrlGuard({ expiresAt: manifest?.expiresAt });

  // Current phrase and segments
  const currentPhrase = manifest?.sequence[phraseIndex];
  const currentSegments = currentPhrase?.segments || [];
  const hasPlayableSegments = currentSegments.length > 0;

  // Playback engine
  const { onAdvanceNext, onAdvancePrev, playSegment, pausePlayback, resumePlayback, stopPlayback } = usePlaybackEngine({
    manifest,
    phraseIndex,
    speed,
    setCurrentSlot,
    setClockMs,
    setPhraseIndex,
  });

  // Handle playing state - start audio playback when playing becomes true
  useEffect(() => {
    if (playing && currentSegments.length > 0 && !currentSlot) {
      // Find the first available segment to start with (EN1)
      const firstSegment = currentSegments.find((s) => s.slot === "EN1" && s.url);
      if (firstSegment && firstSegment.url) {
        // eslint-disable-next-line no-console
        console.log("[PlayerShell] Starting playback with segment:", {
          slot: firstSegment.slot,
          url: firstSegment.url,
        });
        playSegment("EN1", firstSegment.url);
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          "[PlayerShell] No playable segment found. Available segments:",
          currentSegments.map((s) => ({ slot: s.slot, hasUrl: !!s.url, status: s.status }))
        );
      }
    }
  }, [playing, currentSegments, currentSlot, playSegment]);

  // Click-to-seek functionality
  const { seekToToken } = useClickToSeek({
    tokens: currentPhrase?.phrase.tokens,
    timings: currentSegments.find((s) => s.slot === currentSlot)?.timings,
  });

  // Event handlers
  const handlePlay = useCallback(() => {
    if (!hasPlayableSegments) return;
    if (currentSlot) {
      resumePlayback();
      setPlaying(true);
      return;
    }
    setPlaying(true);
  }, [hasPlayableSegments, currentSlot, resumePlayback]);

  const handlePause = useCallback(() => {
    setPlaying(false);
    pausePlayback();
  }, [pausePlayback]);

  const handleStop = useCallback(() => {
    setPlaying(false);
    stopPlayback();
  }, [stopPlayback]);

  const handleRestartPhrase = useCallback(() => {
    setClockMs(0);
    setCurrentSlot(null);
    setPlaying(true);
  }, []);

  const handleSpeedChange = useCallback((newSpeed: PlaybackSpeed) => {
    setSpeed(newSpeed);
  }, []);

  const handleToggleHighlight = useCallback(() => {
    setHighlight((prev) => !prev);
  }, []);

  const handleSeekToToken = useCallback(
    (tokenIndex: number) => {
      if (currentSlot && seekToToken) {
        seekToToken(tokenIndex);
      }
    },
    [currentSlot, seekToToken]
  );

  const handleJumpToSlot = useCallback(
    (slot: VoiceSlot) => {
      const segment = currentSegments.find((s) => s.slot === slot);
      if (segment) {
        setCurrentSlot(slot);
        setClockMs(0);
      }
    },
    [currentSegments]
  );

  const handleRefreshManifest = useCallback(async () => {
    await fetchManifest();
  }, [fetchManifest]);

  // Keyboard shortcuts
  const shortcuts = {
    onPlayPause: playing ? handlePause : handlePlay,
    onStop: handleStop,
    onRestart: handleRestartPhrase,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onSeekSmall: () => {}, // TODO: Implement small seek
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onSeekLarge: () => {}, // TODO: Implement large seek
    onPrevPhrase: onAdvancePrev,
    onNextPhrase: onAdvanceNext,
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">🔒</div>
          <p className="text-red-300 mb-4">Authentication required</p>
          <p className="text-muted-foreground text-sm">Please log in to access the player</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading playback manifest...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">⚠️</div>
          <p className="text-red-300 mb-4">{error}</p>
          <RefreshManifestButton loading={false} onRefresh={handleRefreshManifest} />
        </div>
      </div>
    );
  }

  if (!manifest || manifest.sequence.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-muted-foreground text-xl mb-4">📝</div>
          <p className="text-foreground mb-4">No phrases available for playback</p>
          <p className="text-muted-foreground text-sm">Generate audio first or check your notebook</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <KeyboardShortcutsHandler {...shortcuts} />

      {/* Header with phrase counter */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audio Player</h1>
        </div>
        <div className="text-sm text-muted-foreground">
          Phrase {phraseIndex + 1} of {manifest.sequence.length}
        </div>
      </div>

      {/* Phrase viewer - on top */}
      <div className="mb-6">
        <PhraseViewer
          phrase={currentPhrase?.phrase}
          activeLang={currentSlot === "PL" ? "pl" : currentSlot ? "en" : null}
          highlight={highlight}
          onSeekToToken={handleSeekToToken}
        />
      </div>

      {/* Controls */}
      <div className="mb-6">
        <PlayerControls
          playing={playing}
          speed={speed}
          highlight={highlight}
          hasPlayable={hasPlayableSegments}
          onPlay={handlePlay}
          onPause={handlePause}
          onStop={handleStop}
          onRestart={handleRestartPhrase}
          onSpeedChange={handleSpeedChange}
          onToggleHighlight={handleToggleHighlight}
          onPrevPhrase={onAdvancePrev}
          onNextPhrase={onAdvanceNext}
        />
      </div>

      {/* Segment sequence bar - at the bottom */}
      <div className="mb-6">
        <SegmentSequenceBar
          sequenceForPhrase={currentSegments}
          activeSlot={currentSlot}
          onJumpToSlot={handleJumpToSlot}
        />
      </div>

      {/* Refresh manifest button */}
      {needsRefresh && (
        <div className="mb-6">
          <RefreshManifestButton loading={false} onRefresh={handleRefreshManifest} />
        </div>
      )}
    </div>
  );
}
