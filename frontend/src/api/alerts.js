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

// Auth is a bearer header, not a cookie, so a plain <a href> can't carry it
// — fetch as a blob and trigger the download client-side, same pattern as
// api/logs.js's exportLogsCsv.
export async function exportAlertsCsv(params = {}) {
  const response = await api.get("/alerts/export.csv", { params, responseType: "blob" });
  const blobUrl = window.URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = "alerts_export.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
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
