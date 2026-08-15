import { useRef } from "react";
import { Doughnut, getElementAtEvent } from "react-chartjs-2";
import { theme } from "../../styles/theme";
import {
  arcPercentLabelsPlugin,
  centerTextPlugin,
  dropShadowSheenPlugin,
  externalTooltipHandler,
  htmlLegendPlugin,
} from "./chartSetup";

// Chart.js doughnut — a hover pop-out (`hoverOffset`) and a surface-colored
// border between slices, both lifted from Pi-hole's own dashboard (the
// reference this chart was rebuilt against): the border-in-the-card's-own-
// background-color is what gives clean gaps between slices at any size,
// replacing the previous SVG version's angular-gap-and-inset math. The
// legend and tooltip are Pi-hole's own mechanisms too (see chartSetup.js's
// htmlLegendPlugin/externalTooltipHandler) — a real toggle-to-isolate <ul>
// legend and a positioned DOM tooltip, not Chart.js's built-in canvas ones.
// `segments`: [{ value, color, label, key }]. `legendContainerID`: id of an
// (empty) DOM element the legend renders into — owned by the caller so it
// can be placed anywhere in the card's own layout.
export function DonutChart({
  segments,
  size = 120,
  thickness = 16,
  centerLabel = "total",
  onSelect,
  legendContainerID,
}) {
  const chartRef = useRef(null);
  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0);
  const cutout = `${(1 - (2 * thickness) / size) * 100}%`;

  // Empty state stays inside Chart.js (one inert gray ring) instead of a
  // separate raw-SVG fallback, so this component has exactly one rendering
  // path.
  const data =
    total > 0
      ? {
          labels: visible.map((s) => s.label),
          datasets: [
            {
              data: visible.map((s) => s.value),
              backgroundColor: visible.map((s) => s.color),
              borderColor: theme.color.surface,
              borderWidth: 3,
              borderRadius: 4,
              hoverOffset: 10,
            },
          ],
        }
      : {
          labels: [""],
          datasets: [{ data: [1], backgroundColor: [theme.color.border], borderWidth: 0 }],
        };

  function handleClick(event) {
    if (!onSelect || total === 0 || !chartRef.current) return;
    const els = getElementAtEvent(chartRef.current, event);
    if (els.length > 0) onSelect(visible[els[0].index].key);
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout,
    animation: { duration: 400 },
    events: total > 0 ? ["mousemove", "mouseout", "click", "touchstart", "touchmove"] : [],
    onHover: (event, elements) => {
      event.native.target.style.cursor = elements.length > 0 && onSelect ? "pointer" : "default";
    },
    plugins: {
      legend: { display: false },
      htmlLegend: legendContainerID ? { containerID: legendContainerID, segments: visible, onSelect } : undefined,
      tooltip: {
        enabled: false,
        external: externalTooltipHandler,
        callbacks: {
          // Suppress Chart.js's default title (the category label) — it'd
          // otherwise stack redundantly above our own label line, which
          // already leads with the same name.
          title: () => "",
          label: (ctx) => {
            const seg = visible[ctx.dataIndex];
            const pct = (seg.value / total) * 100;
            return `${seg.label}: ${seg.value} · ${pct.toFixed(0)}%`;
          },
        },
      },
      tpDropShadowSheen: total > 0,
      tpArcPercentLabels: total > 0 ? { size } : undefined,
      tpCenterText: { total, label: centerLabel, size },
    },
  };

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <Doughnut
        ref={chartRef}
        className="tp-chart-in"
        data={data}
        options={options}
        plugins={[dropShadowSheenPlugin, arcPercentLabelsPlugin, centerTextPlugin, htmlLegendPlugin]}
        onClick={handleClick}
      />
    </div>
  );
}
