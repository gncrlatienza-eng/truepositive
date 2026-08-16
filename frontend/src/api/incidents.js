import { api } from "../utils/api";

export function listIncidents(params = {}) {
  return api.get("/incidents", { params }).then((r) => r.data);
}

export function getIncident(id) {
  return api.get(`/incidents/${id}`).then((r) => r.data);
}

export function createIncident(payload) {
  return api.post("/incidents", payload).then((r) => r.data);
}

export function updateIncident(id, payload) {
  return api.patch(`/incidents/${id}`, payload).then((r) => r.data);
}

export function deleteIncident(id) {
  return api.delete(`/incidents/${id}`).then((r) => r.data);
}

// Auth is a bearer header, not a cookie, so a plain <a href> can't carry it
// — fetch as a blob and trigger the download client-side, same pattern as
// exportAlertsCsv in api/alerts.js.
export async function exportIncidentsCsv(params = {}) {
  const response = await api.get("/incidents/export.csv", { params, responseType: "blob" });
  const blobUrl = window.URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = "incidents_export.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

// Alert linking
export function linkAlert(incidentId, alertId) {
  return api.post(`/incidents/${incidentId}/alerts`, { alert_id: alertId }).then((r) => r.data);
}

export function unlinkAlert(incidentId, alertId) {
  return api.delete(`/incidents/${incidentId}/alerts/${alertId}`).then((r) => r.data);
}

export function listIncidentAlerts(incidentId) {
  return api.get(`/incidents/${incidentId}/alerts`).then((r) => r.data);
}

// Notes
export function addNote(incidentId, payload) {
  return api.post(`/incidents/${incidentId}/notes`, payload).then((r) => r.data);
}

export function listNotes(incidentId) {
  return api.get(`/incidents/${incidentId}/notes`).then((r) => r.data);
}

// History / timeline
export function listHistory(incidentId) {
  return api.get(`/incidents/${incidentId}/history`).then((r) => r.data);
}
