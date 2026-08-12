import { useEffect } from "react";
import { theme } from "../../styles/theme";

// Minimal reusable modal shell for Sprint 3's Connect Source / Add Whitelist
// Entry dialogs. Sprint 4's component library is expected to supersede this.
export default function Modal({ open, onClose, title, children, footer, width = 520 }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="tp-modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: theme.space[5],
      }}
    >
      <div
        className="tp-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          overflowY: "auto",
          background: theme.color.surface,
          border: `1px solid ${theme.color.border}`,
          borderRadius: theme.radius.lg,
          padding: theme.space[6],
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: theme.space[5],
          }}
        >
          <h2 style={{ fontSize: 20, margin: 0 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              color: theme.color.textMuted,
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
        {children}
        {footer && (
          <div style={{ marginTop: theme.space[6], display: "flex", justifyContent: "flex-end", gap: theme.space[3] }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
