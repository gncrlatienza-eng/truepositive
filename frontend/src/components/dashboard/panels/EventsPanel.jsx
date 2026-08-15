import { HourBars } from "../../charts/HourBars";
import { BigStat, EmptyNote, RowBar, Section } from "./PanelPrimitives";

export default function EventsPanel({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <BigStat value={data.total} label={`events in the last ${data.window}`} />
      <Section title="Hourly">
        <HourBars bars={data.hourly} />
      </Section>
      <Section title="By type" hint="What kind of events these are, regardless of where they came from">
        {data.by_type.length === 0 && <EmptyNote />}
        {data.by_type.map((t) => (
          <RowBar key={t.label} label={t.label} count={t.count} pct={t.pct} />
        ))}
      </Section>
      <Section title="By source" hint="Which log source they came from, regardless of event type">
        {data.by_source.length === 0 && <EmptyNote />}
        {data.by_source.map((s) => (
          <RowBar key={s.source_id} label={s.name} count={s.count} pct={s.pct} />
        ))}
      </Section>
    </div>
  );
}
