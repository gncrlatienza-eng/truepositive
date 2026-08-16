import { useState } from "react";
import { theme } from "../../styles/theme";
import { Button } from "../common/Button";
import Modal from "../common/Modal";

export default function ResolveModal({ open, onClose, onConfirm }) {
  const [note, setNote] = useState("");

  function handleConfirm() {
    onConfirm(note);
    setNote("");
  }

  function handleClose() {
    setNote("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Resolve incident" width={480}>
      <p style={{ fontSize: 13, color: theme.color.textMuted, marginBottom: theme.space[4] }}>
        Mark this incident as resolved. You can optionally add a resolution note.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Resolution note (optional)…"
        rows={4}
        className="tp-field-input"
        style={{ resize: "vertical", fontSize: 13, fontFamily: "inherit", marginBottom: theme.space[5] }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space[3] }}>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button onClick={handleConfirm}>Resolve</Button>
      </div>
    </Modal>
  );
}
