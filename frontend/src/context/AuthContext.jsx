import { createContext, useContext, useEffect, useState } from "react";
import { api, setAuthToken, setUnauthorizedHandler } from "../utils/api";

const AuthContext = createContext(null);

const STORAGE_KEY = "tp_auth_token";

function readStoredToken() {
  return localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
}

function clearStoredToken() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  function clearSession() {
    clearStoredToken();
    setAuthToken(null);
    setUser(null);
    setOrg(null);
  }

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
  }, []);

  useEffect(() => {
    const token = readStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setAuthToken(token);
    api
      .get("/auth/me")
      .then(({ data }) => {
        setUser(data.user);
        setOrg(data.org);
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => setLoading(false));
  }, []);

  function applySession(data, remember) {
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, data.access_token);
    setAuthToken(data.access_token);
    setUser(data.user);
    setOrg(data.org);
  }

  async function signup(payload) {
    const { data } = await api.post("/auth/signup", payload);
    applySession(data, true);
    return data;
  }

  async function login(payload, remember = true) {
    const { data } = await api.post("/auth/login", payload);
    applySession(data, remember);
    return data;
  }

  function logout() {
    clearSession();
  }

  const value = {
    user,
    org,
    loading,
    isAuthenticated: !!user,
    signup,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
