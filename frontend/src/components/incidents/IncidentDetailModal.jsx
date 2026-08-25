import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, History, Laptop, Link2, Radar, StickyNote } from "lucide-react";
import { theme } from "../../styles/theme";
import { Badge, SeverityBadge } from "../common/Badge";
import { Button } from "../common/Button";
import { CollapsibleSection } from "../common/CollapsibleSection";
import { CopyButton } from "../common/CopyButton";
import { InfoTooltip } from "../common/InfoTooltip";
import Modal from "../common/Modal";
import { RadialGauge } from "../charts/RadialGauge";
import { formatTimestamp } from "../../utils/format";
import { mitreTechniqueHelp, SLA_HELP, STATUS_HELP } from "../../data/mitreGlossary";
import { useAuth } from "../../context/AuthContext";
import { useScope } from "../../context/ScopeContext";
import { useToast } from "../common/Toast";
import {
  addNote,
  linkAlert,
  listHistory,
  listIncidentAlerts,
  listNotes,
  unlinkAlert,
  updateIncident,
} from "../../api/incidents";
import { listAlerts, listRules } from "../../api/alerts";
import { getLog } from "../../api/logs";
import { LogIntelPanel } from "../logs/LogIntelPanel";
import ResolveModal from "./ResolveModal";
import EscalateModal from "./EscalateModal";
import ReassignModal from "./ReassignModal";
import FalsePositiveModal from "./FalsePositiveModal";

const STATUS_COLORS = {
  open: theme.color.textMuted,
  investigating: theme.color.severity.high,
  resolved: theme.color.severity.ok,
  false_positive: theme.color.textFaint,
};

const CLOSED_STATUSES = new Set(["resolved", "false_positive"]);

const HISTORY_ICONS = {
  created: "✦",
  status_changed: "⟳",
  assigned: "→",
  unassigned: "←",
  note_added: "✎",
  alert_linked: "⊕",
  alert_unlinked: "⊖",
};

// Same band set IntelPage's ReputationGauge uses for a 0-100 score — reused
// here rather than reinvented so "risk" reads the same visual language
// everywhere it appears in the app.
const RISK_BANDS = [
  { max: 25, color: theme.color.severity.ok, label: "Low" },
  { max: 50, color: theme.color.severity.medium, label: "Medium" },
  { max: 75, color: theme.color.severity.high, label: "Elevated" },
  { max: 100, color: theme.color.severity.critical, label: "High" },
];
function riskBand(score) {
  return RISK_BANDS.find((b) => score < b.max) || RISK_BANDS[RISK_BANDS.length - 1];
}

function Field({ label, children }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: theme.color.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, marginTop: 3 }}>{children}</div>
    </div>
  );
}

