// Single source of truth for how a Severity enum value ("critical" | "high" |
// "medium" | "ok") is displayed as text. The backend's bottom tier is
// literally "ok" — correct as an internal identifier (it means "nothing
// notable"), but confusing rendered as a severity *level* ("OK" reads as "no
// problem", not as a tier name like "Info"/"Low"). Display-only: the
// underlying value the app matches/sorts/filters on is untouched.
export const SEVERITY_LABEL = { critical: "Critical", high: "High", medium: "Medium", ok: "Info" };

export function severityLabel(severity) {
  return SEVERITY_LABEL[severity] || severity;
}
