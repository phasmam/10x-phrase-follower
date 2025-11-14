import React, { useRef, useCallback } from "react";
import type { PhraseVM } from "../types";
import { useTouchGestures } from "../lib/hooks/useTouchGestures";

interface PhraseViewerProps {
  phrase?: PhraseVM;
  activeLang: "en" | "pl" | null;
  highlight: boolean;
  onSeekToToken: (tokenIndex: number, language: "en" | "pl") => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onDoubleTap?: () => void;
  onDoubleTapLeft?: () => void;
  onDoubleTapRight?: () => void;
}

export default function PhraseViewer({
  phrase,
  activeLang,
  highlight,
  onSeekToToken,
  onSwipeLeft,
  onSwipeRight,
  onDoubleTap,
  onDoubleTapLeft,
  onDoubleTapRight,
}: PhraseViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { getTouchHandlers } = useTouchGestures({
    onSwipeLeft,
    onSwipeRight,
    onDoubleTap,
    onDoubleTapLeft,
    onDoubleTapRight,
  });

  const touchHandlers = getTouchHandlers();

  // Merge refs
  const mergedRef = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el;
      if (touchHandlers.ref) {
        touchHandlers.ref.current = el;
      }
    },
    [touchHandlers.ref]
  );

  if (!phrase) {
    return (
      <div className="h-[clamp(240px,32vh,360px)] rounded-lg border bg-card px-4 py-3 flex items-center justify-center">
        <p className="text-muted-foreground">No phrase selected</p>
      </div>
    );
  }

  const renderTokens = (tokens: PhraseVM["tokens"]["en"] | PhraseVM["tokens"]["pl"], language: "en" | "pl") => {
    if (!tokens || tokens.length === 0) {
      return <span className="text-muted-foreground italic">No tokens available</span>;
    }

    const isActive = activeLang === language;
    const isHighlighted = highlight && isActive;

    return (
      <div className="flex flex-wrap items-center gap-2 md:gap-2.5">
        {tokens.map((token, index) => {
          const isTokenActive = isHighlighted && isActive;

          return (
            <button
              key={index}
              onClick={() => onSeekToToken(index, language)}
              className={`
                rounded-md px-2.5 py-1.5 text-base md:text-lg leading-7
                transition-all duration-200
                ${
                  isTokenActive
                    ? "bg-yellow-400/25 ring-1 ring-yellow-400/60 text-foreground"
                    : isActive
                      ? "bg-muted text-foreground hover:bg-muted/80 cursor-pointer"
                      : "text-muted-foreground cursor-default"
                }
              `}
              disabled={!isActive}
              aria-label={`Seek to word: ${token.text}`}
            >
              {token.text}
            </button>
          );
        })}
      </div>
    );
  };

  const renderLanguageBadge = (language: "en" | "pl", label: string) => {
    const isActive = activeLang === language;
    return (
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            isActive
              ? language === "en"
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                : "bg-green-500/20 text-green-300 border border-green-500/40"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {label}
        </span>
        {isActive && <span className="text-xs text-muted-foreground animate-pulse">●</span>}
      </div>
    );
  };

  return (
    <div
      ref={mergedRef}
      onTouchStart={touchHandlers.onTouchStart}
      onTouchMove={touchHandlers.onTouchMove}
      onTouchEnd={touchHandlers.onTouchEnd}
      className="h-auto md:h-[clamp(240px,32vh,360px)] overflow-visible md:overflow-y-auto rounded-lg border bg-card px-4 py-3"
    >
      {/* English text - on top */}
      <div className="min-h-[64px] md:min-h-[72px] mb-4">
        {renderLanguageBadge("en", "EN")}
        {renderTokens(phrase.tokens.en, "en")}
      </div>

      {/* Polish text - below */}
      <div className="min-h-[64px] md:min-h-[72px]">
        {renderLanguageBadge("pl", "PL")}
        {renderTokens(phrase.tokens.pl, "pl")}
      </div>
    </div>
  );
}
