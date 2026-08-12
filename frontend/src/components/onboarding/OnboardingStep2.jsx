import { useMemo, useState } from "react";
import { theme } from "../../styles/theme";
import { OutlineButton, PrimaryButton } from "../auth/fields";

const PLATFORMS = [
  { id: "windows", label: "Windows", detail: "MSI · 2016+" },
  { id: "linux", label: "Linux", detail: "deb · rpm" },
  { id: "docker", label: "Docker", detail: "compose" },
  { id: "kubernetes", label: "Kubernetes", detail: "DaemonSet" },
];

// Sprint 2 scope: agent enrollment/heartbeat is simulated client-side per
// docs/SPRINT_PLAN.md — real issuance + heartbeat tracking lands in Sprint 3.
function randomToken(len) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const INSTALL_COMMANDS = {
  windows: (id, key) => `iwr https://get.truepositive.io/agent.ps1 | iex; tp-agent enroll --id ${id} --key ${key}`,
  linux: (id, key) => `curl -sL https://get.truepositive.io/agent.sh | sh -s -- --id ${id} --key ${key}`,
  docker: (id, key) => `docker run -d --name tp-agent -e AGENT_ID=${id} -e AGENT_KEY=${key} truepositive/agent`,
  kubernetes: (id, key) => `helm install tp-agent truepositive/agent --set agentId=${id},agentKey=${key}`,
};

export default function OnboardingStep2({ onBack, onNext }) {
  const [platform, setPlatform] = useState("windows");
  const [revealKey, setRevealKey] = useState(false);
  const [connected, setConnected] = useState(false);

  const agentId = useMemo(() => `ag_${randomToken(12)}`, []);
  const enrollmentKey = useMemo(() => randomToken(32), []);
  const installCmd = INSTALL_COMMANDS[platform](agentId, enrollmentKey);

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

      <div className="tp-grid-4" style={{ marginBottom: theme.space[6] }}>
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPlatform(p.id);
              setConnected(false);
            }}
            style={{
              padding: theme.space[4],
              borderRadius: theme.radius.md,
              border: `1px solid ${platform === p.id ? theme.color.accent : theme.color.border}`,
              background: platform === p.id ? "rgba(8, 145, 178, 0.1)" : theme.color.surface,
              color: theme.color.text,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 16 }}>{p.label}</div>
            <div style={{ fontSize: 13, color: theme.color.textMuted, marginTop: 4 }}>{p.detail}</div>
          </button>
        ))}
      </div>

      <div
        style={{
          background: theme.color.surface,
          border: `1px solid ${theme.color.border}`,
          borderRadius: theme.radius.md,
          padding: theme.space[5],
          marginBottom: theme.space[5],
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: theme.space[4],
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18 }}>Enrollment credentials</h3>
          <span
            style={{
              fontSize: 11,
              color: theme.color.severity.high,
              border: `1px solid ${theme.color.severity.high}`,
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            Expires in 24h
          </span>
        </div>

        <div style={{ display: "flex", gap: theme.space[3], marginBottom: theme.space[3], alignItems: "center" }}>
          <span style={{ fontSize: 14, color: theme.color.textMuted, width: 140 }}>Agent ID</span>
          <code style={{ fontFamily: theme.font.mono, fontSize: 14 }}>{agentId}</code>
          <OutlineButton
            type="button"
            style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
            onClick={() => navigator.clipboard?.writeText(agentId)}
          >
            Copy
          </OutlineButton>
        </div>

        <div style={{ display: "flex", gap: theme.space[3], marginBottom: theme.space[4], alignItems: "center" }}>
          <span style={{ fontSize: 14, color: theme.color.textMuted, width: 140 }}>Enrollment key</span>
          <code style={{ fontFamily: theme.font.mono, fontSize: 14 }}>
            {revealKey ? enrollmentKey : "•".repeat(20)}
          </code>
          <OutlineButton
            type="button"
            style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
            onClick={() => setRevealKey((v) => !v)}
          >
            {revealKey ? "Hide" : "Reveal"}
          </OutlineButton>
        </div>

        <div
          style={{
            background: theme.color.background,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.sm,
            padding: theme.space[4],
            fontFamily: theme.font.mono,
            fontSize: 14,
            color: theme.color.text,
            marginBottom: theme.space[2],
            overflowX: "auto",
          }}
        >
          $ {installCmd}
        </div>
        <div style={{ fontSize: 13, color: theme.color.textFaint }}>
          Runs the agent as a background service and enrolls it with the credentials above.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: theme.space[3],
          padding: theme.space[4],
          borderRadius: theme.radius.md,
          border: `1px solid ${connected ? theme.color.severity.ok : theme.color.severity.high}`,
          marginBottom: theme.space[6],
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: connected ? theme.color.severity.ok : theme.color.severity.high,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {connected ? "Agent connected" : "Waiting for first heartbeat"}
          </div>
          <div
            style={{
              fontSize: 13,
              color: theme.color.textMuted,
              fontFamily: connected ? theme.font.mono : theme.font.body,
            }}
          >
            {connected
              ? `${platform.toUpperCase()}-HOST-01 · 192.168.1.5 · last heartbeat 2s ago`
              : "Run the command above. The agent checks in within about 30 seconds."}
          </div>
        </div>
        {!connected && (
          <OutlineButton type="button" style={{ width: "auto" }} onClick={() => setConnected(true)}>
            Verify connection
          </OutlineButton>
        )}
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
