import { useCallback, useRef, useState } from "react";

// Pure-CSS "transition-delay only on :hover" turned out to be flaky under
// repeated hover/unhover cycles (confirmed via repeated automated hover
// testing — a single hold-and-wait test passed reliably, but hover → move
// away → hover again started showing the glow instantly, non-deterministically,
// which matches real usage: nobody hovers a card exactly once and holds
// still). A JS setTimeout is deterministic regardless of how many times the
// pointer has entered/left before, so it replaces that CSS-only technique.
export function useDelayedHover(delayMs = 500) {
  const [hovered, setHovered] = useState(false);
  const timer = useRef(null);

  const onMouseEnter = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(true), delayMs);
  }, [delayMs]);

  const onMouseLeave = useCallback(() => {
    clearTimeout(timer.current);
    setHovered(false);
  }, []);

  return { hovered, onMouseEnter, onMouseLeave };
}
