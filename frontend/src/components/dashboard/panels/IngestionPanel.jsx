import { HourBars } from "../../charts/HourBars";
import { Section, Stat } from "./PanelPrimitives";

export default function IngestionPanel({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Section title="Last 24h">
        <HourBars bars={data.hourly} />
      </Section>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Stat label="Peak hour" value={data.peak_hour_label || "—"} sub={`${data.peak_count} events`} />
        <Stat label="Avg/hour" value={data.avg_per_hour} />
        <Stat label="Today total" value={data.today_total} />
        <Stat label="vs previous" value={data.delta_vs_previous_pct != null ? `${data.delta_vs_previous_pct}%` : "—"} />
      </div>
      {data.top_type && (
        <Section title="Top type">
          <div style={{ fontSize: 14 }}>
            {data.top_type.label} — {data.top_type.count} ({data.top_type.pct}%)
          </div>
        </Section>
      )}
      {data.top_source && (
        <Section title="Top source">
          <div style={{ fontSize: 14 }}>
            {data.top_source.name} — {data.top_source.count}
          </div>
        </Section>
      )}
    </div>
  );
}
