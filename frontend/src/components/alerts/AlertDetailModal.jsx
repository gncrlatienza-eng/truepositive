import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { Badge, SeverityBadge } from "../common/Badge";
import { Button } from "../common/Button";
import Modal from "../common/Modal";
import { EventGuide } from "../common/EventGuide";
import { getLog } from "../../api/logs";
import { formatTimestamp } from "../../utils/format";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../common/Toast";
import { listIncidents, linkAlert, createIncident } from "../../api/incidents";

const STATUS_COLORS = {
  open: theme.color.textMuted,
  ack: theme.color.accent,
  escalated: theme.color.severity.high,
  resolved: theme.color.severity.ok,
};

// Same OPEN -> ACK -> ESCALATED -> RESOLVED progression the mockup implies,
// plus a reopen path — the backend itself doesn't enforce a state machine
// (any status is settable via PATCH), this is just the UI's suggested flow.
const NEXT_STATUS = { open: "ack", ack: "escalated", escalated: "resolved" };
const NEXT_LABEL = { open: "Acknowledge", ack: "Escalate", escalated: "Resolve" };

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.color.textMuted, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, marginTop: 2 }}>{children}</div>
    </div>
  );
}

export default function AlertDetailModal({ open, onClose, alert, ruleName, eventType, onUpdate }) {
  const { user } = useAuth();
  const showToast = useToast();
  const [sourceLog, setSourceLog] = useState(null);

  // Link-to-incident picker state
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [openIncidents, setOpenIncidents] = useState([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const [linking, setLinking] = useState(false);

  // Traceability: the alert already carries the id of the log that
  // triggered it (Alert.log_id, set at ingestion time) — fetch it fresh
  // per-alert rather than trusting a prop the caller might not have, since
  // AlertsPage only ever has the alert list's own fields, not the log.
  useEffect(() => {
    setSourceLog(null);
    setShowLinkPicker(false);
    setSelectedIncidentId("");
    if (open && alert?.log_id) {
      getLog(alert.log_id)
        .then(setSourceLog)
        .catch(() => {});
    }
    if (open && !alert?.incident_id) {
      // Pre-load open/investigating incidents for the link picker.
      Promise.all([
        listIncidents({ status: "open", limit: 100 }),
        listIncidents({ status: "investigating", limit: 100 }),
      ])
        .then(([openData, invData]) => {
          setOpenIncidents([...openData.items, ...invData.items]);
        })
        .catch(() => {});
    }
  }, [open, alert?.log_id, alert?.incident_id]);

  if (!alert) return null;

  const isMine = alert.assignee_id === user?.id;
  const nextStatus = NEXT_STATUS[alert.status];

  async function handleLinkToExisting() {
    if (!selectedIncidentId) return;
    setLinking(true);
    try {
      await linkAlert(selectedIncidentId, alert.id);
      showToast("Alert linked to incident.", "success");
      setShowLinkPicker(false);
      onClose();
    } catch {
      showToast("Could not link alert to incident.", "error");
    } finally {
      setLinking(false);
    }
  }

  async function handleCreateIncident() {
    setLinking(true);
    try {
      const inc = await createIncident({ title: alert.title, severity: alert.severity });
      await linkAlert(inc.id, alert.id);
      showToast("Incident created and alert linked.", "success");
      setShowLinkPicker(false);
      onClose();
    } catch {
      showToast("Could not create incident.", "error");
    } finally {
      setLinking(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={alert.title} width={640}>
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.space[4], marginBottom: theme.space[5] }}
      >
        <Field label="Severity">
          <SeverityBadge severity={alert.severity} />
        </Field>
        <Field label="Status">
          <Badge color={STATUS_COLORS[alert.status]}>{alert.status}</Badge>
        </Field>
        <Field label="Rule">{ruleName || "—"}</Field>
        <Field label="Assignee">{isMine ? "You" : alert.assignee_id ? "Assigned" : "Unassigned"}</Field>
        <Field label="Created">{formatTimestamp(alert.created_at)}</Field>
        <Field label="Updated">{formatTimestamp(alert.updated_at)}</Field>
        {alert.incident_id && (
          <Field label="Incident">
            <span style={{ fontSize: 12, color: theme.color.accent }}>Linked ✓</span>
          </Field>
        )}
      </div>

      {alert.description && (
        <Field label="Description">
          <div
            style={{
              marginTop: 6,
              padding: theme.space[3],
              background: theme.color.background,
              border: `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.sm,
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            {alert.description}
          </div>
        </Field>
      )}

      {sourceLog && (
        <Field label="Source log">
          <div
            style={{
              marginTop: 6,
              padding: theme.space[3],
              background: theme.color.background,
              border: `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.sm,
              fontSize: 13,
            }}
          >
            <div style={{ color: theme.color.textMuted, marginBottom: 4 }}>
              {formatTimestamp(sourceLog.timestamp)} · {sourceLog.event_type}
            </div>
            <div style={{ fontFamily: theme.font.mono, whiteSpace: "pre-wrap" }}>{sourceLog.message}</div>
          </div>
        </Field>
      )}

      <EventGuide eventType={eventType} />

      {/* Link-to-incident inline picker — shown when "Link to incident" is clicked */}
      {showLinkPicker && !alert.incident_id && (
        <div
          style={{
            marginTop: theme.space[4],
            padding: theme.space[4],
            border: `1px solid ${theme.color.accent}`,
            borderRadius: theme.radius.md,
            background: "rgba(8,145,178,0.05)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: theme.space[3] }}>Link to incident</div>
          <div style={{ display: "flex", gap: theme.space[2], marginBottom: theme.space[3] }}>
            <select
              value={selectedIncidentId}
              onChange={(e) => setSelectedIncidentId(e.target.value)}
              className="tp-field-input"
              style={{ flex: 1, fontSize: 13 }}
            >
              <option value="">Select an existing incident…</option>
              {openIncidents.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  [{inc.status}] {inc.title}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={!selectedIncidentId || linking} onClick={handleLinkToExisting}>
              {linking ? "Linking…" : "Link"}
            </Button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: theme.space[3] }}>
            <div style={{ flex: 1, height: 1, background: theme.color.border }} />
            <span style={{ fontSize: 12, color: theme.color.textMuted }}>or</span>
            <div style={{ flex: 1, height: 1, background: theme.color.border }} />
          </div>
          <div style={{ marginTop: theme.space[3] }}>
            <Button
              size="sm"
              variant="secondary"
              disabled={linking}
              onClick={handleCreateIncident}
              style={{ width: "100%" }}
            >
              {linking ? "Creating…" : `New incident from this alert`}
            </Button>
          </div>
          <div style={{ marginTop: theme.space[3], display: "flex", justifyContent: "flex-end" }}>
            <Button size="sm" variant="secondary" onClick={() => setShowLinkPicker(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: theme.space[3], marginTop: theme.space[6], flexWrap: "wrap" }}>
        {nextStatus && <Button onClick={() => onUpdate({ status: nextStatus })}>{NEXT_LABEL[alert.status]}</Button>}
        {alert.status !== "resolved" && (
          <Button variant="secondary" onClick={() => onUpdate({ status: "resolved" })}>
            Resolve
          </Button>
        )}
        {alert.status === "resolved" && (
          <Button variant="secondary" onClick={() => onUpdate({ status: "open" })}>
            Reopen
          </Button>
        )}
        {isMine ? (
          <Button variant="secondary" onClick={() => onUpdate({ assignee_id: null })}>
            Unassign
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => onUpdate({ assignee_id: user?.id })}>
            Assign to me
          </Button>
        )}
        {/* Link-to-incident: show if not yet linked */}
        {!alert.incident_id && (
          <Button variant="secondary" onClick={() => setShowLinkPicker((v) => !v)}>
            {showLinkPicker ? "Cancel link" : "Link to incident"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
