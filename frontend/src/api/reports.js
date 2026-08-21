import { api } from "../utils/api";

export function generateReport(type, date, { periodStart, periodEnd } = {}) {
  return api
    .get("/reports/generate", { params: { type, date, period_start: periodStart, period_end: periodEnd } })
    .then((r) => r.data);
}

export function listReports(params = {}) {
  return api.get("/reports", { params }).then((r) => r.data);
}

export function getReportStats() {
  return api.get("/reports/stats").then((r) => r.data);
}

export function getReport(id) {
  return api.get(`/reports/${id}`).then((r) => r.data);
}

export function exportReportCsv(id) {
  return api.get(`/reports/${id}/export.csv`, { responseType: "blob" }).then((r) => r.data);
}

export function exportReportPdf(id) {
  return api.get(`/reports/${id}/export.pdf`, { responseType: "blob" }).then((r) => r.data);
}

export function listSchedules() {
  return api.get("/reports/schedules").then((r) => r.data);
}

export function createSchedule(payload) {
  return api.post("/reports/schedules", payload).then((r) => r.data);
}

export function deleteSchedule(id) {
  return api.delete(`/reports/schedules/${id}`).then((r) => r.data);
}
