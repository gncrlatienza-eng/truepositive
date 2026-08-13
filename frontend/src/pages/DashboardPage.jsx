import { useEffect, useState } from "react";
import { theme } from "../styles/theme";
import { getDashboardSummary } from "../api/dashboard";
import { StatusBanner } from "../components/dashboard/StatusBanner";
import { KpiRow } from "../components/dashboard/KpiRow";
import { SeverityBreakdownCard } from "../components/dashboard/SeverityBreakdownCard";
import { IngestionSummaryCard } from "../components/dashboard/IngestionSummaryCard";
import { TopAlertTypesCard } from "../components/dashboard/TopAlertTypesCard";
import { AlertQueueCard } from "../components/dashboard/AlertQueueCard";
import { TopSourcesCard } from "../components/dashboard/TopSourcesCard";
import MetricPanel from "../components/dashboard/MetricPanel";

const WINDOWS = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

// KPI keys map straight onto panel types except "critical", which already
// has its own dedicated Critical panel with SLA context beyond the KPI's
// raw count.
const KPI_PANEL_TYPES = {
  events: "events",
  alerts: "alerts",
  critical: "critical",
  ingestion: "ingestion",
  risk: "risk",
};

export default function DashboardPage() {
  const [timeWindow, setTimeWindow] = useState("24h");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openPanel, setOpenPanel] = useState(null);

  useEffect(() => {
    setLoading(true);
    getDashboardSummary(timeWindow)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [timeWindow]);

  if (loading && !summary) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: theme.color.textFaint,
        }}
      >
        Loading dashboard…
      </div>
    );
  }
  if (!summary) return null;

  return (
    <div style={{ animation: "tp-fade 200ms ease-out", flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "12px 24px",
            padding: "28px 28px 20px",
            borderBottom: `1px solid ${theme.color.border}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: theme.color.textMuted,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                marginBottom: 9,
              }}
            >
              Overview
            </div>
            <h1 style={{ fontSize: 34, letterSpacing: "-0.025em" }}>Detection posture</h1>
          </div>
          <div
            style={{
              display: "flex",
              border: `1px solid ${theme.color.border}`,
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            {WINDOWS.map((w) => (
              <span
                key={w.key}
                onClick={() => setTimeWindow(w.key)}
                role="button"
                tabIndex={0}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "7px 14px",
                  cursor: "pointer",
                  background: timeWindow === w.key ? theme.color.surface : "transparent",
                  color: timeWindow === w.key ? theme.color.accent : theme.color.textMuted,
                  borderRight: `1px solid ${theme.color.border}`,
                }}
              >
                {w.label}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            padding: "20px 28px 24px",
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            boxSizing: "border-box",
          }}
        >
          <StatusBanner banner={summary.banner} />

          <KpiRow kpis={summary.kpis} onSelect={(key) => setOpenPanel({ type: KPI_PANEL_TYPES[key] || key })} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <IngestionSummaryCard ingest={summary.ingest} onOpen={() => setOpenPanel({ type: "ingestion" })} />
            <SeverityBreakdownCard
              bars={summary.severity_breakdown}
              onSelect={(severity) => setOpenPanel({ type: "severity", key: severity })}
            />
            <TopAlertTypesCard
              rows={summary.top_alert_types}
              onSelect={(ruleId) => ruleId && setOpenPanel({ type: "rule", key: ruleId })}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))", gap: 16 }}>
            <AlertQueueCard items={summary.alert_queue} />
            <TopSourcesCard rows={summary.top_sources} />
          </div>
        </div>
      </div>

      <MetricPanel panel={openPanel} timeWindow={timeWindow} onClose={() => setOpenPanel(null)} />
    </div>
  );
}
