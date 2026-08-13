import { theme } from "../../styles/theme";

// Inline div-bar sparkline — no charting library in this project, matches
// the mockup's own bar-sparkline approach (flex row of height-scaled divs).
export function Sparkline({ values, color = theme.color.accent, height = 26 }) {
  if (!values || values.length === 0) {
    return <div style={{ height }} />;
  }
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            borderRadius: 1,
            background: color,
            opacity: v === 0 ? 0.15 : 0.9,
            height: `${Math.max(4, (v / max) * 100)}%`,
          }}
        />
      ))}
    </div>
  );
}
