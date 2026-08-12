import { theme } from "../../styles/theme";
import AgentEnrollmentPanel from "../agents/AgentEnrollmentPanel";
import Modal from "../common/Modal";

// Lets people who clicked "Skip" during onboarding step 2 (or who just want
// a second agent) enroll one from Settings instead of being stuck without a
// way back in.
export default function DeployAgentModal({ open, onClose, onAgentCreated }) {
  return (
    <Modal open={open} onClose={onClose} title="Deploy agent" width={640}>
      <p style={{ fontSize: 14, color: theme.color.textMuted, marginBottom: theme.space[5] }}>
        The agent reads logs locally and ships them over TLS. Install it on the host you want to monitor.
      </p>
      <AgentEnrollmentPanel onAgentCreated={onAgentCreated} />
    </Modal>
  );
}
