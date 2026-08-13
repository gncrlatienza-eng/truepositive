import { theme } from "../../styles/theme";

// 24-hour histogram for the ingestion/pattern/events drill-in panels.
// `bars`: [{ hour_label, count }] — real backend buckets, not fabricated.
export function HourBars({ bars, color = theme.color.accent, height = 60 }) {
  if (!bars || bars.length === 0) {
    return <div style={{ fontSize: 13, color: theme.color.textFaint, height }}>No events in this window yet.</div>;
  }
  const max = Math.max(...bars.map((b) => b.count), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
      {bars.map((b, i) => (
        <div
          key={`${b.hour_label}-${i}`}
          title={`${b.hour_label} · ${b.count} events`}
          style={{
            flex: 1,
            minWidth: 3,
            borderRadius: 2,
            background: color,
            opacity: b.count === 0 ? 0.15 : 0.85,
            height: `${Math.max(4, (b.count / max) * 100)}%`,
          }}
        />
      ))}
    </div>
  );
}
