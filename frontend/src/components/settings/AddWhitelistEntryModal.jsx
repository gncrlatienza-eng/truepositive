import { useState } from "react";
import { theme } from "../../styles/theme";
import { Field, TextInput, OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import Modal from "../common/Modal";
import { createWhitelistEntry } from "../../api/whitelist";

const TYPES = [
  { id: "ip", label: "IP address" },
  { id: "domain", label: "Domain" },
  { id: "hash", label: "Hash" },
  { id: "user", label: "User" },
];

export default function AddWhitelistEntryModal({ open, onClose, onSaved }) {
  const [type, setType] = useState("ip");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setType("ip");
    setValue("");
    setReason("");
    setHasExpiry(false);
    setExpiresAt("");
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const entry = await createWhitelistEntry({
        type,
        value,
        reason: reason || null,
        expires_at: hasExpiry && expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      onSaved(entry);
      reset();
      onClose();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map((d) => d.msg).join(" ") : detail || "Check the form and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add whitelist entry">
      <form onSubmit={handleSubmit}>
        <ErrorBanner>{error}</ErrorBanner>

        <div style={{ display: "flex", gap: theme.space[2], marginBottom: theme.space[4], flexWrap: "wrap" }}>
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: `1px solid ${type === t.id ? theme.color.accent : theme.color.border}`,
                background: type === t.id ? "rgba(8, 145, 178, 0.1)" : "transparent",
                color: theme.color.text,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Field label="Value" hint={type === "ip" ? "Single IP or CIDR range, e.g. 10.0.0.5 or 10.0.0.0/24" : undefined}>
          <TextInput value={value} onChange={(e) => setValue(e.target.value)} required />
        </Field>

        <Field label="Reason" hint="Optional — shown to teammates reviewing this entry">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        <label style={{ display: "flex", alignItems: "center", gap: theme.space[2], marginBottom: theme.space[3] }}>
          <input type="checkbox" checked={hasExpiry} onChange={(e) => setHasExpiry(e.target.checked)} />
          <span style={{ fontSize: 14 }}>Set expiry date</span>
        </label>
        {hasExpiry && (
          <Field label="Expires on">
            <TextInput type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
          </Field>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space[3], marginTop: theme.space[5] }}>
          <OutlineButton type="button" style={{ width: "auto" }} onClick={onClose}>
            Cancel
          </OutlineButton>
          <PrimaryButton type="submit" style={{ width: "auto" }} disabled={submitting}>
            {submitting ? "Adding…" : "Add entry"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
