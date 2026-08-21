import { useEffect, useRef, useState } from "react";
import { theme } from "../../styles/theme";
import { OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import { createAgent, getAgent } from "../../api/agents";
import { formatFullTimestamp } from "../../utils/format";
import AgentCredentialsCard from "./AgentCredentialsCard";

const PLATFORMS = [
  { id: "windows", label: "Windows", detail: "Installer · 2016+" },
  { id: "linux", label: "Linux", detail: "deb · rpm" },
  { id: "docker", label: "Docker", detail: "compose" },
  { id: "kubernetes", label: "Kubernetes", detail: "DaemonSet" },
];

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 100; // ~5 minutes

// Platform picker + "generate credentials" + live connection status, shared
// by onboarding step 2 and the Settings -> Sources "Deploy agent" modal, so
// people who skip agent setup during onboarding aren't stuck without a way
// back in.
// `allowReset` shows a "Deploy another agent" action once credentials exist,
// so a persistently-embedded panel (Settings -> Sources) can be reused for a
// second/third agent without navigating away and back to remount it. Off by
// default — onboarding only ever deploys one agent per visit.
export default function AgentEnrollmentPanel({ onAgentCreated, onConnected, allowReset = false }) {
  const [platform, setPlatform] = useState("windows");
  const [agent, setAgent] = useState(null);
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const pollAttempts = useRef(0);

  const connected = agent?.status === "connected";

  function handleReset() {
    pollAttempts.current = 0;
    setAgent(null);
    setEnrollmentKey("");
    setError("");
  }

  async function handleGenerate() {
    setError("");
    setCreating(true);
    try {
      const created = await createAgent({ name: `${platform}-agent`, platform });
      setAgent(created.agent);
      setEnrollmentKey(created.enrollment_key);
      onAgentCreated?.(created.agent);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not generate credentials. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function refetchAgent() {
    if (!agent) return;
    try {
      setAgent(await getAgent(agent.id));
    } catch {
      // transient — the next poll tick (or manual click) will retry
    }
  }

  useEffect(() => {
    if (!agent || connected) return undefined;
    pollAttempts.current = 0;
    const interval = window.setInterval(() => {
      pollAttempts.current += 1;
      if (pollAttempts.current > POLL_MAX_ATTEMPTS) {
        window.clearInterval(interval);
        return;
      }
      refetchAgent();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id, connected]);

  useEffect(() => {
    if (connected) onConnected?.(agent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  return (
    <div>
      <ErrorBanner>{error}</ErrorBanner>

      <div className="tp-grid-4" style={{ marginBottom: theme.space[6] }}>
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={!!agent}
            onClick={() => setPlatform(p.id)}
            style={{
              padding: theme.space[4],
              borderRadius: theme.radius.md,
              border: `1px solid ${platform === p.id ? theme.color.accent : theme.color.border}`,
              background: platform === p.id ? "rgba(8, 144, 177, 0.1)" : theme.color.surface,
              color: theme.color.text,
              cursor: agent ? "default" : "pointer",
              textAlign: "left",
              opacity: agent && platform !== p.id ? 0.5 : 1,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 16 }}>{p.label}</div>
            <div style={{ fontSize: 13, color: theme.color.textMuted, marginTop: 4 }}>{p.detail}</div>
          </button>
        ))}
      </div>

      {!agent ? (
        <div
          style={{
            background: theme.color.surface,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.md,
            padding: theme.space[6],
            marginBottom: theme.space[5],
          }}
        >
          <h3 style={{ margin: 0, marginBottom: theme.space[4], fontSize: 18 }}>Enrollment credentials</h3>
          <PrimaryButton type="button" style={{ width: "auto" }} disabled={creating} onClick={handleGenerate}>
            {creating ? "Generating…" : "Generate enrollment credentials"}
          </PrimaryButton>
        </div>
      ) : (
        <div style={{ marginBottom: theme.space[5] }}>
          <AgentCredentialsCard agent={agent} enrollmentKey={enrollmentKey} platform={platform} />
        </div>
      )}

      {agent && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.space[3],
            padding: theme.space[4],
            borderRadius: theme.radius.md,
            border: `1px solid ${connected ? theme.color.severity.ok : theme.color.severity.high}`,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: connected ? theme.color.severity.ok : theme.color.severity.high,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {connected ? "Agent connected" : "Waiting for first heartbeat"}
            </div>
            <div
              style={{
                fontSize: 13,
                color: theme.color.textMuted,
                fontFamily: connected ? theme.font.mono : theme.font.body,
              }}
            >
              {connected
                ? `${agent.hostname} · last heartbeat ${agent.last_seen_at ? formatFullTimestamp(agent.last_seen_at) : "just now"}`
                : "Run the command above. The agent checks in within about 30 seconds."}
            </div>
          </div>
          {!connected && (
            <OutlineButton type="button" style={{ width: "auto" }} onClick={refetchAgent}>
              Verify connection
            </OutlineButton>
          )}
          {allowReset && (
            <OutlineButton type="button" style={{ width: "auto" }} onClick={handleReset}>
              Deploy another agent
            </OutlineButton>
          )}
        </div>
      )}
    </div>
  );
}
