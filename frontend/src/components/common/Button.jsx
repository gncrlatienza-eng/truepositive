import { theme } from "../../styles/theme";

const SIZES = {
  sm: { padding: "6px 12px", fontSize: 12 },
  md: { padding: "9px 16px", fontSize: 13 },
  lg: { padding: "11px 20px", fontSize: 14 },
};

const VARIANTS = {
  // primary is the one variant that needs to visually pop, so it stays a
  // solid fill — white text, since the accent (#0890b1, the logo's own
  // teal) isn't light enough for dark text to read cleanly. danger/safe
  // are tinted+outlined per the flat design spec (a solid red/green fill
  // read as a warning label, not a button) — border set inline since it
  // needs to survive regardless of class cascade order.
  primary: { background: theme.color.accent, color: "#ffffff" },
  secondary: { color: theme.color.text },
  danger: {
    background: theme.color.danger.bg,
    color: theme.color.danger.text,
    border: `1px solid ${theme.color.danger.border}`,
  },
  safe: {
    background: theme.color.safe.bg,
    color: theme.color.safe.text,
    border: `1px solid ${theme.color.safe.border}`,
  },
};

const GLASS_VARIANTS = new Set(["secondary"]);

// Compact Button (primary/secondary/danger, sm/md/lg) for the app shell and
// dashboard — distinct from the full-width pill buttons in
// components/auth/fields.jsx, which stay as-is for the auth/onboarding forms
// they were purpose-built for.
export function Button({ variant = "primary", size = "md", className = "", style, disabled, children, ...props }) {
  const variantStyle = VARIANTS[variant] || VARIANTS.primary;
  const sizeStyle = SIZES[size] || SIZES.md;
  const isGlass = GLASS_VARIANTS.has(variant);
  return (
    <button
      type="button"
      disabled={disabled}
      {...props}
      className={`tp-btn2 tp-btn2-${variant} ${isGlass ? "tp-glass tp-glass-text" : ""} ${className}`.trim()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontWeight: 600,
        borderRadius: theme.radius.sm,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "all 150ms ease-out",
        ...variantStyle,
        ...sizeStyle,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
