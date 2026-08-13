import { theme } from "../../../styles/theme";
import { SeverityBadge } from "../../common/Badge";
import { AlertQueueList } from "../AlertQueueList";
import { BigStat, Section } from "./PanelPrimitives";

export default function AlertsPanel({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <BigStat value={data.total} label="active alerts" />
      <Section title="By status">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(data.by_status).map(([status, count]) => (
            <span
              key={status}
              style={{
                fontSize: 13,
                background: theme.color.background,
                border: `1px solid ${theme.color.border}`,
                borderRadius: 6,
                padding: "4px 10px",
                textTransform: "capitalize",
              }}
            >
              {status}: {count}
            </span>
          ))}
        </div>
      </Section>
      <Section title="By severity">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {data.by_severity.map((b) => (
            <span key={b.severity} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <SeverityBadge severity={b.severity} /> {b.count}
            </span>
          ))}
        </div>
      </Section>
      <Section title="Recent">
        <AlertQueueList items={data.recent} />
      </Section>
    </div>
  );
}
