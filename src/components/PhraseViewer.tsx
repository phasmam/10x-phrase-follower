import React from "react";
import type { PhraseVM } from "../types";

interface PhraseViewerProps {
  phrase?: PhraseVM;
  activeLang: "en" | "pl" | null;
  highlight: boolean;
  onSeekToToken: (tokenIndex: number) => void;
}

export default function PhraseViewer({ phrase, activeLang, highlight, onSeekToToken }: PhraseViewerProps) {
  if (!phrase) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center">
        <p className="text-gray-400">No phrase selected</p>
      </div>
    );
  }

  const renderTokens = (tokens: PhraseVM["tokens"]["en"] | PhraseVM["tokens"]["pl"], language: "en" | "pl") => {
    if (!tokens || tokens.length === 0) {
      return <span className="text-gray-500 italic">No tokens available</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {tokens.map((token, index) => {
          const isActive = activeLang === language;
          const isHighlighted = highlight && isActive;

          return (
            <button
              key={index}
              onClick={() => onSeekToToken(index)}
              className={`
                px-2 py-1 rounded transition-all duration-200
                ${
                  isHighlighted
                    ? "bg-yellow-400 text-black font-medium"
                    : isActive
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }
                ${isActive ? "cursor-pointer" : "cursor-default"}
              `}
              disabled={!isActive}
            >
              {token.text}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* English text */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2 uppercase tracking-wide">
            <span
              className={`w-2.5 h-2.5 rounded-full ${activeLang === "en" ? "bg-blue-500 animate-pulse" : "bg-blue-500/50"}`}
            ></span>
            English
            {activeLang === "en" && (
              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">Active</span>
            )}
          </h3>
          <div className="text-xl leading-relaxed min-h-[60px]">{renderTokens(phrase.tokens.en, "en")}</div>
        </div>

        {/* Polish text */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2 uppercase tracking-wide">
            <span
              className={`w-2.5 h-2.5 rounded-full ${activeLang === "pl" ? "bg-green-500 animate-pulse" : "bg-green-500/50"}`}
            ></span>
            Polish
            {activeLang === "pl" && (
              <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full font-medium">Active</span>
            )}
          </h3>
          <div className="text-xl leading-relaxed min-h-[60px]">{renderTokens(phrase.tokens.pl, "pl")}</div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 pt-6 border-t border-gray-700">
        <p className="text-xs text-gray-400">
          <strong className="text-gray-300">Click-to-seek:</strong> Click on any word in the active language to jump to
          that position.
        </p>
      </div>
    </div>
  );
}
