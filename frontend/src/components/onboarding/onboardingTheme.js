// Local palette for the onboarding wizard, per the "Clean & Unique Layout
// Specification" — deliberately distinct from src/styles/theme.js (which
// Landing/Login still use). Scoped here rather than merged into the global
// theme so this redesign doesn't change screens it wasn't specified for.
export const wz = {
  // 2026-08-17: rebased alongside src/styles/theme.js's flat-design pass —
  // same GitHub-dark neutrals (was two different cyans: #06b6d4 here vs
  // #0891b2 in the global theme). 2026-08-18: accent re-synced again to
  // match src/styles/theme.js's own switch to the logo's teal (#00d4ff) —
  // kept as a separate object per the note above (still deliberately
  // scoped to onboarding only), just always meant to track the same value.
  bg: "#0f0f0f",
  sidebarBg: "#141414",
  activeBg: "#1a1a1a",
  border: "#262626",
  borderLeft: "#333333",
  accent: "#00d4ff",
  accentHover: "#33ddff",
  textPrimary: "#ffffff",
  textSecondary: "#999999",
  textMuted: "#8b8b8b",
  success: "#3fb950",
  error: "#f85149",
  warning: "#d29922",
  onAccentLight: "#ffffff",
  font: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Courier New', monospace",
  },
};
