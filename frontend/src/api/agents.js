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

export function setPrimaryAgent(agentId) {
  return api.post(`/agents/${agentId}/primary`).then((r) => r.data);
}

// Phase 1 manual pairing: creates the child's credentials directly (same
// trust model as createAgent above — generating this from the dashboard is
// itself the authorization), tagged as belonging to the given hub. Response
// also carries hub_relay_addr, the hub's most recently reported LAN address
// (null until the hub has heartbeated with one at least once).
export function createRelayChild(payload) {
  return api.post("/agents/relay-children", payload).then((r) => r.data);
}
