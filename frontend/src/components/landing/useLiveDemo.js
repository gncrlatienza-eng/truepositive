import { useEffect, useMemo, useState } from "react";
import { theme } from "../../styles/theme";
import { BENIGN_EVENTS, DETECTIONS, INITIAL_QUEUE } from "./sampleData";

// One simulation drives the whole page, so the hero's event feed, its alert
// card and the dashboard below stay in step: an event that trips a rule in
// the hero is the alert that lands in the queue a moment later.

const TICK_MS = 1300;
const DETECT_EVERY = 5; // every 5th event is a detection
const BATCH_EVERY = 3; // the agent ships a batch every 3 events
const STREAM_LENGTH = 7;
const SPARK_HOURS = 12;

const detectionById = Object.fromEntries(DETECTIONS.map((d) => [d.id, d]));

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// `source` is a BENIGN_EVENTS entry or a detection (whose event is nested).
function streamLine(key, source, at, detection = null) {
  const ev = source.event ?? source;
  return { key, at, host: source.host, id: ev.id, text: ev.text, detail: ev.detail, detection };
}

const NEXT_STATUS = { open: "ack", ack: "resolved" };
const QUEUE_LENGTH = 5;
// Open alerts that aren't in the visible queue, so the counts look like a
// real workspace rather than starting from zero.
const BACKLOG = { critical: 0, high: 3, medium: 7 };

function alertFrom(detection, at, status, key) {
  return {
    id: key,
    detection: detection.id,
    created_at: new Date(at).toISOString(),
    severity: detection.severity,
    title: `${detection.rule}: ${detection.event.text}`,
    status,
    source_label: detection.host,
    rule_label: detection.mitre,
  };
}

function initialState() {
  const now = Date.now();
  const stream = [];
  for (let i = 0; i < STREAM_LENGTH - 1; i++) {
    stream.push(streamLine(`b${i}`, BENIGN_EVENTS[i % BENIGN_EVENTS.length], now - (STREAM_LENGTH - i) * TICK_MS));
  }
  const first = DETECTIONS[0];
  stream.push(streamLine("d0", first, now, first));

  const hourMs = 3600_000;
  const startHour = Math.floor(now / hourMs) * hourMs - (SPARK_HOURS - 1) * hourMs;
  const shape = [38, 31, 27, 24, 29, 46, 71, 88, 94, 83, 77, 52];
  const spark = shape.map((count, i) => {
    const start = new Date(startHour + i * hourMs);
    return { bucket_start: start.toISOString(), hour_label: `${start.getHours()}:00`, count };
  });

  const queue = [
    alertFrom(first, now, "open", "q-live-0"),
    ...INITIAL_QUEUE.map((q, i) =>
      alertFrom(detectionById[q.detection], now - q.minutesAgo * 60_000, q.status, `q-init-${i}`),
    ),
  ];

  return {
    tick: 0,
    stream,
    active: first,
    activeAt: now,
    events: spark.reduce((sum, p) => sum + p.count, 0) * 12,
    spark,
    queue,
    lastReceivedAt: new Date(now).toISOString(),
  };
}

function advance(state) {
  const now = Date.now();
  const tick = state.tick + 1;
  const isDetection = tick % DETECT_EVERY === 0;
  const next = { ...state, tick, events: state.events + 1 };

  let line;
  if (isDetection) {
    const detection = DETECTIONS[(tick / DETECT_EVERY) % DETECTIONS.length];
    line = streamLine(`t${tick}`, detection, now, detection);
    next.active = detection;
    next.activeAt = now;
    // Analysts work the queue while new alerts arrive: each older alert moves
    // one step along, and an older copy of the same alert is replaced.
    const worked = state.queue
      .filter((a) => a.detection !== detection.id)
      .map((a) => ({ ...a, status: NEXT_STATUS[a.status] ?? a.status }));
    next.queue = [alertFrom(detection, now, "open", `q-${tick}`), ...worked].slice(0, QUEUE_LENGTH);
  } else {
    line = streamLine(`t${tick}`, BENIGN_EVENTS[tick % BENIGN_EVENTS.length], now);
  }
  next.stream = [...state.stream, line].slice(-STREAM_LENGTH);

  if (tick % BATCH_EVERY === 0) {
    next.lastReceivedAt = new Date(now).toISOString();
    const spark = state.spark.slice();
    spark[spark.length - 1] = { ...spark[spark.length - 1], count: spark[spark.length - 1].count + BATCH_EVERY };
    next.spark = spark;
  }
  return next;
}

function riskLabel(score) {
  if (score >= 40) return "High";
  if (score >= 15) return "Medium";
  return "Low";
}

export function useLiveDemo() {
  const [state, setState] = useState(initialState);
  const [running, setRunning] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    // Pause while the tab is hidden: no point simulating to nobody.
    const onVisibility = () => setRunning(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setState(advance), TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  const dashboard = useMemo(() => {
    const open = { ...BACKLOG };
    for (const a of state.queue) if (a.status !== "resolved") open[a.severity] += 1;
    const { critical, high, medium } = open;
    const risk = critical * 4 + high * 2 + medium;
    const flat = (v) => state.spark.map((p) => ({ ...p, count: v(p.count) }));
    return {
      banner: {
        agents_online: 3,
        agents_total: 3,
        events_flowing: true,
        events_per_min: 46,
        last_received_at: state.lastReceivedAt,
      },
      kpis: [
        { key: "events", label: "Events", value: state.events.toLocaleString(), delta: 12.4, sparkline: state.spark },
        {
          key: "alerts",
          label: "Active alerts",
          value: String(critical + high + medium),
          delta: 8.3,
          sparkline: flat((c) => Math.round(c / 9)),
        },
        {
          key: "critical",
          label: "Critical",
          value: String(critical),
          delta: critical > 1 ? 100 : 0,
          delta_color: critical > 0 ? theme.color.severity.critical : null,
          sparkline: flat((c) => (c > 80 ? 1 : 0)),
        },
        {
          key: "risk",
          label: "Risk score",
          value: `${risk} · ${riskLabel(risk)}`,
          delta: 6.1,
          sparkline: flat((c) => Math.round(c / 4)),
        },
      ],
      queue: state.queue,
    };
  }, [state]);

  return { stream: state.stream, active: state.active, activeAt: state.activeAt, dashboard, running };
}
