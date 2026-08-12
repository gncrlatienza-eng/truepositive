import { api } from "../utils/api";

export function createAgent(payload) {
  return api.post("/agents", payload).then((r) => r.data);
}

export function listAgents() {
  return api.get("/agents").then((r) => r.data);
}

export function getAgent(agentId) {
  return api.get(`/agents/${agentId}`).then((r) => r.data);
}

export function deleteAgent(agentId) {
  return api.delete(`/agents/${agentId}`).then((r) => r.data);
}

export function rotateAgentKey(agentId) {
  return api.post(`/agents/${agentId}/rotate-key`).then((r) => r.data);
}
