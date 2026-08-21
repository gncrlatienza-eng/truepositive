import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { theme } from "../styles/theme";
import SourcesTab from "../components/settings/SourcesTab";
import WhitelistTab from "../components/settings/WhitelistTab";
import RulesTab from "../components/settings/RulesTab";
import AutomationTab from "../components/settings/AutomationTab";
import NetworkTab from "../components/settings/NetworkTab";

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
      <div style={{ padding: theme.space[7], boxSizing: "border-box" }}>
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

        <div style={{ display: "flex", gap: theme.space[2], marginBottom: theme.space[6] }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 20px",
                borderRadius: theme.radius.md,
                border: `1px solid ${tab === t.id ? theme.color.accent : theme.color.border}`,
                background: tab === t.id ? "rgba(8, 144, 177, 0.1)" : "transparent",
                color: theme.color.text,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 14, color: theme.color.textMuted, marginBottom: theme.space[5] }}>
          Audit log tab arrives in a later sprint.
        </div>

        {tab === "sources" && <SourcesTab />}
        {tab === "rules" && <RulesTab />}
        {tab === "whitelist" && <WhitelistTab />}
        {tab === "automation" && <AutomationTab />}
        {tab === "network" && <NetworkTab />}
      </div>
    </div>
  );
}
