// Local palette for the onboarding wizard, per the "Clean & Unique Layout
// Specification" — deliberately distinct from src/styles/theme.js (which
// Landing/Login still use). Scoped here rather than merged into the global
// theme so this redesign doesn't change screens it wasn't specified for.
export const wz = {
  // 2026-08-16: neutrals rebased to match src/styles/theme.js's move off a
  // navy tint to true near-black — kept as a separate object per the note
  // above (still deliberately scoped to onboarding only), just no longer a
  // different-hued dark theme from the rest of the app. accent unchanged.
  bg: "#0a0a0c",
  sidebarBg: "#141417",
  activeBg: "#1b1b1f",
  border: "#242429",
  borderLeft: "#35353c",
  accent: "#06b6d4",
  accentHover: "#0891b2",
  textPrimary: "#e5e7eb",
  textSecondary: "#d1d5db",
  textMuted: "#8b8b8b",
  success: "#86efac",
  error: "#fca5a5",
  warning: "#fdba74",
  onAccentDark: "#0a0a0c",
  onAccentLight: "#f0fdf4",
  font: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Courier New', monospace",
  },
};
