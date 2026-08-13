import { KpiCard } from "./KpiCard";

export function KpiRow({ kpis, onSelect }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
      {kpis.map((k) => (
        <KpiCard key={k.key} kpi={k} onClick={() => onSelect(k.key)} />
      ))}
    </div>
  );
}
