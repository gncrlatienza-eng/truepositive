import { useCallback, useEffect, useState } from "react";
import { theme } from "../styles/theme";
import { listIncidents, updateIncident, exportIncidentsCsv } from "../api/incidents";
import { SetupLockOverlay } from "../components/common/SetupLockOverlay";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { FieldLabel, Select, TextInput } from "../components/common/Input";
import { Badge } from "../components/common/Badge";
import { Table } from "../components/common/Table";
import IncidentDetailModal from "../components/incidents/IncidentDetailModal";
import { formatTimestamp } from "../utils/format";
import { useToast } from "../components/common/Toast";
import { useAuth } from "../context/AuthContext";

const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 30_000;

const STATUS_COLORS = {
  open: theme.color.textMuted,
  investigating: theme.color.severity.high,
  resolved: theme.color.severity.ok,
};

export default function IncidentsPage() {
  const showToast = useToast();
  const { user } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [slaBreachedOnly, setSlaBreachedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null); // detail modal
  const [selectedIds, setSelectedIds] = useState(new Set()); // bulk select

  const refresh = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (q) params.q = q;
      if (status) params.status = status;
      if (mineOnly && user) params.assignee_id = user.id;
      return listIncidents(params)
        .then((data) => {
          // Client-side SLA breach filter since the backend doesn't expose it
          // as a query param yet (same pattern as mineOnly — API adds params
          // incrementally when needed).
          const items = slaBreachedOnly ? data.items.filter((i) => i.sla_breached) : data.items;
          setIncidents(items);
          setTotal(slaBreachedOnly ? items.length : data.total);
        })
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [q, status, mineOnly, slaBreachedOnly, user, page],
  );

  useEffect(() => {
    refresh().catch(() => showToast("Could not load incidents.", "error"));
    setSelectedIds(new Set());

    const interval = setInterval(() => {
      refresh(true).catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh, showToast]);

  async function bulkResolve() {
    try {
      const updated = await Promise.all([...selectedIds].map((id) => updateIncident(id, { status: "resolved" })));
      const byId = Object.fromEntries(updated.map((i) => [i.id, i]));
      setIncidents((prev) => prev.map((i) => byId[i.id] || i));
      setSelectedIds(new Set());
    } catch {
      showToast("Could not resolve selected incidents.", "error");
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
      await exportIncidentsCsv(params);
    } catch {
      showToast("Could not export incidents.", "error");
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
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => <Badge color={STATUS_COLORS[r.status]}>{r.status}</Badge>,
    },
    {
      key: "risk_score",
      label: "Risk",
      sortable: true,
      sortValue: (r) => r.risk_score,
      render: (r) => (
        <span
          style={{
            fontWeight: 700,
            color:
              r.risk_score >= 75
                ? theme.color.severity.critical
                : r.risk_score >= 50
                  ? theme.color.severity.high
                  : theme.color.textMuted,
          }}
        >
          {r.risk_score}
        </span>
      ),
    },
    { key: "title", label: "Title" },
    {
      key: "alerts",
      label: "Alerts",
      render: (r) => (
        <Badge color={r.alert_count > 0 ? theme.color.accent : theme.color.textMuted}>{r.alert_count}</Badge>
      ),
    },
    {
      key: "sla",
      label: "SLA",
      render: (r) =>
        r.status === "resolved" ? null : r.sla_breached ? (
          <span style={{ color: theme.color.severity.critical, fontSize: 12, fontWeight: 600 }}>⚠ Breached</span>
        ) : (
          <span style={{ color: theme.color.severity.ok, fontSize: 12 }}>OK</span>
        ),
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
            {/* Page header */}
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
                  Incidents
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <h1 style={{ fontSize: 34, letterSpacing: "-0.025em", margin: 0 }}>Active incidents</h1>
                  {!loading && (
                    <Badge color={theme.color.accent}>
                      {total.toLocaleString()} {total === 1 ? "incident" : "incidents"}
                    </Badge>
                  )}
                </div>
              </div>
              <Button variant="secondary" onClick={handleExport}>
                Export CSV
              </Button>
            </div>

            <Card
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
              {/* Filter bar */}
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
                      placeholder="Search incident title…"
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
                      <option value="investigating">Investigating</option>
                      <option value="resolved">Resolved</option>
                    </Select>
                  </FieldLabel>
                </div>
                <div style={{ paddingBottom: 9, display: "flex", flexDirection: "column", gap: 6 }}>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
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
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={slaBreachedOnly}
                      onChange={(e) => {
                        setSlaBreachedOnly(e.target.checked);
                        setPage(0);
                      }}
                    />
                    SLA breached
                  </label>
                </div>
              </div>

              {/* Bulk action bar */}
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
                  <Button size="sm" variant="secondary" onClick={bulkResolve}>
                    Resolve
                  </Button>
                </div>
              )}

              {!loading && (
                <Table
                  columns={columns}
                  rows={incidents}
                  rowKey={(row) => row.id}
                  emptyMessage="No incidents match these filters."
                  onRowClick={setSelected}
                  page={page}
                  pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                  onPageChange={setPage}
                />
              )}
            </Card>
          </div>

          <IncidentDetailModal
            open={!!selected}
            onClose={() => setSelected(null)}
            incident={selected}
            onUpdate={(updated) => {
              setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
              setSelected(updated);
            }}
          />
        </div>
      )}
    </SetupLockOverlay>
  );
}
