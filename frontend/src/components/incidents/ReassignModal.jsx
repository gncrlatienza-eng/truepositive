import { theme } from "../../styles/theme";
import { Button } from "../common/Button";
import Modal from "../common/Modal";
import { useAuth } from "../../context/AuthContext";

// Sprint 6: no GET /users endpoint exists yet — this modal is scoped to
// "Assign to me" and "Unassign" only, matching the plan's explicit scope boundary.
// Sprint 7+ can expand this to a full user-list picker once the endpoint lands.
export default function ReassignModal({ open, onClose, onConfirm }) {
  const { user } = useAuth();

  return (
    <Modal open={open} onClose={onClose} title="Reassign incident" width={420}>
      <p style={{ fontSize: 13, color: theme.color.textMuted, marginBottom: theme.space[5] }}>
        Reassignment options. A full user picker will be available in a future sprint.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: theme.space[3], marginBottom: theme.space[5] }}>
        <Button onClick={() => onConfirm(user?.id)} style={{ width: "100%", justifyContent: "center" }}>
          Assign to me
        </Button>
        <Button variant="secondary" onClick={() => onConfirm(null)} style={{ width: "100%", justifyContent: "center" }}>
          Unassign
        </Button>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
