import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import landTopology from "world-atlas/land-110m.json";
import { theme } from "../../styles/theme";
import { PrimaryLink } from "../auth/fields";

// "Under Watch" hero — rebuilt in real React from a Claude Design canvas
// concept (reference/"Under Watch.dc (1).html"), not ported verbatim: that
// canvas's own copy claimed "1.2M indicators" / "38 source feeds", which
// doesn't match this app's real threat-intel feature (a single curated
// ~50-indicator feed, see backend/app/services/intel_service.py) -- numbers
// below are corrected to the real facts, same pattern this file's parent
// page already follows for its own copy. The canvas also loaded d3/
// topojson from unpkg.com, which the Artifact CSP doesn't allow -- as real
// npm dependencies here (d3-geo + topojson-client + world-atlas, bundled at
// build time, no runtime fetch) it actually works.
//
// Narrative: a stylized world map (illustrative threat-intel context, NOT a
// live surveillance claim -- see the caption under the map) scroll-morphs
// into a single laptop inside a shield ring, where sample "attempts" arrive
// and dock as alerts. Below ~768px or under prefers-reduced-motion, the
// scroll-jacked map/morph is skipped entirely in favor of a static stacked
// layout with just the (still live, unless reduced-motion) shield scene --
// scroll-jacking is fragile on small/fast-scrolling viewports.

const VIEW_W = 960;
const VIEW_H = 500;

const ORIGIN_POINTS = [
  { id: "manila", label: "Manila", lat: 14.6, lon: 120.98 },
  { id: "frankfurt", label: "Frankfurt", lat: 50.11, lon: 8.68 },
  { id: "saopaulo", label: "Sao Paulo", lat: -23.55, lon: -46.63 },
  { id: "mumbai", label: "Mumbai", lat: 19.08, lon: 72.88 },
  { id: "lagos", label: "Lagos", lat: 6.52, lon: 3.38 },
  { id: "singapore", label: "Singapore", lat: 1.35, lon: 103.82 },
];

const ARC_PAIRS = [
  ["manila", "singapore"],
  ["frankfurt", "lagos"],
  ["mumbai", "singapore"],
  ["saopaulo", "frankfurt"],
];

const SEVERITY_COLORS = [theme.color.severity.critical, theme.color.severity.high, theme.color.severity.medium];
const MAX_SAMPLE_COUNT = 24; // static "resting" count for the no-motion fallback only

// Real phased script (matching reference/"Under Watch.dc (1).html"'s own
// OM_SCENES: Establish -> FirstStrike -> Escalation -> Hold, looping) --
// a constant-rate trickle the whole time reads as an ambient background
// texture, not something the visitor register as "an animation." A single
// slow first arc, then a fast burst, then a hold, is what actually sells it.
const PHASES = [
  { name: "establish", duration: 3000 },
  { name: "firstStrike", duration: 3000 },
  { name: "escalation", duration: 6000 },
  { name: "hold", duration: 4000 },
];
const CYCLE_MS = PHASES.reduce((sum, p) => sum + p.duration, 0);

function phaseAt(elapsedInCycle) {
  let acc = 0;
  for (const p of PHASES) {
    if (elapsedInCycle < acc + p.duration) return { name: p.name, elapsed: elapsedInCycle - acc };
    acc += p.duration;
  }
  return { name: PHASES[PHASES.length - 1].name, elapsed: 0 };
}

function quadPoint(p0, pc, p1, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * pc.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * pc.y + t * t * p1.y,
  };
}

// This section keeps its own font pairing rather than the app's default
// (system stack + JetBrains Mono) -- a deliberate, explicit exception, not
// drift: Barlow Semi Condensed / IBM Plex Mono are the pairing the "Under
// Watch" design concept was built around (see reference/"Under Watch.dc
// (1).html"), loaded in index.html alongside the existing JetBrains Mono
// link. Everything else here (colors, radii, spacing) stays on theme.js.
const FONT_DISPLAY = "'Barlow Semi Condensed', -apple-system, 'Segoe UI', Arial, sans-serif";
const FONT_MONO = "'IBM Plex Mono', 'JetBrains Mono', 'SF Mono', ui-monospace, monospace";

