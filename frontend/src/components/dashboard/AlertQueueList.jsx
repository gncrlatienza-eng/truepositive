import { theme } from "../../styles/theme";
import { Badge, SeverityBadge } from "../common/Badge";
import { formatTimestamp } from "../../utils/format";

// "open" was neutral gray — flagged twice in review as reading as
// unstyled/no-status. Given resolved/escalated/ack already claim
// ok/high/accent, "open" gets severity.medium: distinct from the other
// three, and "needs attention but not yet alarming" is the right register
// for an alert nobody has looked at yet.
const STATUS_COLORS = {
  open: theme.color.severity.medium,
  ack: theme.color.accent,
  escalated: theme.color.severity.high,
  resolved: theme.color.severity.ok,
};

// Read-only by design — no ack/escalate controls. The backend's
// AlertQueueItem schema has no action fields at all (Sprint 5 scope), so
// there's nothing here to wire up even accidentally.
export function AlertQueueList({ items, emptyMessage = "No alerts yet." }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ padding: theme.space[5], textAlign: "center", color: theme.color.textFaint, fontSize: 13 }}>
        {emptyMessage}
      </div>
    );
  }
  return (
    <div>
      {items.map((a) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "11px 20px",
            borderBottom: `1px solid ${theme.color.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 12, color: theme.color.textMuted, flexShrink: 0, width: 108, paddingTop: 2 }}>
              {formatTimestamp(a.created_at)}
            </span>
            <SeverityBadge severity={a.severity} />
            <span
              style={{
                fontSize: 14,
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {a.title}
            </span>
            <Badge color={STATUS_COLORS[a.status]}>{a.status}</Badge>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 12, color: theme.color.textMuted, paddingLeft: 118 }}>
            {a.source_label && <span>Source: {a.source_label}</span>}
            {a.rule_label && <span>{a.rule_label}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
