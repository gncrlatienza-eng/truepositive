import { api } from "../utils/api";

export function listPlaybooks(params = {}) {
  return api.get("/playbooks", { params }).then((r) => r.data);
}

export function createPlaybook(payload) {
  return api.post("/playbooks", payload).then((r) => r.data);
}

export function getPlaybook(id) {
  return api.get(`/playbooks/${id}`).then((r) => r.data);
}

export function updatePlaybook(id, payload) {
  return api.patch(`/playbooks/${id}`, payload).then((r) => r.data);
}

export function deletePlaybook(id) {
  return api.delete(`/playbooks/${id}`).then((r) => r.data);
}