const STATS = [
  { value: "3 log types", label: "Windows, syslog, Sysmon" },
  { value: "1 agent", label: "Per monitored device" },
  { value: "Self-hosted", label: "Your data stays yours" },
];

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useIsNarrow(breakpoint = 768) {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < breakpoint);
  useEffect(() => {
    function onResize() {
      setNarrow(window.innerWidth < breakpoint);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return narrow;
}

// Scroll progress through the tall wrapper: 0 at the top of the section,
// 1 once it has fully scrolled past under the viewport.
function useScrollProgress(containerRef, enabled) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let ticking = false;
    function measure() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // The sticky visual is only (100vh - 64px) tall (offset by the site
      // header, see the sticky div below), so it stays pinned for that much
      // longer than a plain full-viewport sticky child would.
      const total = rect.height - window.innerHeight + 64;
      const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      setProgress(total > 0 ? scrolled / total : 0);
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        measure();
        ticking = false;
      });
    }
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [containerRef, enabled]);
  return progress;
}

// Antarctica is dropped: at the hero's wide aspect it only rendered as a
// flat strip clipped by the bottom edge, and leaving it out lets the rest of
// the map fit larger.
function landWithoutAntarctica() {
  const fc = feature(landTopology, landTopology.objects.land);
  const features = (fc.features || [fc]).map((f) =>
    f.geometry.type === "MultiPolygon"
      ? {
          ...f,
          geometry: {
            ...f.geometry,
            coordinates: f.geometry.coordinates.filter((poly) => poly[0].some(([, lat]) => lat > -60)),
          },
        }
      : f,
  );
  return { type: "FeatureCollection", features };
}

const SCRIM_MASK = "linear-gradient(90deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.22) 32%, #000 60%)";

