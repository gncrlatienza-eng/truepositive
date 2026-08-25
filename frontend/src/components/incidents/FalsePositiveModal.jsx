import { useState } from "react";
import { theme } from "../../styles/theme";
import { Button } from "../common/Button";
import Modal from "../common/Modal";

export default function FalsePositiveModal({ open, onClose, onConfirm }) {
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
    <Modal open={open} onClose={handleClose} title="Mark as false positive" width={480}>
      <p style={{ fontSize: 13, color: theme.color.textMuted, marginBottom: theme.space[4] }}>
        Mark this incident as a false positive — it wasn&apos;t a real threat. Kept separate from Resolve so
        false-positive rate stays visible for tuning detection rules. You can optionally add a note explaining why.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why was this a false positive? (optional)…"
        rows={4}
        className="tp-field-input"
        style={{ resize: "vertical", fontSize: 13, fontFamily: "inherit", marginBottom: theme.space[5] }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space[3] }}>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button onClick={handleConfirm}>Mark false positive</Button>
      </div>
    </Modal>
  );
}
