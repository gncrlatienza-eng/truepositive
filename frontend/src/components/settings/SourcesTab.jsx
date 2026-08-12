import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import { api } from "../../utils/api";
import { deleteAgent, listAgents, rotateAgentKey } from "../../api/agents";
import { downloadWindowsAgent } from "../../utils/agentDownload";
import { deleteSource, listSources, updateSource } from "../../api/sources";
import ConfirmModal from "../common/ConfirmModal";
import Modal from "../common/Modal";
import ConnectSourceModal from "./ConnectSourceModal";
import DeployAgentModal from "./DeployAgentModal";

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

function StatusDot({ color }) {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

export default function SourcesTab() {
  const [agents, setAgents] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalSource, setModalSource] = useState(undefined); // undefined = closed, null = create, object = edit
  const [deployOpen, setDeployOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null); // { type: "agent" | "source", item }
  const [redeploying, setRedeploying] = useState(null); // agent id currently redeploying, for the button's own spinner
  const [redeployCommand, setRedeployCommand] = useState(null); // non-Windows fallback: show the rotated command

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
    } catch {
      setError("Could not delete that agent.");
    }
  }

  function confirmDelete() {
    if (!confirmTarget) return;
    if (confirmTarget.type === "agent") performDeleteAgent(confirmTarget.item);
    else performDeleteSource(confirmTarget.item);
  }

  // Re-running the *same* already-downloaded agent reconnects it on its
  // own (register isn't blocked by status) — this is only needed when
  // that file/config is gone, since the raw key was never stored server-side.
  async function handleRedeploy(agent) {
    setError("");
    setRedeploying(agent.id);
    try {
      const rotated = await rotateAgentKey(agent.id);
      if (agent.platform === "windows") {
        await downloadWindowsAgent({ id: agent.id, key: rotated.enrollment_key });
      } else {
        setRedeployCommand(
          `python tp_agent.py --url ${api.defaults.baseURL} --id ${agent.id} --key ${rotated.enrollment_key}`,
        );
      }
    } catch {
      setError("Could not redeploy that agent.");
    } finally {
      setRedeploying(null);
    }
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

      <div style={{ marginBottom: theme.space[6] }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: theme.space[3],
          }}
        >
          <h3 style={{ fontSize: 16, margin: 0 }}>Agents</h3>
          <OutlineButton
            type="button"
            style={{ width: "auto", padding: "6px 14px", fontSize: 13 }}
            onClick={() => setDeployOpen(true)}
          >
            + Deploy agent
          </OutlineButton>
        </div>
        {agents.length === 0 ? (
          <div style={{ fontSize: 14, color: theme.color.textFaint }}>
            No agents yet — click &ldquo;Deploy agent&rdquo; above to install one.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
            {agents.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: theme.space[3],
                  padding: theme.space[3],
                  border: `1px solid ${theme.color.border}`,
                  borderRadius: theme.radius.md,
                  background: theme.color.surface,
                }}
              >
                <StatusDot color={AGENT_STATUS_COLOR[a.status]} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {a.name} {a.hostname && <span style={{ color: theme.color.textMuted }}>· {a.hostname}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: theme.color.textFaint }}>
                    {a.status} · last seen {relativeTime(a.last_seen_at)}
                  </div>
                </div>
                {a.status !== "connected" && (
                  <OutlineButton
                    type="button"
                    style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                    disabled={redeploying === a.id}
                    onClick={() => handleRedeploy(a)}
                  >
                    {redeploying === a.id ? "Redeploying…" : "Redeploy"}
                  </OutlineButton>
                )}
                <OutlineButton
                  type="button"
                  style={{ width: "auto", padding: "6px 12px", fontSize: 13, color: theme.color.severity.critical }}
                  onClick={() => setConfirmTarget({ type: "agent", item: a })}
                >
                  Delete
                </OutlineButton>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: theme.space[4] }}
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
          {sources.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: theme.space[3],
                padding: theme.space[4],
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.md,
                background: theme.color.surface,
              }}
            >
              <StatusDot color={s.status === "active" ? theme.color.severity.ok : theme.color.textFaint} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 13, color: theme.color.textFaint, fontFamily: theme.font.mono }}>
                  {s.type === "local" ? s.path || "local" : `${s.protocol}://${s.host}:${s.port}`}
                </div>
              </div>
              <OutlineButton
                type="button"
                style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                onClick={() => togglePause(s)}
              >
                {s.status === "active" ? "Pause" : "Resume"}
              </OutlineButton>
              <OutlineButton
                type="button"
                style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                onClick={() => setModalSource(s)}
              >
                Edit
              </OutlineButton>
              <OutlineButton
                type="button"
                style={{ width: "auto", padding: "6px 12px", fontSize: 13, color: theme.color.severity.critical }}
                onClick={() => setConfirmTarget({ type: "source", item: s })}
              >
                Delete
              </OutlineButton>
            </div>
          ))}
        </div>
      )}

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

      <Modal open={!!redeployCommand} onClose={() => setRedeployCommand(null)} title="New enrollment command">
        <p style={{ fontSize: 14, color: theme.color.textMuted, marginBottom: theme.space[4] }}>
          The old credentials no longer work. Run this on the host to reconnect:
        </p>
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
          $ {redeployCommand}
        </div>
      </Modal>

      <ConnectSourceModal
        open={modalSource !== undefined}
        onClose={() => setModalSource(undefined)}
        onSaved={handleSaved}
        agents={agents}
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
