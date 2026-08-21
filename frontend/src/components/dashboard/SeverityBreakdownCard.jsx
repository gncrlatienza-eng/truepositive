import { useEffect, useRef, useState } from "react";
import { theme } from "../../styles/theme";
import { Card } from "../common/Card";
import { DonutChart } from "../charts/DonutChart";
import { severityLabel } from "../../utils/severity";

// A small pulsing dot in the card header — visible proof this chart is on
// the same 30s live-refresh cycle as the KPI row above it, not a one-time
// snapshot.
function LiveDot() {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: theme.color.textFaint }}>
      <span
        className="tp-pulse-dot"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: theme.color.accent,
          "--tp-pulse-color": theme.color.accent,
        }}
      />
      LIVE
    </span>
  );
}

// Percent-per-severity used to live in a separate list of progress bars next
// to the donut, duplicating exactly what the donut already showed. Counts
// and percentages now live *on* the chart itself — an on-arc % label for any
// segment big enough to read, an exact count in its hover tooltip, and the
// total in the center — so this card is just the donut plus a minimal
// clickable color key, not a chart plus a redundant second breakdown.
export function SeverityBreakdownCard({ bars, onSelect }) {
  // Display label is remapped client-side rather than trusting the
  // backend's own `label` field — keeps the "ok" → "Info" fix purely a
  // presentation concern instead of a backend/API change.
  const segments = bars.map((b) => ({
    value: b.count,
    color: theme.color.severity[b.severity],
    label: severityLabel(b.severity),
    key: b.severity,
  }));

  const signature = bars.map((b) => `${b.severity}:${b.count}`).join("|");
  const prevSignature = useRef(signature);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prevSignature.current !== signature) {
      prevSignature.current = signature;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [signature]);

  return (
    <Card
      title="Severity breakdown"
      action={<LiveDot />}
      className={flash ? "tp-kpi-flash" : ""}
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
      bodyStyle={{ flex: 1, display: "flex", alignItems: "center" }}
    >
      <div
        style={{
          padding: "20px 20px 16px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 24,
          width: "100%",
        }}
      >
        <DonutChart
          segments={segments}
          size={180}
          thickness={20}
          centerLabel="active"
          onSelect={onSelect}
          legendContainerID="severity-legend"
        />
        {/* Bottom-right-anchored key: flex-end on the row aligns it with the
            donut's own base, so it reads as sitting in the chart's corner
            rather than as a separate centered block underneath it. Content
            is owned entirely by DonutChart's htmlLegendPlugin (a real
            checkbox-per-row <ul>, ported from Pi-hole's own dashboard) —
            this is just the mount point. */}
        <div id="severity-legend" className="tp-chart-legend" />
      </div>
    </Card>
  );
}
