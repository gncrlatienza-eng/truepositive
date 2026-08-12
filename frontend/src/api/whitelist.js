import { api } from "../utils/api";

export function listWhitelist() {
  return api.get("/settings/whitelist").then((r) => r.data);
}

export function createWhitelistEntry(payload) {
  return api.post("/settings/whitelist", payload).then((r) => r.data);
}

export function deleteWhitelistEntry(entryId) {
  return api.delete(`/settings/whitelist/${entryId}`).then((r) => r.data);
}
