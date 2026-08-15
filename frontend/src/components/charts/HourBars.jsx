import { LineChart } from "./LineChart";

// Drill-down-panel-sized wrapper around the shared LineChart primitive.
// `bars`: [{ hour_label, count }] — real backend buckets, not fabricated.
export function HourBars({ bars, color, height = 90, showAllTicks = false }) {
  return <LineChart points={bars} color={color} height={height} showAllTicks={showAllTicks} />;
}
