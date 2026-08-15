import { useEffect, useState } from "react";
import { listAgents } from "../api/agents";
import { listSources } from "../api/sources";
import { listRules } from "../api/alerts";

// Matches the agent's own heartbeat cadence (agent/tp_agent.py ships one
// every 30s) — polling on the same interval means an uninstalled/offline
// agent gets noticed (and the dashboard re-locks) within one cycle, not
// only on the next full page load.
const POLL_INTERVAL_MS = 30_000;

// Shared by every page that shouldn't present as "working" until an org has
// actually deployed an agent, added a log source, and enabled a rule — see
// SetupLockOverlay, which blurs/locks a page's content behind this status.
export function useSetupStatus() {
  const [agents, setAgents] = useState(null);
  const [sources, setSources] = useState(null);
  const [rules, setRules] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = () => {
      listAgents()
        .then((data) => !cancelled && setAgents(data))
        .catch(() => !cancelled && setAgents((prev) => prev ?? []));
      listSources()
        .then((data) => !cancelled && setSources(data))
        .catch(() => !cancelled && setSources((prev) => prev ?? []));
      listRules()
        .then((data) => !cancelled && setRules(data))
        .catch(() => !cancelled && setRules((prev) => prev ?? []));
    };

    fetchAll();
    // Re-checks on an interval (not just on mount) so going from
    // locked -> unlocked -> locked again (e.g. the agent gets uninstalled
    // mid-session) is reflected live, without needing a page reload.
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);

    // Also re-check immediately when the tab regains focus/visibility. The
    // realistic path here is: page loads locked (agent not running yet) ->
    // user alt-tabs away to start the agent -> comes back to the browser.
    // Without this, they're waiting on whatever's left of the up-to-30s
    // interval on top of however long the agent itself took to reconnect,
    // which reads as "stuck" and the reported workaround was a hard reload.
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const loading = agents === null || sources === null || rules === null;

  const steps = loading
    ? []
    : [
        {
          key: "agent",
          // Deliberately "currently connected," not just "one exists" —
          // GET /agents lazily flips a stale agent to disconnected after
          // 90s with no heartbeat (see agent_service._sweep_stale), so an
          // uninstalled/offline agent stops counting as done here even
          // though its record is never deleted.
          done: agents.some((a) => a.status === "connected"),
          label: "Deploy an agent",
          why: "The agent runs on a machine and ships its logs here — nothing shows up until one connects.",
          to: "/settings",
          cta: "Deploy an agent",
        },
        {
          key: "source",
          done: sources.length > 0,
          label: "Add a log source",
          why: "Tell the agent which Windows Event Log channel or file to actually collect from.",
          to: "/settings",
          cta: "Add a source",
        },
        {
          key: "rule",
          done: rules.some((r) => r.enabled),
          label: "Enable a detection rule",
          why: "Rules turn incoming logs into alerts — without one enabled, nothing here will ever fire.",
          to: "/settings?tab=rules",
          cta: "Enable a rule",
        },
      ];

  return {
    loading,
    steps,
    ready: !loading && steps.every((s) => s.done),
    // Distinguishes "never deployed an agent" from "deployed one, but it's
    // currently offline" — the two need different copy in SetupLockOverlay
    // (a returning agent going stale after a reboot isn't the same situation
    // as a brand-new org that hasn't touched Settings yet).
    hasAnyAgent: !loading && agents.length > 0,
  };
}
