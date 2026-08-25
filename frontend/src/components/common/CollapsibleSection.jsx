import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { theme } from "../../styles/theme";
import { Badge } from "./Badge";

// Small shared accordion — was duplicated near-identically across
// IncidentDetailModal/LogDetailModal/AlertDetailModal (a genuine mechanics
// primitive with zero page-specific styling, unlike IntelPage's
// SectionCard/ProgressRow which bundle page-specific layout choices this
// codebase deliberately keeps local per its own documented convention).
// `count`: shorthand for the common "badge with a number" header — pass
// `right` directly for anything else (e.g. LogDetailModal's copy button).
export function CollapsibleSection({ icon: Icon, title, count, right, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.sm, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: theme.space[2],
          padding: `${theme.space[3]}px ${theme.space[4]}px`,
          background: open ? "rgba(0,212,255,0.06)" : theme.color.surface,
          border: "none",
          cursor: "pointer",
          color: theme.color.text,
          textAlign: "left",
          transition: "background 150ms ease",
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {Icon && <Icon size={14} color={theme.color.textMuted} />}
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{title}</span>
        {count != null && (
          <Badge color={theme.color.textMuted} style={{ fontSize: 11 }}>
            {count}
          </Badge>
        )}
        {right && <span onClick={(e) => e.stopPropagation()}>{right}</span>}
      </button>
      {open && (
        <div
          style={{
            padding: theme.space[4],
            borderTop: `1px solid ${theme.color.border}`,
            background: theme.color.background,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
