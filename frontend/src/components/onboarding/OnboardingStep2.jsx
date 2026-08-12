import { theme } from "../../styles/theme";
import { OutlineButton, PrimaryButton } from "../auth/fields";
import AgentEnrollmentPanel from "../agents/AgentEnrollmentPanel";

export default function OnboardingStep2({ onBack, onNext, onAgentCreated }) {
  return (
    <div>
      <div
        style={{
          fontFamily: theme.font.mono,
          fontSize: 13,
          fontWeight: 600,
          color: theme.color.accent,
          letterSpacing: 1,
        }}
      >
        STEP 2 OF 3
      </div>
      <h1 style={{ fontSize: 34, margin: `${theme.space[3]}px 0` }}>Deploy your first agent</h1>
      <p style={{ fontSize: 16, color: theme.color.textMuted, marginBottom: theme.space[7], maxWidth: 640 }}>
        The agent reads logs locally and ships them over TLS. Install it on the host you want to monitor first — usually
        a domain controller or jump box.
      </p>

      <div style={{ marginBottom: theme.space[6] }}>
        <AgentEnrollmentPanel onAgentCreated={onAgentCreated} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <OutlineButton type="button" style={{ width: "auto" }} onClick={onBack}>
          Back
        </OutlineButton>
        <div style={{ display: "flex", alignItems: "center", gap: theme.space[4] }}>
          <button
            type="button"
            onClick={onNext}
            style={{
              background: "none",
              border: "none",
              color: theme.color.textMuted,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Skip — I&rsquo;ll deploy later
          </button>
          <PrimaryButton type="button" style={{ width: "auto" }} onClick={onNext}>
            Continue
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
