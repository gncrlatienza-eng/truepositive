import { NavLink } from "react-router-dom";
import { theme } from "../../styles/theme";

const ICONS = {
  dashboard: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.25" y="3.25" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.75" y="3.25" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.25" y="13.75" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.75" y="13.75" width="7" height="7" rx="1.6" fill="currentColor" />
    </svg>
  ),
  logs: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="3.5" y1="6" x2="20.5" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="3.5" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="3.5" y1="18" x2="20.5" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  alerts: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5C15 3.5 15.8 6.2 15.8 8.5C15.8 11.5 17 12.8 18 14.2C18.6 15 18.1 16 17.1 16H6.9C5.9 16 5.4 15 6 14.2C7 12.8 8.2 11.5 8.2 8.5C8.2 6.2 9 3.5 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9.8 19C10.2 20 11 20.6 12 20.6C13 20.6 13.8 20 14.2 19"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  ),
  incidents: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 7V5.5C8.5 4.4 9.4 3.5 10.5 3.5H13.5C14.6 3.5 15.5 4.4 15.5 5.5V7"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
      />
      <rect x="3" y="7" width="18" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <line x1="3" y1="12.2" x2="21" y2="12.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  reports: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3.5H14L18 7.5V19C18 19.8 17.3 20.5 16.5 20.5H7.5C6.7 20.5 6 19.8 6 19V5C6 4.2 6.7 3.5 7.5 3.5H7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M14 3.5V7.5H18" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" fill="none" />
      <line x1="8.7" y1="12.5" x2="15.3" y2="12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8.7" y1="15.7" x2="13" y2="15.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  intel: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.2" cy="10.2" r="6.4" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <line x1="14.7" y1="14.7" x2="20" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" strokeDasharray="2.3 2.3" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
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
