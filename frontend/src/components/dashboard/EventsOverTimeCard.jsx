import { theme } from "../../styles/theme";
import { Card } from "../common/Card";
import { HourBars } from "../charts/HourBars";
import { formatLocalHour } from "../../utils/time";

// Pi-hole-style centerpiece chart: one large, prominent gradient area chart
// directly under the KPI row, spanning the full content width. The ingestion
// stat strip lives below the chart inside the same card so the two pieces of
// information (trend over time + summary numbers) read as one unit — the same
// pattern Pi-hole uses (charts_ref1.png: big chart, then supporting stats).
//
// `bars`  : [{ hour_label, count }] — events KPI sparkline (already fetched)
// `ingest`: IngestSummary from dashboard summary — no extra endpoint needed
// `window`: "24h" | "7d" | "30d" — used in the card title
export function EventsOverTimeCard({ bars, ingest, window, onOpen }) {
  const delta = ingest?.delta_vs_previous_pct;
  const deltaPositive = delta != null && delta > 0;
  const deltaNegative = delta != null && delta < 0;

  return (
    <Card
      title={`Events over last ${window}`}
      // flexShrink:0 prevents the flex-column scroll container from squeezing
      // the canvas toward zero height (raw <canvas> intrinsic min-size is ~0).
      style={{ flexShrink: 0 }}
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
      {/* ── Chart area ─────────────────────────────────────────────────── */}
      <div style={{ padding: "24px 24px 8px" }}>
        <HourBars bars={bars} height={340} showAllTicks />
      </div>

      {/* ── Stat strip ─────────────────────────────────────────────────── */}
      {ingest && (
        <div className="tp-events-stat-strip">
          <StatCell
            label="Peak hour"
            value={formatLocalHour(ingest.peak_hour_start) ?? ingest.peak_hour_label ?? "—"}
            sub={`${ingest.peak_count?.toLocaleString() ?? "0"} events`}
          />
          <StatCell
            label="Avg / hour"
            value={
              typeof ingest.avg_per_hour === "number"
                ? ingest.avg_per_hour % 1 === 0
                  ? ingest.avg_per_hour.toLocaleString()
                  : ingest.avg_per_hour.toFixed(1)
                : "—"
            }
            sub="events / hr"
          />
          <StatCell
            label="Total ingested"
            value={typeof ingest.today_total === "number" ? ingest.today_total.toLocaleString() : "—"}
            sub="this window"
            accent
          />
          <StatCell
            label="vs previous period"
            value={delta != null ? `${deltaPositive ? "▲" : deltaNegative ? "▼" : "•"} ${Math.abs(delta)}%` : "—"}
            sub={ingest.status === "healthy" ? "Healthy" : "Quiet"}
            valueColor={
              deltaPositive ? theme.color.severity.ok : deltaNegative ? theme.color.severity.critical : undefined
            }
          />
        </div>
      )}
    </Card>
  );
}

function StatCell({ label, value, sub, accent, valueColor }) {
  return (
    <div className="tp-events-stat-cell">
      {/* Label — fixed height so all cells line up regardless of text length */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: theme.color.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
          minHeight: 14,
        }}
      >
        {label}
      </div>
      {/* Value — minHeight guards against null "—" being shorter than a real number */}
      <div
        style={{
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: valueColor ?? (accent ? theme.color.accent : theme.color.text),
          lineHeight: 1.1,
          minHeight: 30,
          display: "flex",
          alignItems: "center",
        }}
      >
        {value}
      </div>
      {/* Sub — minHeight so an absent sub line doesn't collapse the row */}
      <div
        style={{
          fontSize: 12,
          color: theme.color.textMuted,
          marginTop: 5,
          minHeight: 18,
        }}
      >
        {sub}
      </div>
    </div>
  );
}