export default function IncidentDetailModal({ open, onClose, incident, onUpdate }) {
  const { user } = useAuth();
  const { agents, setScope } = useScope();
  const navigate = useNavigate();
  const showToast = useToast();

  const [alerts, setAlerts] = useState([]);
  const [notes, setNotes] = useState([]);
  const [history, setHistory] = useState([]);
  const [noteBody, setNoteBody] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Aggregated view across every linked alert's own source log — the
  // "synthesized picture" an incident is supposed to be, not just a flat
  // list of alert titles. rulesById backs the MITRE technique rollup;
  // alertLogs backs the device rollup, the per-alert message preview, and
  // the combined threat-intel panel below.
  const [rulesById, setRulesById] = useState({});
  const [alertLogs, setAlertLogs] = useState({});

  // Unlinked alerts for the link picker
  const [availableAlerts, setAvailableAlerts] = useState([]);
  const [linkingAlert, setLinkingAlert] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState("");

  // Sub-modals
  const [resolveOpen, setResolveOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [falsePositiveOpen, setFalsePositiveOpen] = useState(false);

  function reload() {
    if (!incident) return;
    listIncidentAlerts(incident.id)
      .then((items) => {
        setAlerts(items);
        const withLogs = items.filter((a) => a.log_id != null);
        return Promise.all(
          withLogs.map((a) =>
            getLog(a.log_id)
              .then((log) => [a.id, log])
              .catch(() => null),
          ),
        );
      })
      .then((pairs) => setAlertLogs(Object.fromEntries((pairs || []).filter(Boolean))))
      .catch(() => {});
    listNotes(incident.id)
      .then(setNotes)
      .catch(() => {});
    listHistory(incident.id)
      .then(setHistory)
      .catch(() => {});
  }

  useEffect(() => {
    if (open && incident) {
      reload();
      listRules()
        .then((rules) => setRulesById(Object.fromEntries(rules.map((r) => [r.id, r]))))
        .catch(() => {});
      // Load unlinked alerts for the link picker
      listAlerts({ limit: 200 })
        .then((data) => {
          setAvailableAlerts(data.items.filter((a) => !a.incident_id));
        })
        .catch(() => {});
    } else {
      setAlerts([]);
      setNotes([]);
      setHistory([]);
      setNoteBody("");
      setAlertLogs({});
    }
    // Deliberately keyed on incident?.id, not the incident object itself: onUpdate
    // (in IncidentsPage) replaces incident with a new object of the same id on every
    // note/link/status change, and reload() already re-fetches after those actions —
    // depending on the object reference (or the non-memoized reload function) would
    // re-run this effect, and re-fetch availableAlerts, on every such update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, incident?.id]);

  if (!incident) return null;

  const isMine = incident.assignee_id === user?.id;

  const logList = Object.values(alertLogs);
  const deviceIds = [...new Set(logList.map((l) => l.agent_id).filter(Boolean))];
  const devices = deviceIds.map((id) => agents.find((a) => a.id === id)).filter(Boolean);
  const techniques = [
    ...new Set(alerts.map((a) => a.rule_id && rulesById[a.rule_id]?.mitre_technique).filter(Boolean)),
  ];
  const combinedLogText = logList.map((l) => l.message).join("\n");

  function handleViewDeviceLogs(agentId) {
    setScope({ mode: "agent", agentId });
    onClose();
    navigate("/app/logs");
  }

  async function handleAddNote() {
    if (!noteBody.trim()) return;
    setAddingNote(true);
    try {
      await addNote(incident.id, { body: noteBody.trim() });
      setNoteBody("");
      await reload();
    } catch {
      showToast("Could not add note.", "error");
    } finally {
      setAddingNote(false);
    }
  }

  async function handleLinkAlert() {
    if (!selectedAlertId) return;
    setLinkingAlert(true);
    try {
      const updated = await linkAlert(incident.id, selectedAlertId);
      onUpdate(updated);
      setSelectedAlertId("");
      await reload();
      setAvailableAlerts((prev) => prev.filter((a) => a.id !== selectedAlertId));
    } catch {
      showToast("Could not link that alert.", "error");
    } finally {
      setLinkingAlert(false);
    }
  }

  async function handleUnlinkAlert(alertId) {
    try {
      const updated = await unlinkAlert(incident.id, alertId);
      onUpdate(updated);
      await reload();
      listAlerts({ limit: 200 })
        .then((data) => setAvailableAlerts(data.items.filter((a) => !a.incident_id)))
        .catch(() => {});
    } catch {
      showToast("Could not unlink that alert.", "error");
    }
  }

  async function handleStatusUpdate(newStatus, note) {
    try {
      const updated = await updateIncident(incident.id, { status: newStatus });
      if (note?.trim()) {
        await addNote(incident.id, { body: note.trim() });
      }
      onUpdate(updated);
      reload();
    } catch {
      showToast("Could not update incident.", "error");
    }
  }

  async function handleReassign(assigneeId) {
    try {
      const updated = await updateIncident(incident.id, {
        assignee_id: assigneeId,
      });
      onUpdate(updated);
      reload();
    } catch {
      showToast("Could not reassign incident.", "error");
    }
  }

  // SLA remaining calculation
  const createdMs = new Date(incident.created_at).getTime();
  const slaMs = incident.sla_hours * 60 * 60 * 1000;
  const remaining = Math.max(0, createdMs + slaMs - Date.now());
  const remainingHours = Math.floor(remaining / 3_600_000);
  const remainingMins = Math.floor((remaining % 3_600_000) / 60_000);
  const slaText = CLOSED_STATUSES.has(incident.status)
    ? incident.status === "resolved"
      ? "Resolved"
      : "False positive"
    : incident.sla_breached
      ? "⚠ SLA breached"
      : `${remainingHours}h ${remainingMins}m remaining`;

  const band = riskBand(incident.risk_score);

  return (
    <>
      <Modal open={open} onClose={onClose} title={incident.title} width={760}>
        {/* Metadata grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: theme.space[4],
            marginBottom: theme.space[5],
          }}
        >
          <Field label="Status">
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              <Badge color={STATUS_COLORS[incident.status]}>{incident.status}</Badge>
              {STATUS_HELP[incident.status] && <InfoTooltip text={STATUS_HELP[incident.status]} />}
            </span>
          </Field>
          <Field label="Risk score">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RadialGauge value={incident.risk_score} bands={RISK_BANDS} size={44} thickness={6} />
              <div>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 15, color: band.color }}>{incident.risk_score}</span>
                  <span style={{ fontSize: 11, color: theme.color.textMuted }}>/100</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: band.color }}>{band.label}</div>
              </div>
            </div>
          </Field>
          <Field label="SLA">
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              <span
                style={{
                  color: incident.sla_breached ? theme.color.severity.critical : theme.color.severity.ok,
                  fontSize: 13,
                }}
              >
                {slaText}
              </span>
              <InfoTooltip text={SLA_HELP} />
            </span>
          </Field>
          <Field label="Assignee">{isMine ? "You" : incident.assignee_id ? "Assigned" : "Unassigned"}</Field>
          <Field label="Created">{formatTimestamp(incident.created_at)}</Field>
          <Field label="Updated">{formatTimestamp(incident.updated_at)}</Field>
        </div>

        {incident.description && (
          <div style={{ marginBottom: theme.space[5], position: "relative" }}>
            <div
              style={{
                padding: theme.space[3],
                background: theme.color.background,
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.sm,
                fontSize: 13,
                whiteSpace: "pre-wrap",
                color: theme.color.textMuted,
                paddingRight: 32,
              }}
            >
              {incident.description}
            </div>
            <div style={{ position: "absolute", top: 6, right: 8 }}>
              <CopyButton value={incident.description} label="Copy description" />
            </div>
          </div>
        )}

        {/* Devices/techniques rollup — the synthesized picture across every
            linked alert's own source log, not just a flat alert list. */}
        {(devices.length > 0 || techniques.length > 0) && (
          <div style={{ display: "flex", gap: theme.space[5], marginBottom: theme.space[5], flexWrap: "wrap" }}>
            {devices.length > 0 && (
              <Field label="Devices involved">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {devices.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleViewDeviceLogs(d.id)}
                      title={`View ${d.name}'s logs`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        padding: "4px 9px",
                        borderRadius: 999,
                        border: `1px solid ${theme.color.border}`,
                        background: theme.color.surface,
                        color: theme.color.text,
                        cursor: "pointer",
                      }}
                    >
                      <Laptop size={11} color={theme.color.textMuted} />
                      {d.name}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            {techniques.length > 0 && (
              <Field label="MITRE techniques touched">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {techniques.map((t) => (
                    <span key={t} style={{ display: "inline-flex", alignItems: "center" }}>
                      <Badge color={theme.color.accent}>{t}</Badge>
                      <InfoTooltip text={mitreTechniqueHelp(t)} />
                    </span>
                  ))}
                </div>
              </Field>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!CLOSED_STATUSES.has(incident.status) && (
          <div
            style={{
              display: "flex",
              gap: theme.space[2],
              marginBottom: theme.space[5],
              flexWrap: "wrap",
            }}
          >
            {incident.status === "open" && (
              <Button size="sm" onClick={() => setEscalateOpen(true)}>
                Escalate
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setResolveOpen(true)}>
              Resolve
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setFalsePositiveOpen(true)}>
              False positive
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setReassignOpen(true)}>
              Reassign
            </Button>
            {isMine ? (
              <Button size="sm" variant="secondary" onClick={() => handleReassign(null)}>
                Unassign
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => handleReassign(user?.id)}>
                Assign to me
              </Button>
            )}
          </div>
        )}
        {CLOSED_STATUSES.has(incident.status) && (
          <div style={{ marginBottom: theme.space[5] }}>
            <Button size="sm" variant="secondary" onClick={() => handleStatusUpdate("open", null)}>
              Reopen
            </Button>
          </div>
        )}

        {/* ── Collapsible sections ── */}

        <div style={{ display: "flex", flexDirection: "column", gap: theme.space[3] }}>
          <CollapsibleSection icon={Link2} title="Linked alerts" count={alerts.length} defaultOpen={alerts.length > 0}>
            {alerts.length === 0 ? (
              <div style={{ fontSize: 13, color: theme.color.textMuted }}>No alerts linked yet.</div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: theme.space[2], marginBottom: theme.space[3] }}
              >
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      padding: theme.space[2],
                      border: `1px solid ${theme.color.border}`,
                      borderRadius: theme.radius.sm,
                      background: theme.color.surface,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: theme.space[3] }}>
                      <SeverityBadge severity={a.severity} />
                      <span
                        style={{
                          flex: 1,
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {a.title}
                      </span>
                      <span style={{ fontSize: 11, color: theme.color.textMuted, whiteSpace: "nowrap" }}>
                        {formatTimestamp(a.created_at)}
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => handleUnlinkAlert(a.id)}>
                        Unlink
                      </Button>
                    </div>
                    {alertLogs[a.id] && (
                      <div
                        style={{
                          marginTop: 6,
                          paddingLeft: 2,
                          fontSize: 12,
                          fontFamily: theme.font.mono,
                          color: theme.color.textFaint,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {alertLogs[a.id].message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Link alert picker */}
            <div style={{ display: "flex", gap: theme.space[2], marginTop: theme.space[2] }}>
              <select
                value={selectedAlertId}
                onChange={(e) => setSelectedAlertId(e.target.value)}
                className="tp-field-input"
                style={{ flex: 1, fontSize: 13 }}
              >
                <option value="">Select an alert to link…</option>
                {availableAlerts.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.severity}] {a.title}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={!selectedAlertId || linkingAlert} onClick={handleLinkAlert}>
                {linkingAlert ? "Linking…" : "Link"}
              </Button>
            </div>
          </CollapsibleSection>

          {combinedLogText && (
            <CollapsibleSection icon={Radar} title="Threat intel across linked alerts">
              <LogIntelPanel open={open} text={combinedLogText} />
            </CollapsibleSection>
          )}

          <CollapsibleSection icon={History} title="Timeline" count={history.length} defaultOpen>
            {history.length === 0 ? (
              <div style={{ fontSize: 13, color: theme.color.textMuted }}>No history yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {history.map((h, i) => (
                  <div
                    key={h.id}
                    style={{
                      display: "flex",
                      gap: theme.space[3],
                      paddingBottom: theme.space[3],
                      position: "relative",
                    }}
                  >
                    {/* Vertical line connecting events */}
                    {i < history.length - 1 && (
                      <div
                        style={{
                          position: "absolute",
                          left: 9,
                          top: 20,
                          bottom: 0,
                          width: 1,
                          background: theme.color.border,
                        }}
                      />
                    )}
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: theme.color.surface,
                        border: `1px solid ${theme.color.accent}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        flexShrink: 0,
                        zIndex: 1,
                      }}
                    >
                      {HISTORY_ICONS[h.kind] || "·"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {h.kind.replace(/_/g, " ")}
                        {h.detail && (
                          <span style={{ fontWeight: 400, color: theme.color.textMuted }}> — {h.detail}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: theme.color.textMuted }}>{formatTimestamp(h.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection icon={StickyNote} title="Notes" count={notes.length}>
            {notes.length === 0 ? (
              <div style={{ fontSize: 13, color: theme.color.textMuted, marginBottom: theme.space[3] }}>
                No notes yet.
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: theme.space[3], marginBottom: theme.space[4] }}
              >
                {notes.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: theme.space[3],
                      border: `1px solid ${theme.color.border}`,
                      borderRadius: theme.radius.sm,
                      background: theme.color.surface,
                    }}
                  >
                    <div style={{ fontSize: 11, color: theme.color.textMuted, marginBottom: 4 }}>
                      {formatTimestamp(n.created_at)}
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{n.body}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
              <textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Add a note…"
                rows={3}
                className="tp-field-input"
                style={{ resize: "vertical", fontSize: 13, fontFamily: "inherit" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button size="sm" disabled={!noteBody.trim() || addingNote} onClick={handleAddNote}>
                  {addingNote ? "Adding…" : "Add note"}
                </Button>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            icon={FileText}
            title="Assignment history"
            count={history.filter((h) => h.kind === "assigned" || h.kind === "unassigned").length}
          >
            {history.filter((h) => h.kind === "assigned" || h.kind === "unassigned").length === 0 ? (
              <div style={{ fontSize: 13, color: theme.color.textMuted }}>No assignment changes.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
                {history
                  .filter((h) => h.kind === "assigned" || h.kind === "unassigned")
                  .map((h) => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span>
                        {h.kind === "assigned" ? "Assigned" : "Unassigned"}
                        {h.detail && <span style={{ color: theme.color.textMuted }}> · {h.detail}</span>}
                      </span>
                      <span style={{ fontSize: 11, color: theme.color.textMuted }}>
                        {formatTimestamp(h.created_at)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CollapsibleSection>
        </div>
      </Modal>

      <ResolveModal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onConfirm={(note) => {
          setResolveOpen(false);
          handleStatusUpdate("resolved", note);
        }}
      />
      <FalsePositiveModal
        open={falsePositiveOpen}
        onClose={() => setFalsePositiveOpen(false)}
        onConfirm={(note) => {
          setFalsePositiveOpen(false);
          handleStatusUpdate("false_positive", note);
        }}
      />
      <EscalateModal
        open={escalateOpen}
        onClose={() => setEscalateOpen(false)}
        currentStatus={incident.status}
        onConfirm={(note) => {
          setEscalateOpen(false);
          handleStatusUpdate("investigating", note);
        }}
      />
      <ReassignModal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        onConfirm={(assigneeId) => {
          setReassignOpen(false);
          handleReassign(assigneeId);
        }}
      />
    </>
  );
}
