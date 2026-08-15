import { theme } from "../../styles/theme";
import { Badge, SeverityBadge } from "../common/Badge";
import { Button } from "../common/Button";
import Modal from "../common/Modal";
import { formatTimestamp } from "../../utils/format";
import { useAuth } from "../../context/AuthContext";

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

export default function AlertDetailModal({ open, onClose, alert, ruleName, onUpdate }) {
  const { user } = useAuth();
  if (!alert) return null;

  const isMine = alert.assignee_id === user?.id;
  const nextStatus = NEXT_STATUS[alert.status];

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
      </div>
    </Modal>
  );
}
