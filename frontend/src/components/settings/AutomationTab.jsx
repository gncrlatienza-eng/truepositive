import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { deletePlaybook, listPlaybooks, updatePlaybook } from "../../api/playbooks";
import { OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import ConfirmModal from "../common/ConfirmModal";
import PlaybookFormModal from "./PlaybookFormModal";
import { Badge } from "../common/Badge";

function triggerSummary(pb) {
  const parts = [];
  if (pb.trigger_conditions?.event_type) parts.push(`event = "${pb.trigger_conditions.event_type}"`);
  if (pb.trigger_conditions?.min_severity) parts.push(`min severity ${pb.trigger_conditions.min_severity}`);
  return parts.length ? parts.join(" · ") : "Any log";
}

function actionSummary(pb) {
  const a = pb.actions || {};
  const active = [];
  if (a.auto_create_incident) active.push("create incident");
  if (a.block_ip) active.push("block IP (stub)");
  if (a.disable_account) active.push("disable account (stub)");
  if (a.slack_notify) active.push("Slack notify (stub)");
  return active.length ? active.join(", ") : "No actions";
}

export default function AutomationTab() {
  const [playbooks, setPlaybooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [modalPb, setModalPb] = useState(undefined); // undefined=closed, null=create, obj=edit
  const [confirmTarget, setConfirmTarget] = useState(null);

  function refresh() {
    return listPlaybooks().then(setPlaybooks);
  }

  useEffect(() => {
    refresh()
      .catch(() => setError("Could not load playbooks. Try refreshing."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = q ? playbooks.filter((pb) => pb.name.toLowerCase().includes(q.toLowerCase())) : playbooks;

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSaved(saved) {
    setPlaybooks((prev) => {
      const exists = prev.some((pb) => pb.id === saved.id);
      return exists ? prev.map((pb) => (pb.id === saved.id ? saved : pb)) : [saved, ...prev];
    });
  }

  async function performDelete(pb) {
    setError("");
    try {
      await deletePlaybook(pb.id);
      setPlaybooks((prev) => prev.filter((p) => p.id !== pb.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(pb.id);
        return next;
      });
    } catch {
      setError("Could not delete that playbook.");
    }
  }

  async function bulkSetEnabled(enabled) {
    setError("");
    try {
      const updated = await Promise.all([...selected].map((id) => updatePlaybook(id, { enabled })));
      const byId = Object.fromEntries(updated.map((pb) => [pb.id, pb]));
      setPlaybooks((prev) => prev.map((pb) => byId[pb.id] || pb));
      setSelected(new Set());
    } catch {
      setError("Could not update selected playbooks.");
    }
  }

  async function bulkDelete() {
    setError("");
    try {
      await Promise.all([...selected].map((id) => deletePlaybook(id)));
      setPlaybooks((prev) => prev.filter((pb) => !selected.has(pb.id)));
      setSelected(new Set());
    } catch {
      setError("Could not delete selected playbooks.");
    }
  }

  if (loading) return null;

  return (
    <div>
      <ErrorBanner>{error}</ErrorBanner>

      {/* Callout about stub actions */}
      <div
        style={{
          padding: theme.space[3],
          marginBottom: theme.space[5],
          background: "rgba(8,145,178,0.06)",
          border: `1px solid ${theme.color.accent}`,
          borderRadius: theme.radius.md,
          fontSize: 12,
          color: theme.color.textMuted,
        }}
      >
        <strong style={{ color: theme.color.text }}>About stub actions:</strong> Block IP, disable account, and Slack
        notify are logged but not executed this sprint. They will appear in Docker container logs with a{" "}
        <code style={{ fontFamily: "monospace", color: theme.color.accent }}>[PLAYBOOK ACTION]</code> prefix so you can
        verify they fire correctly.
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: theme.space[4],
          gap: theme.space[3],
        }}
      >
        <input
          type="text"
          placeholder="Search playbooks…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="tp-field-input"
          style={{ maxWidth: 260 }}
        />
        <PrimaryButton type="button" style={{ width: "auto" }} onClick={() => setModalPb(null)}>
          + New playbook
        </PrimaryButton>
      </div>

      {selected.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.space[3],
            padding: theme.space[3],
            marginBottom: theme.space[4],
            background: "rgba(8, 145, 178, 0.08)",
            border: `1px solid ${theme.color.accent}`,
            borderRadius: theme.radius.md,
          }}
        >
          <span style={{ fontSize: 13 }}>{selected.size} selected</span>
          <OutlineButton
            type="button"
            style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
            onClick={() => bulkSetEnabled(true)}
          >
            Enable
          </OutlineButton>
          <OutlineButton
            type="button"
            style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
            onClick={() => bulkSetEnabled(false)}
          >
            Disable
          </OutlineButton>
          <OutlineButton
            type="button"
            style={{
              width: "auto",
              padding: "6px 12px",
              fontSize: 13,
              color: theme.color.severity.critical,
            }}
            onClick={bulkDelete}
          >
            Delete
          </OutlineButton>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ fontSize: 14, color: theme.color.textFaint }}>No playbooks match.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
          {filtered.map((pb) => (
            <div
              key={pb.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: theme.space[3],
                padding: theme.space[3],
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.md,
                background: theme.color.surface,
                opacity: pb.enabled ? 1 : 0.6,
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(pb.id)}
                onChange={() => toggleSelected(pb.id)}
                style={{ marginTop: 3 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: theme.space[2],
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pb.name}
                  </span>
                  <Badge color={pb.enabled ? theme.color.severity.ok : theme.color.textMuted}>
                    {pb.enabled ? "enabled" : "disabled"}
                  </Badge>
                </div>
                <div style={{ fontSize: 12, color: theme.color.textMuted }}>
                  <span style={{ fontWeight: 600 }}>Trigger:</span> {triggerSummary(pb)}
                </div>
                <div style={{ fontSize: 12, color: theme.color.textMuted }}>
                  <span style={{ fontWeight: 600 }}>Actions:</span> {actionSummary(pb)}
                </div>
              </div>
              <OutlineButton
                type="button"
                style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                onClick={() => setModalPb(pb)}
              >
                Edit
              </OutlineButton>
              <OutlineButton
                type="button"
                style={{
                  width: "auto",
                  padding: "6px 12px",
                  fontSize: 13,
                  color: theme.color.severity.critical,
                }}
                onClick={() => setConfirmTarget(pb)}
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
        onConfirm={() => confirmTarget && performDelete(confirmTarget)}
        title="Delete playbook?"
        message={`Delete "${confirmTarget?.name}"? Incidents it already created are kept.`}
      />

      <PlaybookFormModal
        open={modalPb !== undefined}
        onClose={() => setModalPb(undefined)}
        onSaved={handleSaved}
        playbook={modalPb || null}
      />
    </div>
  );
}
