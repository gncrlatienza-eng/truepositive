import { theme } from "../../styles/theme";

// Horizontal pct-width bar for severity breakdown / top sources / top alert
// type rows.
export function ProgressBar({ pct, color = theme.color.accent, height = 8 }) {
  return (
    <div style={{ height, background: theme.color.background, borderRadius: height / 2, overflow: "hidden" }}>
      <div
        style={{
          height,
          borderRadius: height / 2,
          background: color,
          width: `${Math.min(100, Math.max(0, pct))}%`,
        }}
      />
    </div>
  );
}
