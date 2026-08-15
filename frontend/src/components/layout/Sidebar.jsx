import { NavLink } from "react-router-dom";
import { LayoutDashboard, ScrollText, Bell, Siren, FileBarChart2, ShieldCheck, Settings2 } from "lucide-react";
import { theme } from "../../styles/theme";

// Icon set: lucide-react v0.x (MIT). Selected over continuing to hand-roll
// SVGs because all 7 previous hand-drawn icons had inconsistent stroke widths
// (1.5 / 1.6 / 1.7 / 1.8 mixed) which read as unpolished at sidebar scale.
// Lucide guarantees a uniform 24×24 grid, 1.5px stroke, and exports only the
// icons we import (tree-shaken at build time — bundle cost: ~1 kB per icon).
// All icons use stroke="currentColor" by default, so they inherit the
// NavLink's active (accent teal) / inactive (muted gray) color automatically.
const ICON_SIZE = 22;
const ICON_STROKE = 1.6; // slightly heavier than Lucide's default 2px to match this dark UI's weight

const ICONS = {
  dashboard: <LayoutDashboard size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />,
  logs: <ScrollText size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />,
  alerts: <Bell size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />,
  incidents: <Siren size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />,
  reports: <FileBarChart2 size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />,
  intel: <ShieldCheck size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />,
  settings: <Settings2 size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />,
};

function navItems(criticalCount) {
  return [
    { to: "/app", label: "OVERVIEW", title: "Dashboard", icon: "dashboard", end: true },
    { to: "/app/logs", label: "LOGS", title: "Logs", icon: "logs" },
    {
      to: "/app/alerts",
      label: "ALERTS",
      title: "Alerts",
      icon: "alerts",
      badge: criticalCount > 0 ? criticalCount : null,
    },
    { to: "/app/incidents", label: "INCIDENTS", title: "Incidents", icon: "incidents" },
    { to: "/app/reports", label: "REPORTS", title: "Daily reports", icon: "reports" },
    { to: "/app/intel", label: "INTEL", title: "Threat intel", icon: "intel" },
    { to: "/settings", label: "CONFIG", title: "Settings", icon: "settings" },
  ];
}

export default function Sidebar({ railW, collapsed, criticalCount }) {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 64,
        bottom: 0,
        width: railW,
        background: theme.color.background,
        borderRight: `1px solid ${theme.color.border}`,
        padding: "16px 12px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        zIndex: 90,
        transition: "width 150ms ease-out",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {navItems(criticalCount).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.title}
            className="tp-sidebar-item"
            style={({ isActive }) => ({
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: "15px 4px",
              borderRadius: 8,
              cursor: "pointer",
              color: isActive ? theme.color.accent : theme.color.textMuted,
              background: isActive ? "rgba(8, 145, 178, 0.1)" : "transparent",
            })}
          >
            {/* Icon wrapper — position:relative so the badge floats top-right
                of the icon without affecting the label below it.             */}
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {ICONS[item.icon]}
              {item.badge != null && (
                <span
                  style={{
                    position: "absolute",
                    top: -6,
                    left: 14,
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: theme.font.mono,
                    background: "#7f1d1d",
                    color: "#fff",
                    padding: "1px 5px",
                    borderRadius: 8,
                    lineHeight: 1.4,
                    border: `2px solid ${theme.color.background}`,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </div>
            {!collapsed && <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{item.label}</span>}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
