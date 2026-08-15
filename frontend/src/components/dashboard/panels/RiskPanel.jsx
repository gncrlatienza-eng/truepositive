import { theme } from "../../../styles/theme";
import { RadialGauge } from "../../charts/RadialGauge";
import { BigStat, Section } from "./PanelPrimitives";

const LEVEL_COLORS = {
  High: theme.color.severity.critical,
  Elevated: theme.color.severity.high,
  Moderate: theme.color.severity.medium,
  Low: theme.color.severity.ok,
};

// Same bands the text line below states — 40+ is "High" with no ceiling, so
// the gauge's scale caps at 60 (needle pins there for anything past it).
const RISK_BANDS = [
  { max: 8, color: theme.color.severity.ok, label: "Low" },
  { max: 20, color: theme.color.severity.medium, label: "Moderate" },
  { max: 40, color: theme.color.severity.high, label: "Elevated" },
  { max: 60, color: theme.color.severity.critical, label: "High" },
];

export default function RiskPanel({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <RadialGauge value={data.score} bands={RISK_BANDS} size={110} thickness={12} />
        <BigStat value={data.score} label={data.level} color={LEVEL_COLORS[data.level]} />
      </div>
      <div style={{ fontSize: 13, color: theme.color.textFaint, lineHeight: 1.5 }}>
        Weighted score: Critical ×4, High ×2, Medium ×1, OK ×0.3 — over currently active (non-resolved) alerts. Bands:
        0–8 Low, 8–20 Moderate, 20–40 Elevated, 40+ High.
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
