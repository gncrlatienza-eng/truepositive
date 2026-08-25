import { api } from "../utils/api";

// Local params are named timeWindow (not window) to avoid shadowing the
// global `window` object — mapped to the backend's `window` query param.
// `agentId` (all but getAgentsPanel) backs the Scope Switcher — omit or pass
// undefined for "All machines", the default everywhere the backend already
// treats a missing agent_id as unscoped.

export function getDashboardSummary(timeWindow = "24h", agentId) {
  return api.get("/dashboard/summary", { params: { window: timeWindow, agent_id: agentId } }).then((r) => r.data);
}

export function getCriticalPanel(agentId) {
  return api.get("/dashboard/panels/critical", { params: { agent_id: agentId } }).then((r) => r.data);
}

export function getIngestionPanel(timeWindow = "24h", agentId) {
  return api
    .get("/dashboard/panels/ingestion", { params: { window: timeWindow, agent_id: agentId } })
    .then((r) => r.data);
}

export function getEventsPanel(timeWindow = "24h", agentId) {
  return api.get("/dashboard/panels/events", { params: { window: timeWindow, agent_id: agentId } }).then((r) => r.data);
}

export function getAlertsPanel(agentId) {
  return api.get("/dashboard/panels/alerts", { params: { agent_id: agentId } }).then((r) => r.data);
}

export function getTriagePanel(agentId) {
  return api.get("/dashboard/panels/triage", { params: { agent_id: agentId } }).then((r) => r.data);
}

export function getRiskPanel(agentId) {
  return api.get("/dashboard/panels/risk", { params: { agent_id: agentId } }).then((r) => r.data);
}

export function getSeverityPanel(severity, agentId) {
  return api.get(`/dashboard/panels/severity/${severity}`, { params: { agent_id: agentId } }).then((r) => r.data);
}

export function getRulePanel(ruleId, agentId) {
  return api.get(`/dashboard/panels/rule/${ruleId}`, { params: { agent_id: agentId } }).then((r) => r.data);
}

export function getEventTypePanel(eventType, agentId) {
  return api
    .get(`/dashboard/panels/event-type/${encodeURIComponent(eventType)}`, { params: { agent_id: agentId } })
    .then((r) => r.data);
}

// Deliberately no agentId param — this panel exists specifically to compare
// devices to one another, so scoping it to a single device would make it
// degenerate (see dashboard_service.get_agents_panel's own comment).
export function getAgentsPanel(timeWindow = "24h") {
  return api.get("/dashboard/panels/agents", { params: { window: timeWindow } }).then((r) => r.data);
}
