import { LineChart } from "./LineChart";

// KPI-card-sized wrapper around the shared LineChart primitive.
// `values`: [{ hour_label, count }] (KpiCard.sparkline).
export function Sparkline({ values, color, height = 56 }) {
  return <LineChart points={values} color={color} height={height} />;
}
