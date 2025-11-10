import { useCallback } from "react";
import type { Token, TokenTimingsHint } from "../../types";

interface UseClickToSeekProps {
  tokens?: {
    en: Token[];
    pl: Token[];
  };
  timings?: TokenTimingsHint[];
}

export function useClickToSeek({ tokens, timings }: UseClickToSeekProps) {
  const seekToToken = useCallback(
    (tokenIndex: number) => {
      if (!tokens || !timings || tokenIndex < 0 || tokenIndex >= timings.length) {
        return;
      }

      const timing = timings[tokenIndex];
      if (!timing) return;

      // Calculate the start time for the token
      const startTime = timing.startMs / 1000; // Convert to seconds for audio element

      // Find the audio element and seek to the position
      const audioElements = document.querySelectorAll("audio");
      for (const audio of audioElements) {
        if (audio.src && !audio.paused) {
          audio.currentTime = startTime;
          break;
        }
      }
    },
    [tokens, timings]
  );

  return { seekToToken };
}
