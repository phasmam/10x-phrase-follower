import React from 'react';
import { Button } from './ui/button';
import { Play, Pause, Square, RotateCcw, Volume2, VolumeX, SkipBack, SkipForward } from 'lucide-react';
import type { PlaybackSpeed } from '../types';

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
  { value: 0.75, label: '0.75x' },
  { value: 0.9, label: '0.9x' },
  { value: 1, label: '1x' },
  { value: 1.25, label: '1.25x' }
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
  onNextPhrase
}: PlayerControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-gray-800 rounded-lg p-4">
      {/* Main playback controls */}
      <div className="flex items-center gap-2">
        <Button
          onClick={playing ? onPause : onPlay}
          disabled={!hasPlayable}
          variant="default"
          size="lg"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          <span className="ml-2">{playing ? 'Pause' : 'Play'}</span>
        </Button>

        <Button
          onClick={onStop}
          variant="secondary"
          size="lg"
        >
          <Square className="h-5 w-5" />
          <span className="ml-2">Stop</span>
        </Button>

        <Button
          onClick={onRestart}
          disabled={!hasPlayable}
          variant="secondary"
          size="lg"
        >
          <RotateCcw className="h-5 w-5" />
          <span className="ml-2">Restart</span>
        </Button>

        {/* Phrase navigation */}
        <div className="ml-2 flex items-center gap-2">
          <Button
            onClick={onPrevPhrase}
            variant="secondary"
            size="lg"
          >
            <SkipBack className="h-5 w-5" />
            <span className="ml-2">Prev</span>
          </Button>

          <Button
            onClick={onNextPhrase}
            variant="secondary"
            size="lg"
          >
            <SkipForward className="h-5 w-5" />
            <span className="ml-2">Next</span>
          </Button>
        </div>
      </div>

      {/* Speed control */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-300">Speed:</span>
        <div className="flex gap-1">
          {speedOptions.map((option) => (
            <Button
              key={option.value}
              onClick={() => onSpeedChange(option.value)}
              variant={speed === option.value ? 'default' : 'secondary'}
              size="sm"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Highlight toggle */}
      <div className="flex items-center gap-2">
        <Button
          onClick={onToggleHighlight}
          variant={'default'}
          size="sm"
        >
          {highlight ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          <span className="ml-2">Highlight</span>
        </Button>
      </div>
    </div>
  );
}
