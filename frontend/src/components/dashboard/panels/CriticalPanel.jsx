import { theme } from "../../../styles/theme";
import { formatDuration } from "../../../utils/format";
import { AlertQueueList } from "../AlertQueueList";
import { BigStat, Section } from "./PanelPrimitives";

export default function CriticalPanel({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <BigStat value={data.count} label="critical alerts active" color={theme.color.severity.critical} />
      {data.oldest_title && (
        <div
          style={{
            fontSize: 14,
            color: data.sla_breached ? theme.color.severity.critical : theme.color.textMuted,
          }}
        >
          Oldest: {data.oldest_title} — {formatDuration(data.oldest_age_seconds)} ago
          {data.sla_breached ? " · SLA breached (15min)" : ""}
        </div>
      )}
      <Section title="Recent critical alerts">
        <AlertQueueList items={data.recent} emptyMessage="No critical alerts." />
      </Section>
    </div>
  );
}