function WorldSignalMap({ opacity, active, scale = 1, scrim = false }) {
  const land = useMemo(() => landWithoutAntarctica(), []);
  const projection = useMemo(() => geoNaturalEarth1().fitSize([VIEW_W, VIEW_H], land), [land]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const points = useMemo(() => {
    const byId = {};
    ORIGIN_POINTS.forEach((p) => {
      const [x, y] = projection([p.lon, p.lat]);
      byId[p.id] = { ...p, x, y };
    });
    return byId;
  }, [projection]);
  const arcs = useMemo(() => {
    return ARC_PAIRS.map(([fromId, toId]) => {
      const from = points[fromId];
      const to = points[toId];
      if (!from || !to) return null;
      const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 60 };
      return { id: `${fromId}-${toId}`, from, to, control };
    }).filter(Boolean);
  }, [points]);

  // A dot ping-ponging back and forth between two points reads as aimless
  // "bouncing," not as an event -- one-way travel that visibly ARRIVES
  // somewhere (a fading trail behind it, a flash on impact) tells a clear
  // story instead. Severity-colored to match the same language ShieldScene
  // already uses, so a packet here reads as "an indicator," not decoration.
  const PACKET_TRAVEL_MS = 1800;
  const PACKET_GAP_MS = 500;

  const [, forceTick] = useState(0);
  const nowRef = useRef(0);
  const rafRef = useRef(null);
  const packetsRef = useRef({}); // arcId -> { start, dir, color } | null
  const nextLaunchRef = useRef({}); // arcId -> timestamp
  const impactsRef = useRef([]); // { id, x, y, color, start }
  const impactIdRef = useRef(0);

  useEffect(() => {
    if (!active) return undefined;
    function frame(t) {
      arcs.forEach((arc, i) => {
        const p = packetsRef.current[arc.id];
        if (!p) {
          if (nextLaunchRef.current[arc.id] === undefined) {
            nextLaunchRef.current[arc.id] = t + i * 400; // stagger the first launch per arc
          }
          if (t >= nextLaunchRef.current[arc.id]) {
            packetsRef.current[arc.id] = {
              start: t,
              dir: Math.random() < 0.5 ? 1 : -1,
              color: SEVERITY_COLORS[Math.floor(Math.random() * SEVERITY_COLORS.length)],
            };
          }
          return;
        }
        if (t - p.start >= PACKET_TRAVEL_MS) {
          const arrival = p.dir === 1 ? arc.to : arc.from;
          impactsRef.current.push({
            id: impactIdRef.current++,
            x: arrival.x,
            y: arrival.y,
            color: p.color,
            start: t,
          });
          packetsRef.current[arc.id] = null;
          nextLaunchRef.current[arc.id] = t + PACKET_GAP_MS + Math.random() * 900;
        }
      });
      impactsRef.current = impactsRef.current.filter((imp) => t - imp.start < 700);
      nowRef.current = t;
      forceTick((n) => n + 1);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    // No CSS transition on opacity/transform: both are already driven per
    // scroll frame, and a transition on top made the crossfade lag behind
    // the scrollbar and smear the two scenes together.
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        transform: `scale(${scale})`,
        visibility: opacity > 0 ? "visible" : "hidden",
        // Fades the map itself under the headline copy on the left so arcs
        // and pins don't run through the text -- a mask, not an overlay, so
        // the page's dot grid behind it stays untouched.
        ...(scrim && { maskImage: SCRIM_MASK, WebkitMaskImage: SCRIM_MASK }),
      }}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height="100%" style={{ display: "block" }}>
        <path d={path(land)} fill={theme.color.raised} stroke={theme.color.border} strokeWidth={0.6} />
        {arcs.map(({ id, from, to, control }) => (
          <path
            key={id}
            d={`M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`}
            fill="none"
            stroke={theme.color.accent}
            strokeWidth={1}
            strokeOpacity={0.2}
          />
        ))}
        {active &&
          arcs.map((arc) => {
            const p = packetsRef.current[arc.id];
            if (!p) return null;
            const t = clamp01((nowRef.current - p.start) / PACKET_TRAVEL_MS);
            const [p0, p1] = p.dir === 1 ? [arc.from, arc.to] : [arc.to, arc.from];
            const head = quadPoint(p0, arc.control, p1, t);
            const trail = [0.08, 0.16, 0.24].map((back) => quadPoint(p0, arc.control, p1, clamp01(t - back)));
            return (
              <g key={arc.id}>
                {trail.map((pt, ti) => (
                  <circle key={ti} cx={pt.x} cy={pt.y} r={3 - ti * 0.6} fill={p.color} opacity={0.35 - ti * 0.1} />
                ))}
                <circle cx={head.x} cy={head.y} r={4} fill={p.color} />
              </g>
            );
          })}
        {active &&
          impactsRef.current.map((imp) => {
            const t = clamp01((nowRef.current - imp.start) / 700);
            return (
              <circle
                key={imp.id}
                cx={imp.x}
                cy={imp.y}
                r={4 + t * 18}
                fill="none"
                stroke={imp.color}
                strokeWidth={2}
                opacity={1 - t}
              />
            );
          })}
        {Object.values(points).map((p) => (
          <g key={p.id}>
            <circle cx={p.x} cy={p.y} r={3.5} fill={theme.color.accent} />
            <circle cx={p.x} cy={p.y} r={3.5} fill="none" stroke={theme.color.accent} strokeWidth={1.4}>
              <animate attributeName="r" values="3.5;16;3.5" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0;0.8" dur="1.8s" repeatCount="indefinite" />
            </circle>
          </g>
        ))}
      </svg>
      {points.manila &&
        (() => {
          // Anchor the callout to whichever side has room -- Manila's point
          // sits close to the map's right edge, and a fixed right-side
          // offset ran the label straight off the visible area.
          const nearRightEdge = points.manila.x / VIEW_W > 0.72;
          return (
            <div
              style={{
                position: "absolute",
                left: `${(points.manila.x / VIEW_W) * 100}%`,
                top: `${(points.manila.y / VIEW_H) * 100}%`,
                transform: nearRightEdge ? "translate(calc(-100% - 12px), -50%)" : "translate(12px, -50%)",
                background: theme.color.surface,
                border: `1px solid ${theme.color.borderStrong}`,
                borderRadius: theme.radius.sm,
                padding: "8px 12px",
                fontSize: 12,
                fontFamily: FONT_MONO,
                color: theme.color.textMuted,
                whiteSpace: "nowrap",
                boxShadow: "0 8px 20px -8px rgba(0,0,0,0.6)",
              }}
            >
              <span style={{ color: theme.color.accent }}>Manila</span> — credential phishing kit flagged
            </div>
          );
        })()}
    </div>
  );
}

