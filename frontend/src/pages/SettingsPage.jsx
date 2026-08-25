import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { theme } from "../styles/theme";
import SourcesTab from "../components/settings/SourcesTab";
import WhitelistTab from "../components/settings/WhitelistTab";
import RulesTab from "../components/settings/RulesTab";
import AutomationTab from "../components/settings/AutomationTab";
import NetworkTab from "../components/settings/NetworkTab";
import { PillSelector } from "../components/common/PillSelector";

const TAB_IDS = ["sources", "rules", "whitelist", "automation", "network"];
const TABS = [
  { id: "sources", label: "Data sources" },
  { id: "rules", label: "Rules" },
  { id: "whitelist", label: "Whitelisting" },
  { id: "automation", label: "Automation" },
  { id: "network", label: "Remote access" },
];

// Rendered inside AppShell (sidebar/topbar) as of Sprint 4 — no longer builds
// its own header/back-link, since the shell now provides navigation
// (and the Config nav item highlights while this page is active).
export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const initialTab = TAB_IDS.includes(searchParams.get("tab")) ? searchParams.get("tab") : "sources";
  const [tab, setTab] = useState(initialTab);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Sticky header + tab bar -- position: sticky needs an opaque
          background or scrolled-past content shows through it (same
          reasoning as .tp-table th in index.css / IntelPage's own sticky
          search bar), plus a border to mark where the pinned area ends. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: theme.color.background,
          padding: `${theme.space[7]}px ${theme.space[7]}px ${theme.space[5]}px`,
          boxSizing: "border-box",
          borderBottom: `1px solid ${theme.color.border}`,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: theme.color.textMuted,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            marginBottom: 9,
          }}
        >
          Configuration
        </div>
        <h1 style={{ fontSize: 34, letterSpacing: "-0.025em", margin: 0, marginBottom: theme.space[6] }}>Settings</h1>

        <PillSelector options={TABS.map((t) => ({ id: t.id, label: t.label }))} activeId={tab} onSelect={setTab} />
        <div style={{ fontSize: 13, color: theme.color.textFaint, marginTop: theme.space[3] }}>
          Audit log tab arrives in a later sprint.
        </div>
      </div>

      <div style={{ padding: `${theme.space[5]}px ${theme.space[7]}px ${theme.space[7]}px`, boxSizing: "border-box" }}>
        <div key={tab} className="tp-mini-pane-enter">
          {tab === "sources" && <SourcesTab />}
          {tab === "rules" && <RulesTab />}
          {tab === "whitelist" && <WhitelistTab />}
          {tab === "automation" && <AutomationTab />}
          {tab === "network" && <NetworkTab />}
        </div>
      </div>
    </div>
  );
}
