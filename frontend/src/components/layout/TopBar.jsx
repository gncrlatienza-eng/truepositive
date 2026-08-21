import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { theme } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useDelayedHover } from "../../hooks/useDelayedHover";
import GlobalSearch from "./GlobalSearch";

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

export default function TopBar() {
  const { user, org, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const orgBadgeHover = useDelayedHover();

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

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
          <img src="/tp-logo.png" alt="" width={30} height={30} style={{ flexShrink: 0 }} />
          {/* Was plain single-color text — the same two-tone split
              (True=text, Positive=accent) already used on Login/Onboarding
              is the real wordmark; this was the one place still missing it. */}
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
            <span style={{ color: theme.color.text }}>True</span>
            <span style={{ color: theme.color.accent }}>Positive</span>
          </span>
        </Link>

        <div style={{ width: 1, height: 22, background: theme.color.border }} />

        {/* Was inert display text. No multi-org membership exists in this
            app's data model (User.org_id is a single FK, not a join table)
            so this can't be a real workspace switcher — but it shouldn't
            have been dead either. Links to Settings, where the org's own
            details actually live. */}
        <Link
          to="/settings"
          title="Org settings"
          className={`tp-topbar-orgbadge tp-glass-subtle tp-glass-subtle-text${orgBadgeHover.hovered ? " tp-hover-brighten" : ""}`}
          onMouseEnter={orgBadgeHover.onMouseEnter}
          onMouseLeave={orgBadgeHover.onMouseLeave}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 11px",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: theme.font.mono,
            color: theme.color.text,
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          <span
            style={{ width: 7, height: 7, borderRadius: "50%", background: theme.color.severity.ok, flexShrink: 0 }}
          />
          <span>{org?.slug || "workspace"}</span>
        </Link>
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
        <GlobalSearch />
        <div style={{ width: 1, height: 22, background: theme.color.border }} />
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: theme.color.text,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: theme.color.accent,
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {(user?.full_name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, textAlign: "left" }}>
              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{user?.full_name}</span>
              <span style={{ fontSize: 12, color: theme.color.textMuted, whiteSpace: "nowrap" }}>
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
            </div>
          </button>

          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                minWidth: 200,
                background: theme.color.raised,
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.md,
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
                zIndex: 200,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${theme.color.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{user?.full_name}</div>
                <div style={{ fontSize: 12, color: theme.color.textMuted }}>
                  {ROLE_LABELS[user?.role] || user?.role} · {org?.slug || "workspace"}
                </div>
              </div>
              <Link
                to="/settings"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "block",
                  padding: "9px 14px",
                  fontSize: 13,
                  color: theme.color.text,
                  textDecoration: "none",
                }}
              >
                Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 14px",
                  fontSize: 13,
                  color: theme.color.text,
                  background: "none",
                  border: "none",
                  borderTop: `1px solid ${theme.color.border}`,
                  cursor: "pointer",
                }}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
