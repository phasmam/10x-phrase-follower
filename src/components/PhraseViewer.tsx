import React from 'react';
import type { PhraseVM } from '../types';

interface PhraseViewerProps {
  phrase?: PhraseVM;
  activeLang: 'en' | 'pl' | null;
  highlight: boolean;
  onSeekToToken: (tokenIndex: number) => void;
}

export default function PhraseViewer({
  phrase,
  activeLang,
  highlight,
  onSeekToToken
}: PhraseViewerProps) {
  if (!phrase) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 text-center">
        <p className="text-gray-400">No phrase selected</p>
      </div>
    );
  }

  const renderTokens = (tokens: PhraseVM['tokens']['en'] | PhraseVM['tokens']['pl'], language: 'en' | 'pl') => {
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
                ${isHighlighted 
                  ? 'bg-yellow-400 text-black font-medium' 
                  : isActive 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }
                ${isActive ? 'cursor-pointer' : 'cursor-default'}
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
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* English text */}
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            English
            {activeLang === 'en' && (
              <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Active</span>
            )}
          </h3>
          <div className="text-lg leading-relaxed">
            {renderTokens(phrase.tokens.en, 'en')}
          </div>
        </div>

        {/* Polish text */}
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            Polish
            {activeLang === 'pl' && (
              <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">Active</span>
            )}
          </h3>
          <div className="text-lg leading-relaxed">
            {renderTokens(phrase.tokens.pl, 'pl')}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-gray-700 rounded-lg">
        <p className="text-sm text-gray-300">
          <strong>Click-to-seek:</strong> Click on any word in the active language to jump to that position. 
          Click the first word to start playback from the beginning.
        </p>
      </div>
    </div>
  );
}
