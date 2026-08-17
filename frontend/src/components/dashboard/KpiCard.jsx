import { useEffect, useRef, useState } from "react";
import { theme } from "../../styles/theme";
import { Sparkline } from "../charts/Sparkline";
import { InfoTooltip } from "../common/InfoTooltip";
import { useDelayedHover } from "../../hooks/useDelayedHover";

// Plain-English explanations for people new to what these numbers mean —
// frontend-only content keyed on the same kpi.key the backend already sends
// (dashboard_service.py's KpiCard list), no schema change needed.
const KPI_HELP = {
  events: "Total log events ingested from all your sources in this time window.",
  alerts: "Alerts that haven't been resolved yet — open, acknowledged, or escalated.",
  critical: "Active alerts at the highest severity. Start here — these deserve attention first.",
  ingestion: "How many events arrived in the last 60 seconds — a live check that logs are still flowing in.",
  risk: "A weighted score over active alerts (Critical ×4, High ×2, Medium ×1, OK ×0.3). Higher means more, or more severe, unresolved alerts.",
};

// `delta` is a pct change vs. the previous equal-length period (see
// dashboard_service.py). Whether "up" is good or bad depends on the metric —
// more events isn't inherently bad, more open/critical alerts or a rising
// risk score is — so only these three get red/green treatment.
const BAD_WHEN_RISING = new Set(["alerts", "critical", "risk"]);

function deltaColor(kpi) {
  if (kpi.delta == null || !BAD_WHEN_RISING.has(kpi.key)) return theme.color.textMuted;
  if (kpi.delta > 0) return theme.color.severity.critical;
  if (kpi.delta < 0) return theme.color.severity.ok;
  return theme.color.textMuted;
}

export function KpiCard({ kpi, onClick }) {
  const prevValue = useRef(kpi.value);
  const [flash, setFlash] = useState(false);
  const { hovered, onMouseEnter, onMouseLeave } = useDelayedHover();

  useEffect(() => {
    if (prevValue.current !== kpi.value) {
      prevValue.current = kpi.value;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [kpi.value]);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={["tp-kpi-card", flash && "tp-kpi-flash", hovered && "tp-hover-glow"].filter(Boolean).join(" ")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        background: theme.color.surface,
        borderRadius: theme.radius.lg,
        padding: "24px 26px",
        minWidth: 0,
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 13, color: theme.color.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {kpi.label}
        {KPI_HELP[kpi.key] && <InfoTooltip text={KPI_HELP[kpi.key]} />}
      </span>
      <span
        style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.01em", color: kpi.delta_color || theme.color.text }}
      >
        {kpi.value}
      </span>
      {/* Fixed-height placeholders, not conditional rendering — a KPI with
          no recent activity (e.g. zero critical alerts created in this
          window) legitimately has no delta/sparkline data, but the 5 cards
          sit in one flex row and each card sizes to its own content, so
          letting one skip these rows made it visibly shorter than its
          siblings instead of just showing an empty state. */}
      <span style={{ fontSize: 12, fontWeight: 600, color: deltaColor(kpi), minHeight: 15 }}>
        {kpi.delta != null
          ? `${kpi.delta > 0 ? "▲" : kpi.delta < 0 ? "▼" : "•"} ${Math.abs(kpi.delta)}% vs previous period`
          : " "}
      </span>
      {/* width:"100%" + minWidth:0 — without both, Chart.js's ResizeObserver
          can't shrink the canvas below its HTML default (300px), which is
          wider than a KPI card: the canvas silently overflows the card and
          visually collides with the next card's own tick labels. */}
      <div style={{ minHeight: 64, width: "100%", minWidth: 0, display: "flex", alignItems: "flex-end" }}>
        {kpi.sparkline?.length > 0 && <Sparkline values={kpi.sparkline} height={64} />}
      </div>
    </div>
  );
}
