import { useEffect, useState } from "react";
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
            background: mode === "allow" ? "rgba(8, 145, 178, 0.1)" : "transparent",
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
          disabled
          title="Blocklists are coming in a later release"
          style={{
            padding: "8px 18px",
            borderRadius: 999,
            border: `1px solid ${theme.color.border}`,
            background: "transparent",
            color: theme.color.textFaint,
            cursor: "not-allowed",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          BLOCKLIST — coming soon
        </button>
      </div>

      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: theme.space[4] }}
      >
        <div style={{ fontSize: 14, color: theme.color.textMuted }}>
          {entries.length} entr{entries.length === 1 ? "y" : "ies"}
        </div>
        <PrimaryButton type="button" style={{ width: "auto" }} onClick={() => setModalOpen(true)}>
          + Add entry
        </PrimaryButton>
      </div>

      {entries.length === 0 ? (
        <div style={{ fontSize: 14, color: theme.color.textFaint }}>No whitelist entries yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
          {entries.map((e) => (
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
