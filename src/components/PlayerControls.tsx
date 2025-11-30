import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Play, Pause, Square, RotateCcw, Volume2, VolumeX, SkipBack, SkipForward } from "lucide-react";
import type { PlaybackSpeed } from "../types";

interface PlayerControlsProps {
  playing: boolean;
  speed: PlaybackSpeed;
  highlight: boolean;
  hasPlayable: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  onToggleHighlight: () => void;
  onPrevPhrase: () => void;
  onNextPhrase: () => void;
}

const speedOptions: { value: PlaybackSpeed; label: string }[] = [
  { value: 0.75, label: "0.75x" },
  { value: 0.9, label: "0.9x" },
  { value: 1, label: "1x" },
  { value: 1.25, label: "1.25x" },
];

export default function PlayerControls({
  playing,
  speed,
  highlight,
  hasPlayable,
  onPlay,
  onPause,
  onStop,
  onRestart,
  onSpeedChange,
  onToggleHighlight,
  onPrevPhrase,
  onNextPhrase,
}: PlayerControlsProps) {
  const [isPortrait, setIsPortrait] = useState(false);

  // Detect orientation on mobile
  useEffect(() => {
    const checkOrientation = () => {
      if (window.innerWidth < 768) {
        // Mobile: check if portrait
        setIsPortrait(window.innerHeight > window.innerWidth);
      } else {
        // Desktop: always show
        setIsPortrait(false);
      }
    };

    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  return (
    <div className="fixed md:sticky inset-x-0 bottom-0 md:bottom-auto z-30 md:z-20 bg-background/95 md:bg-background/80 backdrop-blur border-t pb-[env(safe-area-inset-bottom)] md:pb-0">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-3 md:gap-4 items-center justify-center sm:justify-between px-4 py-3 md:py-4">
        {/* Main playback controls */}
        <div className="flex items-center gap-2 md:gap-2.5">
          {/* Play/Pause - filled/solid, central */}
          <Button
            onClick={playing ? onPause : onPlay}
            disabled={!hasPlayable}
            variant="default"
            size="icon"
            className="h-12 w-12 md:h-10 md:w-10 active:scale-95"
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause (Space/K)" : "Play (Space/K)"}
          >
            {playing ? <Pause className="h-5 w-5 md:h-4 md:w-4" /> : <Play className="h-5 w-5 md:h-4 md:w-4" />}
          </Button>

          {/* Stop - ghost/outline */}
          <Button
            onClick={onStop}
            variant="ghost"
            size="icon"
            className="h-12 w-12 md:h-10 md:w-10 active:bg-emerald-500/20 active:text-emerald-300"
            aria-label="Stop"
            title="Stop (S)"
          >
            <Square className="h-5 w-5 md:h-4 md:w-4" />
          </Button>

          {/* Restart - ghost/outline */}
          <Button
            onClick={onRestart}
            disabled={!hasPlayable}
            variant="ghost"
            size="icon"
            className="h-12 w-12 md:h-10 md:w-10 active:bg-emerald-500/20 active:text-emerald-300"
            aria-label="Restart phrase"
            title="Restart phrase (R)"
          >
            <RotateCcw className="h-5 w-5 md:h-4 md:w-4" />
          </Button>

          {/* Phrase navigation - ghost/outline */}
          <div className="ml-1 md:ml-2 flex items-center gap-1 md:gap-2">
            <Button
              onClick={onPrevPhrase}
              variant="ghost"
              size="icon"
              className="h-12 w-12 md:h-10 md:w-10 active:bg-emerald-500/20 active:text-emerald-300"
              aria-label="Previous phrase"
              title="Previous phrase (P)"
            >
              <SkipBack className="h-5 w-5 md:h-4 md:w-4" />
            </Button>

            <Button
              onClick={onNextPhrase}
              variant="ghost"
              size="icon"
              className="h-12 w-12 md:h-10 md:w-10 active:bg-emerald-500/20 active:text-emerald-300"
              aria-label="Next phrase"
              title="Next phrase (N)"
            >
              <SkipForward className="h-5 w-5 md:h-4 md:w-4" />
            </Button>
          </div>
        </div>

        {/* Speed control + highlight - hidden in portrait mode on mobile */}
        {!isPortrait && (
          <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-end flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden md:inline">Speed:</span>
              <div className="flex gap-1 rounded-md border bg-muted/50 p-1">
                {speedOptions.map((option) => (
                  <Button
                    key={option.value}
                    onClick={() => onSpeedChange(option.value)}
                    variant={speed === option.value ? "default" : "ghost"}
                    size="sm"
                    className={`h-8 px-2 md:px-3 text-xs md:text-sm ${
                      speed === option.value ? "" : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/80"
                    }`}
                    aria-label={`Set speed to ${option.label}`}
                    aria-pressed={speed === option.value}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={onToggleHighlight}
                variant={highlight ? "default" : "ghost"}
                size="icon"
                className="h-12 w-12 md:h-10 md:w-10"
                aria-label={highlight ? "Disable highlight" : "Enable highlight"}
                aria-pressed={highlight}
                title={highlight ? "Disable highlight" : "Enable highlight"}
              >
                {highlight ? (
                  <Volume2 className="h-5 w-5 md:h-4 md:w-4" />
                ) : (
                  <VolumeX className="h-5 w-5 md:h-4 md:w-4" />
                )}
              </Button>
              <span className="text-sm text-muted-foreground hidden md:inline">Highlight</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
