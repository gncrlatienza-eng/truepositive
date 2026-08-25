import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import * as dashboardApi from "../../api/dashboard";
import { setPrimaryAgent } from "../../api/agents";
import { useScope } from "../../context/ScopeContext";
import CriticalPanel from "./panels/CriticalPanel";
import IngestionPanel from "./panels/IngestionPanel";
import EventsPanel from "./panels/EventsPanel";
import AlertsPanel from "./panels/AlertsPanel";
import TriagePanel from "./panels/TriagePanel";
import RiskPanel from "./panels/RiskPanel";
import SeverityPanel from "./panels/SeverityPanel";
import RulePanel from "./panels/RulePanel";
import EventTypePanel from "./panels/EventTypePanel";
import AgentsPanel from "./panels/AgentsPanel";

const STATIC_TITLES = {
  critical: "Critical alerts",
  ingestion: "Ingestion summary",
  events: "Events breakdown",
  alerts: "Active alerts",
  triage: "Median triage (MTTR)",
  risk: "Risk score",
  agents: "Agents",
};

function fetchPanel(panel, timeWindow, agentId) {
  switch (panel.type) {
    case "critical":
      return dashboardApi.getCriticalPanel(agentId);
    case "ingestion":
      return dashboardApi.getIngestionPanel(timeWindow, agentId);
    case "events":
      return dashboardApi.getEventsPanel(timeWindow, agentId);
    case "alerts":
      return dashboardApi.getAlertsPanel(agentId);
    case "triage":
      return dashboardApi.getTriagePanel(agentId);
    case "risk":
      return dashboardApi.getRiskPanel(agentId);
    case "severity":
      return dashboardApi.getSeverityPanel(panel.key, agentId);
    case "rule":
      return dashboardApi.getRulePanel(panel.key, agentId);
    case "eventType":
      return dashboardApi.getEventTypePanel(panel.key, agentId);
    case "agents":
      // Deliberately unscoped — see api/dashboard.js's getAgentsPanel comment.
      return dashboardApi.getAgentsPanel(timeWindow);
    default:
      return Promise.resolve(null);
  }
}

function titleFor(panel, data) {
  if (STATIC_TITLES[panel.type]) return STATIC_TITLES[panel.type];
  if (panel.type === "severity" && data) return `${data.severity} alerts`;
  if (panel.type === "rule" && data) return data.rule_name;
  if (panel.type === "eventType" && data) return data.event_type;
  return "Details";
}

// Right-side drill-in drawer — one endpoint fetched lazily per click,
// matching the mockup's per-panel-type gating (isCriticalPanel/etc) 1:1.
//
// Keyed remount by design: switching from e.g. a Severity panel straight to a
// Rule panel changes `panel.type` (and therefore which schema `data` must
// match) synchronously on click, but the effect that resets `data` for the
// new panel only runs *after* that render commits. Without a fresh component
// instance per panel identity, that first render would pass the old
// severity-shaped `data` into <RulePanel>, which reads fields (top_sources,
// other_rules, ...) the severity schema doesn't have — an uncaught crash.
// The `key` below forces React to mount a brand-new instance (fresh
// data/loading/error state) whenever the panel identity changes, so a stale
// shape can never reach the wrong panel component.
export default function MetricPanel({ panel, timeWindow, onClose }) {
  if (!panel) return null;
  return (
    <PanelDrawer key={`${panel.type}:${panel.key ?? ""}`} panel={panel} timeWindow={timeWindow} onClose={onClose} />
  );
}

function PanelDrawer({ panel, timeWindow, onClose }) {
  const { scope, refreshAgents } = useScope();
  const scopedAgentId = scope.mode === "agent" ? scope.agentId : undefined;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchPanel(panel, timeWindow, scopedAgentId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [panel, timeWindow, scopedAgentId]);

  // Every other panel type is a point-in-time snapshot the user reads once,
  // but "agents" reflects live connect/disconnect status (see
  // DashboardPage's own 30s poll for the same reason) — without this, a
  // reconnect while this drawer is left open shows stale status until
  // closed/reopened or the page is reloaded.
  useEffect(() => {
    if (panel.type !== "agents") return undefined;
    const interval = setInterval(() => {
      dashboardApi
        .getAgentsPanel(timeWindow)
        .then(setData)
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [panel, timeWindow]);

  // Owned here (not inside AgentsPanel) so the panel component stays a pure
  // presentational component like every other panel in this file — the
  // mutation + refetch-to-reflect-the-new-single-primary lives with the
  // rest of this drawer's data-fetching logic instead. Also refreshes
  // ScopeContext's own agent list (not just this drawer's local `data`) —
  // otherwise the newly-primary agent only becomes a "hub" as far as the
  // Scope Switcher is concerned once something else happens to call
  // refreshAgents (e.g. deploying another device), leaving the switcher
  // absent right after the exact action that should make it appear.
  function handleSetPrimary(agentId) {
    return setPrimaryAgent(agentId).then(() =>
      Promise.all([dashboardApi.getAgentsPanel(timeWindow).then(setData), refreshAgents()])
    );
  }

  return (
    <div
      className="tp-panel-in"
      style={{
        width: 420,
        flexShrink: 0,
        borderLeft: `1px solid ${theme.color.border}`,
        background: theme.color.surface,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "18px 20px",
          borderBottom: `1px solid ${theme.color.border}`,
          position: "sticky",
          top: 0,
          background: theme.color.surface,
          zIndex: 1,
        }}
      >
        <h3 style={{ fontSize: 18, margin: 0 }}>{titleFor(panel, data)}</h3>
        <span
          className="tp-panel-close"
          onClick={onClose}
          role="button"
          tabIndex={0}
          style={{
            display: "inline-block",
            fontSize: 22,
            lineHeight: 1,
            color: theme.color.textMuted,
            cursor: "pointer",
            padding: 2,
          }}
        >
          ×
        </span>
      </div>

      <div style={{ padding: 20 }}>
        {loading && <div style={{ color: theme.color.textFaint, fontSize: 13 }}>Loading…</div>}
        {!loading && error && (
          <div style={{ color: theme.color.severity.high, fontSize: 13 }}>
            Couldn&apos;t load this panel. Try closing and reopening it.
          </div>
        )}
        {!loading && !error && data && (
          <>
            {panel.type === "critical" && <CriticalPanel data={data} />}
            {panel.type === "ingestion" && <IngestionPanel data={data} />}
            {panel.type === "events" && <EventsPanel data={data} />}
            {panel.type === "alerts" && <AlertsPanel data={data} />}
            {panel.type === "triage" && <TriagePanel data={data} />}
            {panel.type === "risk" && <RiskPanel data={data} />}
            {panel.type === "severity" && <SeverityPanel data={data} />}
            {panel.type === "rule" && <RulePanel data={data} />}
            {panel.type === "eventType" && <EventTypePanel data={data} />}
            {panel.type === "agents" && <AgentsPanel data={data} onSetPrimary={handleSetPrimary} />}
          </>
        )}
      </div>
      {/* Hints there's more to scroll — sticks to the viewport bottom while
          scrolling, so it doesn't eat into real content height (marginTop
          cancels out the space it would otherwise reserve). */}
      <div
        aria-hidden="true"
        style={{
          position: "sticky",
          bottom: 0,
          height: 40,
          marginTop: -40,
          background: `linear-gradient(to bottom, transparent, ${theme.color.surface})`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