function ShieldScene({ opacity, active, reducedMotion, scale = 1, offsetX = "0px" }) {
  const canvasSize = 480;
  const center = canvasSize / 2;
  const ringRadius = 130;
  const spawnRadius = 228; // just inside the viewBox edge
  const IMPACT_MS = 650;

  const [, forceTick] = useState(0);
  const [phase, setPhase] = useState("establish");
  const arcsRef = useRef([]);
  const countRef = useRef(reducedMotion ? MAX_SAMPLE_COUNT : 0);
  const [count, setCount] = useState(countRef.current);
  const nextSpawnAtRef = useRef(0);
  const idRef = useRef(0);
  const rafRef = useRef(null);
  const nowRef = useRef(0);
  const startRef = useRef(null);
  const lastPhaseRef = useRef(null);
  const impactsRef = useRef([]); // { id, x, y, start }

  function spawnArc(t, duration) {
    const angle = Math.random() * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    arcsRef.current.push({
      id: idRef.current++,
      start: t,
      duration,
      from: { x: center + dx * spawnRadius, y: center + dy * spawnRadius },
      to: { x: center + dx * ringRadius, y: center + dy * ringRadius },
      color: SEVERITY_COLORS[Math.floor(Math.random() * SEVERITY_COLORS.length)],
    });
  }

  useEffect(() => {
    if (reducedMotion || !active) return undefined;

    function frame(t) {
      if (startRef.current === null) startRef.current = t;
      const { name: phaseName } = phaseAt((t - startRef.current) % CYCLE_MS);

      if (phaseName !== lastPhaseRef.current) {
        if (phaseName === "establish") {
          arcsRef.current = [];
          impactsRef.current = [];
          countRef.current = 0;
        }
        if (phaseName === "firstStrike") {
          spawnArc(t, 2200); // one slow, deliberate arc -- the moment that sells "this is live"
        }
        lastPhaseRef.current = phaseName;
        setPhase(phaseName);
      }

      if (phaseName === "escalation" && t > nextSpawnAtRef.current) {
        spawnArc(t, 900 + Math.random() * 400);
        nextSpawnAtRef.current = t + 280 + Math.random() * 260;
      }

      const stillFlying = [];
      arcsRef.current.forEach((a) => {
        if (t - a.start >= a.duration) {
          countRef.current += 1;
          impactsRef.current.push({ id: a.id, x: a.to.x, y: a.to.y, start: t });
        } else {
          stillFlying.push(a);
        }
      });
      arcsRef.current = stillFlying;
      impactsRef.current = impactsRef.current.filter((imp) => t - imp.start < IMPACT_MS);
      nowRef.current = t;
      setCount(countRef.current);
      forceTick((n) => n + 1);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion, center, canvasSize]);

  // Ease-in so an attempt accelerates into the ring, with a short fading
  // tail rather than a line all the way back to an off-screen origin.
  const lerp = (a, p) => ({ x: a.from.x + (a.to.x - a.from.x) * p, y: a.from.y + (a.to.y - a.from.y) * p });
  const flyingArcs = arcsRef.current.map((a) => {
    const raw = clamp01((nowRef.current - a.start) / a.duration);
    const p = raw * raw;
    const head = lerp(a, p);
    const tail = lerp(a, Math.max(0, p - 0.35));
    return { ...a, x: head.x, y: head.y, tx: tail.x, ty: tail.y, fade: clamp01(raw * 4) };
  });

  // "the ring runs hot" during escalation, "cools" during hold -- ties the
  // ring's own intensity to the same phase script driving the arcs, so the
  // scene reads as one escalating event rather than a flat ambient loop.
  const RING_INTENSITY = { establish: 0.28, firstStrike: 0.4, escalation: 0.75, hold: 0.3 };
  const ringOpacity = reducedMotion ? 0.35 : RING_INTENSITY[phase];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        transform: `scale(${scale})`,
        visibility: opacity > 0 ? "visible" : "hidden",
      }}
    >
      <svg
        viewBox={`0 0 ${canvasSize} ${canvasSize}`}
        width="100%"
        height="100%"
        style={{ display: "block", overflow: "hidden", transform: `translateX(${offsetX})` }}
      >
        <defs>
          {flyingArcs.map((a) => (
            <linearGradient
              key={a.id}
              id={`tp-tail-${a.id}`}
              gradientUnits="userSpaceOnUse"
              x1={a.tx}
              y1={a.ty}
              x2={a.x}
              y2={a.y}
            >
              <stop offset="0" stopColor={a.color} stopOpacity="0" />
              <stop offset="1" stopColor={a.color} stopOpacity="0.7" />
            </linearGradient>
          ))}
        </defs>
        <circle
          cx={center}
          cy={center}
          r={ringRadius}
          fill="none"
          stroke={theme.color.accent}
          strokeOpacity={ringOpacity}
          strokeWidth={1.5}
          style={{ transition: "stroke-opacity 1.2s ease" }}
        />
        <circle
          cx={center}
          cy={center}
          r={ringRadius + 14}
          fill="none"
          stroke={theme.color.accent}
          strokeOpacity={ringOpacity * 0.35}
          strokeWidth={1}
          style={{ transition: "stroke-opacity 1.2s ease" }}
        />
        <g transform={`translate(${center - 46}, ${center - 30})`}>
          <rect
            x="0"
            y="0"
            width="92"
            height="56"
            rx="4"
            fill={theme.color.surface}
            stroke={theme.color.borderStrong}
            strokeWidth={1.4}
          />
          <rect x="6" y="6" width="80" height="40" rx="2" fill={theme.color.background} />
          <rect
            x="-8"
            y="56"
            width="108"
            height="7"
            rx="2"
            fill={theme.color.raised}
            stroke={theme.color.borderStrong}
            strokeWidth={1}
          />
        </g>
        {!reducedMotion &&
          flyingArcs.map((a) => (
            <g key={a.id} opacity={a.fade}>
              <line
                x1={a.tx}
                y1={a.ty}
                x2={a.x}
                y2={a.y}
                stroke={`url(#tp-tail-${a.id})`}
                strokeWidth={1.6}
                strokeLinecap="round"
              />
              <circle cx={a.x} cy={a.y} r={3.5} fill={a.color} />
            </g>
          ))}
        {/* Blocked at the ring: a short "covered" flash where it hit. */}
        {!reducedMotion &&
          impactsRef.current.map((imp) => {
            const t = clamp01((nowRef.current - imp.start) / IMPACT_MS);
            return (
              <circle
                key={imp.id}
                cx={imp.x}
                cy={imp.y}
                r={3 + t * 12}
                fill="none"
                stroke={theme.color.severity.ok}
                strokeWidth={1.6}
                opacity={1 - t}
              />
            );
          })}
      </svg>
      <div style={{ position: "absolute", top: 16, right: 16, textAlign: "right", fontFamily: FONT_MONO }}>
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: theme.color.textFaint,
            marginBottom: 4,
          }}
        >
          Sample activity — illustrative only
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: theme.color.accent, fontVariantNumeric: "tabular-nums" }}>
          {count}
        </div>
        <div style={{ fontSize: 10.5, color: theme.color.textFaint, textTransform: "uppercase", letterSpacing: 1 }}>
          Attempts observed
        </div>
      </div>
    </div>
  );
}

