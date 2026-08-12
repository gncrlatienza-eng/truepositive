import { Link } from "react-router-dom";
import { theme } from "../../styles/theme";

export function Field({ label, hint, error, children }) {
  return (
    <label style={{ display: "block", marginBottom: theme.space[4] }}>
      {label && (
        <div style={{ fontSize: 15, fontWeight: 600, color: theme.color.textMuted, marginBottom: theme.space[2] }}>
          {label}
        </div>
      )}
      {children}
      {hint && !error && (
        <div style={{ fontSize: 13, color: theme.color.textFaint, marginTop: theme.space[1] }}>{hint}</div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: theme.color.severity.critical, marginTop: theme.space[1] }}>{error}</div>
      )}
    </label>
  );
}

export function TextInput({ className = "", style, ...props }) {
  return <input {...props} className={`tp-input ${className}`.trim()} style={style} />;
}

export function Select({ children, className = "", style, ...props }) {
  return (
    <select {...props} className={`tp-input ${className}`.trim()} style={style}>
      {children}
    </select>
  );
}

export function PrimaryButton({ children, className = "", style, ...props }) {
  return (
    <button {...props} className={`tp-btn tp-btn-primary ${className}`.trim()} style={style}>
      {children}
    </button>
  );
}

export function OutlineButton({ children, className = "", style, ...props }) {
  return (
    <button {...props} className={`tp-btn tp-btn-outline ${className}`.trim()} style={style}>
      {children}
    </button>
  );
}

export function PrimaryLink({ to, children, style, className = "" }) {
  return (
    <Link to={to} className={`tp-btn tp-btn-primary ${className}`.trim()} style={style}>
      {children}
    </Link>
  );
}

export function OutlineLink({ to, children, style, className = "" }) {
  return (
    <Link to={to} className={`tp-btn tp-btn-outline ${className}`.trim()} style={style}>
      {children}
    </Link>
  );
}

export function ErrorBanner({ children }) {
  if (!children) return null;
  return (
    <div
      style={{
        background: "rgba(220, 38, 38, 0.1)",
        border: `1px solid ${theme.color.severity.critical}`,
        color: theme.color.severity.critical,
        borderRadius: theme.radius.sm,
        padding: "12px 14px",
        fontSize: 14,
        marginBottom: theme.space[4],
      }}
    >
      {children}
    </div>
  );
}
