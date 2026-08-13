import { theme } from "../../styles/theme";

// Compact form field family for the app shell/dashboard (filters, settings
// forms in Sprint 5+) — sibling to the pill-shaped Field/TextInput/Select in
// components/auth/fields.jsx, which stay dedicated to the auth/onboarding forms.
export function FieldLabel({ label, hint, error, children }) {
  return (
    <label style={{ display: "block", marginBottom: theme.space[3] }}>
      {label && (
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.color.textMuted, marginBottom: theme.space[1] }}>
          {label}
        </div>
      )}
      {children}
      {hint && !error && (
        <div style={{ fontSize: 12, color: theme.color.textFaint, marginTop: theme.space[1] }}>{hint}</div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: theme.color.severity.critical, marginTop: theme.space[1] }}>{error}</div>
      )}
    </label>
  );
}

export function TextInput({ className = "", style, ...props }) {
  return <input {...props} className={`tp-field-input ${className}`.trim()} style={style} />;
}

export function Select({ children, className = "", style, ...props }) {
  return (
    <select {...props} className={`tp-field-input ${className}`.trim()} style={style}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className = "", style, ...props }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: theme.space[2],
        fontSize: 13,
        color: theme.color.text,
        cursor: "pointer",
      }}
    >
      <input type="checkbox" {...props} className={className} style={style} />
      {label}
    </label>
  );
}
