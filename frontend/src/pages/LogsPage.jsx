import { useCallback, useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { theme } from "../styles/theme";
import { exportLogsCsv, listLogs } from "../api/logs";
import { listSources } from "../api/sources";
import { SetupLockOverlay } from "../components/common/SetupLockOverlay";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { FieldLabel, Select, TextInput } from "../components/common/Input";
import { Badge, SeverityBadge } from "../components/common/Badge";
import { Table } from "../components/common/Table";
import LogDetailModal from "../components/logs/LogDetailModal";
import { formatTimestamp } from "../utils/format";
import { useToast } from "../components/common/Toast";
import { getEventGuide } from "../data/eventGuides";

const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 30_000;

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
  // Real server-side pagination, not a client-side slice of a capped fetch
  // — with a few hundred logs, the old `limit: 100` fetch-once approach
  // silently made anything past the 100 most recent unreachable from the
  // UI. Every filter change below resets this back to page 0.
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState(null);

  const sourceNameById = Object.fromEntries(sources.map((s) => [s.id, s.name]));

  const refresh = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE, sort: "timestamp_desc" };
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
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [q, severity, sourceId, hourFilter, page],
  );

  useEffect(() => {
    listSources()
      .then(setSources)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh().catch(() => showToast("Could not load logs.", "error"));

    // Silent background refresh — matches Overview's own 30s cadence, so
    // logs actually arriving mid-investigation show up without a manual
    // reload, the same reasoning as the agent's own 30s shipping interval.
    const interval = setInterval(() => {
      refresh(true).catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
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
    {
      key: "event_type",
      label: "Event type",
      sortable: true,
      render: (row) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {row.event_type}
          {getEventGuide(row.event_type) && (
            <BookOpen size={12} color={theme.color.textFaint} title="A learning guide is available for this event" />
          )}
        </span>
      ),
    },
    { key: "source", label: "Source", render: (row) => sourceNameById[row.source_id] || "—" },
    {
      key: "message",
      label: "Message",
      render: (row) => (
        // Muted, not full-strength text — the raw message frequently just
        // restates the event type + source already shown in their own
        // columns (real agent-collected logs can carry more than that, but
        // when they don't, this shouldn't visually compete with the columns
        // that already say the same thing).
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
            maxWidth: 480,
            color: theme.color.textMuted,
          }}
        >
          {row.message}
        </span>
      ),
    },
  ];

  return (
    <SetupLockOverlay variant="compact">
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
                Logs
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <h1 style={{ fontSize: 34, letterSpacing: "-0.025em", margin: 0 }}>Log search</h1>
                {!loading && (
                  <Badge color={theme.color.accent}>
                    {total.toLocaleString()} {total === 1 ? "log" : "logs"}
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="secondary" onClick={handleExport}>
              Export CSV
            </Button>
          </div>

          <Card
            style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
            bodyStyle={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: theme.space[4],
                padding: theme.space[4],
                borderBottom: `1px solid ${theme.color.border}`,
                flexShrink: 0,
              }}
            >
              <div style={{ flex: "2 1 220px", minWidth: 200 }}>
                <FieldLabel label="Search">
                  <TextInput
                    placeholder="Search message or event type…"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(0);
                    }}
                  />
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
              <div style={{ flex: "1 1 160px", minWidth: 160 }}>
                <FieldLabel label="Source">
                  <Select
                    value={sourceId}
                    onChange={(e) => {
                      setSourceId(e.target.value);
                      setPage(0);
                    }}
                  >
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
                  <Select
                    value={hourFilter}
                    onChange={(e) => {
                      setHourFilter(e.target.value);
                      setPage(0);
                    }}
                  >
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
                emptyMessage="No logs match these filters."
                onRowClick={setSelectedLog}
                page={page}
                pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                onPageChange={setPage}
              />
            )}
          </Card>
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
