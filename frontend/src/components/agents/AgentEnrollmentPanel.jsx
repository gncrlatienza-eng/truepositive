import { useEffect, useRef, useState } from "react";
import { theme } from "../../styles/theme";
import { OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import { api } from "../../utils/api";
import { createAgent, getAgent } from "../../api/agents";
import { downloadWindowsAgent } from "../../utils/agentDownload";

const PLATFORMS = [
  { id: "windows", label: "Windows", detail: "MSI · 2016+" },
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
export default function AgentEnrollmentPanel({ onAgentCreated, onConnected }) {
  const [platform, setPlatform] = useState("windows");
  const [revealKey, setRevealKey] = useState(false);
  const [agent, setAgent] = useState(null);
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const pollAttempts = useRef(0);

  const connected = agent?.status === "connected";

  async function handleGenerate() {
    setError("");
    setCreating(true);
    try {
      const created = await createAgent({ name: `${platform}-agent`, platform });
      setAgent(created.agent);
      setEnrollmentKey(created.enrollment_key);
      onAgentCreated?.(created.agent.id);
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

  const installCmd = agent
    ? `python tp_agent.py --url ${api.defaults.baseURL} --id ${agent.id} --key ${enrollmentKey}`
    : null;

  async function handleDownloadWindowsAgent() {
    setDownloading(true);
    setError("");
    try {
      await downloadWindowsAgent({ id: agent.id, key: enrollmentKey });
    } catch {
      setError("Could not download the agent. Try again.");
    } finally {
      setDownloading(false);
    }
  }

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
              background: platform === p.id ? "rgba(8, 145, 178, 0.1)" : theme.color.surface,
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

      <div
        style={{
          background: theme.color.surface,
          border: `1px solid ${theme.color.border}`,
          borderRadius: theme.radius.md,
          padding: theme.space[5],
          marginBottom: theme.space[5],
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: theme.space[4],
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18 }}>Enrollment credentials</h3>
          {agent && (
            <span
              style={{
                fontSize: 11,
                color: theme.color.severity.high,
                border: `1px solid ${theme.color.severity.high}`,
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              Expires in 24h
            </span>
          )}
        </div>

        {!agent ? (
          <PrimaryButton type="button" style={{ width: "auto" }} disabled={creating} onClick={handleGenerate}>
            {creating ? "Generating…" : "Generate enrollment credentials"}
          </PrimaryButton>
        ) : (
          <>
            <div style={{ display: "flex", gap: theme.space[3], marginBottom: theme.space[3], alignItems: "center" }}>
              <span style={{ fontSize: 14, color: theme.color.textMuted, width: 140 }}>Agent ID</span>
              <code style={{ fontFamily: theme.font.mono, fontSize: 14 }}>{agent.id}</code>
              <OutlineButton
                type="button"
                style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
                onClick={() => navigator.clipboard?.writeText(agent.id)}
              >
                Copy
              </OutlineButton>
            </div>

            <div style={{ display: "flex", gap: theme.space[3], marginBottom: theme.space[4], alignItems: "center" }}>
              <span style={{ fontSize: 14, color: theme.color.textMuted, width: 140 }}>Enrollment key</span>
              <code style={{ fontFamily: theme.font.mono, fontSize: 14 }}>
                {revealKey ? enrollmentKey : "•".repeat(20)}
              </code>
              <OutlineButton
                type="button"
                style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
                onClick={() => setRevealKey((v) => !v)}
              >
                {revealKey ? "Hide" : "Reveal"}
              </OutlineButton>
            </div>

            {platform === "windows" ? (
              <>
                <PrimaryButton
                  type="button"
                  style={{ width: "auto", marginBottom: theme.space[3] }}
                  disabled={downloading}
                  onClick={handleDownloadWindowsAgent}
                >
                  {downloading ? "Preparing download…" : "Download agent for Windows"}
                </PrimaryButton>
                <div style={{ fontSize: 13, color: theme.color.textFaint, marginBottom: theme.space[3] }}>
                  Downloads <code>tp_agent.exe</code>, pre-configured for this agent. Double-click it. Nothing to type,
                  nothing else to download.
                </div>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: theme.color.textMuted }}>
                    Advanced: run manually via Python instead
                  </summary>
                  <div
                    style={{
                      background: theme.color.background,
                      border: `1px solid ${theme.color.border}`,
                      borderRadius: theme.radius.sm,
                      padding: theme.space[4],
                      fontFamily: theme.font.mono,
                      fontSize: 14,
                      color: theme.color.text,
                      marginTop: theme.space[3],
                      overflowX: "auto",
                    }}
                  >
                    $ {installCmd}
                  </div>
                </details>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: theme.color.textFaint, marginBottom: theme.space[3] }}>
                  A packaged installer for {platform} is a future release — run this manually for now:
                </div>
                <div
                  style={{
                    background: theme.color.background,
                    border: `1px solid ${theme.color.border}`,
                    borderRadius: theme.radius.sm,
                    padding: theme.space[4],
                    fontFamily: theme.font.mono,
                    fontSize: 14,
                    color: theme.color.text,
                    overflowX: "auto",
                  }}
                >
                  $ {installCmd}
                </div>
              </>
            )}
          </>
        )}
      </div>

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
                ? `${agent.hostname} · last heartbeat ${agent.last_seen_at ? new Date(agent.last_seen_at).toLocaleTimeString() : "just now"}`
                : "Run the command above. The agent checks in within about 30 seconds."}
            </div>
          </div>
          {!connected && (
            <OutlineButton type="button" style={{ width: "auto" }} onClick={refetchAgent}>
              Verify connection
            </OutlineButton>
          )}
        </div>
      )}
    </div>
  );
}
