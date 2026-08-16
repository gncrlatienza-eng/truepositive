import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { createPlaybook, updatePlaybook } from "../../api/playbooks";
import { Button } from "../common/Button";
import { Checkbox, FieldLabel, Select, TextInput } from "../common/Input";
import Modal from "../common/Modal";

const EMPTY = {
  name: "",
  description: "",
  event_type: "",
  min_severity: "",
  block_ip: false,
  disable_account: false,
  slack_notify: false,
  auto_create_incident: false,
  enabled: true,
};

// Mirrors RuleFormModal's pattern: structured fields rather than free-form JSON.
// Trigger fields (event_type, min_severity) use the identical schema as
// AlertRuleConditions so the backend evaluator can reuse _rule_matches.
export default function PlaybookFormModal({ open, onClose, onSaved, playbook }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (playbook) {
      setForm({
        name: playbook.name,
        description: playbook.description || "",
        event_type: playbook.trigger_conditions?.event_type || "",
        min_severity: playbook.trigger_conditions?.min_severity || "",
        block_ip: playbook.actions?.block_ip || false,
        disable_account: playbook.actions?.disable_account || false,
        slack_notify: playbook.actions?.slack_notify || false,
        auto_create_incident: playbook.actions?.auto_create_incident || false,
        enabled: playbook.enabled,
      });
    } else {
      setForm(EMPTY);
    }
    setError("");
  }, [open, playbook]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      trigger: {
        event_type: form.event_type.trim() || null,
        min_severity: form.min_severity || null,
      },
      actions: {
        block_ip: form.block_ip,
        disable_account: form.disable_account,
        slack_notify: form.slack_notify,
        auto_create_incident: form.auto_create_incident,
      },
      enabled: form.enabled,
    };
    try {
      const saved = playbook ? await updatePlaybook(playbook.id, payload) : await createPlaybook(payload);
      onSaved(saved);
      onClose();
    } catch {
      setError("Could not save that playbook.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={playbook ? "Edit playbook" : "New playbook"} width={540}>
      {error && (
        <div style={{ color: theme.color.severity.critical, fontSize: 13, marginBottom: theme.space[4] }}>{error}</div>
      )}

      <FieldLabel label="Name">
        <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={255} />
      </FieldLabel>
      <FieldLabel label="Description" hint="Optional">
        <TextInput value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} />
      </FieldLabel>

      <div
        style={{
          marginBottom: theme.space[4],
          paddingTop: theme.space[3],
          borderTop: `1px solid ${theme.color.border}`,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.color.textMuted, marginBottom: theme.space[3] }}>
          TRIGGER — fires when a log matches all conditions
        </div>
        <FieldLabel label="Match event type" hint="Optional — exact match">
          <TextInput value={form.event_type} onChange={(e) => set("event_type", e.target.value)} maxLength={100} />
        </FieldLabel>
        <FieldLabel label="Minimum severity" hint="Optional">
          <Select value={form.min_severity} onChange={(e) => set("min_severity", e.target.value)}>
            <option value="">Any</option>
            <option value="ok">OK</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </FieldLabel>
      </div>

      <div
        style={{
          marginBottom: theme.space[5],
          paddingTop: theme.space[3],
          borderTop: `1px solid ${theme.color.border}`,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.color.textMuted, marginBottom: theme.space[3] }}>
          ACTIONS — executed when trigger fires
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
          <Checkbox
            label="Create incident automatically"
            checked={form.auto_create_incident}
            onChange={(e) => set("auto_create_incident", e.target.checked)}
          />
          <Checkbox
            label={
              <span>
                Block source IP <span style={{ fontSize: 11, color: theme.color.textMuted }}>(stub — logs action)</span>
              </span>
            }
            checked={form.block_ip}
            onChange={(e) => set("block_ip", e.target.checked)}
          />
          <Checkbox
            label={
              <span>
                Disable user account{" "}
                <span style={{ fontSize: 11, color: theme.color.textMuted }}>(stub — logs action)</span>
              </span>
            }
            checked={form.disable_account}
            onChange={(e) => set("disable_account", e.target.checked)}
          />
          <Checkbox
            label={
              <span>
                Send Slack notification{" "}
                <span style={{ fontSize: 11, color: theme.color.textMuted }}>(stub — logs action)</span>
              </span>
            }
            checked={form.slack_notify}
            onChange={(e) => set("slack_notify", e.target.checked)}
          />
        </div>
      </div>

      <div style={{ marginBottom: theme.space[5] }}>
        <Checkbox label="Enabled" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space[3] }}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}
