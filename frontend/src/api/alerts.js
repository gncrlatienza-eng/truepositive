import { api } from "../utils/api";

export function listAlerts(params = {}) {
  return api.get("/alerts", { params }).then((r) => r.data);
}

export function getAlert(alertId) {
  return api.get(`/alerts/${alertId}`).then((r) => r.data);
}

export function updateAlert(alertId, payload) {
  return api.patch(`/alerts/${alertId}`, payload).then((r) => r.data);
}

export function listRules(params = {}) {
  return api.get("/alerts/rules", { params }).then((r) => r.data);
}

export function createRule(payload) {
  return api.post("/alerts/rules", payload).then((r) => r.data);
}

export function updateRule(ruleId, payload) {
  return api.patch(`/alerts/rules/${ruleId}`, payload).then((r) => r.data);
}

export function deleteRule(ruleId) {
  return api.delete(`/alerts/rules/${ruleId}`).then((r) => r.data);
}
