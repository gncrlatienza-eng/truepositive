// Design tokens extracted from the reference UI mockup in ../../reference/
// (gitignored — not part of this repo). Match new screens against that
// mockup's inline styles rather than inventing new values here.

export const theme = {
  color: {
    background: "#0F1219",
    surface: "#1A1E2E",
    border: "#2D3748",
    accent: "#0891b2",
    accentHover: "#067a94",
    text: "#E8EAED",
    textMuted: "#9CA3AF",
    textFaint: "#4B5563",
    severity: {
      critical: "#dc2626",
      high: "#a16207",
      medium: "#6D28D9",
      ok: "#047857",
    },
  },
  font: {
    body:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', Helvetica, Arial, sans-serif",
    mono:
      "'SF Mono', ui-monospace, SFMono-Regular, 'Menlo', 'Consolas', monospace",
  },
  radius: {
    sm: "6px",
    md: "8px",
    lg: "10px",
  },
  space: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48],
};
