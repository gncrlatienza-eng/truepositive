import { useState } from "react";
import { theme } from "../styles/theme";
import SourcesTab from "../components/settings/SourcesTab";
import WhitelistTab from "../components/settings/WhitelistTab";

const TABS = [
  { id: "sources", label: "Data sources" },
  { id: "whitelist", label: "Whitelisting" },
];

// Rendered inside AppShell (sidebar/topbar) as of Sprint 4 — no longer builds
// its own header/back-link, since the shell now provides navigation
// (and the Config nav item highlights while this page is active).
export default function SettingsPage() {
  const [tab, setTab] = useState("sources");

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: theme.space[7] }}>
        <h1 style={{ fontSize: 28, marginBottom: theme.space[6] }}>Settings</h1>

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
                background: tab === t.id ? "rgba(8, 145, 178, 0.1)" : "transparent",
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
        <div style={{ fontSize: 13, color: theme.color.textFaint, marginBottom: theme.space[5] }}>
          Alert rules, automation, and audit log settings arrive in later sprints.
        </div>

        {tab === "sources" && <SourcesTab />}
        {tab === "whitelist" && <WhitelistTab />}
      </div>
    </div>
  );
}
