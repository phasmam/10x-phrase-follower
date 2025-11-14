import { useCallback } from "react";
import type { Token, TokenTimingsHint } from "../../types";

interface UseClickToSeekProps {
  tokens?: {
    en: Token[];
    pl: Token[];
  };
  timings?: TokenTimingsHint[];
  getAudioElement?: () => HTMLAudioElement | null;
}

export function useClickToSeek({ tokens, timings, getAudioElement }: UseClickToSeekProps) {
  const seekToToken = useCallback(
    (tokenIndex: number) => {
      if (!tokens || !timings || tokenIndex < 0 || tokenIndex >= timings.length) {
        return;
      }

      const timing = timings[tokenIndex];
      if (!timing) return;

      // Calculate the start time for the token
      const startTime = timing.startMs / 1000; // Convert to seconds for audio element

      // Use provided audio element getter, or fallback to finding audio elements
      if (getAudioElement) {
        const audio = getAudioElement();
        if (audio) {
          audio.currentTime = startTime;
          return;
        }
      }

      // Fallback: find the audio element
      const audioElements = document.querySelectorAll("audio");
      for (const audio of audioElements) {
        if (audio.src) {
          audio.currentTime = startTime;
          break;
        }
      }
    },
    [tokens, timings, getAudioElement]
  );

  return { seekToToken };
}
