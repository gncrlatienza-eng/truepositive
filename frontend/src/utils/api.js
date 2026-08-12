import axios from "axios";

// Fixed by docker-compose's port mapping in every local setup (dev server or
// nginx-served build), so this fallback is correct without needing a build-time env.
const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const api = axios.create({ baseURL });

let unauthorizedHandler = null;

// Lets AuthContext register a callback (clear session) without api.js
// depending on React/router — keeps this module a plain HTTP client.
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}
