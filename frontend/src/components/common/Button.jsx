import { theme } from "../../styles/theme";

const SIZES = {
  sm: { padding: "6px 12px", fontSize: 12 },
  md: { padding: "9px 16px", fontSize: 13 },
  lg: { padding: "11px 20px", fontSize: 14 },
};

const VARIANTS = {
  // primary/danger stay solid — they're the "this is the action to take"
  // CTAs, and glass's whole point is translucency, which is the wrong
  // property for something that needs to visually pop above everything
  // else. secondary was already transparent-with-a-border, i.e. already
  // halfway to glass — that's the one that actually becomes real glass.
  primary: { background: theme.color.accent, color: "#0A0A0C" },
  secondary: { color: theme.color.text },
  danger: { background: theme.color.severity.critical, color: "#fff" },
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
