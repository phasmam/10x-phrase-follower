import React, { useEffect } from 'react';

interface KeyboardShortcutsHandlerProps {
  onPlayPause: () => void;
  onStop: () => void;
  onRestart: () => void;
  onSeekSmall: (direction: 'left' | 'right') => void;
  onSeekLarge: (direction: 'left' | 'right') => void;
  onPrevPhrase: () => void;
  onNextPhrase: () => void;
}

export default function KeyboardShortcutsHandler({
  onPlayPause,
  onStop,
  onRestart,
  onSeekSmall,
  onSeekLarge,
  onPrevPhrase,
  onNextPhrase
}: KeyboardShortcutsHandlerProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        return;
      }

      // Prevent default for our shortcuts
      const preventDefault = () => event.preventDefault();

      switch (event.key.toLowerCase()) {
        case ' ':
        case 'k':
          preventDefault();
          onPlayPause();
          break;
        
        case 's':
          preventDefault();
          onStop();
          break;
        
        case 'r':
          preventDefault();
          onRestart();
          break;
        
        case 'arrowleft':
          preventDefault();
          if (event.shiftKey) {
            onSeekLarge('left');
          } else {
            onSeekSmall('left');
          }
          break;
        
        case 'arrowright':
          preventDefault();
          if (event.shiftKey) {
            onSeekLarge('right');
          } else {
            onSeekSmall('right');
          }
          break;
        
        case 'p':
          preventDefault();
          onPrevPhrase();
          break;
        
        case 'n':
          preventDefault();
          onNextPhrase();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onPlayPause, onStop, onRestart, onSeekSmall, onSeekLarge, onPrevPhrase, onNextPhrase]);

  return null; // This component doesn't render anything
}
