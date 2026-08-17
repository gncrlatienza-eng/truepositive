import { useEffect, useState } from "react";
import { theme } from "../styles/theme";
import { getDashboardSummary } from "../api/dashboard";
import { SetupLockOverlay } from "../components/common/SetupLockOverlay";
import { CriticalActionStrip } from "../components/dashboard/CriticalActionStrip";
import { StatusBanner } from "../components/dashboard/StatusBanner";
import { KpiRow } from "../components/dashboard/KpiRow";
import { SeverityBreakdownCard } from "../components/dashboard/SeverityBreakdownCard";
import { EventsOverTimeCard } from "../components/dashboard/EventsOverTimeCard";
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

// Per explicit user request: fast enough that the charts visibly redraw
// instead of only ever changing on a page reload. Worth knowing what this
// actually buys, honestly: the agent itself only ships a new batch every
// 30s (agent/tp_agent.py's own heartbeat/collection cadence), so genuinely
// new data still only ever lands roughly every 30s regardless of how often
// this polls — polling faster than that shortens the *worst-case delay*
// before a new batch shows up (up to ~2s instead of up to ~30s), it doesn't
// manufacture motion between real batches. The real cost is real: this
// endpoint runs ~15 separate GROUP BY/COUNT queries per call (see
// dashboard_service.get_dashboard_summary), so this is 15x the query
// volume of the previous 30s interval, per open Overview tab. Fine at this
// project's current scale; worth revisiting (e.g. a cheaper summary
// endpoint, or server-push instead of polling) if concurrent open
// dashboards ever becomes large.
const REFRESH_INTERVAL_MS = 2_000;

export default function DashboardPage() {
  const [timeWindow, setTimeWindow] = useState("24h");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openPanel, setOpenPanel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDashboardSummary(timeWindow)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Silent background refresh — no loading spinner, no flash beyond the
    // per-KPI update highlight (see KpiCard's flash-on-change).
    const interval = setInterval(() => {
      getDashboardSummary(timeWindow)
        .then((data) => {
          if (!cancelled) setSummary(data);
        })
        .catch(() => {});
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [timeWindow]);

  if (loading && !summary) {
    return (
      <SetupLockOverlay>
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
      </SetupLockOverlay>
    );
  }
  if (!summary) return null;

  return (
    <SetupLockOverlay>
      {({ agentOfflineOnly }) => (
        <div
          style={{ animation: "tp-fade 200ms ease-out", flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}
        >
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
              {/* Was one joined segmented-tab strip (shared outer border,
                  overflow:hidden, inner borderRight separators) with the
                  active segment just re-colored — .tp-glass's own border/
                  shadow doesn't sit cleanly on one segment of a joined
                  group (no radius of its own, would clip against the
                  shared border). Switched to independent pills with a gap,
                  matching how the sidebar's own glass bubble is built: each
                  one fully rounded, the active one gets real glass. */}
              <div style={{ display: "flex", gap: 6 }}>
                {WINDOWS.map((w) => (
                  <span
                    key={w.key}
                    onClick={() => setTimeWindow(w.key)}
                    role="button"
                    tabIndex={0}
                    className={timeWindow === w.key ? "tp-glass tp-glass-text" : ""}
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      padding: "7px 14px",
                      borderRadius: 999,
                      cursor: "pointer",
                      color: timeWindow === w.key ? theme.color.text : theme.color.textMuted,
                      // Only set inline when inactive — .tp-glass supplies its
                      // own border for the active pill, and inline styles
                      // would otherwise win over the class and hide it.
                      ...(timeWindow !== w.key && { border: `1px solid ${theme.color.border}` }),
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
              <StatusBanner banner={summary.banner} onOpenAgents={() => setOpenPanel({ type: "agents" })} />

              <CriticalActionStrip
                criticalCount={Number(summary.kpis.find((k) => k.key === "critical")?.value || 0)}
                onOpen={() => setOpenPanel({ type: "critical" })}
              />

              {/* Everything below the status banner/critical strip is stale
                  while the agent is offline — the KPIs/trend chart most
                  obviously imply real-time freshness, but the severity/rule
                  breakdowns, alert queue, and top sources are all reads of
                  the same now-not-updating pipeline, so they get the same
                  dim/grayscale treatment rather than looking falsely current
                  next to a banner saying otherwise. Still fully interactive
                  either way — drilling into a KPI or breakdown shows real
                  historical data for that window regardless of current
                  connection status. */}
              <div
                className={agentOfflineOnly ? "tp-agent-offline" : ""}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  opacity: agentOfflineOnly ? 0.55 : 1,
                  filter: agentOfflineOnly ? "grayscale(65%)" : "none",
                  transition: "opacity 200ms ease-out, filter 200ms ease-out",
                }}
              >
                <KpiRow
                  kpis={summary.kpis.filter((k) => k.key !== "ingestion")}
                  onSelect={(key) => setOpenPanel({ type: KPI_PANEL_TYPES[key] || key })}
                />

                <EventsOverTimeCard
                  bars={summary.kpis.find((k) => k.key === "events")?.sparkline || []}
                  ingest={summary.ingest}
                  window={timeWindow}
                  onOpen={() => setOpenPanel({ type: "events" })}
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
          </div>

          <MetricPanel panel={openPanel} timeWindow={timeWindow} onClose={() => setOpenPanel(null)} />
        </div>
      )}
    </SetupLockOverlay>
  );
}
