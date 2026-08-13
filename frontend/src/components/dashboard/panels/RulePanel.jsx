import { theme } from "../../../styles/theme";
import { HourBars } from "../../charts/HourBars";
import { SeverityBadge } from "../../common/Badge";
import { AlertQueueList } from "../AlertQueueList";
import { EmptyNote, Section, Stat } from "./PanelPrimitives";

// "Pattern" panel — keyed off AlertRule (from the dashboard's Top Alert
// Types clicks). No MITRE tactic/TID, risk-label chip, or exception
// workflow — that heuristic/narrative layer is explicitly out of scope
// this sprint (see docs/SPRINT_PLAN.md Sprint 4).
export default function RulePanel({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <SeverityBadge severity={data.severity} />
        <span style={{ fontSize: 13, color: data.enabled ? theme.color.severity.ok : theme.color.textFaint }}>
          {data.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Stat
          label="Today"
          value={data.count_today}
          sub={data.vs_yesterday_pct != null ? `${data.vs_yesterday_pct}% vs yesterday` : ""}
        />
        <Stat label="Yesterday" value={data.count_yesterday} />
        <Stat
          label="Weekly avg/day"
          value={data.weekly_avg}
          sub={data.vs_weekly_pct != null ? `${data.vs_weekly_pct}% vs weekly` : ""}
        />
        <Stat label="Monthly avg/day" value={data.monthly_avg} />
      </div>
      <Section title="Last 24h">
        <HourBars bars={data.hourly} />
      </Section>
      <Section title="Top sources">
        {data.top_sources.length === 0 && <EmptyNote>None.</EmptyNote>}
        {data.top_sources.map((s) => (
          <div key={s.source_id} style={{ fontSize: 14, padding: "4px 0" }}>
            {s.name} — {s.count}
          </div>
        ))}
      </Section>
      <Section title="Recent alerts">
        <AlertQueueList items={data.recent} />
      </Section>
      <Section title="Other active rules">
        {data.other_rules.length === 0 && <EmptyNote>None.</EmptyNote>}
        {data.other_rules.map((r) => (
          <div key={r.rule_id} style={{ fontSize: 14, padding: "4px 0" }}>
            {r.label} — {r.count}
          </div>
        ))}
      </Section>
    </div>
  );
}
