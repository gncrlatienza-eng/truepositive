import { useEffect, useRef, useState } from "react";
import { theme } from "../../styles/theme";

// Shared sliding-highlight segmented control -- originally built inline in
// ReportsPage.jsx for its tab bar and type selector, now shared since
// SettingsPage.jsx's tab bar is a third caller. The indicator carries
// .tp-glass (the same "active surface" look pills used to get individually
// via className) so it reads as the same design language, just now able to
// glide between options instead of instantly swapping.
export function PillSelector({ options, activeId, onSelect }) {
  const containerRef = useRef(null);
  const [indicator, setIndicator] = useState(null);

  // Tracks top/height too, and re-measures on resize: when the pills wrap
  // onto a second row (narrow window), the old left-only, full-height
  // indicator stretched across both rows into a tall blob behind one pill.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    function measure() {
      const activeEl = container.querySelector(`[data-pill-id="${activeId}"]`);
      if (!activeEl) return;
      setIndicator({
        left: activeEl.offsetLeft,
        top: activeEl.offsetTop,
        width: activeEl.offsetWidth,
        height: activeEl.offsetHeight,
      });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [activeId, options]);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", gap: 6, flexWrap: "wrap" }}>
      {indicator && (
        <span
          className="tp-glass tp-pill-indicator"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: indicator.width,
            height: indicator.height,
            transform: `translate(${indicator.left}px, ${indicator.top}px)`,
            borderRadius: 999,
          }}
        />
      )}
      {options.map((opt) => (
        <span
          key={opt.id}
          data-pill-id={opt.id}
          onClick={() => onSelect(opt.id)}
          role="button"
          tabIndex={0}
          style={{
            position: "relative",
            zIndex: 1,
            fontSize: 14,
            fontWeight: 600,
            padding: "7px 16px",
            borderRadius: 999,
            cursor: "pointer",
            color: activeId === opt.id ? theme.color.text : theme.color.textMuted,
            border: activeId === opt.id ? "1px solid transparent" : `1px solid ${theme.color.border}`,
          }}
        >
          {opt.label}
        </span>
      ))}
    </div>
  );
}
