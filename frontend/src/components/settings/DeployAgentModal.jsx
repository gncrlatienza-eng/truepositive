import { theme } from "../../styles/theme";
import AgentEnrollmentPanel from "../agents/AgentEnrollmentPanel";
import Modal from "../common/Modal";

// The actual credential-generation workflow (platform picker, generate,
// credentials display, download) — deliberately in a modal, not inline in
// Sources' narrow sidebar: that content is tall/multi-step enough that
// squeezing it into a ~320px column looked stretched and cramped. width=640
// matches the other "richer content" modals in this app (AlertDetailModal).
export default function DeployAgentModal({ open, onClose, onAgentCreated }) {
  return (
    <Modal open={open} onClose={onClose} title="Install an agent" width={720}>
      <p style={{ fontSize: 14, color: theme.color.textMuted, marginBottom: theme.space[5] }}>
        Generate credentials and install the agent on the host you want to monitor. If a previous agent went offline for
        good (uninstalled, decommissioned), just deploy a new one here rather than reviving the old one — delete the
        stale row once its replacement is connected.
      </p>
      <AgentEnrollmentPanel allowReset onAgentCreated={onAgentCreated} />
    </Modal>
  );
}
