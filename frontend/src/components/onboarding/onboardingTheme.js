// Local palette for the onboarding wizard, per the "Clean & Unique Layout
// Specification" — deliberately distinct from src/styles/theme.js (which
// Landing/Login still use). Scoped here rather than merged into the global
// theme so this redesign doesn't change screens it wasn't specified for.
export const wz = {
  bg: "#0f1419",
  sidebarBg: "#1a2332",
  activeBg: "#151c28",
  border: "#2d3748",
  borderLeft: "#374151",
  accent: "#06b6d4",
  accentHover: "#0891b2",
  textPrimary: "#e5e7eb",
  textSecondary: "#d1d5db",
  textMuted: "#8b8b8b",
  success: "#86efac",
  error: "#fca5a5",
  warning: "#fdba74",
  onAccentDark: "#0f1419",
  onAccentLight: "#f0fdf4",
  font: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Courier New', monospace",
  },
};
