import React from "react";
import { Button } from "./ui/button";
import { Play, Pause, X } from "lucide-react";
import type { Segment, VoiceSlot } from "../types";

interface SegmentSequenceBarProps {
  sequenceForPhrase: Segment[];
  activeSlot?: VoiceSlot | null;
  onJumpToSlot: (slot: VoiceSlot) => void;
  compact?: boolean;
}

const slotOrder: VoiceSlot[] = ["EN1", "EN2", "EN3", "PL"];
const slotLabels = {
  EN1: "EN 1",
  EN2: "EN 2",
  EN3: "EN 3",
  PL: "PL",
};

export default function SegmentSequenceBar({
  sequenceForPhrase,
  activeSlot,
  onJumpToSlot,
  compact = false,
}: SegmentSequenceBarProps) {
  const getSlotStatus = (slot: VoiceSlot) => {
    const segment = sequenceForPhrase.find((s) => s.slot === slot);
    if (!segment) return "missing";
    if (activeSlot === slot) return "playing";
    return "available";
  };

  const getSlotIcon = (slot: VoiceSlot, status: string) => {
    switch (status) {
      case "playing":
        return <Play className="h-3 w-3 md:h-4 md:w-4 fill-current" />;
      case "available":
        return <Pause className="h-3 w-3 md:h-4 md:w-4" />;
      case "missing":
        return <X className="h-3 w-3 md:h-4 md:w-4" />;
      default:
        return <Pause className="h-3 w-3 md:h-4 md:w-4" />;
    }
  };

  const getSlotColor = (slot: VoiceSlot, status: string) => {
    if (status === "missing") {
      return "bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50";
    }

    if (status === "playing") {
      // Colorful badges similar to EN/PL in PhraseViewer
      if (slot === "EN1") {
        return "bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30";
      } else if (slot === "EN2") {
        return "bg-blue-600/20 text-blue-400 border border-blue-600/40 hover:bg-blue-600/30";
      } else if (slot === "EN3") {
        return "bg-blue-700/20 text-blue-500 border border-blue-700/40 hover:bg-blue-700/30";
      } else if (slot === "PL") {
        return "bg-green-500/20 text-green-300 border border-green-500/40 hover:bg-green-500/30";
      }
    }

    // Available but not playing
    return "bg-muted text-muted-foreground/90 hover:text-foreground hover:bg-muted/80 border border-transparent";
  };

  if (compact) {
    // Mobile compact variant: pills with icons
    return (
      <div className="flex gap-2 justify-center">
        {slotOrder.map((slot) => {
          const status = getSlotStatus(slot);
          const isClickable = status !== "missing";

          return (
            <Button
              key={slot}
              onClick={() => isClickable && onJumpToSlot(slot)}
              disabled={!isClickable}
              variant="outline"
              size="icon"
              className={`h-10 w-10 rounded-full ${getSlotColor(slot, status)} ${!isClickable ? "cursor-not-allowed" : ""}`}
              aria-label={`Jump to ${slotLabels[slot]}${status === "playing" ? " (playing)" : ""}`}
              title={slotLabels[slot]}
            >
              {getSlotIcon(slot, status)}
            </Button>
          );
        })}
      </div>
    );
  }

  // Desktop full variant: buttons with labels
  return (
    <div className="bg-card rounded-lg p-3 border">
      <h3 className="text-sm font-medium text-muted-foreground mb-3 hidden md:block">Playback Sequence</h3>
      <div className="flex gap-2 justify-center">
        {slotOrder.map((slot) => {
          const status = getSlotStatus(slot);
          const isClickable = status !== "missing";

          return (
            <Button
              key={slot}
              onClick={() => isClickable && onJumpToSlot(slot)}
              disabled={!isClickable}
              variant="outline"
              size="sm"
              className={`flex flex-col items-center gap-1 min-w-[60px] h-14 md:h-12 ${getSlotColor(slot, status)} ${
                !isClickable ? "cursor-not-allowed" : ""
              }`}
              aria-label={`Jump to ${slotLabels[slot]}${status === "playing" ? " (playing)" : ""}`}
              title={slotLabels[slot]}
            >
              <span className="text-base">{getSlotIcon(slot, status)}</span>
              <span className="text-xs font-medium">{slotLabels[slot]}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
