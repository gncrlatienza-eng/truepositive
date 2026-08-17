import { theme } from "../../../styles/theme";
import { formatTimestamp } from "../../../utils/format";
import { Badge } from "../../common/Badge";
import { EmptyNote, Section } from "./PanelPrimitives";

const STATUS_COLORS = {
  connected: theme.color.severity.ok,
  disconnected: theme.color.severity.high,
  pending: theme.color.textMuted,
};

// Backs the status banner's "Agents online X/Y" drill-down — GET
// /dashboard/panels/agents (Sprint 7), which enriches the plain agent list
// with real per-agent event/alert counts for the current window and the
// is_primary flag, instead of just connection status.
export default function AgentsPanel({ data, onSetPrimary }) {
  const agents = data?.agents || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Section title={`${agents.length} agent${agents.length === 1 ? "" : "s"}`}>
        {agents.length === 0 ? (
          <EmptyNote>No agents deployed yet.</EmptyNote>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {agents.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  border: `1px solid ${a.is_primary ? theme.color.accent : theme.color.border}`,
                  borderRadius: theme.radius.md,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                    {a.is_primary && <Badge color={theme.color.accent}>Primary</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: theme.color.textFaint }}>
                    {a.hostname || "not registered yet"}
                    {a.last_seen_at ? ` · last seen ${formatTimestamp(a.last_seen_at)}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: theme.color.textFaint, marginTop: 2 }}>
                    {a.event_count.toLocaleString()} event{a.event_count === 1 ? "" : "s"} ·{" "}
                    {a.alert_count.toLocaleString()} alert{a.alert_count === 1 ? "" : "s"} this window
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <Badge color={STATUS_COLORS[a.status]}>{a.status}</Badge>
                  {!a.is_primary && onSetPrimary && (
                    <button
                      type="button"
                      onClick={() => onSetPrimary(a.id)}
                      style={{
                        background: "none",
                        border: `1px solid ${theme.color.border}`,
                        borderRadius: theme.radius.sm,
                        color: theme.color.textMuted,
                        fontSize: 11,
                        padding: "4px 8px",
                        cursor: "pointer",
                      }}
                    >
                      Mark as primary
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
