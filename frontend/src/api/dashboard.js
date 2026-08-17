import { api } from "../utils/api";

// Local params are named timeWindow (not window) to avoid shadowing the
// global `window` object — mapped to the backend's `window` query param.

export function getDashboardSummary(timeWindow = "24h") {
  return api.get("/dashboard/summary", { params: { window: timeWindow } }).then((r) => r.data);
}

export function getCriticalPanel() {
  return api.get("/dashboard/panels/critical").then((r) => r.data);
}

export function getIngestionPanel(timeWindow = "24h") {
  return api.get("/dashboard/panels/ingestion", { params: { window: timeWindow } }).then((r) => r.data);
}

export function getEventsPanel(timeWindow = "24h") {
  return api.get("/dashboard/panels/events", { params: { window: timeWindow } }).then((r) => r.data);
}

export function getAlertsPanel() {
  return api.get("/dashboard/panels/alerts").then((r) => r.data);
}

export function getTriagePanel() {
  return api.get("/dashboard/panels/triage").then((r) => r.data);
}

export function getRiskPanel() {
  return api.get("/dashboard/panels/risk").then((r) => r.data);
}

export function getSeverityPanel(severity) {
  return api.get(`/dashboard/panels/severity/${severity}`).then((r) => r.data);
}

export function getRulePanel(ruleId) {
  return api.get(`/dashboard/panels/rule/${ruleId}`).then((r) => r.data);
}

export function getEventTypePanel(eventType) {
  return api.get(`/dashboard/panels/event-type/${encodeURIComponent(eventType)}`).then((r) => r.data);
}

export function getAgentsPanel(timeWindow = "24h") {
  return api.get("/dashboard/panels/agents", { params: { window: timeWindow } }).then((r) => r.data);
}
