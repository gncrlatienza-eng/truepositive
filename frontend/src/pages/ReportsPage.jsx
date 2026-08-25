import { useEffect, useRef, useState } from "react";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import {
  createSchedule,
  deleteSchedule,
  exportReportCsv,
  generateReport,
  listReports,
  listSchedules,
} from "../api/reports";
import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";
import { SetupLockOverlay } from "../components/common/SetupLockOverlay";
import { FieldLabel, Select, TextInput } from "../components/common/Input";
import { Table } from "../components/common/Table";
import { Badge } from "../components/common/Badge";
import { useToast } from "../components/common/Toast";
import { InfoTooltip } from "../components/common/InfoTooltip";
import ConfirmModal from "../components/common/ConfirmModal";
import Modal from "../components/common/Modal";
import { useDelayedHover } from "../hooks/useDelayedHover";
import { formatTimestamp } from "../utils/format";
import ReportViewModal from "../components/screens/ReportViewModal";
import ReportPdfModal from "../components/screens/ReportPdfModal";
import { PillSelector } from "../components/common/PillSelector";

const TABS = [
  { id: "report", label: "Report" },
  { id: "compliance", label: "Compliance" },
  { id: "builder", label: "Custom builder" },
  { id: "library", label: "Library" },
];

// Matches backend report_service._PERIOD_DAYS exactly, so the period
// stepper always lands on the same window the backend would compute.
const REPORT_TYPE_STEP_DAYS = { daily: 1, weekly: 7, monthly: 30 };
const REPORT_TYPE_OPTIONS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];
const COMPARE_LABEL = { daily: "Previous day", weekly: "Previous week", monthly: "Previous 30 days" };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob, filename) {
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

const TREND_ARROW = { up: "▲", down: "▼", flat: "•" };

function trendColor(trendGood) {
  if (trendGood == null) return theme.color.textMuted;
  return trendGood ? theme.color.severity.ok : theme.color.severity.critical;
}

// `today()` above is computed in UTC (`new Date().toISOString()`), so this
// must parse/shift in UTC too — parsing as local midnight and converting
// back through toISOString() silently loses/gains a day in any timezone
// ahead of UTC (confirmed live: a single "previous day" click jumped 2 days
// in UTC+8, since local midnight is already the prior UTC day).
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Same flash-on-change pattern as KpiCard.jsx, colocated here rather than
// extracted to hooks/ since this page is the only other caller.
function useFlashOnChange(value) {
  const prevValue = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [value]);

  return flash;
}

// ── Report status strip — replaces the old page-wide "Reports this month /
// Scheduled deliveries / Last export / Delivery" quick stats, which were
// noise (a counter that just goes up every time you click Regenerate) and
// not about *this* report. These four are: what period this report covers,
// how complete the agent coverage was, what evidence backs it, and whether
// it's been distributed — all real, derived from the report just generated.
// ────────────────────────────────────────────────────────────────────────

function ReportStatusStrip({ report, agents, schedule, onJumpToday, onOpenAgents, onOpenSchedule }) {
  const connected = agents.filter((a) => a.status === "connected").length;
  const singleDay = report.period_start === report.period_end;
  const days = Math.round((new Date(report.period_end) - new Date(report.period_start)) / 86400000) + 1;
  const isToday = report.period_end === today();

  const tiles = [
    {
      label: "Period",
      value: singleDay ? report.period_start : `${report.period_start} – ${report.period_end}`,
      sub: singleDay ? "Single day" : `${days} days`,
      // Not clickable when already showing today's period — nothing to jump to.
      onClick: isToday ? undefined : onJumpToday,
      hint: "Jump to today",
    },
    // Real agent-reporting count, not a fabricated uptime % — this app has
    // no historical connectivity log to compute one honestly (same call
    // already made for report_service's own agent_summary field).
    {
      label: "Coverage",
      value: `${connected} of ${agents.length} agents`,
      sub: "reporting",
      onClick: agents.length ? onOpenAgents : undefined,
      hint: "View agents",
    },
    { label: "Evidence", value: "Generated", sub: new Date(report.generated_at).toLocaleString() },
    {
      label: "Distribution",
      value: schedule ? "Scheduled" : "Not scheduled",
      sub: schedule ? `Delivers to ${schedule.email}` : "No active schedule for this report type",
      onClick: onOpenSchedule,
      hint: schedule ? "Manage schedule" : "Schedule delivery",
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: theme.space[3] }}>
      {tiles.map((t) => (
        <StatusTile key={t.label} tile={t} />
      ))}
    </div>
  );
}

