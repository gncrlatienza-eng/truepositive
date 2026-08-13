import { theme } from "../../../styles/theme";
import { BigStat, Section } from "./PanelPrimitives";

const LEVEL_COLORS = {
  High: theme.color.severity.critical,
  Elevated: theme.color.severity.high,
  Moderate: theme.color.severity.medium,
  Low: theme.color.severity.ok,
};

export default function RiskPanel({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <BigStat value={data.score} label={data.level} color={LEVEL_COLORS[data.level]} />
      <div style={{ fontSize: 13, color: theme.color.textFaint, lineHeight: 1.5 }}>
        Weighted score: Critical ×4, High ×2, Medium ×1, OK ×0.3 — over currently active (non-resolved) alerts.
      </div>
      <Section title="Breakdown">
        {data.breakdown.map((row) => (
          <div
            key={row.severity}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 14,
              padding: "6px 0",
              borderBottom: `1px solid ${theme.color.border}`,
              textTransform: "capitalize",
            }}
          >
            <span>{row.severity}</span>
            <span style={{ color: theme.color.textMuted }}>
              {row.count} × {row.weight} = {row.contribution}
            </span>
          </div>
        ))}
      </Section>
      {data.top_rule && (
        <Section title="Top contributing rule">
          <div style={{ fontSize: 14 }}>
            {data.top_rule.label} — {data.top_rule.count} alerts
          </div>
        </Section>
      )}
    </div>
  );
}
