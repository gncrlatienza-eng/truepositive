import { theme } from "../../styles/theme";

const SEVERITY_LABELS = { critical: "Critical", high: "High", medium: "Medium", ok: "OK" };

// theme.severity only has 4 tones (critical/high/medium/ok) — matches the
// backend's Severity enum exactly, no "low"/"info" to invent.
export function SeverityBadge({ severity, className = "", style }) {
  const color = theme.color.severity[severity] || theme.color.textMuted;
  return (
    <Badge color={color} className={className} style={style}>
      {SEVERITY_LABELS[severity] || severity}
    </Badge>
  );
}

// Generic status badge — background is a low-opacity tint of `color`, text is `color`.
export function Badge({ color = theme.color.textMuted, children, className = "", style }) {
  return (
    <span className={`tp-badge ${className}`.trim()} style={{ background: `${color}26`, color, ...style }}>
      {children}
    </span>
  );
}
