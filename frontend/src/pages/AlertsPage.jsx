import { useCallback, useEffect, useState } from "react";
import { theme } from "../styles/theme";
import { listAlerts, listRules, updateAlert } from "../api/alerts";
import { SetupLockOverlay } from "../components/common/SetupLockOverlay";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { FieldLabel, Select } from "../components/common/Input";
import { Badge, SeverityBadge } from "../components/common/Badge";
import { Table } from "../components/common/Table";
import AlertDetailModal from "../components/alerts/AlertDetailModal";
import { formatTimestamp } from "../utils/format";
import { useToast } from "../components/common/Toast";
import { useAuth } from "../context/AuthContext";

const FETCH_LIMIT = 100;
const STATUS_COLORS = {
  open: theme.color.textMuted,
  ack: theme.color.accent,
  escalated: theme.color.severity.high,
  resolved: theme.color.severity.ok,
};
const NEXT_STATUS = { open: "ack", ack: "escalated", escalated: "resolved" };
const NEXT_LABEL = { open: "Ack", ack: "Escalate", escalated: "Resolve" };

export default function AlertsPage() {
  const showToast = useToast();
  const { user } = useAuth();
  const [rules, setRules] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [selected, setSelected] = useState(null);

  const ruleNameById = Object.fromEntries(rules.map((r) => [r.id, r.name]));

  const refresh = useCallback(() => {
    setLoading(true);
    const params = { limit: FETCH_LIMIT };
    if (status) params.status = status;
    if (severity) params.severity = severity;
    if (ruleId) params.rule_id = ruleId;
    if (mineOnly && user) params.assignee_id = user.id;
    return listAlerts(params)
      .then((data) => {
        setAlerts(data.items);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, [status, severity, ruleId, mineOnly, user]);

  useEffect(() => {
    listRules()
      .then(setRules)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh().catch(() => showToast("Could not load alerts.", "error"));
  }, [refresh, showToast]);

  async function applyUpdate(alertId, payload) {
    try {
      const updated = await updateAlert(alertId, payload);
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setSelected((prev) => (prev && prev.id === updated.id ? updated : prev));
    } catch {
      showToast("Could not update that alert.", "error");
    }
  }

  const columns = [
    {
      key: "created_at",
      label: "Created",
      sortable: true,
      sortValue: (r) => r.created_at,
      render: (r) => formatTimestamp(r.created_at),
    },
    { key: "severity", label: "Severity", sortable: true, render: (r) => <SeverityBadge severity={r.severity} /> },
    { key: "title", label: "Title" },
    { key: "rule", label: "Rule", render: (r) => (r.rule_id ? ruleNameById[r.rule_id] || "—" : "—") },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => <Badge color={STATUS_COLORS[r.status]}>{r.status}</Badge>,
    },
    {
      key: "actions",
      label: "",
      render: (r) =>
        NEXT_STATUS[r.status] ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              applyUpdate(r.id, { status: NEXT_STATUS[r.status] });
            }}
          >
            {NEXT_LABEL[r.status]}
          </Button>
        ) : null,
    },
  ];

  return (
    <SetupLockOverlay variant="compact">
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: theme.space[7] }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ marginBottom: theme.space[6] }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: theme.color.textMuted,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                marginBottom: 9,
              }}
            >
              Alerts
            </div>
            <h1 style={{ fontSize: 34, letterSpacing: "-0.025em", margin: 0 }}>Active alerts</h1>
          </div>

          <Card>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                gap: theme.space[4],
                padding: theme.space[4],
                borderBottom: `1px solid ${theme.color.border}`,
              }}
            >
              <div style={{ flex: "1 1 140px", minWidth: 140 }}>
                <FieldLabel label="Status">
                  <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">All</option>
                    <option value="open">Open</option>
                    <option value="ack">Ack</option>
                    <option value="escalated">Escalated</option>
                    <option value="resolved">Resolved</option>
                  </Select>
                </FieldLabel>
              </div>
              <div style={{ flex: "1 1 140px", minWidth: 140 }}>
                <FieldLabel label="Severity">
                  <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                    <option value="">All</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="ok">OK</option>
                  </Select>
                </FieldLabel>
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 200 }}>
                <FieldLabel label="Rule">
                  <Select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
                    <option value="">All rules</option>
                    {rules.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </FieldLabel>
              </div>
              <div style={{ paddingBottom: 9 }}>
                <label
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}
                >
                  <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                  Assigned to me
                </label>
              </div>
            </div>

            {!loading && (
              <Table
                columns={columns}
                rows={alerts}
                rowKey={(row) => row.id}
                pageSize={20}
                emptyMessage="No alerts match these filters."
                onRowClick={setSelected}
              />
            )}
          </Card>

          {total > alerts.length && (
            <div style={{ marginTop: theme.space[3], fontSize: 13, color: theme.color.textFaint }}>
              Showing {alerts.length} of {total} matching alerts — narrow the filters above to see more specific
              results.
            </div>
          )}
        </div>

        <AlertDetailModal
          open={!!selected}
          onClose={() => setSelected(null)}
          alert={selected}
          ruleName={selected?.rule_id ? ruleNameById[selected.rule_id] : null}
          onUpdate={(payload) => selected && applyUpdate(selected.id, payload)}
        />
      </div>
    </SetupLockOverlay>
  );
}
