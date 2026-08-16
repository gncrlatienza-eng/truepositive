import { useState } from "react";
import { theme } from "../../styles/theme";
import { Button } from "../common/Button";
import Modal from "../common/Modal";

export default function EscalateModal({ open, onClose, currentStatus, onConfirm }) {
  const [note, setNote] = useState("");

  const isAlreadyInvestigating = currentStatus === "investigating";

  function handleConfirm() {
    onConfirm(note);
    setNote("");
  }

  function handleClose() {
    setNote("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Escalate incident" width={480}>
      <p style={{ fontSize: 13, color: theme.color.textMuted, marginBottom: theme.space[4] }}>
        {isAlreadyInvestigating
          ? "This incident is already under active investigation."
          : "Move this incident to Investigating status, indicating active triage has started."}
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Escalation note (optional)…"
        rows={4}
        className="tp-field-input"
        style={{ resize: "vertical", fontSize: 13, fontFamily: "inherit", marginBottom: theme.space[5] }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space[3] }}>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={isAlreadyInvestigating}>
          Escalate
        </Button>
      </div>
    </Modal>
  );
}
