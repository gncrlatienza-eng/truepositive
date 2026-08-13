import { SeverityBadge } from "../../common/Badge";
import { BigStat, Section } from "./PanelPrimitives";

// "Type" panel — keyed off Log.event_type (from the Events panel's "by
// type" rows). The schema has no per-alert Windows-event-ID concept the
// way the mockup's mock data does, so this reads real log/alert counts by
// exact event_type match instead.
export default function EventTypePanel({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <BigStat value={data.log_count} label={`log events · ${data.alert_count} produced alerts`} />
      <Section title="By severity">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {data.by_severity.map((b) => (
            <span key={b.severity} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <SeverityBadge severity={b.severity} /> {b.count}
            </span>
          ))}
        </div>
      </Section>
    </div>
  );
}
