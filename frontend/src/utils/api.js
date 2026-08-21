import axios from "axios";

// Relative by default so one built image works behind any host/domain without
// a rebuild: nginx (prod) and the Vite dev server (`vite.config.js`'s proxy)
// both forward /api/* to the backend and strip the prefix. VITE_API_URL is a
// build-time override for setups that don't front the API this way.
const baseURL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({ baseURL });

// The SPA's own axios calls resolve a relative baseURL fine (the browser
// resolves it against the current page automatically) -- but anywhere that
// string gets shown to a human to copy, or baked into a downloaded/deployed
// agent config for a standalone process to use, it needs to be a real
// absolute URL: an external process has no "current page" to resolve
// against. Falls through unchanged if VITE_API_URL was set to an absolute
// override already.
export function externalApiUrl() {
  return /^https?:\/\//i.test(baseURL) ? baseURL : `${window.location.origin}${baseURL}`;
}

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
