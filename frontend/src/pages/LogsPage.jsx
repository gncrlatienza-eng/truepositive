import { useCallback, useEffect, useState } from "react";
import { theme } from "../styles/theme";
import { exportLogsCsv, listLogs } from "../api/logs";
import { listSources } from "../api/sources";
import { SetupLockOverlay } from "../components/common/SetupLockOverlay";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { FieldLabel, Select, TextInput } from "../components/common/Input";
import { SeverityBadge } from "../components/common/Badge";
import { Table } from "../components/common/Table";
import LogDetailModal from "../components/logs/LogDetailModal";
import { formatTimestamp } from "../utils/format";
import { useToast } from "../components/common/Toast";

const FETCH_LIMIT = 100;

const HOUR_FILTERS = [
  { key: "all", label: "All time", hours: null },
  { key: "1h", label: "Last hour", hours: 1 },
  { key: "24h", label: "Last 24h", hours: 24 },
  { key: "7d", label: "Last 7 days", hours: 24 * 7 },
];

function sinceFor(hours) {
  if (!hours) return undefined;
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

export default function LogsPage() {
  const showToast = useToast();
  const [sources, setSources] = useState([]);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [hourFilter, setHourFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState(null);

  const sourceNameById = Object.fromEntries(sources.map((s) => [s.id, s.name]));

  const refresh = useCallback(() => {
    setLoading(true);
    const params = { limit: FETCH_LIMIT, sort: "timestamp_desc" };
    if (q) params.q = q;
    if (severity) params.severity = severity;
    if (sourceId) params.source_id = sourceId;
    const since = sinceFor(HOUR_FILTERS.find((h) => h.key === hourFilter)?.hours);
    if (since) params.since = since;

    return listLogs(params)
      .then((data) => {
        setLogs(data.items);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, [q, severity, sourceId, hourFilter]);

  useEffect(() => {
    listSources()
      .then(setSources)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh().catch(() => showToast("Could not load logs.", "error"));
  }, [refresh, showToast]);

  async function handleExport() {
    try {
      const params = {};
      if (q) params.q = q;
      if (severity) params.severity = severity;
      if (sourceId) params.source_id = sourceId;
      const since = sinceFor(HOUR_FILTERS.find((h) => h.key === hourFilter)?.hours);
      if (since) params.since = since;
      await exportLogsCsv(params);
    } catch {
      showToast("Could not export logs.", "error");
    }
  }

  const columns = [
    {
      key: "timestamp",
      label: "Time",
      sortable: true,
      sortValue: (row) => row.timestamp,
      render: (row) => formatTimestamp(row.timestamp),
    },
    {
      key: "severity",
      label: "Severity",
      sortable: true,
      render: (row) => <SeverityBadge severity={row.severity} />,
    },
    { key: "event_type", label: "Event type", sortable: true },
    { key: "source", label: "Source", render: (row) => sourceNameById[row.source_id] || "—" },
    {
      key: "message",
      label: "Message",
      render: (row) => (
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
            maxWidth: 480,
          }}
        >
          {row.message}
        </span>
      ),
    },
  ];

  return (
    <SetupLockOverlay variant="compact">
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: theme.space[7] }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: theme.space[6],
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
                Logs
              </div>
              <h1 style={{ fontSize: 34, letterSpacing: "-0.025em", margin: 0 }}>Log search</h1>
            </div>
            <Button variant="secondary" onClick={handleExport}>
              Export CSV
            </Button>
          </div>

          <Card>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: theme.space[4],
                padding: theme.space[4],
                borderBottom: `1px solid ${theme.color.border}`,
              }}
            >
              <div style={{ flex: "2 1 220px", minWidth: 200 }}>
                <FieldLabel label="Search">
                  <TextInput
                    placeholder="Search message or event type…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
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
              <div style={{ flex: "1 1 160px", minWidth: 160 }}>
                <FieldLabel label="Source">
                  <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                    <option value="">All sources</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </FieldLabel>
              </div>
              <div style={{ flex: "1 1 140px", minWidth: 140 }}>
                <FieldLabel label="Window">
                  <Select value={hourFilter} onChange={(e) => setHourFilter(e.target.value)}>
                    {HOUR_FILTERS.map((h) => (
                      <option key={h.key} value={h.key}>
                        {h.label}
                      </option>
                    ))}
                  </Select>
                </FieldLabel>
              </div>
            </div>

            {!loading && (
              <Table
                columns={columns}
                rows={logs}
                rowKey={(row) => row.id}
                pageSize={20}
                emptyMessage="No logs match these filters."
                onRowClick={setSelectedLog}
              />
            )}
          </Card>

          {total > logs.length && (
            <div style={{ marginTop: theme.space[3], fontSize: 13, color: theme.color.textFaint }}>
              Showing {logs.length} of {total} matching logs — narrow the filters above to see more specific results.
            </div>
          )}
        </div>

        <LogDetailModal
          open={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          log={selectedLog}
          sourceName={selectedLog && sourceNameById[selectedLog.source_id]}
        />
      </div>
    </SetupLockOverlay>
  );
}
