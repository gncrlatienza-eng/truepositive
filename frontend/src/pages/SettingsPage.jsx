import { useState } from "react";
import { Link } from "react-router-dom";
import { theme } from "../styles/theme";
import SourcesTab from "../components/settings/SourcesTab";
import WhitelistTab from "../components/settings/WhitelistTab";

const TABS = [
  { id: "sources", label: "Data sources" },
  { id: "whitelist", label: "Whitelisting" },
];

// Standalone protected page — no app shell (sidebar/dashboard) exists yet,
// that's Sprint 4. Reached from AppHomePage's "Workspace settings" link.
export default function SettingsPage() {
  const [tab, setTab] = useState("sources");

  return (
    <div style={{ minHeight: "100vh", background: theme.color.background, color: theme.color.text }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${theme.space[4]}px ${theme.space[7]}px`,
          borderBottom: `1px solid ${theme.color.border}`,
        }}
      >
        <h1 style={{ fontSize: 20 }}>Settings</h1>
        <Link to="/app" style={{ fontSize: 14, color: theme.color.textMuted, textDecoration: "none" }}>
          ← Back to app
        </Link>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: theme.space[7] }}>
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
