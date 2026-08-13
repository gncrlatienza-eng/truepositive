import { theme } from "../../styles/theme";
import { Card } from "../common/Card";

export function IngestionSummaryCard({ ingest, onOpen }) {
  return (
    <Card
      title="Ingestion summary"
      action={
        <span
          onClick={onOpen}
          role="button"
          tabIndex={0}
          style={{ fontSize: 14, color: theme.color.accent, cursor: "pointer", fontWeight: 600 }}
        >
          Details →
        </span>
      }
    >
      <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Stat label="Peak hour" value={ingest.peak_hour_label || "—"} sub={`${ingest.peak_count} events`} />
        <Stat label="Avg / hour" value={ingest.avg_per_hour} sub="events/hour" />
        <Stat label="Today total" value={ingest.today_total} sub="events ingested" accent />
        <Stat
          label="vs previous"
          value={ingest.delta_vs_previous_pct != null ? `${ingest.delta_vs_previous_pct}%` : "—"}
          sub={ingest.status === "healthy" ? "Healthy" : "Quiet"}
        />
      </div>
    </Card>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: theme.color.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ? theme.color.accent : theme.color.text }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: theme.color.textMuted, marginTop: 4 }}>{sub}</div>
    </div>
  );
}
