import { useCallback, useEffect, useRef } from 'react';
import type { PlaybackManifestVM, VoiceSlot, PlaybackSpeed } from '../../types';

interface UsePlaybackEngineProps {
  manifest: PlaybackManifestVM | null;
  phraseIndex: number;
  speed: PlaybackSpeed;
  setCurrentSlot: (slot: VoiceSlot | null) => void;
  setClockMs: (ms: number) => void;
  setPhraseIndex: (index: number) => void;
}

const SLOT_SEQUENCE: VoiceSlot[] = ['EN1', 'EN2', 'EN3', 'PL'];
const PAUSE_DURATION_MS = 800;

export function usePlaybackEngine({
  manifest,
  phraseIndex,
  speed,
  setCurrentSlot,
  setClockMs,
  setPhraseIndex
}: UsePlaybackEngineProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentSegmentRef = useRef<VoiceSlot | null>(null);

  // Clean up timeouts
  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Handle segment end logic
  const handleSegmentEnd = useCallback(() => {
    if (!manifest || phraseIndex >= manifest.sequence.length) return;

    const currentPhrase = manifest.sequence[phraseIndex];
    const currentSlot = currentSegmentRef.current;
    
    if (!currentSlot) return;

    const currentSlotIndex = SLOT_SEQUENCE.indexOf(currentSlot);
    const nextSlot = SLOT_SEQUENCE[currentSlotIndex + 1];
    
    // Check if there's a next slot in current phrase
    const nextSegment = currentPhrase.segments.find(s => s.slot === nextSlot);
    
    if (nextSegment) {
      // Play next segment after pause
      timeoutRef.current = setTimeout(() => {
        playSegment(nextSlot, nextSegment.url);
      }, PAUSE_DURATION_MS);
    } else {
      // No more segments in current phrase, advance to next phrase
      timeoutRef.current = setTimeout(() => {
        handlePhraseEnd();
      }, PAUSE_DURATION_MS);
    }
  }, [manifest, phraseIndex]);

  // Handle phrase end logic
  const handlePhraseEnd = useCallback(() => {
    if (!manifest || phraseIndex >= manifest.sequence.length - 1) {
      // No more phrases, stop playback
      setCurrentSlot(null);
      setClockMs(0);
      return;
    }

    // Advance to next phrase
    const nextPhraseIndex = phraseIndex + 1;
    setPhraseIndex(nextPhraseIndex);
    
    // Start next phrase from EN1
    const nextPhrase = manifest.sequence[nextPhraseIndex];
    const en1Segment = nextPhrase.segments.find(s => s.slot === 'EN1');
    
    if (en1Segment) {
      timeoutRef.current = setTimeout(() => {
        playSegment('EN1', en1Segment.url);
      }, PAUSE_DURATION_MS);
    }
  }, [manifest, phraseIndex, setPhraseIndex, setCurrentSlot, setClockMs]);

  // Play audio segment
  const playSegment = useCallback(async (slot: VoiceSlot, url: string) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      
      // Set up event listeners
      audioRef.current.addEventListener('ended', handleSegmentEnd);
      audioRef.current.addEventListener('timeupdate', () => {
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
      console.error('Failed to play audio segment:', error);
      // Continue to next segment on error
      handleSegmentEnd();
    }
  }, [speed, setCurrentSlot, setClockMs, handleSegmentEnd]);

  // Advance to next phrase
  const onAdvanceNext = useCallback(() => {
    if (!manifest || phraseIndex >= manifest.sequence.length - 1) return;
    
    clearTimeouts();
    setCurrentSlot(null);
    setClockMs(0);
    setPhraseIndex(phraseIndex + 1);
  }, [manifest, phraseIndex, setPhraseIndex, setCurrentSlot, setClockMs, clearTimeouts]);

  // Advance to previous phrase
  const onAdvancePrev = useCallback(() => {
    if (phraseIndex <= 0) return;
    
    clearTimeouts();
    setCurrentSlot(null);
    setClockMs(0);
    setPhraseIndex(phraseIndex - 1);
  }, [phraseIndex, setPhraseIndex, setCurrentSlot, setClockMs, clearTimeouts]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearTimeouts();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [clearTimeouts]);

  // Update audio playback rate when speed changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  return {
    onEndSegment: handleSegmentEnd,
    onEndPhrase: handlePhraseEnd,
    onAdvanceNext,
    onAdvancePrev,
    playSegment
  };
}