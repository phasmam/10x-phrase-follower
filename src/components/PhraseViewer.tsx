import React, { useRef, useCallback, useMemo } from "react";
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

  // Helper function to find formatting ranges in text
  const findFormattingRanges = useMemo(() => {
    return (text: string): { start: number; end: number; type: "bold" | "italic" }[] => {
      const ranges: { start: number; end: number; type: "bold" | "italic" }[] = [];

      // Find bold ranges (**text**)
      const boldRegex = /\*\*([^*]+?)\*\*/g;
      let match;
      while ((match = boldRegex.exec(text)) !== null) {
        ranges.push({
          start: match.index,
          end: match.index + match[0].length,
          type: "bold",
        });
      }

      // Find italic ranges (__text__)
      const italicRegex = /__([^_]+?)__/g;
      while ((match = italicRegex.exec(text)) !== null) {
        ranges.push({
          start: match.index,
          end: match.index + match[0].length,
          type: "italic",
        });
      }

      return ranges.sort((a, b) => a.start - b.start);
    };
  }, []);

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

    // Get the original text for this language
    const originalText = language === "en" ? phrase.en_text : phrase.pl_text;
    const formattingRanges = findFormattingRanges(originalText);

    return (
      <div className="flex flex-wrap items-center gap-1 md:gap-1.5">
        {tokens.map((token, index) => {
          const isTokenActive = isHighlighted && isActive;

          // Check if token overlaps with any formatting range
          // Token positions are character indices in the original text
          const tokenStart = token.charStart;
          const tokenEnd = token.charEnd;

          // Find which formatting applies to this token
          // We need to account for the fact that formatting markers (**, __) are in the text
          // but tokens might not include them. So we check if the token's text content
          // falls within a formatting range.
          let isBold = false;
          let isItalic = false;

          for (const range of formattingRanges) {
            // Check if token overlaps with formatting range
            // We need to account for the markers themselves (2 chars for **, 2 for __)
            if (range.type === "bold") {
              // Bold range: **text**, so actual content starts at range.start + 2, ends at range.end - 2
              const contentStart = range.start + 2;
              const contentEnd = range.end - 2;
              if (tokenStart >= contentStart && tokenEnd <= contentEnd) {
                isBold = true;
              } else if (tokenStart < contentEnd && tokenEnd > contentStart) {
                // Partial overlap
                isBold = true;
              }
            } else if (range.type === "italic") {
              // Italic range: __text__, so actual content starts at range.start + 2, ends at range.end - 2
              const contentStart = range.start + 2;
              const contentEnd = range.end - 2;
              if (tokenStart >= contentStart && tokenEnd <= contentEnd) {
                isItalic = true;
              } else if (tokenStart < contentEnd && tokenEnd > contentStart) {
                // Partial overlap
                isItalic = true;
              }
            }
          }

          // Clean token text (remove formatting markers if present)
          let tokenText = token.text;
          tokenText = tokenText.replace(/\*\*/g, "").replace(/__/g, "");

          return (
            <button
              key={index}
              onClick={() => onSeekToToken(index, language)}
              className={`
                rounded-md px-2 py-1 text-base md:text-lg leading-5 md:leading-6
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
              aria-label={`Seek to word: ${tokenText}`}
            >
              {isBold && isItalic ? (
                <strong>
                  <em>{tokenText}</em>
                </strong>
              ) : isBold ? (
                <strong>{tokenText}</strong>
              ) : isItalic ? (
                <em>{tokenText}</em>
              ) : (
                tokenText
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const renderLanguageBadge = (language: "en" | "pl", label: string) => {
    const isActive = activeLang === language;
    return (
      <div className="flex items-center gap-2 mb-1">
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
      <div className="min-h-[64px] md:min-h-[72px] mb-2 md:mb-3">
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
