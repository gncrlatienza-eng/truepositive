import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { theme } from "../../styles/theme";
import { OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import { deleteWhitelistEntry, listWhitelist } from "../../api/whitelist";
import ConfirmModal from "../common/ConfirmModal";
import AddWhitelistEntryModal from "./AddWhitelistEntryModal";

export default function WhitelistTab() {
  const [mode, setMode] = useState("allow");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);

  useEffect(() => {
    listWhitelist()
      .then(setEntries)
      .catch(() => setError("Could not load the whitelist. Try refreshing."))
      .finally(() => setLoading(false));
  }, []);

  async function confirmDelete() {
    if (!confirmTarget) return;
    setError("");
    try {
      await deleteWhitelistEntry(confirmTarget.id);
      setEntries((prev) => prev.filter((e) => e.id !== confirmTarget.id));
    } catch {
      setError("Could not remove that entry.");
    }
  }

  if (loading) return null;

  // Every existing entry defaults to kind="allow" (the column's own DB
  // default, for entries created before Sprint 8) — filtering on that
  // instead of assuming absence-means-allow keeps this correct either way.
  const filtered = entries.filter((e) => (e.kind || "allow") === mode);

  return (
    <div>
      <ErrorBanner>{error}</ErrorBanner>

      <div style={{ display: "flex", gap: theme.space[2], marginBottom: theme.space[5] }}>
        <button
          type="button"
          onClick={() => setMode("allow")}
          style={{
            padding: "8px 18px",
            borderRadius: 999,
            border: `1px solid ${mode === "allow" ? theme.color.accent : theme.color.border}`,
            background: mode === "allow" ? "rgba(8, 144, 177, 0.1)" : "transparent",
            color: theme.color.text,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ALLOWLIST
        </button>
        <button
          type="button"
          onClick={() => setMode("block")}
          title="Block entries are created from the Threat Intel page's 'Block' action"
          style={{
            padding: "8px 18px",
            borderRadius: 999,
            border: `1px solid ${mode === "block" ? theme.color.severity.critical : theme.color.border}`,
            background: mode === "block" ? "rgba(220, 38, 38, 0.1)" : "transparent",
            color: theme.color.text,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          BLOCKLIST
        </button>
      </div>

      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: theme.space[4] }}
      >
        <div style={{ fontSize: 14, color: theme.color.textMuted }}>
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
        </div>
        {mode === "allow" ? (
          <PrimaryButton type="button" style={{ width: "auto" }} onClick={() => setModalOpen(true)}>
            + Add entry
          </PrimaryButton>
        ) : (
          <Link to="/app/intel" style={{ fontSize: 13, color: theme.color.accent, textDecoration: "none" }}>
            Block an indicator from Threat Intel →
          </Link>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ fontSize: 14, color: theme.color.textFaint }}>
          {mode === "allow" ? "No whitelist entries yet." : "No blocked indicators yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
          {filtered.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: theme.space[3],
                padding: theme.space[3],
                border: `1px solid ${theme.color.border}`,
                borderRadius: theme.radius.md,
                background: theme.color.surface,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: `1px solid ${theme.color.border}`,
                  color: theme.color.textMuted,
                  textTransform: "uppercase",
                }}
              >
                {e.type}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontFamily: theme.font.mono }}>{e.value}</div>
                <div style={{ fontSize: 12, color: theme.color.textFaint }}>
                  {e.reason && `${e.reason} · `}added {new Date(e.created_at).toLocaleDateString()} by{" "}
                  {e.created_by_email}
                </div>
              </div>
              {e.expires_at && (
                <span
                  style={{
                    fontSize: 12,
                    color: e.is_active ? theme.color.textMuted : theme.color.severity.critical,
                  }}
                >
                  {e.is_active ? "expires" : "expired"} {new Date(e.expires_at).toLocaleDateString()}
                </span>
              )}
              <OutlineButton
                type="button"
                style={{ width: "auto", padding: "6px 12px", fontSize: 13, color: theme.color.severity.critical }}
                onClick={() => setConfirmTarget(e)}
              >
                Remove
              </OutlineButton>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={confirmDelete}
        title="Remove whitelist entry?"
        message={`Remove "${confirmTarget?.value}" from the whitelist?`}
        confirmLabel="Remove"
      />

      <AddWhitelistEntryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(entry) => setEntries((prev) => [entry, ...prev])}
      />
    </div>
  );
}