function HeroCopyBlock() {
  return (
    <div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.3em",
          color: theme.color.accent,
          textTransform: "uppercase",
          marginBottom: 18,
        }}
      >
        Threat intel, cross-referenced
      </div>
      <h1
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: "clamp(40px, 5.2vw, 76px)",
          lineHeight: 1.03,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          margin: "0 0 20px",
        }}
      >
        Known threats, checked against your own rules.
      </h1>
      <p style={{ fontSize: 17, lineHeight: 1.6, color: theme.color.textMuted, maxWidth: 480, margin: "0 0 32px" }}>
        TruePositive cross-references a curated feed of indicators — IPs, domains, hashes — against your logs and
        detection rules, so a known-bad actor doesn&apos;t slip through as just another line in the log.
      </p>
      <div style={{ display: "flex", gap: 36, marginBottom: 36, flexWrap: "wrap" }}>
        {STATS.map((stat) => (
          <div key={stat.label}>
            <div style={{ fontSize: 24, fontWeight: 700, color: theme.color.accent }}>{stat.value}</div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: theme.color.textFaint,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
        <PrimaryLink to="/onboarding" style={{ width: "auto", padding: "14px 28px", fontSize: 15 }}>
          Create your workspace
        </PrimaryLink>
        <a
          href="#how-it-works"
          className="tp-link-hover-underline"
          style={{ color: theme.color.textMuted, opacity: 0.65, fontWeight: 600, fontSize: 14 }}
        >
          See how it works
        </a>
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10.5,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: theme.color.textFaint,
          marginTop: 24,
          maxWidth: 420,
        }}
      >
        Illustrative — the kind of indicator your rules check against. Not live real-world telemetry.
      </div>
    </div>
  );
}

