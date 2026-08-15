import { KpiCard } from "./KpiCard";

// Flexbox, not a grid — grid's auto-fit computes column tracks across the
// *whole* grid, so a wrapped last row (5 cards never divides evenly into
// fixed-width columns) leaves an orphaned card next to dead empty columns.
// Flex-wrap recalculates per visual row, so cards in a partial row stretch
// to fill it instead.
export function KpiRow({ kpis, onSelect }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
      {kpis.map((k) => (
        <div key={k.key} style={{ flex: "1 1 200px", minWidth: 0 }}>
          <KpiCard kpi={k} onClick={() => onSelect(k.key)} />
        </div>
      ))}
    </div>
  );
}
