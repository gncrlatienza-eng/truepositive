// Design tokens extracted from the reference UI mockup in ../../reference/
// (gitignored — not part of this repo). Match new screens against that
// mockup's inline styles rather than inventing new values here.

// 2026-08-17: full flat-design rebase (Reports/Intel revamp, applied
// app-wide per explicit user decision). Prior sessions spent many rounds
// chasing "looks AI" via a cyan-on-near-black "liquid glass" treatment —
// the user's own diagnosis this round was more specific: flat GitHub-dark
// palette (#0d1117/#161b22/#30363d), zero backdrop-filter/blur anywhere,
// and a locked two-weight font system. `raised` is a new token: one value
// shared by card-hover surfaces and modal/elevated panels, matching the
// mockup's own reuse of #1c2128 for both. Severity ramp realigned to the
// same mockup's reputation-gauge score bands (ok/medium/high/critical =
// green/amber/orange/red) so the whole app reads as one consistent ramp
// instead of two different ones.
//
// 2026-08-18: accent recolored from the interim GitHub-blue (#1f6feb) to
// the real brand mark's own teal — sampled directly from the "P" in
// reference/tp_logo.png (RGB 8,144,177 = #0890b1), the exact same source
// the logo/favicon assets were generated from, so the accent and the logo
// are provably the same color rather than a hand-matched guess.
export const theme = {
  color: {
    background: "#0d1117",
    surface: "#161b22",
    raised: "#1c2128",
    input: "#21262d",
    border: "#30363d",
    borderStrong: "#484f58",
    accent: "#0890b1",
    accentHover: "#0ab0d8",
    text: "#e6edf3",
    textMuted: "#8b949e",
    textFaint: "#484f58",
    severity: {
      critical: "#f85149",
      high: "#f0883e",
      medium: "#d29922",
      ok: "#3fb950",
    },
    safe: {
      bg: "rgba(63, 185, 80, 0.1)",
      border: "rgba(63, 185, 80, 0.4)",
      text: "#3fb950",
    },
    danger: {
      bg: "rgba(248, 81, 73, 0.1)",
      border: "rgba(248, 81, 73, 0.4)",
      text: "#f85149",
    },
  },
  font: {
    body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', ui-monospace, SFMono-Regular, 'Menlo', 'Consolas', monospace",
    weight: {
      regular: 400,
      semibold: 600,
    },
  },
  radius: {
    sm: "6px",
    md: "8px",
    lg: "10px",
  },
  space: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48],
};
