import { theme } from "../../styles/theme";
import { Sparkline } from "../charts/Sparkline";

export function KpiCard({ kpi, onClick }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={{
        background: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        padding: "20px 22px",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 13, color: theme.color.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {kpi.label}
      </span>
      <span
        style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em", color: kpi.delta_color || theme.color.text }}
      >
        {kpi.value}
      </span>
      {kpi.sparkline?.length > 0 && <Sparkline values={kpi.sparkline} />}
    </div>
  );
}
