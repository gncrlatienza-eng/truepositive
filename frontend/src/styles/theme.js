// Design tokens extracted from the reference UI mockup in ../../reference/
// (gitignored — not part of this repo). Match new screens against that
// mockup's inline styles rather than inventing new values here.

// 2026-08-16: rebased off a neutral near-black (was a navy-tinted
// #0F1219/#1A1E2E, R<G<B on every dark token — that blue lean plus the
// exact-Tailwind-cyan-600 accent is what read as generic/"AI-dashboard"
// rather than an intentional dark theme). Backgrounds/borders/text are now
// truly neutral gray; accent is unchanged (explicit call — cyan stays,
// keeps every `rgba(8, 145, 178, …)` accent-tint literal elsewhere in the
// app valid without touching each one). Severity ramp fixed for real: the
// old high/medium (`#a16207` muddy olive, `#6D28D9` violet) broke the
// intuitive red→orange→amber→green danger gradient — violet doesn't read
// as "between" red and green. New steps are the dataviz skill's own
// pre-validated status palette (good/warning/serious/critical), which
// clears ≥3:1 contrast on a dark surface even lighter than this one.
export const theme = {
  color: {
    background: "#0A0A0C",
    surface: "#141417",
    border: "#242429",
    accent: "#0891b2",
    accentHover: "#067a94",
    text: "#EDEDEF",
    textMuted: "#9B9CA4",
    textFaint: "#57585F",
    severity: {
      critical: "#d03b3b",
      high: "#ec835a",
      medium: "#fab219",
      ok: "#0ca30c",
    },
  },
  font: {
    body: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', Helvetica, Arial, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', ui-monospace, SFMono-Regular, 'Menlo', 'Consolas', monospace",
  },
  radius: {
    sm: "6px",
    md: "8px",
    lg: "10px",
  },
  space: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48],
};
