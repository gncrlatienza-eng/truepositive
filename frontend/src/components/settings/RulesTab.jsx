import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import { createRule, deleteRule, listRules, updateRule } from "../../api/alerts";
import { SeverityBadge } from "../common/Badge";
import ConfirmModal from "../common/ConfirmModal";
import RuleFormModal from "../rules/RuleFormModal";

// Plain-English starter rules for people new to detection engineering — same
// event_type taxonomy as scripts/seed_dashboard_data.py's EVENT_TYPES/RULES,
// expressed with the same conditions schema the rule-builder modal uses (no
// new backend capability, just pre-filled examples of what to watch for).
const STARTER_RULES = [
  {
    name: "Repeated failed logons",
    why: "Failed logon attempts are usually the first thing a SOC analyst checks for brute-force or password-spray attempts.",
    event_type: "An account failed to log on",
    min_severity: "medium",
    severity: "high",
  },
  {
    name: "New privileged logon",
    why: "Special privileges granted to a logon session can signal privilege escalation after a compromise.",
    event_type: "Special privileges assigned to new logon",
    min_severity: "medium",
    severity: "critical",
  },
  {
    name: "PowerShell script block logged",
    why: "Attackers commonly use PowerShell to run obfuscated or encoded commands once they have a foothold.",
    event_type: "PowerShell script block logged",
    min_severity: "medium",
    severity: "high",
  },
  {
    name: "Network share accessed",
    why: "Unusual access to network shares can indicate lateral movement or data staging before exfiltration.",
    event_type: "A network share object was accessed",
    min_severity: "medium",
    severity: "medium",
  },
];

export default function RulesTab() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [modalRule, setModalRule] = useState(undefined); // undefined = closed, null = create, object = edit
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [addingStarter, setAddingStarter] = useState(null);

  function refresh() {
    return listRules().then(setRules);
  }

  useEffect(() => {
    refresh()
      .catch(() => setError("Could not load rules. Try refreshing."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = q ? rules.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : rules;

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSaved(saved) {
    setRules((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev];
    });
  }

  async function performDelete(rule) {
    setError("");
    try {
      await deleteRule(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch {
      setError("Could not delete that rule.");
    }
  }

  async function bulkSetEnabled(enabled) {
    setError("");
    try {
      const updated = await Promise.all([...selected].map((id) => updateRule(id, { enabled })));
      const byId = Object.fromEntries(updated.map((r) => [r.id, r]));
      setRules((prev) => prev.map((r) => byId[r.id] || r));
      setSelected(new Set());
    } catch {
      setError("Could not update the selected rules.");
    }
  }

  async function bulkDelete() {
    setError("");
    try {
      await Promise.all([...selected].map((id) => deleteRule(id)));
      setRules((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
    } catch {
      setError("Could not delete the selected rules.");
    }
  }

  async function addStarterRule(starter) {
    setError("");
    setAddingStarter(starter.name);
    try {
      const saved = await createRule({
        name: starter.name,
        description: starter.why,
        conditions: { event_type: starter.event_type, min_severity: starter.min_severity },
        severity: starter.severity,
        enabled: true,
      });
      handleSaved(saved);
    } catch {
      setError(`Could not add "${starter.name}".`);
    } finally {
      setAddingStarter(null);
    }
  }

  if (loading) return null;

  const addedNames = new Set(rules.map((r) => r.name));
  const suggestions = STARTER_RULES.filter((s) => !addedNames.has(s.name));

  return (
    <div>
      <ErrorBanner>{error}</ErrorBanner>

      {suggestions.length > 0 && (
        <div style={{ marginBottom: theme.space[5] }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: theme.space[2] }}>Suggested rules</div>
          <div style={{ fontSize: 12, color: theme.color.textFaint, marginBottom: theme.space[3] }}>
            New to detection rules? Start with a few common ones — you can edit or delete any of these later.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
            {suggestions.map((s) => (
              <div
                key={s.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: theme.space[3],
                  padding: theme.space[3],
                  border: `1px dashed ${theme.color.border}`,
                  borderRadius: theme.radius.md,
                }}
              >
                <SeverityBadge severity={s.severity} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.name}
                  </div>
                  <div style={{ fontSize: 12, color: theme.color.textFaint }}>{s.why}</div>
                </div>
                <OutlineButton
                  type="button"
                  style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                  disabled={addingStarter === s.name}
                  onClick={() => addStarterRule(s)}
                >
                  {addingStarter === s.name ? "Adding…" : "Add this rule"}
                </OutlineButton>
              </div>
            ))}
          </div>
        </div>
      )}

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
          placeholder="Search rules…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="tp-field-input"
          style={{ maxWidth: 260 }}
        />
        <PrimaryButton type="button" style={{ width: "auto" }} onClick={() => setModalRule(null)}>
          + New rule
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
            style={{ width: "auto", padding: "6px 12px", fontSize: 13, color: theme.color.severity.critical }}
            onClick={bulkDelete}
          >
            Delete
          </OutlineButton>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ fontSize: 14, color: theme.color.textFaint }}>No rules match.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
          {filtered.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: theme.space[3],
                padding: theme.space[3],
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.md,
                background: theme.color.surface,
                opacity: r.enabled ? 1 : 0.6,
              }}
            >
              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelected(r.id)} />
              <SeverityBadge severity={r.severity} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.name}
                </div>
                <div style={{ fontSize: 12, color: theme.color.textFaint }}>
                  {r.enabled ? "Enabled" : "Disabled"}
                  {r.conditions?.event_type && ` · event_type = "${r.conditions.event_type}"`}
                  {r.conditions?.min_severity && ` · min severity ${r.conditions.min_severity}`}
                </div>
              </div>
              <OutlineButton
                type="button"
                style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
                onClick={() => setModalRule(r)}
              >
                Edit
              </OutlineButton>
              <OutlineButton
                type="button"
                style={{ width: "auto", padding: "6px 12px", fontSize: 13, color: theme.color.severity.critical }}
                onClick={() => setConfirmTarget(r)}
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
        title="Delete rule?"
        message={`Delete "${confirmTarget?.name}"? Alerts it already created are kept, just detached from the rule.`}
      />

      <RuleFormModal
        open={modalRule !== undefined}
        onClose={() => setModalRule(undefined)}
        onSaved={handleSaved}
        rule={modalRule || null}
      />
    </div>
  );
}
