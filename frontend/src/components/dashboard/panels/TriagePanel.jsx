import { theme } from "../../../styles/theme";
import { formatDuration } from "../../../utils/format";
import { BigStat, Section } from "./PanelPrimitives";

export default function TriagePanel({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ fontSize: 13, color: theme.color.textFaint, lineHeight: 1.5 }}>
        Triage time: how long it takes from an alert firing to your first action on it (ack, escalate, or resolve).
        Lower is better — it means alerts aren&apos;t sitting untouched.
      </div>
      {data.median_seconds != null ? (
        <BigStat
          value={formatDuration(data.median_seconds)}
          label={`median across ${data.sample_size} triaged alerts`}
        />
      ) : (
        <div style={{ fontSize: 14, color: theme.color.textFaint, lineHeight: 1.5 }}>
          No triaged alerts yet — nothing has moved off &quot;open&quot; status. Ack/escalate actions ship in Sprint 5.
        </div>
      )}
      {data.slowest_by_rule.length > 0 && (
        <Section title="Slowest by rule">
          {data.slowest_by_rule.map((r) => (
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
              <span style={{ color: theme.color.textMuted }}>{formatDuration(r.count)}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
