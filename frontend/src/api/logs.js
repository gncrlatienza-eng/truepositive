import { api } from "../utils/api";

export function listLogs(params = {}) {
  return api.get("/logs", { params }).then((r) => r.data);
}

export function getLog(logId) {
  return api.get(`/logs/${logId}`).then((r) => r.data);
}

// Auth is a bearer header, not a cookie, so a plain <a href> can't carry it
// — fetch as a blob and trigger the download client-side, same pattern as
// utils/agentDownload.js's downloadWindowsAgent.
export async function exportLogsCsv(params = {}) {
  const response = await api.get("/logs/export.csv", { params, responseType: "blob" });
  const blobUrl = window.URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = "logs_export.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
