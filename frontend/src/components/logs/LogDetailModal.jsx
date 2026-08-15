import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { SeverityBadge, Badge } from "../common/Badge";
import { Checkbox } from "../common/Input";
import Modal from "../common/Modal";
import { EventGuide } from "../common/EventGuide";
import { listAlerts } from "../../api/alerts";
import { formatTimestamp } from "../../utils/format";

const STATUS_COLORS = {
  open: theme.color.textMuted,
  ack: theme.color.accent,
  escalated: theme.color.severity.high,
  resolved: theme.color.severity.ok,
};

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

// `showIntel` mirrors the mockup's row.showIntel toggle — real enrichment
// (VirusTotal/AbuseIPDB-style lookups) is Threat Intel's own sprint (8, was
// 7 before Sprint 7 — Multi-Device Visibility got inserted 2026-08-15), not
// yet built, so this honestly says so rather than fabricating intel data.
export default function LogDetailModal({ open, onClose, log, sourceName }) {
  const [showIntel, setShowIntel] = useState(false);
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);

  // Traceability, the other direction from AlertDetailModal's "source log"
  // — a single log can match more than one rule, so this can be a real
  // list, not just a single id lookup.
  useEffect(() => {
    setTriggeredAlerts([]);
    if (open && log?.id) {
      listAlerts({ log_id: log.id })
        .then((data) => setTriggeredAlerts(data.items))
        .catch(() => {});
    }
  }, [open, log?.id]);

  if (!log) return null;

  return (
    <Modal open={open} onClose={onClose} title="Log detail" width={640}>
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.space[4], marginBottom: theme.space[5] }}
      >
        <Field label="Timestamp">{formatTimestamp(log.timestamp)}</Field>
        <Field label="Severity">
          <SeverityBadge severity={log.severity} />
        </Field>
        <Field label="Event type">{log.event_type}</Field>
        <Field label="Source">{sourceName || log.source_id}</Field>
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
          }}
        >
          {log.message}
        </div>
      </Field>

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

      <EventGuide eventType={log.event_type} />

      <div style={{ marginTop: theme.space[5] }}>
        <Checkbox
          label="Show threat intel enrichment"
          checked={showIntel}
          onChange={(e) => setShowIntel(e.target.checked)}
        />
        {showIntel && (
          <div
            style={{
              marginTop: theme.space[3],
              padding: theme.space[4],
              border: `1px dashed ${theme.color.border}`,
              borderRadius: theme.radius.sm,
              fontSize: 13,
              color: theme.color.textFaint,
            }}
          >
            Threat intel enrichment (IP/hash/domain reputation lookups) is coming in Sprint 8 — nothing to show yet for
            this log.
          </div>
        )}
      </div>
    </Modal>
  );
}
