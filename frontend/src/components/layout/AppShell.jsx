import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { theme } from "../../styles/theme";
import { getCriticalPanel } from "../../api/dashboard";
import { ErrorBoundary } from "../common/ErrorBoundary";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";

const SIDEBAR_COLLAPSED_KEY = "tp_sidebar_collapsed";
// EXPANDED was 76 — sized for the old stacked (icon-above-label) nav item
// layout. Once labels moved beside the icons instead of under them, 76px
// wasn't remotely enough room for e.g. "INCIDENTS" next to a 22px icon —
// the text was getting clipped by the rail's own edge, not just visually
// cramped. Widened to fit icon + gap + the longest label with real margin.
const RAIL_WIDTH_EXPANDED = 200;
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
      <TopBar />
      <Sidebar
        railW={railW}
        collapsed={collapsed}
        criticalCount={criticalCount}
        onToggleSidebar={() => setCollapsed((c) => !c)}
      />
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