function StatusTile({ tile: t }) {
  const { hovered, onMouseEnter, onMouseLeave } = useDelayedHover();
  const flash = useFlashOnChange(t.value);
  const clickable = !!t.onClick;
  return (
    <div
      className={["tp-card", hovered && "tp-hover-glow", flash && "tp-kpi-flash"].filter(Boolean).join(" ")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={t.onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      style={{ padding: "15px 18px", cursor: clickable ? "pointer" : "default" }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: theme.color.textMuted,
          marginBottom: 6,
        }}
      >
        {t.label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: theme.color.text }}>{t.value}</div>
      <div style={{ fontSize: 12, color: theme.color.textMuted, marginTop: 3 }}>
        {clickable && hovered ? t.hint : t.sub}
      </div>
    </div>
  );
}

const AGENT_STATUS_COLOR = {
  connected: theme.color.severity.ok,
  disconnected: theme.color.severity.high,
  pending: theme.color.textMuted,
};

// Coverage tile drill-down — real per-agent rows from the same `agents`
// array report_service already computed for the status strip (name/
// hostname/platform/status/last_seen_at), no separate fetch needed.
function AgentsModal({ open, onClose, agents }) {
  return (
    <Modal open={open} onClose={onClose} title="Agents in this report's coverage" width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {agents.map((a) => (
          <div
            key={a.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 14px",
              border: `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.md,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
              <div style={{ fontSize: 12, color: theme.color.textMuted, marginTop: 2 }}>
                {a.hostname || "not registered yet"} · {a.platform}
                {a.last_seen_at ? ` · last seen ${formatTimestamp(a.last_seen_at)}` : ""}
              </div>
            </div>
            <Badge color={AGENT_STATUS_COLOR[a.status]}>{a.status}</Badge>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Period comparison table — the signature "this is a report, not a
// dashboard" element: tabular, mono-numeric, right-aligned, restrained
// color (only the change column). Reuses each KPI's own delta_pct/
// previous_value exactly as report_service already computes them (vs. the
// immediately preceding equal-length period) — "Compare to: Custom
// date"/"Same day last week" against an arbitrary second period is a real
// follow-up (needs either new backend support or a second fetch + client
// diff against non-numeric formatted metrics like "2h 6m"), deliberately
// not attempted here rather than half-implemented.
// ────────────────────────────────────────────────────────────────────────

// Cells set their own font-size/padding rather than relying on .tp-table's
// defaults (11px/13px, 12px 14px padding) — that's tuned for Logs/Alerts'
// dense 20-row pages, too small/cramped for a 4-row summary table meant to
// be read at a glance, not scanned like a data grid.
const CMP_TH = { padding: "11px 16px", fontSize: 11 };
const CMP_TD = { padding: "12px 16px", fontSize: 14 };

function ComparisonRow({ k, showComparison }) {
  const flash = useFlashOnChange(k.value);
  return (
    <tr>
      <td style={CMP_TD}>{k.label}</td>
      <td
        className={flash ? "tp-kpi-flash" : ""}
        style={{ ...CMP_TD, textAlign: "right", fontFamily: theme.font.mono, fontWeight: 600 }}
      >
        {k.value}
      </td>
      {showComparison && (
        <td style={{ ...CMP_TD, textAlign: "right", fontFamily: theme.font.mono, color: theme.color.textMuted }}>
          {k.previous_value ?? "—"}
        </td>
      )}
      {showComparison && (
        <td style={{ ...CMP_TD, textAlign: "right", fontFamily: theme.font.mono, fontWeight: 600 }}>
          <span style={{ color: trendColor(k.trend_good) }}>
            {k.delta_pct != null ? `${TREND_ARROW[k.trend]} ${Math.abs(k.delta_pct)}%` : "—"}
          </span>
        </td>
      )}
    </tr>
  );
}

function ComparisonTable({ kpis, compareTo }) {
  const showComparison = compareTo !== "none";
  return (
    <Card title="Period comparison">
      <div style={{ overflowX: "auto" }}>
        <table className="tp-table">
          <thead>
            <tr>
              <th style={CMP_TH}>Metric</th>
              <th style={{ ...CMP_TH, textAlign: "right" }}>This period</th>
              {showComparison && <th style={{ ...CMP_TH, textAlign: "right" }}>Previous</th>}
              {showComparison && <th style={{ ...CMP_TH, textAlign: "right" }}>Change</th>}
            </tr>
          </thead>
          <tbody>
            {kpis.map((k) => (
              <ComparisonRow key={k.label} k={k} showComparison={showComparison} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const TYPE_BADGE_COLOR = {
  daily: theme.color.accent,
  weekly: "#bc8cff",
  monthly: "#39d0d8",
  compliance: theme.color.severity.ok,
  custom: theme.color.textMuted,
};

function TypeBadge({ type }) {
  const color = TYPE_BADGE_COLOR[type] || theme.color.textMuted;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 4,
        color,
        background: `${color}1f`,
        whiteSpace: "nowrap",
      }}
    >
      {type}
    </span>
  );
}

function kpiValue(data, label) {
  return data?.kpis?.find((k) => k.label === label)?.value;
}

// Built from whatever fields that report *type* actually has, rather than
// forcing a fixed "N events / N alerts / N incidents" shape onto types that
// don't track all three (e.g. weekly has no incident counts at all).
function summarizeReport(r) {
  const d = r.data || {};
  if (r.type === "compliance") {
    const rows = d.framework_rows || [];
    const passCount = rows.filter((row) => row.status === "pass").length;
    return rows.length ? `${passCount}/${rows.length} controls passing` : "No controls evaluated";
  }
  const parts = [];
  const events = kpiValue(d, "Events ingested");
  if (events != null) parts.push(`${events} events`);
  const alerts = kpiValue(d, "Alerts created") ?? d.alerts_total;
  if (alerts != null) parts.push(`${alerts} alerts`);
  if (r.type === "daily" && d.agent_summary) parts.push(d.agent_summary);
  if (r.type === "monthly") {
    const opened = kpiValue(d, "Incidents opened");
    const resolved = kpiValue(d, "Incidents resolved");
    if (opened != null) parts.push(`${opened} incidents opened`);
    if (resolved != null) parts.push(`${resolved} resolved`);
  }
  return parts.length ? parts.join(" · ") : "No summary available";
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

// Single unified view for Daily/Weekly/Monthly — same period-control-bar →
// status-strip → comparison-table shape for all three, only the underlying
// metrics (report.data) change per type. A type pill selector (matching
// DashboardPage.jsx's own 24h/7d/30d window-switcher pattern) replaces what
// used to be 3 separate tabs, each with its own bespoke layout.
function ReportTab({ reportType, onReportTypeChange, onGenerated, onOpenSchedule }) {
  const [refDate, setRefDate] = useState(today());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [compareTo, setCompareTo] = useState("previous");
  const [schedules, setSchedules] = useState([]);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const showToast = useToast();

  async function handleGenerate(type, dateOverride) {
    setLoading(true);
    try {
      const generated = await generateReport(type, dateOverride !== undefined ? dateOverride : refDate);
      setReport(generated);
      onGenerated(generated);
    } catch {
      showToast(`Could not generate the ${type} report.`, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Land on today's report immediately, for whichever type is selected —
    // an empty page until the user clicks a button is the wrong default for
    // a tool meant to be scanned at a glance. Re-fires on every type switch
    // so picking a pill is itself zero-click, same as the original tabs.
    handleGenerate(reportType, today());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType]);

  useEffect(() => {
    listSchedules()
      .then(setSchedules)
      .catch(() => {});
  }, []);

  function stepDate(deltaDays) {
    const next = shiftDate(refDate, deltaDays);
    setRefDate(next);
    handleGenerate(reportType, next);
  }

  function jumpToday() {
    const t = today();
    setRefDate(t);
    handleGenerate(reportType, t);
  }

  const d = report?.data;
  const activeSchedule = schedules.find((s) => s.report_type === reportType && s.enabled);
  const stepDays = REPORT_TYPE_STEP_DAYS[reportType];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.space[4] }}>
      {/* Period control bar — a type pill selector, prev/next step through
          the period (increment matches the selected type), a real
          Compare-to target, Create grouped in the same bar instead of
          floating disconnected from the controls it acts on. Vertically
          centered against the whole row (label + control), not pinned to
          its bottom edge — Create has no label above it, so flex-end made
          it read as dropped low relative to the labeled fields beside it. */}
      <div
        className="tp-card"
        style={{
          padding: theme.space[4],
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.space[3],
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: theme.space[3], flexWrap: "wrap" }}>
          <FieldLabel label="Type">
            <PillSelector
              options={REPORT_TYPE_OPTIONS.map((opt) => ({ id: opt.key, label: opt.label }))}
              activeId={reportType}
              onSelect={onReportTypeChange}
            />
          </FieldLabel>
          <FieldLabel label="Period">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Button variant="secondary" size="sm" onClick={() => stepDate(-stepDays)} aria-label="Previous period">
                ‹
              </Button>
              <TextInput
                type="date"
                value={refDate}
                onChange={(e) => {
                  setRefDate(e.target.value);
                  handleGenerate(reportType, e.target.value);
                }}
                max={today()}
                style={{ width: 160 }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => stepDate(stepDays)}
                disabled={refDate >= today()}
                aria-label="Next period"
              >
                ›
              </Button>
            </div>
          </FieldLabel>
          <FieldLabel label="Compare to">
            <Select value={compareTo} onChange={(e) => setCompareTo(e.target.value)} style={{ width: 170 }}>
              <option value="previous">{COMPARE_LABEL[reportType]}</option>
              <option value="none">None</option>
            </Select>
          </FieldLabel>
        </div>
        <Button variant="primary" onClick={() => handleGenerate(reportType)} disabled={loading}>
          {loading ? "Creating…" : "Create report"}
        </Button>
      </div>

      {loading && !d && (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: theme.space[3] }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="tp-card" style={{ padding: "15px 18px" }}>
              <div className="tp-intel-skeleton" style={{ height: 10, width: "50%", marginBottom: 10 }} />
              <div className="tp-intel-skeleton" style={{ height: 15, width: "70%", marginBottom: 6 }} />
              <div className="tp-intel-skeleton" style={{ height: 10, width: "40%" }} />
            </div>
          ))}
        </div>
      )}

      {d && (
        <div
          key={`${reportType}-${refDate}`}
          className="tp-mini-pane-enter"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: theme.space[4],
            opacity: loading ? 0.5 : 1,
            transition: "opacity 150ms ease",
          }}
        >
          <ReportStatusStrip
            report={report}
            agents={d.agents}
            schedule={activeSchedule}
            onJumpToday={jumpToday}
            onOpenAgents={() => setAgentsOpen(true)}
            onOpenSchedule={onOpenSchedule}
          />
          <ComparisonTable kpis={d.kpis} compareTo={compareTo} />
          <AgentsModal open={agentsOpen} onClose={() => setAgentsOpen(false)} agents={d.agents} />
        </div>
      )}
    </div>
  );
}

const COMPLIANCE_CONTROL_HELP = {
  "Log retention":
    "Real count of logs ingested in the last 90 days, checked against a fixed floor — a proxy for whether logging is genuinely active, not a retention-policy audit.",
  "Incident SLA": "Share of resolved incidents that were closed within their own configured SLA window.",
  "Access anomalies":
    "Count of Critical/High severity alerts raised this period — any is flagged for review, since these are exactly the alerts worth a second look.",
  "Rule coverage":
    "Number of currently enabled detection rules — a floor on baseline monitoring coverage, not a claim those rules are sufficient.",
};

function statusPillStyle(status) {
  if (status === "pass") return { background: "rgba(63, 185, 80, 0.13)", color: theme.color.severity.ok };
  if (status === "review") return { background: "rgba(210, 153, 34, 0.15)", color: theme.color.severity.medium };
  return { background: "rgba(139, 148, 158, 0.16)", color: theme.color.textMuted };
}

function ComplianceRow({ row, generatedAt, delayMs = 0 }) {
  const { hovered, onMouseEnter, onMouseLeave } = useDelayedHover();
  return (
    <div
      className={["tp-card", "tp-intel-card-in", hovered && "tp-hover-glow"].filter(Boolean).join(" ")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        animationDelay: `${delayMs}ms`,
        padding: theme.space[4],
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: theme.space[5],
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: theme.space[2] }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{row.framework}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: theme.radius.sm,
              textTransform: "capitalize",
              ...statusPillStyle(row.status),
            }}
          >
            {row.status}
          </span>
        </div>
        <span style={{ fontSize: 13, color: theme.color.text, display: "flex", alignItems: "center", gap: 4 }}>
          {row.control}
          {COMPLIANCE_CONTROL_HELP[row.control] && <InfoTooltip text={COMPLIANCE_CONTROL_HELP[row.control]} />}
        </span>
        <span style={{ fontSize: 12, color: theme.color.textMuted }}>
          {row.metric_label}: {row.value} (threshold {row.threshold})
        </span>
        {generatedAt && (
          <span style={{ fontSize: 11, color: theme.color.textFaint }}>
            Last evidence pull: {new Date(generatedAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

function ComplianceTab({ onGenerated }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const showToast = useToast();

  async function handleGenerate() {
    setLoading(true);
    try {
      const generated = await generateReport("compliance", undefined);
      setReport(generated);
      onGenerated(generated);
    } catch {
      showToast("Could not generate the compliance report.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = report?.data?.framework_rows ?? [];
  const passCount = rows.filter((r) => r.status === "pass").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.space[4] }}>
      <div
        className="tp-card"
        style={{
          padding: theme.space[4],
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.space[3],
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.color.text }}>
          {rows.length > 0
            ? `Compliance evidence — ${passCount}/${rows.length} controls passing`
            : "Compliance evidence"}
        </div>
        <Button onClick={handleGenerate} disabled={loading}>
          {loading ? "Generating…" : "Regenerate"}
        </Button>
      </div>

      {loading && rows.length === 0 && (
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: theme.space[3] }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="tp-card" style={{ padding: theme.space[4] }}>
              <div className="tp-intel-skeleton" style={{ height: 14, width: "60%", marginBottom: 10 }} />
              <div className="tp-intel-skeleton" style={{ height: 11, width: "80%", marginBottom: 8 }} />
              <div className="tp-intel-skeleton" style={{ height: 11, width: "50%" }} />
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: theme.space[3],
            opacity: loading ? 0.5 : 1,
            transition: "opacity 150ms ease",
          }}
        >
          {rows.map((row, i) => (
            <ComplianceRow key={i} row={row} generatedAt={report?.generated_at} delayMs={i * 40} />
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowExplain((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: theme.color.accent,
              cursor: "pointer",
              fontSize: 13,
              padding: 0,
            }}
          >
            {showExplain ? "Hide" : "What does Pass/Review mean?"}
          </button>
          {showExplain && (
            <div style={{ fontSize: 13, color: theme.color.textMuted, marginTop: theme.space[3], lineHeight: 1.6 }}>
              Each control checks a real count from your org&apos;s own data against a fixed, documented threshold —
              these are conservative sanity checks, not a formal SOC2/HIPAA/PCI-DSS certification. &ldquo;Review&rdquo;
              means the current count fell short of the threshold and is worth a human look; &ldquo;n/a&rdquo; means
              there isn&apos;t enough data yet (e.g. no resolved incidents) to compute the metric.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Real fields, not marketing copy -- lifted from what report_service.py's
// _daily_data/_weekly_data/_monthly_data/_compliance_rows actually populate
// (see backend/app/services/report_service.py), so this can't drift into
// promising a field the backend doesn't compute.
const BUILDER_TYPE_DESCRIPTIONS = {
  daily:
    "Events ingested, alerts created, critical alerts, mean time to triage, an hourly event chart, top event types, and agent coverage — all for a single day.",
  weekly:
    "The same event/alert/critical KPIs as Daily plus mean time to resolve, a day-by-day alert chart, and trending detection rules over a 7-day window.",
  monthly:
    "A written executive summary, event/alert volume trend, and incidents opened vs. resolved over a 30-day window.",
  compliance:
    "Four real controls checked against your org's own data: log retention, incident SLA, high-severity alert count, and enabled detection-rule coverage.",
};

function RecentBuilderReports({ refreshToken }) {
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    listReports({ limit: 5 })
      .then((r) => setRecent(r.items))
      .catch(() => {});
  }, [refreshToken]);

  if (recent.length === 0) {
    return <div style={{ fontSize: 13, color: theme.color.textFaint }}>No reports generated yet.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
      {recent.map((r) => (
        <div
          key={r.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.space[2],
            padding: theme.space[3],
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.md,
          }}
        >
          <TypeBadge type={r.type} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13 }}>
              {r.period_start} to {r.period_end}
            </div>
            <div style={{ fontSize: 11, color: theme.color.textFaint }}>{summarizeReport(r)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function BuilderTab({ onGenerated }) {
  const [type, setType] = useState("daily");
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentToken, setRecentToken] = useState(0);
  const showToast = useToast();

  async function handleGenerate() {
    if (useCustomRange && (!from || !to)) {
      showToast("Pick both a start and end date for a custom range.", "error");
      return;
    }
    setLoading(true);
    try {
      const generated = await generateReport(
        type,
        undefined,
        useCustomRange ? { periodStart: from, periodEnd: to } : {},
      );
      showToast("Report generated — see it in the Library tab.", "success");
      onGenerated(generated);
      setRecentToken((n) => n + 1);
    } catch {
      showToast("Could not generate that report.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: theme.space[5] }}>
      <Card>
        <div style={{ padding: theme.space[5], display: "flex", flexDirection: "column", gap: theme.space[4] }}>
          <p style={{ fontSize: 13, color: theme.color.textMuted, margin: 0, lineHeight: 1.6 }}>
            Generate any report type against a real custom date range instead of its default rolling window — the result
            lands in the Library tab.
          </p>
          <FieldLabel label="Report type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="compliance">Compliance</option>
            </Select>
          </FieldLabel>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: theme.space[2],
              fontSize: 13,
              color: theme.color.textMuted,
              cursor: "pointer",
            }}
          >
            <input type="checkbox" checked={useCustomRange} onChange={(e) => setUseCustomRange(e.target.checked)} />
            Use a custom date range instead of the default rolling window
          </label>
          {useCustomRange && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.space[3] }}>
              <FieldLabel label="From">
                <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={today()} />
              </FieldLabel>
              <FieldLabel label="To">
                <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} max={today()} min={from} />
              </FieldLabel>
            </div>
          )}
          <Button onClick={handleGenerate} disabled={loading} style={{ alignSelf: "flex-start" }}>
            {loading ? "Generating…" : "Generate report"}
          </Button>
        </div>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: theme.space[4] }}>
        <Card title="What this report includes">
          <div style={{ padding: theme.space[4], fontSize: 13, color: theme.color.textMuted, lineHeight: 1.6 }}>
            {BUILDER_TYPE_DESCRIPTIONS[type]}
          </div>
        </Card>
        <Card title="Recently generated">
          <div style={{ padding: theme.space[4] }}>
            <RecentBuilderReports refreshToken={recentToken} />
          </div>
        </Card>
      </div>
    </div>
  );
}

const LIBRARY_PAGE_SIZE = 10;

function LibraryTab({ jumpToken }) {
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [pdfViewing, setPdfViewing] = useState(null);
  const showToast = useToast();

  function refresh(atPage) {
    setLoading(true);
    listReports({ limit: LIBRARY_PAGE_SIZE, offset: atPage * LIBRARY_PAGE_SIZE })
      .then((r) => {
        setReports(r.items);
        setTotal(r.total);
      })
      .finally(() => setLoading(false));
  }

  // A new report was just generated elsewhere on the page — jump back to
  // page 0 so it's visible, same as it always was before pagination existed.
  useEffect(() => {
    setPage(0);
  }, [jumpToken]);

  useEffect(() => {
    refresh(page);
  }, [page, jumpToken]);

  async function handleExportCsv(reportId, type) {
    try {
      const blob = await exportReportCsv(reportId);
      downloadBlob(blob, `${type}_report_${reportId}.csv`);
    } catch {
      showToast("Could not export that report as CSV.", "error");
    }
  }

  if (loading && reports.length === 0) return null;

  const columns = [
    { key: "type", label: "Type", render: (r) => <TypeBadge type={r.type} /> },
    {
      key: "period",
      label: "Period",
      render: (r) => (
        <div>
          <div>
            {r.period_start} to {r.period_end}
          </div>
          <div style={{ fontSize: 12, color: theme.color.textFaint }}>{summarizeReport(r)}</div>
        </div>
      ),
    },
    { key: "owner", label: "Owner", render: (r) => r.owner_email || "—" },
    { key: "generated_at", label: "Generated", render: (r) => new Date(r.generated_at).toLocaleString() },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (r) => (
        <div style={{ display: "flex", gap: theme.space[2], justifyContent: "flex-end" }}>
          <Button variant="secondary" size="sm" onClick={() => setViewing(r)}>
            View
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExportCsv(r.id, r.type)}>
            CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setPdfViewing(r)}>
            PDF
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.space[4], flex: 1, minHeight: 0 }}>
      <p style={{ fontSize: 13, color: theme.color.textMuted, margin: 0 }}>
        All generated reports across every type, newest first.
      </p>
      <Table
        columns={columns}
        rows={reports}
        rowKey={(r) => r.id}
        page={page}
        pageCount={Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE))}
        onPageChange={setPage}
        emptyMessage="No reports generated yet. Use the Custom builder tab to create one."
      />
      <ReportViewModal open={!!viewing} onClose={() => setViewing(null)} report={viewing} />
      <ReportPdfModal
        open={!!pdfViewing}
        onClose={() => setPdfViewing(null)}
        reportId={pdfViewing?.id}
        filename={pdfViewing ? `${pdfViewing.type}_report_${pdfViewing.id}.pdf` : ""}
      />
    </div>
  );
}

function ScheduleModal({ open, onClose }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("daily");
  const [frequency, setFrequency] = useState("daily");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const showToast = useToast();

  function refresh() {
    listSchedules()
      .then(setSchedules)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setCreating(true);
    try {
      const created = await createSchedule({ report_type: type, frequency, email: email.trim() });
      setSchedules((prev) => [created, ...prev]);
      setEmail("");
    } catch {
      showToast("Could not create that schedule.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!confirmTarget) return;
    try {
      await deleteSchedule(confirmTarget.id);
      setSchedules((prev) => prev.filter((s) => s.id !== confirmTarget.id));
    } catch {
      showToast("Could not delete that schedule.", "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Schedule delivery" width={520}>
      <div
        style={{
          fontSize: 12,
          color: theme.color.textMuted,
          marginBottom: theme.space[4],
          padding: theme.space[3],
          border: `1px solid ${theme.color.border}`,
          borderRadius: theme.radius.md,
        }}
      >
        Reports matching an active schedule are emailed automatically when generated. If this deployment hasn&apos;t
        configured SMTP yet, delivery attempts are logged only — check with whoever manages this server&apos;s .env if
        emails aren&apos;t arriving.
      </div>

      <form
        onSubmit={handleCreate}
        style={{
          display: "flex",
          gap: theme.space[3],
          alignItems: "flex-end",
          marginBottom: theme.space[4],
          flexWrap: "wrap",
        }}
      >
        <FieldLabel label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </FieldLabel>
        <FieldLabel label="Frequency">
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </FieldLabel>
        <FieldLabel label="Email">
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="soc@example.com"
          />
        </FieldLabel>
        <Button type="submit" disabled={creating}>
          {creating ? "Adding…" : "Add"}
        </Button>
      </form>

      {!loading &&
        (schedules.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.color.textFaint }}>No schedules yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
            {schedules.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: theme.space[3],
                  padding: theme.space[3],
                  border: `1px solid ${theme.color.border}`,
                  borderRadius: theme.radius.md,
                }}
              >
                <span style={{ textTransform: "capitalize", fontWeight: 600, fontSize: 13 }}>{s.report_type}</span>
                <span style={{ fontSize: 12, color: theme.color.textFaint }}>every {s.frequency}</span>
                <span style={{ flex: 1, fontSize: 13, fontFamily: theme.font.mono }}>{s.email}</span>
                <Button variant="danger" size="sm" onClick={() => setConfirmTarget(s)}>
                  Delete
                </Button>
              </div>
            ))}
          </div>
        ))}

      <ConfirmModal
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={confirmDelete}
        title="Delete schedule?"
        message={`Stop sending the ${confirmTarget?.report_type} report to ${confirmTarget?.email}?`}
        confirmLabel="Delete"
      />
    </Modal>
  );
}

const REPORT_TITLES = {
  daily: "Daily detection report",
  weekly: "Weekly detection report",
  monthly: "Monthly executive report",
  compliance: "Compliance evidence report",
  builder: "Custom report builder",
  library: "Report library",
};

// Real export in all three formats, no backend change needed for JSON — the
// full report (including `data`) is already in memory client-side once
// generated, so a client-only Blob download is genuinely real, not a stub.
function ExportMenu({ report, onViewPdf }) {
  const [open, setOpen] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (!e.target.closest("[data-export-menu]")) setOpen(false);
    }
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function doExport(format) {
    setOpen(false);
    if (!report) {
      showToast("Generate a report first.", "error");
      return;
    }
    if (format === "pdf") {
      onViewPdf();
      return;
    }
    try {
      if (format === "json") {
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
        downloadBlob(blob, `${report.type}_report_${report.id}.json`);
        return;
      }
      const blob = await exportReportCsv(report.id);
      downloadBlob(blob, `${report.type}_report_${report.id}.${format}`);
    } catch {
      showToast(`Could not export that report as ${format.toUpperCase()}.`, "error");
    }
  }

  return (
    <div data-export-menu style={{ position: "relative" }}>
      <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
        Export ▾
      </Button>
      {open && (
        <div
          className="tp-card"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 130,
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          {["pdf", "csv", "json"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => doExport(f)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                background: "none",
                border: "none",
                color: theme.color.text,
                cursor: "pointer",
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState("report");
  // Which of Daily/Weekly/Monthly is selected inside the merged "Report"
  // tab — lifted up here (not local to ReportTab) because the header's
  // <h1>/masthead line above the tab body need to read it too.
  const [reportType, setReportType] = useState("daily");
  const [libraryJump, setLibraryJump] = useState(0);
  const [lastReport, setLastReport] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pdfModalReport, setPdfModalReport] = useState(null);
  const { org, user } = useAuth();

  function handleGenerated(report) {
    setLastReport(report);
    setLibraryJump((n) => n + 1);
  }

  const activeType = tab === "report" ? reportType : tab;
  const showSubtitle = lastReport && lastReport.type === activeType;

  return (
    <SetupLockOverlay variant="compact">
      {({ agentOfflineOnly }) => (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: "12px 24px",
              padding: "28px 28px 20px",
              borderBottom: `1px solid ${theme.color.border}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
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
                Report
              </div>
              <h1 style={{ fontSize: 34, letterSpacing: "-0.025em", margin: 0 }}>{REPORT_TITLES[activeType]}</h1>
              {/* Document masthead — workspace · period · generated-by, mono,
                  the "this is a frozen artifact" cue a live dashboard never
                  needs. Only shown once the tab's own report has actually
                  loaded, not a stale report from a previously-viewed tab. */}
              <div
                style={{
                  fontFamily: theme.font.mono,
                  fontSize: 12,
                  color: theme.color.textMuted,
                  marginTop: 7,
                  minHeight: 16,
                }}
              >
                {showSubtitle &&
                  `${org?.slug ?? ""} · ${
                    lastReport.period_start === lastReport.period_end
                      ? lastReport.period_start
                      : `${lastReport.period_start} to ${lastReport.period_end}`
                  } · Generated ${new Date(lastReport.generated_at).toLocaleTimeString()} by ${user?.full_name ?? "—"}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: theme.space[2] }}>
              <Button variant="secondary" onClick={() => setScheduleOpen(true)}>
                Schedule delivery
              </Button>
              <ExportMenu report={showSubtitle ? lastReport : null} onViewPdf={() => setPdfModalReport(lastReport)} />
            </div>
          </div>

          <div
            className={agentOfflineOnly ? "tp-agent-offline" : ""}
            style={{
              padding: "20px 28px 24px",
              flex: 1,
              minHeight: 0,
              // A real flex column (not just a scrolling block div) so a
              // height:0-resistant child (the Library case below) can be
              // bounded by flexbox's own algorithm instead of a height:100%
              // percentage chain, which doesn't reliably resolve through a
              // flex-sized ancestor. Library owns its own internal scroll
              // region (Table.jsx's sticky-header/pinned-pager area) and
              // fills exactly what's left after the pill selector -- letting
              // this div also scroll would mean two nested scrollbars
              // fighting over the same overflow. Every other tab still
              // relies on this being the scroll surface, since their content
              // isn't laid out for an internal one.
              display: "flex",
              flexDirection: "column",
              overflowY: tab === "library" ? "hidden" : "auto",
              boxSizing: "border-box",
              opacity: agentOfflineOnly ? 0.55 : 1,
              filter: agentOfflineOnly ? "grayscale(65%)" : "none",
              transition: "opacity 200ms ease-out, filter 200ms ease-out",
            }}
          >
            <div style={{ marginBottom: theme.space[5], flexShrink: 0 }}>
              <PillSelector
                options={TABS.map((t) => ({ id: t.id, label: t.label }))}
                activeId={tab}
                onSelect={setTab}
              />
            </div>

            <div
              key={tab}
              className="tp-mini-pane-enter"
              style={
                // Library gets a real bounded flex item (flex:1, minHeight:0)
                // so it's capped to whatever space remains below the pill
                // selector, handing any overflow to Table.jsx's own internal
                // region. The other tabs get flex:1 with no minHeight cap --
                // they size to their natural content and overflow up to the
                // tab-body's own overflowY: auto, same as before this chain
                // became a real flex column.
                tab === "library"
                  ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
                  : { flex: "0 0 auto" }
              }
            >
              {tab === "report" && (
                <ReportTab
                  reportType={reportType}
                  onReportTypeChange={setReportType}
                  onGenerated={handleGenerated}
                  onOpenSchedule={() => setScheduleOpen(true)}
                />
              )}
              {tab === "compliance" && <ComplianceTab onGenerated={handleGenerated} />}
              {tab === "builder" && <BuilderTab onGenerated={handleGenerated} />}
              {tab === "library" && <LibraryTab jumpToken={libraryJump} />}
            </div>
          </div>

          <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
          <ReportPdfModal
            open={!!pdfModalReport}
            onClose={() => setPdfModalReport(null)}
            reportId={pdfModalReport?.id}
            filename={pdfModalReport ? `${pdfModalReport.type}_report_${pdfModalReport.id}.pdf` : ""}
          />
        </div>
      )}
    </SetupLockOverlay>
  );
}
