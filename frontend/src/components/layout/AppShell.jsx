import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { theme } from "../../styles/theme";
import { getCriticalPanel } from "../../api/dashboard";
import { ErrorBoundary } from "../common/ErrorBoundary";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";

const SIDEBAR_COLLAPSED_KEY = "tp_sidebar_collapsed";
const RAIL_WIDTH_EXPANDED = 76;
const RAIL_WIDTH_COLLAPSED = 60;

// Persists across every /app/* and /settings route via nested routing (see
// App.jsx) — sidebar/topbar never remount on navigation.
export default function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  const [criticalCount, setCriticalCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    // Not window-scoped — matches the real definition of "needs attention"
    // (all active critical alerts), independent of whatever time window the
    // dashboard page itself is currently showing.
    getCriticalPanel()
      .then((data) => setCriticalCount(data.count))
      .catch(() => {});
  }, []);

  const railW = collapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH_EXPANDED;

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: theme.color.background, color: theme.color.text }}>
      <TopBar collapsed={collapsed} onToggleSidebar={() => setCollapsed((c) => !c)} />
      <Sidebar railW={railW} collapsed={collapsed} criticalCount={criticalCount} />
      <div
        style={{
          marginLeft: railW,
          paddingTop: 64,
          height: "100vh",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "margin-left 150ms ease-out",
        }}
      >
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </div>
    </div>
  );
}
