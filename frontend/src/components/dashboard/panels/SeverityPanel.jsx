import { theme } from "../../../styles/theme";
import { AlertQueueList } from "../AlertQueueList";
import { BigStat, EmptyNote, Section } from "./PanelPrimitives";

export default function SeverityPanel({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <BigStat
        value={data.count}
        label={`${data.pct_of_active}% of active alerts`}
        color={theme.color.severity[data.severity]}
      />
      <Section title="By rule">
        {data.by_rule.length === 0 && <EmptyNote />}
        {data.by_rule.map((r) => (
          <div
            key={r.rule_id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 14,
              padding: "6px 0",
              borderBottom: `1px solid ${theme.color.border}`,
            }}
          >
            <span>{r.label}</span>
            <span style={{ color: theme.color.textMuted }}>{r.count}</span>
          </div>
        ))}
      </Section>
      <Section title="By source">
        {data.by_source.length === 0 && <EmptyNote />}
        {data.by_source.map((s) => (
          <div
            key={s.source_id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 14,
              padding: "6px 0",
              borderBottom: `1px solid ${theme.color.border}`,
            }}
          >
            <span>{s.name}</span>
            <span style={{ color: theme.color.textMuted }}>{s.count}</span>
          </div>
        ))}
      </Section>
      <Section title="Recent">
        <AlertQueueList items={data.recent} />
      </Section>
    </div>
  );
}
