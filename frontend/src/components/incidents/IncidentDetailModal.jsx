import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText, History, Link2, StickyNote } from "lucide-react";
import { theme } from "../../styles/theme";
import { Badge, SeverityBadge } from "../common/Badge";
import { Button } from "../common/Button";
import Modal from "../common/Modal";
import { formatTimestamp } from "../../utils/format";
import { useAuth } from "../../context/AuthContext";
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
import { listAlerts } from "../../api/alerts";
import ResolveModal from "./ResolveModal";
import EscalateModal from "./EscalateModal";
import ReassignModal from "./ReassignModal";

const STATUS_COLORS = {
  open: theme.color.textMuted,
  investigating: theme.color.severity.high,
  resolved: theme.color.severity.ok,
};

const HISTORY_ICONS = {
  created: "✦",
  status_changed: "⟳",
  assigned: "→",
  unassigned: "←",
  note_added: "✎",
  alert_linked: "⊕",
  alert_unlinked: "⊖",
};

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

// Collapsible section — new UI primitive for this app. Simple toggle, no external
// accordion library, consistent with the dark theme's existing border weight.
function CollapsibleSection({ icon: Icon, title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.md,
        overflow: "hidden",
        marginBottom: theme.space[3],
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: theme.space[2],
          padding: `${theme.space[3]} ${theme.space[4]}`,
          background: open ? "rgba(8,145,178,0.06)" : theme.color.surface,
          border: "none",
          cursor: "pointer",
          color: theme.color.text,
          textAlign: "left",
          transition: "background 150ms ease",
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {Icon && <Icon size={14} color={theme.color.textMuted} />}
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{title}</span>
        {count != null && (
          <Badge color={theme.color.textMuted} style={{ fontSize: 11 }}>
            {count}
          </Badge>
        )}
      </button>
      {open && (
        <div
          style={{
            padding: theme.space[4],
            borderTop: `1px solid ${theme.color.border}`,
            background: theme.color.background,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default function IncidentDetailModal({ open, onClose, incident, onUpdate }) {
  const { user } = useAuth();
  const showToast = useToast();

  const [alerts, setAlerts] = useState([]);
  const [notes, setNotes] = useState([]);
  const [history, setHistory] = useState([]);
  const [noteBody, setNoteBody] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Unlinked alerts for the link picker
  const [availableAlerts, setAvailableAlerts] = useState([]);
  const [linkingAlert, setLinkingAlert] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState("");

  // Sub-modals
  const [resolveOpen, setResolveOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  function reload() {
    if (!incident) return;
    listIncidentAlerts(incident.id)
      .then(setAlerts)
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
  const slaText =
    incident.status === "resolved"
      ? "Resolved"
      : incident.sla_breached
        ? "⚠ SLA breached"
        : `${remainingHours}h ${remainingMins}m remaining`;

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
            <Badge color={STATUS_COLORS[incident.status]}>{incident.status}</Badge>
          </Field>
          <Field label="Risk score">
            <span
              style={{
                fontWeight: 600,
                fontSize: 15,
                color:
                  incident.risk_score >= 75
                    ? theme.color.severity.critical
                    : incident.risk_score >= 50
                      ? theme.color.severity.high
                      : theme.color.textMuted,
              }}
            >
              {incident.risk_score}
            </span>
            <span style={{ fontSize: 12, color: theme.color.textMuted }}>/100</span>
          </Field>
          <Field label="SLA">
            <span
              style={{
                color: incident.sla_breached ? theme.color.severity.critical : theme.color.severity.ok,
                fontSize: 13,
              }}
            >
              {slaText}
            </span>
          </Field>
          <Field label="Assignee">{isMine ? "You" : incident.assignee_id ? "Assigned" : "Unassigned"}</Field>
          <Field label="Created">{formatTimestamp(incident.created_at)}</Field>
          <Field label="Updated">{formatTimestamp(incident.updated_at)}</Field>
        </div>

        {incident.description && (
          <div
            style={{
              marginBottom: theme.space[5],
              padding: theme.space[3],
              background: theme.color.background,
              border: `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.sm,
              fontSize: 13,
              whiteSpace: "pre-wrap",
              color: theme.color.textMuted,
            }}
          >
            {incident.description}
          </div>
        )}

        {/* Action buttons */}
        {incident.status !== "resolved" && (
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
        {incident.status === "resolved" && (
          <div style={{ marginBottom: theme.space[5] }}>
            <Button size="sm" variant="secondary" onClick={() => handleStatusUpdate("open", null)}>
              Reopen
            </Button>
          </div>
        )}

        {/* ── Collapsible sections ── */}

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
                    display: "flex",
                    alignItems: "center",
                    gap: theme.space[3],
                    padding: theme.space[2],
                    border: `1px solid ${theme.color.border}`,
                    borderRadius: theme.radius.sm,
                    background: theme.color.surface,
                  }}
                >
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
                      {h.detail && <span style={{ fontWeight: 400, color: theme.color.textMuted }}> — {h.detail}</span>}
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
                    <span style={{ fontSize: 11, color: theme.color.textMuted }}>{formatTimestamp(h.created_at)}</span>
                  </div>
                ))}
            </div>
          )}
        </CollapsibleSection>
      </Modal>

      <ResolveModal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onConfirm={(note) => {
          setResolveOpen(false);
          handleStatusUpdate("resolved", note);
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
