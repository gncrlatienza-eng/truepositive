import { api } from "../utils/api";

export const searchIoc = (q) => api.get("/intel/search", { params: { q } }).then((r) => r.data);

export const lookupIoc = (type, value) => api.get("/intel/lookup", { params: { type, value } }).then((r) => r.data);

export const linkIocToIncident = (type, value, incidentId) =>
  api.post("/intel/link-to-incident", { type, value, incident_id: incidentId }).then((r) => r.data);

export const getMitreTags = () => api.get("/intel/mitre/techniques").then((r) => r.data);

export const getFeedInfo = () => api.get("/intel/feed-info").then((r) => r.data);

export const listFeedIndicators = () => api.get("/intel/feed").then((r) => r.data);

export const getWorkspaceHits = (days = 7) =>
  api.get("/intel/workspace-hits", { params: { days } }).then((r) => r.data);

export const getMitreCoverage = () => api.get("/intel/mitre/coverage").then((r) => r.data);
