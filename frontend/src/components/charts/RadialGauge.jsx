import { Doughnut } from "react-chartjs-2";
import { needlePlugin } from "./chartSetup";

// No shared hex->rgba helper exists elsewhere in the codebase (every other
// consumer hand-writes literal rgba() strings) — kept local rather than
// adding a new shared util for one call site.
function hexToRgba(hex, alpha) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Raw math-angle convention (0° = 3 o'clock, clockwise positive) — the same
// one the previous SVG version used directly. needlePlugin draws the needle
// in this convention independent of Chart.js's own `rotation`/`circumference`
// (see below for the conversion between the two).
const START_ANGLE = -120;
const SWEEP = 240;

// Semicircle Chart.js doughnut (the bands) + a custom canvas-drawn needle
// plugin — Chart.js has no native gauge/needle chart type. `bands`: [{ max,
// color, label }] ascending; last entry's max is the gauge's full scale.
// Value beyond the last band's max just pins the needle at the end.
export function RadialGauge({ value, bands, size = 140, thickness = 14 }) {
  const domainMax = bands[bands.length - 1].max;
  const cutout = `${(1 - (2 * thickness) / size) * 100}%`;

  let prevMax = 0;
  const sliceValues = bands.map((b) => {
    const delta = Math.min(b.max, domainMax) - prevMax;
    prevMax = b.max;
    return delta;
  });

  const data = {
    labels: bands.map((b) => b.label),
    datasets: [
      {
        data: sliceValues,
        backgroundColor: bands.map((b) => hexToRgba(b.color, 0.85)),
        borderWidth: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    // Chart.js's `rotation` is in the same raw math-angle convention as
    // START_ANGLE, but relative to 12 o'clock (0 = -90° in that convention)
    // rather than 3 o'clock — hence + 90 here. Get this wrong and the gauge
    // renders visibly rotated, not just subtly off.
    rotation: START_ANGLE + 90,
    circumference: SWEEP,
    cutout,
    events: [], // no hover/click/tooltip, matching the previous version exactly
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      tpNeedle: { value, domainMax, startAngle: START_ANGLE, sweep: SWEEP, thickness },
    },
  };

  return (
    <div style={{ width: size, height: size }}>
      <Doughnut className="tp-chart-in" data={data} options={options} plugins={[needlePlugin]} />
    </div>
  );
}
