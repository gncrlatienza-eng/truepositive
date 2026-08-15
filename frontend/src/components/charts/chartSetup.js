import {
  ArcElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { theme } from "../../styles/theme";

// Central registration — only what's actually used across the app's charts,
// not `chart.js/auto` (which registers everything and defeats tree-shaking).
// Legend IS registered even though no chart renders Chart.js's own canvas
// legend (every chart sets `plugins.legend.display: false`) — htmlLegendPlugin
// below still needs the Legend plugin's default `labels.generateLabels`
// implementation to exist on `chart.options.plugins.legend`.
Chart.register(
  ArcElement,
  DoughnutController,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
);

Chart.defaults.font.family = theme.font.body;
Chart.defaults.color = theme.color.textMuted;
Chart.defaults.borderColor = theme.color.border;

// Chart.js has no built-in "text in the middle of a doughnut" — reads
// `options.plugins.tpCenterText = { total, label, size }` per chart instance.
export const centerTextPlugin = {
  id: "tpCenterText",
  afterDraw(chart) {
    const opts = chart.options.plugins?.tpCenterText;
    if (!opts) return;
    const { total, label, size } = opts;
    const { ctx, chartArea } = chart;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.color.text;
    ctx.font = `700 ${size * 0.2}px ${theme.font.body}`;
    ctx.fillText(String(total), cx, cy - size * 0.03);
    ctx.fillStyle = theme.color.textFaint;
    ctx.font = `400 ${size * 0.075}px ${theme.font.body}`;
    ctx.fillText(label, cx, cy + size * 0.14);
    ctx.restore();
  },
};

// A soft cast shadow under the ring plus a faint upper-left sheen over it —
// the two cues that read a flat doughnut as a lit, physical ring instead of
// a pasted-on color wheel (ported from the previous SVG version's
// feDropShadow + radial-gradient-masked-to-the-ring approach). The sheen
// uses `source-atop` so the gradient only paints over already-opaque ring
// pixels — the canvas equivalent of the SVG version's mask. Reads
// `options.plugins.tpDropShadowSheen: true`.
export const dropShadowSheenPlugin = {
  id: "tpDropShadowSheen",
  beforeDatasetsDraw(chart) {
    if (!chart.options.plugins?.tpDropShadowSheen) return;
    const { ctx } = chart;
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
  },
  afterDatasetsDraw(chart) {
    if (!chart.options.plugins?.tpDropShadowSheen) return;
    const { ctx } = chart;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const arc = chart.getDatasetMeta(0).data[0];
    if (!arc) return;
    const { x, y, outerRadius } = arc.getProps(["x", "y", "outerRadius"], true);

    const gradient = ctx.createRadialGradient(
      x - outerRadius * 0.35,
      y - outerRadius * 0.45,
      0,
      x,
      y,
      outerRadius * 1.1,
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.16)");
    gradient.addColorStop(0.55, "rgba(255, 255, 255, 0.04)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
};

// In-arc "23%" style labels for segments big enough to read (≥8% share) —
// hand-rolled rather than chartjs-plugin-datalabels (archived by its
// maintainer, last published years ago — not worth the dependency for
// something this small). Reads `options.plugins.tpArcPercentLabels = { size }`.
export const arcPercentLabelsPlugin = {
  id: "tpArcPercentLabels",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins?.tpArcPercentLabels;
    if (!opts) return;
    const data = chart.data.datasets[0]?.data ?? [];
    const total = data.reduce((sum, v) => sum + v, 0);
    if (!total) return;

    const meta = chart.getDatasetMeta(0);
    const { ctx } = chart;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.color.background;
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${opts.size * 0.09}px ${theme.font.body}`;

    for (const [i, value] of data.entries()) {
      const pct = (value / total) * 100;
      if (pct < 8) continue;
      const arc = meta.data[i];
      if (!arc) continue;
      const { x, y } = arc.getCenterPoint();
      const text = `${pct.toFixed(0)}%`;
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }

    ctx.restore();
  },
};

// RadialGauge's needle. Chart.js has no gauge/needle chart type — draws
// directly via canvas 2D in the same raw math-angle convention (0° = 3
// o'clock, clockwise positive) the original SVG version used, independent
// of whatever `rotation`/`circumference` Chart.js itself was given to draw
// the bands — as long as both describe the same physical angles on screen,
// which the caller is responsible for keeping in sync (see RadialGauge.jsx's
// own comment on converting startAngle to Chart.js's rotation parameter).
// Reads `options.plugins.tpNeedle = { value, domainMax, startAngle, sweep, thickness }`.
export const needlePlugin = {
  id: "tpNeedle",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins?.tpNeedle;
    if (!opts) return;
    const { value, domainMax, startAngle, sweep, thickness } = opts;

    const arc = chart.getDatasetMeta(0).data[0];
    if (!arc) return;
    const { x, y, outerRadius } = arc.getProps(["x", "y", "outerRadius"], true);

    const needleAngleDeg = startAngle + (Math.min(value, domainMax) / domainMax) * sweep;
    const rad = (needleAngleDeg * Math.PI) / 180;
    const needleRadius = outerRadius - thickness / 2 - 2;
    const nx = x + needleRadius * Math.cos(rad);
    const ny = y + needleRadius * Math.sin(rad);

    const { ctx } = chart;
    ctx.save();
    ctx.strokeStyle = theme.color.text;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.fillStyle = theme.color.text;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
};

// LineChart's hover crosshair — Chart.js has no built-in equivalent. Draws
// one dashed vertical line at the active (hovered/nearest) point's x.
export const crosshairPlugin = {
  id: "tpCrosshair",
  afterDraw(chart) {
    if (!chart.options.plugins?.tpCrosshair) return;
    const active = chart.getActiveElements();
    if (!active || active.length === 0) return;
    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.strokeStyle = theme.color.textFaint;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

// A real <ul><li> legend built and kept in sync by Chart.js's own update
// lifecycle — ported from Pi-hole's own dashboard (scripts/js/charts.js),
// not a from-scratch design. Chart.js's `generateLabels` is the source of
// truth for each row's color/hidden state, so there's no separate React
// state to drift out of sync with the chart. Reads
// `options.plugins.htmlLegend = { containerID, segments, onSelect }` —
// `segments` is the caller's own array (with a stable `.key` per entry,
// e.g. "critical") since Chart.js's generated label `.text` is the *display*
// label ("Critical"), not the key `onSelect` needs.
export const htmlLegendPlugin = {
  id: "tpHtmlLegend",
  afterUpdate(chart) {
    const opts = chart.options.plugins?.htmlLegend;
    if (!opts) return;
    const { containerID, segments, onSelect } = opts;
    const container = document.getElementById(containerID);
    if (!container) return;

    const items = chart.options.plugins.legend.labels.generateLabels(chart);

    // Skip rebuilding the DOM if nothing actually changed — this plugin's
    // afterUpdate fires on every chart.update() (including the 30s silent
    // dashboard poll), and rebuilding on every tick would needlessly drop
    // any in-progress hover/focus state on a legend row.
    const unchanged =
      chart.$tpLastLegendItems &&
      items.length === chart.$tpLastLegendItems.length &&
      items.every(
        (item, i) =>
          item.text === chart.$tpLastLegendItems[i].text && item.hidden === chart.$tpLastLegendItems[i].hidden,
      );
    if (unchanged) return;
    chart.$tpLastLegendItems = items;

    container.replaceChildren();
    const ul = document.createElement("ul");
    container.append(ul);

    for (const item of items) {
      const seg = segments[item.index];
      const li = document.createElement("li");

      // Hovering a row highlights its slice via the same active-element
      // mechanism direct chart hover uses — the pop-out/tooltip "just work"
      // for free, no separate highlight implementation needed.
      li.addEventListener("mouseenter", () => {
        chart.setActiveElements([{ datasetIndex: 0, index: item.index }]);
        chart.update();
      });
      li.addEventListener("mouseleave", () => {
        chart.setActiveElements([]);
        chart.update();
      });

      const checkbox = document.createElement("span");
      checkbox.className = "tp-legend-checkbox";
      checkbox.title = "Toggle visibility";
      checkbox.setAttribute("role", "checkbox");
      checkbox.tabIndex = 0;
      checkbox.setAttribute("aria-checked", item.hidden ? "false" : "true");
      checkbox.style.setProperty("--tp-legend-color", item.fillStyle);
      function toggle() {
        chart.toggleDataVisibility(item.index);
        chart.update();
      }
      checkbox.addEventListener("click", toggle);
      checkbox.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });

      const label = document.createElement("span");
      label.className = "tp-legend-label";
      label.textContent = item.text;
      label.style.textDecoration = item.hidden ? "line-through" : "";
      if (onSelect) {
        label.setAttribute("role", "button");
        label.tabIndex = 0;
        label.classList.add("clickable");
        label.addEventListener("click", () => onSelect(seg.key));
        label.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(seg.key);
          }
        });
      }

      li.append(checkbox, label);
      ul.append(li);
    }
  },
};

// Chart.js's built-in canvas tooltip is disabled on every chart that uses
// this (`options.plugins.tooltip.enabled: false`) in favor of a real
// positioned DOM element — ported from Pi-hole's `customTooltips` /
// `getOrCreateTooltipElement` / `setTooltipCaretPosition` /
// `positionTooltip` (scripts/js/charts.js). Kept instance-keyed (stored on
// the chart object itself) rather than Pi-hole's canvas-id-keyed DOM lookup,
// since this app mounts many dynamically-created, unnamed canvases (five KPI
// sparklines alone) where a shared id-based lookup would collide.
const TOOLTIP_ARROW = 5;

// Anchored to `document.body` with viewport-relative (`position: fixed`)
// coordinates, not appended into the chart's own small wrapper div — several
// of this app's charts (a KPI sparkline is 56px tall) have no room to fit a
// floating tooltip inside their own bounds without it visually spilling past
// the card, the same class of problem Pi-hole's own `.box[id]` ancestor
// lookup exists to dodge (anchor to something reliably bigger than the
// chart itself) — `document.body` is the simplest version of that fix.
function getOrCreateTooltipEl(chart) {
  if (chart.$tpTooltipEl) return chart.$tpTooltipEl;
  const el = document.createElement("div");
  el.className = "tp-chart-tooltip";
  el.style.position = "fixed";
  const arrow = document.createElement("div");
  arrow.className = "tp-chart-tooltip-arrow";
  const body = document.createElement("div");
  body.className = "tp-chart-tooltip-body";
  el.append(arrow, body);
  document.body.append(el);
  chart.$tpTooltipEl = el;
  return el;
}

export function externalTooltipHandler(context) {
  const { chart, tooltip } = context;
  const el = getOrCreateTooltipEl(chart);

  if (tooltip.opacity === 0) {
    el.style.opacity = 0;
    return;
  }

  // A line chart is small enough (56-90px tall) that a tooltip floating at
  // the exact hover point has nowhere good to sit — pin it below the chart
  // and let it track the hovered x, the same fix Pi-hole applies to its own
  // (much larger, but same problem in spirit) time-series chart.
  const isLine = chart.config.type === "line";

  const bodyEl = el.querySelector(".tp-chart-tooltip-body");
  bodyEl.replaceChildren();
  for (const title of tooltip.title ?? []) {
    const titleEl = document.createElement("div");
    titleEl.className = "tp-chart-tooltip-title";
    titleEl.textContent = title;
    bodyEl.append(titleEl);
  }
  for (const bodyItem of tooltip.body ?? []) {
    for (const line of bodyItem.lines) {
      const lineEl = document.createElement("div");
      lineEl.className = "tp-chart-tooltip-line";
      lineEl.textContent = line;
      bodyEl.append(lineEl);
    }
  }

  const canvasRect = chart.canvas.getBoundingClientRect();

  let left = canvasRect.left + tooltip.caretX;
  let top;
  let arrowClass;

  if (isLine) {
    top = canvasRect.top + chart.chartArea.bottom + TOOLTIP_ARROW;
    left -= el.offsetWidth / 2;
    arrowClass = "center top";
  } else {
    if (tooltip.xAlign === "center") left -= el.offsetWidth / 2;
    else if (tooltip.xAlign === "right") left -= el.offsetWidth;

    if (tooltip.yAlign === "bottom") {
      top = canvasRect.top + tooltip.caretY - el.offsetHeight - TOOLTIP_ARROW;
      arrowClass = `${tooltip.xAlign} bottom`;
    } else if (tooltip.yAlign === "center") {
      top = canvasRect.top + tooltip.caretY - el.offsetHeight / 2;
      arrowClass = `${tooltip.xAlign} center`;
    } else {
      top = canvasRect.top + tooltip.caretY + TOOLTIP_ARROW;
      arrowClass = `${tooltip.xAlign} top`;
    }
  }

  // Clamped against the viewport, not the chart's own (often tiny) wrapper —
  // document.body-anchored means there's no small-card boundary to spill
  // past in the first place, just the browser window itself.
  const clampedLeft = Math.min(Math.max(left, 4), window.innerWidth - el.offsetWidth - 4);
  const clampedTop = Math.min(Math.max(top, 4), window.innerHeight - el.offsetHeight - 4);

  el.className = `tp-chart-tooltip ${arrowClass}`;
  el.style.left = `${clampedLeft}px`;
  el.style.top = `${clampedTop}px`;
  el.style.opacity = 1;

  // The arrow tracks the real caret position even after the box itself got
  // clamped away from it, so it still visually points at the hovered mark.
  const arrowEl = el.querySelector(".tp-chart-tooltip-arrow");
  const arrowLeft = canvasRect.left + tooltip.caretX - clampedLeft;
  arrowEl.style.left = `${Math.min(Math.max(arrowLeft, 10), el.offsetWidth - 10)}px`;
}
