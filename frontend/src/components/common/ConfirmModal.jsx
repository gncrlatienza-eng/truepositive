import { theme } from "../../styles/theme";
import { OutlineButton, PrimaryButton } from "../auth/fields";
import Modal from "./Modal";

// Styled stand-in for window.confirm() — matches the app's dark theme
// instead of the browser's native dialog, which looked out of place next
// to everything else in Settings.
export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
}) {
  function handleConfirm() {
    onConfirm();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={title} width={420}>
      <p style={{ fontSize: 14, color: theme.color.textMuted, marginBottom: theme.space[5] }}>{message}</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space[3] }}>
        <OutlineButton type="button" style={{ width: "auto" }} onClick={onClose}>
          Cancel
        </OutlineButton>
        <PrimaryButton
          type="button"
          style={{ width: "auto", background: danger ? theme.color.severity.critical : undefined }}
          onClick={handleConfirm}
        >
          {confirmLabel}
        </PrimaryButton>
      </div>
    </Modal>
  );
}