function EndpointCopyBlock() {
  const legend = [
    { label: "Critical", color: theme.color.severity.critical },
    { label: "High", color: theme.color.severity.high },
    { label: "Medium", color: theme.color.severity.medium },
    { label: "Covered", color: theme.color.severity.ok },
  ];
  return (
    <div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.3em",
          color: theme.color.textFaint,
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        From the feed to one endpoint
      </div>
      <h2
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: "clamp(26px, 3vw, 38px)",
          fontWeight: 600,
          margin: "0 0 14px",
          lineHeight: 1.12,
        }}
      >
        The same patterns, arriving at a device you own.
      </h2>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: theme.color.textMuted, maxWidth: 440, margin: "0 0 20px" }}>
        Each arc represents an indicator from the curated feed, colour-coded by severity, matched the moment it touches
        your network — not after the fact.
      </p>
      <div
        style={{
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          fontFamily: FONT_MONO,
          fontSize: 11.5,
          letterSpacing: 1,
          color: theme.color.textMuted,
        }}
      >
        {legend.map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
            {l.label.toUpperCase()}
          </div>
        ))}
      </div>
    </div>
  );
}

function CoverageStrip() {
  const items = [
    { value: "50", label: "indicators in the curated feed, hand-maintained" },
    { value: "1", label: "feed, cross-referenced against every matching log automatically" },
    { value: "0", label: "claims of live telemetry — coverage is measured against your own rules" },
  ];
  return (
    <div
      className="tp-landing-section"
      style={{
        borderTop: `1px solid ${theme.color.border}`,
        borderBottom: `1px solid ${theme.color.border}`,
        paddingTop: 56,
        paddingBottom: 56,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 40,
      }}
    >
      {items.map((item) => (
        <div key={item.label}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 40,
              fontWeight: 700,
              color: theme.color.text,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {item.value}
          </div>
          <div style={{ fontSize: 14.5, color: theme.color.textMuted, marginTop: 8, maxWidth: 260 }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function UnderWatchHero() {
  const reducedMotion = usePrefersReducedMotion();
  const isNarrow = useIsNarrow();
  const useStaticLayout = reducedMotion || isNarrow;
  const outerRef = useRef(null);
  const [inView, setInView] = useState(true);
  const progress = useScrollProgress(outerRef, !useStaticLayout);

  useEffect(() => {
    if (useStaticLayout || !outerRef.current) return undefined;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 });
    io.observe(outerRef.current);
    return () => io.disconnect();
  }, [useStaticLayout]);

  if (useStaticLayout) {
    return (
      <>
        <section className="tp-landing-section" style={{ paddingTop: 56, paddingBottom: 56 }}>
          <HeroCopyBlock />
          <div
            style={{
              height: 380,
              position: "relative",
              margin: "48px 0",
              borderRadius: theme.radius.lg,
              overflow: "hidden",
              border: `1px solid ${theme.color.border}`,
              background: theme.color.surface,
            }}
          >
            <ShieldScene opacity={1} active={!reducedMotion} reducedMotion={reducedMotion} />
          </div>
          <EndpointCopyBlock />
        </section>
        <CoverageStrip />
      </>
    );
  }

  // One scene at a time: the hero copy and map leave together, then the
  // shield and its copy arrive. The old ranges overlapped, so both scenes
  // (and both copy blocks) sat half-faded on screen at once.
  const heroCopyOpacity = clamp01(1 - (progress - 0.08) / 0.25);
  const mapOpacity = clamp01(1 - (progress - 0.1) / 0.25);
  const shieldOpacity = clamp01((progress - 0.38) / 0.22);
  const endpointOpacity = clamp01((progress - 0.45) / 0.2);
  const shieldActive = inView && progress > 0.3;

  return (
    <>
      <div ref={outerRef} style={{ position: "relative", height: "220vh" }}>
        {/* top/height offset by the site header's own height (64px, LandingPage.jsx's
            <header>) -- two position:sticky elements both pinned to top:0 would overlap
            once both are stuck, hiding this visual's top edge (and the counter badge in
            it) underneath the header. */}
        <div style={{ position: "sticky", top: 64, height: "calc(100vh - 64px)", overflow: "hidden" }}>
          <WorldSignalMap
            opacity={mapOpacity}
            active={inView && mapOpacity > 0}
            scale={1 + (1 - mapOpacity) * 0.06}
            scrim
          />
          <ShieldScene
            opacity={shieldOpacity}
            active={shieldActive}
            reducedMotion={false}
            scale={0.94 + shieldOpacity * 0.06}
            // Shifted right so the ring clears the endpoint copy on the left.
            offsetX="max(0px, 22vw - 100px)"
          />
        </div>
        <div
          className="tp-landing-section"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: heroCopyOpacity > 0 ? "auto" : "none",
              maxWidth: 560,
              opacity: heroCopyOpacity,
              transform: `translateY(${(1 - heroCopyOpacity) * -16}px)`,
            }}
          >
            <HeroCopyBlock />
          </div>
        </div>
        <div
          className="tp-landing-section"
          style={{
            position: "absolute",
            top: "100vh",
            left: 0,
            right: 0,
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: endpointOpacity > 0 ? "auto" : "none",
              maxWidth: 480,
              opacity: endpointOpacity,
              transform: `translateY(${(1 - endpointOpacity) * 16}px)`,
            }}
          >
            <EndpointCopyBlock />
          </div>
        </div>
      </div>
      <CoverageStrip />
    </>
  );
}
