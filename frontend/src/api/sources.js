import { api } from "../utils/api";

export function listSources() {
  return api.get("/logs/sources").then((r) => r.data);
}

export function createSource(payload) {
  return api.post("/logs/sources", payload).then((r) => r.data);
}

export function updateSource(sourceId, payload) {
  return api.patch(`/logs/sources/${sourceId}`, payload).then((r) => r.data);
}

export function deleteSource(sourceId) {
  return api.delete(`/logs/sources/${sourceId}`).then((r) => r.data);
}
