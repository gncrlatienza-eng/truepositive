import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { createRule, updateRule } from "../../api/alerts";
import { Button } from "../common/Button";
import { Checkbox, FieldLabel, Select, TextInput } from "../common/Input";
import Modal from "../common/Modal";

const EMPTY = {
  name: "",
  description: "",
  event_type: "",
  min_severity: "",
  severity: "medium",
  enabled: true,
  mitre_technique: "",
};

// Visual, no-code rule creation: two independent conditions (event_type
// exact-match, min_severity threshold) — deliberately not a free-form JSONB
// editor, matching how log_service._rule_matches only understands these two
// keys (see schemas/alert_rules.py on the backend).
//
// `rule`: an existing AlertRule to edit (has `.id` — saving PATCHes it).
// `initialValues`: prefills a *new* rule's form (e.g. from the Threat Intel
// page's "Create Rule" action) without treating it as an edit — saving still
// POSTs a real new rule. These are deliberately separate props so a caller
// can't accidentally trigger an update against a nonexistent id.
export default function RuleFormModal({ open, onClose, onSaved, rule, initialValues }) {
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
        mitre_technique: rule.mitre_technique || "",
      });
    } else if (initialValues) {
      setForm({ ...EMPTY, ...initialValues });
    } else {
      setForm(EMPTY);
    }
    setError("");
  }, [open, rule, initialValues]);

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
      mitre_technique: form.mitre_technique.trim() || null,
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
          <option value="ok">Info</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </Select>
      </FieldLabel>
      <FieldLabel label="Alert severity" hint="Severity assigned to alerts this rule creates">
        <Select value={form.severity} onChange={(e) => set("severity", e.target.value)}>
          <option value="ok">Info</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </Select>
      </FieldLabel>
      <FieldLabel
        label="MITRE ATT&CK technique"
        hint="Optional — e.g. 'T1078 — Valid Accounts', shown on the Threat Intel page"
      >
        <TextInput
          value={form.mitre_technique}
          onChange={(e) => set("mitre_technique", e.target.value)}
          maxLength={200}
          placeholder="T1078 — Valid Accounts"
        />
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
