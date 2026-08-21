import { theme } from "../../styles/theme";
import { severityLabel } from "../../utils/severity";

// theme.severity only has 4 tones (critical/high/medium/ok) — matches the
// backend's Severity enum exactly, no "low"/"info" tone to invent (only the
// display text is remapped — see utils/severity.js).
export function SeverityBadge({ severity, className = "", style }) {
  const color = theme.color.severity[severity] || theme.color.textMuted;
  return (
    <Badge color={color} className={className} style={style}>
      {severityLabel(severity)}
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
