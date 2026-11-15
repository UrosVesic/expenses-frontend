import { useEffect, useRef, useState } from "react";

const THRESHOLD = 70; // px of (damped) pull needed to trigger
const MAX_PULL = 110;

// Pull-to-refresh for touch devices. The installed PWA (display: standalone) has no
// browser pull-to-refresh, and body has overscroll-behavior-y: none, so we do it ourselves.
// Starts only when the page is scrolled to the top and the touch isn't inside a dialog.
// Returns the current pull distance (0 when idle) for the indicator.
export function usePullToRefresh(onRefresh, { disabled = false } = {}) {
  const [pull, setPull] = useState(0);
  const startY = useRef(null);
  const pullRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    if (disabled) return;

    const set = (v) => {
      pullRef.current = v;
      setPull(v);
    };

    const onStart = (e) => {
      if (e.touches.length !== 1 || window.scrollY > 0) return;
      if (e.target.closest?.('[role="dialog"], [aria-modal="true"]')) return;
      startY.current = e.touches[0].clientY;
    };

    const onMove = (e) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current) set(0);
        return;
      }
      set(Math.min(MAX_PULL, dy * 0.5)); // damped so it feels elastic
    };

    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pullRef.current >= THRESHOLD) onRefreshRef.current();
      set(0);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [disabled]);

  return { pull, ready: pull >= THRESHOLD };
}
