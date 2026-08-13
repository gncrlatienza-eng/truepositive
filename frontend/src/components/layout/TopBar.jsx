import { Link, useLocation } from "react-router-dom";
import { theme } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";

const ROLE_LABELS = { admin: "Admin", lead: "SOC Lead", analyst: "Analyst", read_only: "Read only" };

const CRUMB_LEAVES = [
  { prefix: "/app/logs", label: "Logs" },
  { prefix: "/app/alerts", label: "Alerts" },
  { prefix: "/app/incidents", label: "Incidents" },
  { prefix: "/app/reports", label: "Reports" },
  { prefix: "/app/intel", label: "Threat intel" },
  { prefix: "/settings", label: "Settings" },
  { prefix: "/app", label: "Overview" },
];

function crumbLeafFor(pathname) {
  return CRUMB_LEAVES.find((c) => pathname.startsWith(c.prefix))?.label || "";
}

export default function TopBar({ collapsed, onToggleSidebar }) {
  const { user, org } = useAuth();
  const location = useLocation();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 64,
        background: theme.color.surface,
        borderBottom: `1px solid ${theme.color.border}`,
        padding: "0 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 100,
        boxSizing: "border-box",
        gap: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0, minWidth: 0 }}>
        <Link
          to="/app"
          style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none", color: theme.color.text }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: theme.color.accent,
              color: "#0F1219",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: theme.font.mono,
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            &gt;
          </div>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
            TruePositive
          </span>
        </Link>

        <button
          type="button"
          onClick={onToggleSidebar}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 7,
            cursor: "pointer",
            color: theme.color.textMuted,
            flexShrink: 0,
            background: "none",
            border: "none",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3.5" y="4" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
            <line x1="9.5" y1="4.6" x2="9.5" y2="19.4" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M6.5 9.5L4.3 12L6.5 14.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              style={{ transform: collapsed ? "scaleX(-1)" : "none", transformOrigin: "6px 12px" }}
            />
          </svg>
        </button>

        <div style={{ width: 1, height: 22, background: theme.color.border }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 11px",
            border: `1px solid ${theme.color.border}`,
            borderRadius: 6,
            fontSize: 13,
            fontFamily: theme.font.mono,
            color: theme.color.textMuted,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{ width: 7, height: 7, borderRadius: "50%", background: theme.color.severity.ok, flexShrink: 0 }}
          />
          <span>{org?.slug || "workspace"}</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          height: 64,
          flexShrink: 0,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <span style={{ fontSize: 14, color: theme.color.textFaint, whiteSpace: "nowrap" }}>
          {org?.slug || "workspace"}
        </span>
        <span style={{ fontSize: 13, color: theme.color.border }}>/</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: theme.color.text, whiteSpace: "nowrap" }}>
          {crumbLeafFor(location.pathname)}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        {/* Visual-only this sprint — no backing search feature yet. */}
        <div
          className="tp-topbar-search"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            background: theme.color.background,
            border: `1px solid ${theme.color.border}`,
            borderRadius: 7,
            padding: "8px 10px 8px 12px",
            width: 220,
            boxSizing: "border-box",
            cursor: "default",
          }}
        >
          <span style={{ fontSize: 13, color: theme.color.textFaint, flex: 1 }}>Search events, IPs, rules</span>
          <span
            style={{
              fontSize: 11,
              fontFamily: theme.font.mono,
              color: theme.color.textMuted,
              border: `1px solid ${theme.color.border}`,
              borderRadius: 3,
              padding: "1px 5px",
            }}
          >
            ⌘K
          </span>
        </div>
        <div style={{ width: 1, height: 22, background: theme.color.border }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: theme.color.accent,
              color: "#0F1219",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {(user?.full_name || "?").slice(0, 1).toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{user?.full_name}</span>
            <span style={{ fontSize: 12, color: theme.color.textMuted, whiteSpace: "nowrap" }}>
              {ROLE_LABELS[user?.role] || user?.role}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
