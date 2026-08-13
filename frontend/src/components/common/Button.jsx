import { theme } from "../../styles/theme";

const SIZES = {
  sm: { padding: "6px 12px", fontSize: 12 },
  md: { padding: "9px 16px", fontSize: 13 },
  lg: { padding: "11px 20px", fontSize: 14 },
};

const VARIANTS = {
  primary: { background: theme.color.accent, color: "#0F1219" },
  secondary: { background: "transparent", color: theme.color.text, border: `1px solid ${theme.color.border}` },
  danger: { background: theme.color.severity.critical, color: "#fff" },
};

// Compact Button (primary/secondary/danger, sm/md/lg) for the app shell and
// dashboard — distinct from the full-width pill buttons in
// components/auth/fields.jsx, which stay as-is for the auth/onboarding forms
// they were purpose-built for.
export function Button({ variant = "primary", size = "md", className = "", style, disabled, children, ...props }) {
  const variantStyle = VARIANTS[variant] || VARIANTS.primary;
  const sizeStyle = SIZES[size] || SIZES.md;
  return (
    <button
      type="button"
      disabled={disabled}
      {...props}
      className={`tp-btn2 tp-btn2-${variant} ${className}`.trim()}
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
