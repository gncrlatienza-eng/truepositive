import { createContext, useContext, useEffect, useRef, useState } from "react";
import { listAgents } from "../api/agents";

const STORAGE_KEY = "tp_scope";
export const ALL_SCOPE = { mode: "all" };

// Timing/phase sequence ported from reference/"Scope Switcher.dc (1).html"'s
// Component.pick() — an "in" phase (overlay fades up), a "swap" phase at
// 420ms (the real scope value actually changes here, and the from/to icon
// and label crossfade), "out" at 2150ms (overlay fades away), "idle" at
// 2600ms (fully hidden again). Kept as the mockup's own numbers rather than
// inventing new ones — they're tuned so the crossfade has room to read
// clearly before the overlay clears.
const PHASE_SWAP_MS = 420;
const PHASE_OUT_MS = 2150;
const PHASE_IDLE_MS = 2600;

function loadStoredScope() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return ALL_SCOPE;
    const parsed = JSON.parse(raw);
    return parsed?.mode === "agent" && parsed.agentId ? parsed : ALL_SCOPE;
  } catch {
    return ALL_SCOPE;
  }
}

function scopeId(scope) {
  return scope.mode === "agent" ? scope.agentId : "all";
}

// Shared by ScopeSwitcher.jsx's radial menu (which adds its own icon
// component + chip-color presentation on top) and the transition overlay
// (which only needs label/meta/kind) — one source of truth for "what does
// scope id X actually mean right now" instead of two independent derivations
// that could drift apart.
export function resolveScopeOption(id, agents) {
  if (id === "all") {
    return {
      id: "all",
      label: "All machines",
      meta: `${agents.length} HOST${agents.length === 1 ? "" : "S"} · FLEET VIEW`,
      kind: "globe",
    };
  }
  const agent = agents.find((a) => a.id === id);
  if (!agent) {
    // The previous scope's device may have been deleted between picking it
    // and this render (rare, but not impossible) — a plausible placeholder
    // beats a crash reading fields off `undefined`.
    return { id, label: "Unknown device", meta: "", kind: "node" };
  }
  return {
    id,
    label: agent.name,
    meta: `${agent.status.toUpperCase()}${agent.hostname ? ` · ${agent.hostname}` : ""}`,
    kind: agent.is_primary ? "host" : "node",
  };
}

const ScopeContext = createContext({
  scope: ALL_SCOPE,
  setScope: () => {},
  agents: [],
  refreshAgents: () => {},
  transition: { phase: "idle", fromId: "all", toId: "all" },
});

// Which device (or "all machines") Overview/Logs/Alerts are currently
// scoped to — set via the ScopeSwitcher radial menu (see that component).
// Persisted in sessionStorage, not localStorage, so it survives a refresh
// within the tab but resets for a fresh session — the same session-only
// scoping choice already made for the JWT itself, not a new pattern.
//
// The agent list lives here (not in ScopeSwitcher) so both the radial menu
// and the full-screen switching overlay read the same already-loaded data
// instead of fetching it twice.
export function ScopeProvider({ children }) {
  const [scope, setScopeState] = useState(loadStoredScope);
  const [agents, setAgents] = useState([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [transition, setTransition] = useState({ phase: "idle", fromId: "all", toId: "all" });
  const timersRef = useRef([]);

  // Exposed so ScopeSwitcher can pick up a just-deployed relay child (or a
  // freshly marked-primary hub) immediately, without waiting on a page
  // reload — same listAgents() call the initial fetch below already uses.
  function refreshAgents() {
    return listAgents()
      .then((list) => {
        setAgents(list);
        setAgentsLoaded(true);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refreshAgents();
  }, []);

  // A scope restored from sessionStorage (loadStoredScope, above) names an
  // agent id with no server-side validation -- if that device was deleted
  // (or this is a stale tab from before an org reset) while the tab stayed
  // open, every scoped query below would silently filter on an id nothing
  // matches, reading as "no logs/alerts/data" even though the real agents
  // in this org have plenty. Reconcile against the real list once it's
  // loaded and fall back to "All machines" if the stored device is gone.
  // Gated on agentsLoaded (not just agents.length) so this can't fire
  // before the first fetch resolves and wrongly reset a valid scope while
  // `agents` is still its initial empty array.
  useEffect(() => {
    if (!agentsLoaded || scope.mode !== "agent") return;
    if (agents.some((a) => a.id === scope.agentId)) return;
    setScopeState(ALL_SCOPE);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Best-effort, same as the write path below.
    }
  }, [agents, agentsLoaded, scope]);

  useEffect(() => () => timersRef.current.forEach(window.clearTimeout), []);

  function after(ms, fn) {
    timersRef.current.push(window.setTimeout(fn, ms));
  }

  function setScope(next) {
    const toId = scopeId(next);
    const fromId = scopeId(scope);
    if (toId === fromId) return; // re-picking the current scope is a no-op, matches the mockup's own pick()

    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];

    setTransition({ phase: "in", fromId, toId });
    after(PHASE_SWAP_MS, () => {
      setScopeState(next);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Best-effort — a private-browsing tab with storage disabled just
        // won't remember the choice past this page load; nothing else breaks.
      }
      setTransition((t) => ({ ...t, phase: "swap" }));
    });
    after(PHASE_OUT_MS, () => setTransition((t) => ({ ...t, phase: "out" })));
    after(PHASE_IDLE_MS, () => setTransition((t) => ({ ...t, phase: "idle" })));
  }

  return (
    <ScopeContext.Provider value={{ scope, setScope, agents, refreshAgents, transition }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useScope() {
  return useContext(ScopeContext);
}
