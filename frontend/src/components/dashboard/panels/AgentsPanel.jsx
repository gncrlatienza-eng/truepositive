import { theme } from "../../../styles/theme";
import { formatTimestamp } from "../../../utils/format";
import { Badge } from "../../common/Badge";
import { EmptyNote, Section } from "./PanelPrimitives";

const STATUS_COLORS = {
  connected: theme.color.severity.ok,
  disconnected: theme.color.severity.high,
  pending: theme.color.textMuted,
};

// Backs the status banner's "Agents online X/Y" drill-down — reuses the
// plain agent list (`GET /agents`, same data Settings → Sources already
// shows) rather than a dedicated dashboard endpoint.
export default function AgentsPanel({ data }) {
  const agents = data || [];
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
                  border: `1px solid ${theme.color.border}`,
                  borderRadius: theme.radius.md,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: theme.color.textFaint }}>
                    {a.hostname || "not registered yet"}
                    {a.last_seen_at ? ` · last seen ${formatTimestamp(a.last_seen_at)}` : ""}
                  </div>
                </div>
                <Badge color={STATUS_COLORS[a.status]}>{a.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
