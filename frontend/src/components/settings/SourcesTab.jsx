import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import { deleteAgent, listAgents } from "../../api/agents";
import { deleteSource, listSources, updateSource } from "../../api/sources";
import AgentCredentialsCard from "../agents/AgentCredentialsCard";
import ConfirmModal from "../common/ConfirmModal";
import ConnectSourceModal from "./ConnectSourceModal";
import DeployAgentModal from "./DeployAgentModal";
import SourceDetailModal from "./SourceDetailModal";
import { computeSourceHealth, HEALTH_COLOR_HEX } from "../../utils/sourceHealth";

const AGENT_STATUS_COLOR = {
  connected: theme.color.severity.ok,
  pending: theme.color.severity.medium,
  disconnected: theme.color.severity.critical,
};

function relativeTime(iso) {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// A pending agent's enrollment_key stays visible (Agent.enrollment_key,
// backend-decrypted) for the same 24h window enrollment_expires_at already
// tracked — computed from the timestamp directly rather than just trusting
// enrollment_key's presence, so a still-open tab flips to "expired" live
// instead of waiting on a refetch.
function isEnrollmentExpired(agent) {
  return (
    agent.status === "pending" &&
    !!agent.enrollment_expires_at &&
    new Date(agent.enrollment_expires_at).getTime() <= Date.now()
  );
}

function StatusDot({ color }) {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

export default function SourcesTab() {
  const [agents, setAgents] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalSource, setModalSource] = useState(undefined); // undefined = closed, null = create, object = edit
  const [confirmTarget, setConfirmTarget] = useState(null); // { type: "agent" | "source", item }
  const [detailSource, setDetailSource] = useState(null); // source whose container was clicked, for the health detail modal
  const [deployOpen, setDeployOpen] = useState(false);

  async function refresh() {
    const [agentList, sourceList] = await Promise.all([listAgents(), listSources()]);
    setAgents(agentList);
    setSources(sourceList);
  }

  useEffect(() => {
    refresh()
      .catch(() => setError("Could not load sources. Try refreshing."))
      .finally(() => setLoading(false));
  }, []);

  async function togglePause(source) {
    setError("");
    try {
      const updated = await updateSource(source.id, { status: source.status === "active" ? "paused" : "active" });
      setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch {
      setError("Could not update that source.");
    }
  }

  async function performDeleteSource(source) {
    setError("");
    try {
      await deleteSource(source.id);
      setSources((prev) => prev.filter((s) => s.id !== source.id));
    } catch {
      setError("Could not delete that source.");
    }
  }

  async function performDeleteAgent(agent) {
    setError("");
    try {
      await deleteAgent(agent.id);
      setAgents((prev) => prev.filter((a) => a.id !== agent.id));
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map((d) => d.msg).join(" ") : detail || "Could not delete that agent.");
    }
  }

  function confirmDelete() {
    if (!confirmTarget) return;
    if (confirmTarget.type === "agent") performDeleteAgent(confirmTarget.item);
    else performDeleteSource(confirmTarget.item);
  }

  function handleSaved(saved) {
    setSources((prev) => {
      const exists = prev.some((s) => s.id === saved.id);
      return exists ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev];
    });
  }

  if (loading) return null;

  return (
    <div>
      <ErrorBanner>{error}</ErrorBanner>

      <div style={{ display: "flex", flexWrap: "wrap", gap: theme.space[6], alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 480px", minWidth: 0 }}>
          <div style={{ marginBottom: theme.space[6] }}>
            <h3 style={{ fontSize: 16, margin: 0, marginBottom: theme.space[3] }}>Agents</h3>
            {agents.length === 0 ? (
              <div style={{ fontSize: 14, color: theme.color.textFaint }}>
                No agents yet — get credentials and install one on the right.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
                {agents.map((a) => {
                  const expired = isEnrollmentExpired(a);
                  const showCredentials = a.status === "pending" && !expired && !!a.enrollment_key;
                  return (
                    <div
                      key={a.id}
                      style={{
                        border: `1px solid ${theme.color.border}`,
                        borderRadius: theme.radius.md,
                        background: theme.color.surface,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: theme.space[3],
                          padding: theme.space[3],
                        }}
                      >
                        <StatusDot color={AGENT_STATUS_COLOR[a.status]} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>
                            {a.name}{" "}
                            {a.hostname && <span style={{ color: theme.color.textMuted }}>· {a.hostname}</span>}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: expired ? theme.color.severity.critical : theme.color.textFaint,
                            }}
                          >
                            {expired
                              ? "Enrollment expired — deploy a new agent"
                              : `${a.status} · last seen ${relativeTime(a.last_seen_at)}`}
                          </div>
                        </div>
                        <OutlineButton
                          type="button"
                          style={{
                            width: "auto",
                            padding: "6px 12px",
                            fontSize: 13,
                            color: theme.color.severity.critical,
                          }}
                          onClick={() => setConfirmTarget({ type: "agent", item: a })}
                        >
                          Delete
                        </OutlineButton>
                      </div>
                      {showCredentials && (
                        <div style={{ borderTop: `1px solid ${theme.color.border}`, padding: theme.space[4] }}>
                          <AgentCredentialsCard
                            agent={a}
                            enrollmentKey={a.enrollment_key}
                            platform={a.platform}
                            embedded
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: theme.space[4],
            }}
          >
            <h3 style={{ fontSize: 16, margin: 0 }}>Data sources</h3>
            <PrimaryButton type="button" style={{ width: "auto" }} onClick={() => setModalSource(null)}>
              + Connect data source
            </PrimaryButton>
          </div>

          {sources.length === 0 ? (
            <div style={{ fontSize: 14, color: theme.color.textFaint }}>No sources configured yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: theme.space[3] }}>
              {sources.map((s) => {
                const health = computeSourceHealth(s, agents);
                const colorKey = HEALTH_COLOR_HEX[health.color];
                const dotColor = colorKey ? theme.color.severity[colorKey] : theme.color.textFaint;
                return (
                  <div
                    key={s.id}
                    onClick={() => setDetailSource(s)}
                    title={`${health.label} — click for details`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: theme.space[3],
                      padding: theme.space[4],
                      border: `1px solid ${theme.color.border}`,
                      borderRadius: theme.radius.md,
                      background: theme.color.surface,
                      cursor: "pointer",
                    }}
                  >
                    <StatusDot color={dotColor} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 13, color: theme.color.textFaint, fontFamily: theme.font.mono }}>
                        {s.type === "local" ? s.path || "local" : `${s.protocol}://${s.host}:${s.port}`}
                      </div>
                    </div>
                    <OutlineButton
                      type="button"
                      style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePause(s);
                      }}
                    >
                      {s.status === "active" ? "Pause" : "Resume"}
                    </OutlineButton>
                    <OutlineButton
                      type="button"
                      style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalSource(s);
                      }}
                    >
                      Edit
                    </OutlineButton>
                    <OutlineButton
                      type="button"
                      style={{ width: "auto", padding: "6px 12px", fontSize: 13, color: theme.color.severity.critical }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmTarget({ type: "source", item: s });
                      }}
                    >
                      Delete
                    </OutlineButton>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ flex: "1 1 320px", maxWidth: 360, minWidth: 300, position: "sticky", top: theme.space[4] }}>
          <div
            style={{
              border: `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.lg,
              padding: theme.space[5],
            }}
          >
            <h3 style={{ fontSize: 16, margin: 0, marginBottom: theme.space[2] }}>Install an agent</h3>
            <p style={{ fontSize: 13, color: theme.color.textFaint, marginTop: 0, marginBottom: theme.space[4] }}>
              Generate credentials and install the agent on the host you want to monitor.
            </p>
            <PrimaryButton type="button" style={{ width: "auto" }} onClick={() => setDeployOpen(true)}>
              + Deploy an agent
            </PrimaryButton>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={confirmDelete}
        title={confirmTarget?.type === "agent" ? "Delete agent?" : "Delete data source?"}
        message={
          confirmTarget?.type === "agent"
            ? `Delete agent "${confirmTarget.item.name}"? Any source pointed at it will be unlinked, not deleted.`
            : `Delete "${confirmTarget?.item?.name}"? This can't be undone.`
        }
      />

      <SourceDetailModal
        open={!!detailSource}
        onClose={() => setDetailSource(null)}
        source={detailSource}
        agents={agents}
      />

      <ConnectSourceModal
        open={modalSource !== undefined}
        onClose={() => setModalSource(undefined)}
        onSaved={handleSaved}
        agents={agents}
        sources={sources}
        source={modalSource || null}
      />

      <DeployAgentModal
        open={deployOpen}
        onClose={() => {
          setDeployOpen(false);
          refresh().catch(() => setError("Could not refresh the agent list."));
        }}
        onAgentCreated={() => refresh().catch(() => {})}
      />
    </div>
  );
}
