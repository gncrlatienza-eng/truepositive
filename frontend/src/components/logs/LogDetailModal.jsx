import { useEffect, useState } from "react";
import { Braces, ChevronDown, ChevronRight, Clock, Laptop, Radar, Server, ShieldPlus } from "lucide-react";
import { theme } from "../../styles/theme";
import { SeverityBadge, Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { CopyButton } from "../common/CopyButton";
import { FieldLabel, Select, TextInput } from "../common/Input";
import Modal from "../common/Modal";
import { EventGuide } from "../common/EventGuide";
import { LogIntelPanel } from "./LogIntelPanel";
import { listAlerts, createAlert } from "../../api/alerts";
import { formatTimestamp } from "../../utils/format";
import { useScope } from "../../context/ScopeContext";
import { useToast } from "../common/Toast";

const STATUS_COLORS = {
  open: theme.color.textMuted,
  ack: theme.color.accent,
  escalated: theme.color.severity.high,
  resolved: theme.color.severity.ok,
};

function Field({ label, children, delayMs = 0 }) {
  return (
    <div className="tp-mini-pane-enter" style={{ animationDelay: `${delayMs}ms` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.color.textMuted, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, marginTop: 2 }}>{children}</div>
    </div>
  );
}

const WINDOW_MINUTES = 15;

// `showIntel` mirrors the mockup's row.showIntel toggle. Real enrichment
// (curated feed lookups cross-referenced against this org's own
// logs/alerts/incidents) shipped in Sprint 8 and is wired in below via
// LogIntelPanel — this no longer says "coming soon" for a feature that's
// actually live elsewhere in the app (IntelPage).
export default function LogDetailModal({ open, onClose, log, sourceName, onFilterBySource, onFilterByWindow }) {
  const [showIntel, setShowIntel] = useState(false);
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const { agents, setScope } = useScope();
  const showToast = useToast();

  const [showCreateAlert, setShowCreateAlert] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertSeverity, setAlertSeverity] = useState("medium");
  const [creatingAlert, setCreatingAlert] = useState(false);
  const [alertCreated, setAlertCreated] = useState(false);

  useEffect(() => {
    setTriggeredAlerts([]);
    setShowIntel(false);
    setShowCreateAlert(false);
    setAlertCreated(false);
    if (open && log?.id) {
      listAlerts({ log_id: log.id })
        .then((data) => setTriggeredAlerts(data.items))
        .catch(() => {});
    }
    if (open && log) {
      setAlertTitle(log.event_type || "Escalated log");
      setAlertSeverity(log.severity || "medium");
    }
    // Deliberately keyed on log?.id, not the log object itself — same
    // reasoning as IncidentDetailModal's identical pattern: LogsPage doesn't
    // hand back a new log object reference on every render, but keying on
    // the object anyway would risk needless re-fetches if it ever did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, log?.id]);

  if (!log) return null;

  const device = log.agent_id ? agents.find((a) => a.id === log.agent_id) : null;
  const rawEntries = log.raw && typeof log.raw === "object" ? Object.entries(log.raw) : [];
  const rawText = rawEntries.length > 0 ? JSON.stringify(log.raw, null, 2) : null;

  function handleViewDevice() {
    if (!log.agent_id) return;
    setScope({ mode: "agent", agentId: log.agent_id });
    onClose();
  }

  function handleViewSource() {
    if (!log.source_id || !onFilterBySource) return;
    onFilterBySource(log.source_id);
    onClose();
  }

  function handleViewWindow() {
    if (!onFilterByWindow) return;
    onFilterByWindow(log.timestamp, WINDOW_MINUTES);
    onClose();
  }

  async function handleCreateAlert() {
    if (!alertTitle.trim()) return;
    setCreatingAlert(true);
    try {
      await createAlert({
        title: alertTitle.trim(),
        description: log.message,
        severity: alertSeverity,
        log_id: log.id,
      });
      setAlertCreated(true);
      setShowCreateAlert(false);
      showToast("Alert created from this log.", "success");
      listAlerts({ log_id: log.id })
        .then((data) => setTriggeredAlerts(data.items))
        .catch(() => {});
    } catch {
      showToast("Could not create an alert from this log.", "error");
    } finally {
      setCreatingAlert(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Log detail" width={680}>
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.space[4], marginBottom: theme.space[5] }}
      >
        <Field label="Timestamp" delayMs={0}>
          {formatTimestamp(log.timestamp)}
        </Field>
        <Field label="Severity" delayMs={20}>
          <SeverityBadge severity={log.severity} />
        </Field>
        <Field label="Event type" delayMs={40}>
          {log.event_type}
        </Field>
        <Field label="Source" delayMs={60}>
          {sourceName || log.source_id || "—"}
        </Field>
        <Field label="Device" delayMs={80}>
          {device ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Laptop size={13} color={theme.color.textMuted} />
              {device.name}
              {device.hostname && (
                <span style={{ color: theme.color.textFaint, fontSize: 12 }}>· {device.hostname}</span>
              )}
            </span>
          ) : (
            <span style={{ color: theme.color.textFaint }}>—</span>
          )}
        </Field>
      </div>

      <Field label="Message">
        <div
          style={{
            marginTop: 6,
            padding: theme.space[3],
            background: theme.color.background,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.sm,
            fontFamily: theme.font.mono,
            fontSize: 13,
            whiteSpace: "pre-wrap",
            maxHeight: 220,
            overflowY: "auto",
            position: "relative",
          }}
        >
          <div style={{ position: "absolute", top: 6, right: 8 }}>
            <CopyButton value={log.message} label="Copy message" />
          </div>
          <div style={{ paddingRight: 24 }}>{log.message}</div>
        </div>
      </Field>

      {/* Cross-navigation — jump straight into the exact filtered view an
          analyst almost always wants next, instead of a dead-end read-only
          modal they have to close and manually rebuild filters from. */}
      <div style={{ display: "flex", gap: theme.space[2], marginTop: theme.space[4], flexWrap: "wrap" }}>
        {log.agent_id && (
          <Button size="sm" variant="secondary" onClick={handleViewDevice}>
            <Laptop size={13} /> View this device&apos;s logs
          </Button>
        )}
        {log.source_id && onFilterBySource && (
          <Button size="sm" variant="secondary" onClick={handleViewSource}>
            <Server size={13} /> View this source&apos;s logs
          </Button>
        )}
        {onFilterByWindow && (
          <Button size="sm" variant="secondary" onClick={handleViewWindow}>
            <Clock size={13} /> View ±{WINDOW_MINUTES}m window
          </Button>
        )}
      </div>

      {triggeredAlerts.length > 0 && (
        <Field label={`Triggered ${triggeredAlerts.length === 1 ? "alert" : `${triggeredAlerts.length} alerts`}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {triggeredAlerts.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: theme.space[2],
                  background: theme.color.background,
                  border: `1px solid ${theme.color.border}`,
                  borderRadius: theme.radius.sm,
                  fontSize: 13,
                }}
              >
                <SeverityBadge severity={a.severity} />
                <span
                  style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {a.title}
                </span>
                <Badge color={STATUS_COLORS[a.status]}>{a.status}</Badge>
              </div>
            ))}
          </div>
        </Field>
      )}

      {/* Manual escalation — a log that didn't trip any rule but still looks
          worth a second look can be raised into a real alert directly from
          here, the same way AlertDetailModal already lets an alert become an
          incident. */}
      <div style={{ marginTop: theme.space[4] }}>
        {!showCreateAlert && !alertCreated && (
          <Button size="sm" variant="secondary" onClick={() => setShowCreateAlert(true)}>
            <ShieldPlus size={13} /> Create alert from this log
          </Button>
        )}
        {alertCreated && (
          <span className="tp-copied-badge" style={{ fontSize: 12, color: theme.color.severity.ok }}>
            ✓ Alert created
          </span>
        )}
        {showCreateAlert && (
          <div
            className="tp-mini-pane-enter"
            style={{
              marginTop: theme.space[2],
              padding: theme.space[4],
              border: `1px solid ${theme.color.accent}`,
              borderRadius: theme.radius.md,
              background: "rgba(0,212,255,0.05)",
            }}
          >
            <div style={{ display: "flex", gap: theme.space[3], marginBottom: theme.space[3] }}>
              <div style={{ flex: 1 }}>
                <FieldLabel label="Title">
                  <TextInput value={alertTitle} onChange={(e) => setAlertTitle(e.target.value)} />
                </FieldLabel>
              </div>
              <div style={{ width: 140 }}>
                <FieldLabel label="Severity">
                  <Select value={alertSeverity} onChange={(e) => setAlertSeverity(e.target.value)}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="ok">Info</option>
                  </Select>
                </FieldLabel>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space[2] }}>
              <Button size="sm" variant="secondary" onClick={() => setShowCreateAlert(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!alertTitle.trim() || creatingAlert} onClick={handleCreateAlert}>
                {creatingAlert ? "Creating…" : "Create alert"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <EventGuide eventType={log.event_type} />

      {rawText && (
        <div style={{ marginTop: theme.space[4] }}>
          <CollapsibleSection
            icon={Braces}
            title="Raw data"
            right={<CopyButton value={rawText} label="Copy raw JSON" />}
          >
            <pre
              style={{
                margin: 0,
                fontFamily: theme.font.mono,
                fontSize: 12,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                color: theme.color.textMuted,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {rawText}
            </pre>
          </CollapsibleSection>
        </div>
      )}

      <div style={{ marginTop: theme.space[5] }}>
        <button
          type="button"
          onClick={() => setShowIntel((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: theme.color.text,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {showIntel ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Radar size={14} color={theme.color.accent} />
          Threat intel enrichment
        </button>
        {showIntel && (
          <div
            className="tp-mini-pane-enter"
            style={{
              marginTop: theme.space[3],
              padding: theme.space[4],
              border: `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.sm,
              background: theme.color.background,
            }}
          >
            <LogIntelPanel open={open && showIntel} text={log.message} />
          </div>
        )}
      </div>
    </Modal>
  );
}
