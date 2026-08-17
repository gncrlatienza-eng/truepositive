import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { theme } from "../styles/theme";
import { exportAlertsCsv, listAlerts, listRules, updateAlert } from "../api/alerts";
import { SetupLockOverlay } from "../components/common/SetupLockOverlay";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { FieldLabel, Select, TextInput } from "../components/common/Input";
import { Badge, SeverityBadge } from "../components/common/Badge";
import { Table } from "../components/common/Table";
import AlertDetailModal from "../components/alerts/AlertDetailModal";
import { formatTimestamp } from "../utils/format";
import { useToast } from "../components/common/Toast";
import { useAuth } from "../context/AuthContext";
import { getEventGuide } from "../data/eventGuides";

const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 30_000;
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
  const [searchParams] = useSearchParams();
  // Deep-linked from the topbar's global search (?q=...) — see LogsPage.jsx's
  // identical comment for why this is read once, not kept in sync.
  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  // Real server-side pagination — see LogsPage.jsx's PAGE_SIZE comment for
  // why this matters once an org has more than one page's worth of alerts.
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  // Bulk-select, scoped to the current page only (same as RulesTab's own
  // bulk-select) — a Set of alert ids, not tied to sortedRows/pagination
  // internals since Table.jsx owns those.
  const [selectedIds, setSelectedIds] = useState(new Set());

  const ruleNameById = Object.fromEntries(rules.map((r) => [r.id, r.name]));
  const ruleById = Object.fromEntries(rules.map((r) => [r.id, r]));

  const refresh = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (q) params.q = q;
      if (status) params.status = status;
      if (severity) params.severity = severity;
      if (ruleId) params.rule_id = ruleId;
      if (mineOnly && user) params.assignee_id = user.id;
      return listAlerts(params)
        .then((data) => {
          setAlerts(data.items);
          setTotal(data.total);
        })
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [q, status, severity, ruleId, mineOnly, user, page],
  );

  useEffect(() => {
    listRules()
      .then(setRules)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh().catch(() => showToast("Could not load alerts.", "error"));
    setSelectedIds(new Set());

    // Silent background refresh — matches Overview's own 30s cadence, so a
    // new critical alert shows up here without a manual reload during
    // active triage, the exact scenario a static list is worst at.
    const interval = setInterval(() => {
      refresh(true).catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
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

  // Fires the existing single-item PATCH in parallel for each selected id —
  // same approach RulesTab.jsx's bulk enable/disable/delete already
  // established, rather than adding a dedicated bulk endpoint for this.
  async function bulkSetStatus(newStatus) {
    const ids = [...selectedIds];
    try {
      const updated = await Promise.all(ids.map((id) => updateAlert(id, { status: newStatus })));
      const byId = Object.fromEntries(updated.map((a) => [a.id, a]));
      setAlerts((prev) => prev.map((a) => byId[a.id] || a));
      setSelectedIds(new Set());
    } catch {
      showToast("Could not update the selected alerts.", "error");
    }
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExport() {
    try {
      const params = {};
      if (q) params.q = q;
      if (status) params.status = status;
      if (severity) params.severity = severity;
      if (ruleId) params.rule_id = ruleId;
      if (mineOnly && user) params.assignee_id = user.id;
      await exportAlertsCsv(params);
    } catch {
      showToast("Could not export alerts.", "error");
    }
  }

  const columns = [
    {
      key: "select",
      label: "",
      render: (r) => (
        <input
          type="checkbox"
          checked={selectedIds.has(r.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSelected(r.id)}
        />
      ),
    },
    {
      key: "created_at",
      label: "Created",
      sortable: true,
      sortValue: (r) => r.created_at,
      render: (r) => formatTimestamp(r.created_at),
    },
    { key: "severity", label: "Severity", sortable: true, render: (r) => <SeverityBadge severity={r.severity} /> },
    { key: "title", label: "Title" },
    {
      key: "rule",
      label: "Rule",
      render: (r) => {
        const eventType = r.rule_id ? ruleById[r.rule_id]?.conditions?.event_type : null;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {r.rule_id ? ruleNameById[r.rule_id] || "—" : "—"}
            {eventType && getEventGuide(eventType) && (
              <BookOpen size={12} color={theme.color.textFaint} title="A learning guide is available for this event" />
            )}
          </span>
        );
      },
    },
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
      {({ agentOfflineOnly }) => (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            padding: theme.space[7],
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              maxWidth: 1200,
              width: "100%",
              margin: "0 auto",
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: theme.space[6],
                flexShrink: 0,
              }}
            >
              <div>
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
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <h1 style={{ fontSize: 34, letterSpacing: "-0.025em", margin: 0 }}>Active alerts</h1>
                  {!loading && (
                    <Badge color={theme.color.accent}>
                      {total.toLocaleString()} {total === 1 ? "alert" : "alerts"}
                    </Badge>
                  )}
                </div>
              </div>
              <Button variant="secondary" onClick={handleExport}>
                Export CSV
              </Button>
            </div>

            {/* Same reasoning as LogsPage: the filter bar + table is the
                "live" surface, dimmed while the agent is offline. */}
            <Card
              className={agentOfflineOnly ? "tp-agent-offline" : ""}
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                opacity: agentOfflineOnly ? 0.55 : 1,
                filter: agentOfflineOnly ? "grayscale(65%)" : "none",
                transition: "opacity 200ms ease-out, filter 200ms ease-out",
              }}
              bodyStyle={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-end",
                  gap: theme.space[4],
                  padding: theme.space[4],
                  borderBottom: `1px solid ${theme.color.border}`,
                  flexShrink: 0,
                }}
              >
                <div style={{ flex: "2 1 200px", minWidth: 180 }}>
                  <FieldLabel label="Search">
                    <TextInput
                      placeholder="Search alert title or description…"
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value);
                        setPage(0);
                      }}
                    />
                  </FieldLabel>
                </div>
                <div style={{ flex: "1 1 140px", minWidth: 140 }}>
                  <FieldLabel label="Status">
                    <Select
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        setPage(0);
                      }}
                    >
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
                    <Select
                      value={severity}
                      onChange={(e) => {
                        setSeverity(e.target.value);
                        setPage(0);
                      }}
                    >
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
                    <Select
                      value={ruleId}
                      onChange={(e) => {
                        setRuleId(e.target.value);
                        setPage(0);
                      }}
                    >
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
                    <input
                      type="checkbox"
                      checked={mineOnly}
                      onChange={(e) => {
                        setMineOnly(e.target.checked);
                        setPage(0);
                      }}
                    />
                    Assigned to me
                  </label>
                </div>
              </div>

              {selectedIds.size > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: theme.space[3],
                    padding: theme.space[3],
                    margin: theme.space[4],
                    marginBottom: 0,
                    background: "rgba(8, 145, 178, 0.08)",
                    border: `1px solid ${theme.color.accent}`,
                    borderRadius: theme.radius.md,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 13 }}>{selectedIds.size} selected</span>
                  <Button size="sm" variant="secondary" onClick={() => bulkSetStatus("ack")}>
                    Ack
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => bulkSetStatus("escalated")}>
                    Escalate
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => bulkSetStatus("resolved")}>
                    Resolve
                  </Button>
                </div>
              )}

              {!loading && (
                <Table
                  columns={columns}
                  rows={alerts}
                  rowKey={(row) => row.id}
                  emptyMessage="No alerts match these filters."
                  onRowClick={setSelected}
                  page={page}
                  pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                  onPageChange={setPage}
                />
              )}
            </Card>
          </div>

          <AlertDetailModal
            open={!!selected}
            onClose={() => setSelected(null)}
            alert={selected}
            ruleName={selected?.rule_id ? ruleNameById[selected.rule_id] : null}
            eventType={selected?.rule_id ? ruleById[selected.rule_id]?.conditions?.event_type : null}
            onUpdate={(payload) => selected && applyUpdate(selected.id, payload)}
          />
        </div>
      )}
    </SetupLockOverlay>
  );
}
