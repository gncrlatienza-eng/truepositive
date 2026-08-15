import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { createRule, updateRule } from "../../api/alerts";
import { Button } from "../common/Button";
import { Checkbox, FieldLabel, Select, TextInput } from "../common/Input";
import Modal from "../common/Modal";

const EMPTY = { name: "", description: "", event_type: "", min_severity: "", severity: "medium", enabled: true };

// Visual, no-code rule creation: two independent conditions (event_type
// exact-match, min_severity threshold) — deliberately not a free-form JSONB
// editor, matching how log_service._rule_matches only understands these two
// keys (see schemas/alert_rules.py on the backend).
export default function RuleFormModal({ open, onClose, onSaved, rule }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (rule) {
      setForm({
        name: rule.name,
        description: rule.description || "",
        event_type: rule.conditions?.event_type || "",
        min_severity: rule.conditions?.min_severity || "",
        severity: rule.severity,
        enabled: rule.enabled,
      });
    } else {
      setForm(EMPTY);
    }
    setError("");
  }, [open, rule]);

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
      conditions: { event_type: form.event_type.trim() || null, min_severity: form.min_severity || null },
      severity: form.severity,
      enabled: form.enabled,
    };
    try {
      const saved = rule ? await updateRule(rule.id, payload) : await createRule(payload);
      onSaved(saved);
      onClose();
    } catch {
      setError("Could not save that rule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={rule ? "Edit rule" : "New rule"} width={520}>
      {error && (
        <div style={{ color: theme.color.severity.critical, fontSize: 13, marginBottom: theme.space[4] }}>{error}</div>
      )}

      <FieldLabel label="Name">
        <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={255} />
      </FieldLabel>
      <FieldLabel label="Description" hint="Optional">
        <TextInput value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} />
      </FieldLabel>
      <FieldLabel label="Match event type" hint="Optional — exact match, e.g. 'An account failed to log on'">
        <TextInput value={form.event_type} onChange={(e) => set("event_type", e.target.value)} maxLength={100} />
      </FieldLabel>
      <FieldLabel label="Minimum severity" hint="Optional — fires only for logs at or above this level">
        <Select value={form.min_severity} onChange={(e) => set("min_severity", e.target.value)}>
          <option value="">Any</option>
          <option value="ok">OK</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </Select>
      </FieldLabel>
      <FieldLabel label="Alert severity" hint="Severity assigned to alerts this rule creates">
        <Select value={form.severity} onChange={(e) => set("severity", e.target.value)}>
          <option value="ok">OK</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </Select>
      </FieldLabel>
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
