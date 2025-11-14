import { useCallback, useRef } from "react";

interface UseTouchGesturesProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onDoubleTap?: () => void;
  onDoubleTapLeft?: () => void;
  onDoubleTapRight?: () => void;
  onLongPress?: () => void;
  swipeThreshold?: number; // pixels
  longPressDuration?: number; // milliseconds
}

export function useTouchGestures({
  onSwipeLeft,
  onSwipeRight,
  onDoubleTap,
  onDoubleTapLeft,
  onDoubleTapRight,
  onLongPress,
  swipeThreshold = 48,
  longPressDuration = 500,
}: UseTouchGesturesProps) {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      const now = Date.now();
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now };

      // Long press detection
      if (onLongPress) {
        longPressTimerRef.current = setTimeout(() => {
          onLongPress();
        }, longPressDuration);
      }
    },
    [onLongPress, longPressDuration]
  );

  const handleTouchMove = useCallback(() => {
    // Cancel long press if user moves
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // Cancel long press
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (!touchStartRef.current) return;

      const touch = e.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;
      const now = Date.now();

      // Swipe detection (horizontal movement > threshold, minimal vertical movement)
      if (Math.abs(deltaX) > swipeThreshold && Math.abs(deltaY) < Math.abs(deltaX) * 0.5 && deltaTime < 300) {
        if (deltaX > 0 && onSwipeRight) {
          onSwipeRight();
        } else if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft();
        }
        touchStartRef.current = null;
        return;
      }

      // Double tap detection
      const timeSinceLastTap = now - lastTapRef.current;
      const tapDuration = deltaTime;
      const isQuickTap = tapDuration < 300;
      const isDoubleTap = timeSinceLastTap < 300 && isQuickTap;

      if (isQuickTap) {
        if (isDoubleTap) {
          // Determine tap position relative to container
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const tapX = touch.clientX - rect.left;
            const containerWidth = rect.width;
            const leftThird = containerWidth / 3;
            const rightThird = (containerWidth * 2) / 3;

            if (tapX < leftThird && onDoubleTapLeft) {
              onDoubleTapLeft();
            } else if (tapX > rightThird && onDoubleTapRight) {
              onDoubleTapRight();
            } else if (onDoubleTap) {
              // Center third
              onDoubleTap();
            }
          } else if (onDoubleTap) {
            onDoubleTap();
          }
          lastTapRef.current = 0; // Reset to prevent triple tap
        } else {
          lastTapRef.current = now;
        }
      }

      touchStartRef.current = null;
    },
    [onSwipeLeft, onSwipeRight, onDoubleTap, onDoubleTapLeft, onDoubleTapRight, swipeThreshold]
  );

  const getTouchHandlers = useCallback(() => {
    return {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      ref: containerRef,
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { getTouchHandlers };
}
