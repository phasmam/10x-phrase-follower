import React from "react";
import { Button } from "./ui/button";
import type { Segment, VoiceSlot } from "../types";

interface SegmentSequenceBarProps {
  sequenceForPhrase: Segment[];
  activeSlot?: VoiceSlot | null;
  onJumpToSlot: (slot: VoiceSlot) => void;
}

const slotOrder: VoiceSlot[] = ["EN1", "EN2", "EN3", "PL"];
const slotLabels = {
  EN1: "EN 1",
  EN2: "EN 2",
  EN3: "EN 3",
  PL: "PL",
};

export default function SegmentSequenceBar({ sequenceForPhrase, activeSlot, onJumpToSlot }: SegmentSequenceBarProps) {
  const getSlotStatus = (slot: VoiceSlot) => {
    const segment = sequenceForPhrase.find((s) => s.slot === slot);
    if (!segment) return "missing";
    if (activeSlot === slot) return "playing";
    return "available";
  };

  const getSlotIcon = (slot: VoiceSlot) => {
    const status = getSlotStatus(slot);
    switch (status) {
      case "playing":
        return "▶️";
      case "available":
        return "⏸️";
      case "missing":
        return "❌";
      default:
        return "⏸️";
    }
  };

  const getSlotColor = (slot: VoiceSlot) => {
    const status = getSlotStatus(slot);
    switch (status) {
      case "playing":
        return "bg-blue-600 hover:bg-blue-700 text-white";
      case "available":
        return "bg-gray-600 hover:bg-gray-700 text-white";
      case "missing":
        return "bg-gray-800 text-gray-500 cursor-not-allowed";
      default:
        return "bg-gray-600 hover:bg-gray-700 text-white";
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Playback Sequence</h3>
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
              className={`flex flex-col items-center gap-1 min-w-[80px] h-16 ${
                isClickable ? getSlotColor(slot) : "border-gray-700 text-gray-500 cursor-not-allowed"
              }`}
            >
              <span className="text-lg">{getSlotIcon(slot)}</span>
              <span className="text-xs font-medium">{slotLabels[slot]}</span>
              <span className="text-xs opacity-75">
                {status === "missing" ? "Missing" : status === "playing" ? "Playing" : "Ready"}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
