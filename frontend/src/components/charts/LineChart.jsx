import { Line } from "react-chartjs-2";
import { theme } from "../../styles/theme";
import { crosshairPlugin, externalTooltipHandler } from "./chartSetup";

// Canvas gradients are a Chart.js "scriptable option" — a function re-run
// whenever the chart (re)draws, since a gradient object is tied to a
// specific canvas context and can't be precomputed before `chartArea`
// exists. `${color}59`/`${color}00` are hex+alpha shorthand (0x59 ≈ 35%,
// matching the previous SVG gradient's stopOpacity values).
function buildAreaGradient(color) {
  return (context) => {
    const { chart } = context;
    const { chartArea } = chart;
    if (!chartArea) return null;
    const gradient = chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, `${color}59`);
    gradient.addColorStop(1, `${color}00`);
    return gradient;
  };
}

// Chart.js line — shared primitive behind both Sparkline (compact, KPI
// cards) and HourBars (larger, drill-down panels). `points`: [{ hour_label,
// count }] (the backend's HourBar shape, reused verbatim — no separate
// chart-data schema).
export function LineChart({
  points,
  color = theme.color.accent,
  height = 64,
  showArea = true,
  showAxis = true,
  showAllTicks = false,
}) {
  const hasData = points && points.length > 0;

  if (!hasData) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", fontSize: 12, color: theme.color.textFaint }}>
        No data in this window yet.
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.count), 1);
  const mid = Math.round(max / 2);

  const data = {
    labels: points.map((p) => p.hour_label),
    datasets: [
      {
        data: points.map((p) => p.count),
        borderColor: color,
        backgroundColor: buildAreaGradient(color),
        fill: showArea ? "origin" : false,
        tension: 0, // straight polyline, not Chart.js's default bezier smoothing
        borderWidth: 1.6,
        pointRadius: 0, // markers only appear on hover, matching how Splunk/Grafana keep the resting line clean
        pointHoverRadius: 3.5,
        pointHoverBackgroundColor: theme.color.surface,
        pointHoverBorderColor: color,
        pointHoverBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        display: showAxis,
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: theme.color.textFaint,
          font: { size: 10 },
          autoSkip: false,
          maxRotation: 0,
          // Only the first and last hour label, matching the previous
          // version — the axis, not every bucket, carries the time range.
          callback: (_val, index, ticks) => {
            if (!showAllTicks) {
              return index === 0 || index === ticks.length - 1 ? (points[index]?.hour_label ?? "") : "";
            }
            // Dense ticks for large charts: every 4th bucket for 24h (24 points),
            // every 2nd for 7d, every label for 30d or sparse data.
            const step = points.length > 20 ? 4 : points.length > 7 ? 2 : 1;
            return index % step === 0 ? (points[index]?.hour_label ?? "") : "";
          },
        },
      },
      y: {
        display: showAxis,
        min: 0,
        max,
        grid: { color: theme.color.border },
        border: { display: false },
        ticks: { color: theme.color.textFaint, font: { size: 9 } },
        // Chart.js's own "nice number" tick algorithm won't reliably land on
        // exactly max/mid/0 — force it so the 3 gridlines/labels match the
        // real data bounds, not a rounded approximation.
        afterBuildTicks: (axis) => {
          axis.ticks = [{ value: 0 }, { value: mid }, { value: max }];
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: false,
        external: externalTooltipHandler,
        mode: "index",
        intersect: false,
        callbacks: {
          title: (items) => items[0]?.label ?? "",
          label: (ctx) => String(ctx.parsed.y),
        },
      },
      tpCrosshair: true,
    },
  };

  return (
    // width:"100%" + minWidth:0 so Chart.js's ResizeObserver can shrink the
    // canvas below its HTML default (300px) inside a flex/grid ancestor —
    // otherwise the canvas can end up wider than its own container and
    // visually spill into whatever sits next to it.
    <div style={{ height, width: "100%", minWidth: 0 }}>
      <Line className="tp-chart-in" data={data} options={options} plugins={[crosshairPlugin]} />
    </div>
  );
}
