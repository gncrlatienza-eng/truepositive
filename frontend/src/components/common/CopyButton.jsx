import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { theme } from "../../styles/theme";

// Small icon-only copy-to-clipboard control — pasting a log line, a raw
// payload, or an indicator value into a ticket/search bar is routine
// analyst work that had no affordance anywhere in the log modal before this.
export function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard API can be unavailable (insecure context, permission
      // denied) — silently no-op rather than throwing in the UI.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={label}
      className="tp-copy-btn"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "none",
        border: "none",
        padding: 2,
        cursor: "pointer",
        color: copied ? theme.color.severity.ok : theme.color.textFaint,
        fontSize: 11,
      }}
    >
      {copied ? (
        <span key="copied" className="tp-copied-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Check size={13} /> Copied
        </span>
      ) : (
        <Copy size={13} />
      )}
    </button>
  );
}
