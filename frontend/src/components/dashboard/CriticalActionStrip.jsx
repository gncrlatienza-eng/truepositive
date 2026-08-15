import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { getCriticalPanel } from "../../api/dashboard";
import { formatDuration } from "../../utils/format";

// Persistent "what to do right now" call-to-action shown only when there's
// at least one active critical alert — reuses the existing critical
// drill-down endpoint rather than adding a new one, and opens that same
// panel on click instead of navigating anywhere new.
export function CriticalActionStrip({ criticalCount, onOpen }) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!criticalCount) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    getCriticalPanel()
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [criticalCount]);

  if (!criticalCount || !detail?.oldest_title) return null;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 18px",
        background: "rgba(220, 38, 38, 0.08)",
        border: `1px solid ${theme.color.severity.critical}`,
        borderRadius: 8,
        cursor: "pointer",
      }}
    >
      <span
        className="tp-pulse-dot"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: theme.color.severity.critical,
          flexShrink: 0,
          "--tp-pulse-color": theme.color.severity.critical,
        }}
      />
      <span style={{ fontSize: 14, fontWeight: 600, color: theme.color.severity.critical, whiteSpace: "nowrap" }}>
        {criticalCount} critical alert{criticalCount === 1 ? "" : "s"} need attention
      </span>
      <span
        style={{
          fontSize: 13,
          color: theme.color.textMuted,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        Oldest: {detail.oldest_title} — {formatDuration(detail.oldest_age_seconds)} ago
        {detail.sla_breached ? " · SLA breached" : ""}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: theme.color.accent, flexShrink: 0 }}>View →</span>
    </div>
  );
}
