import { useState } from "react";
import { theme } from "../../styles/theme";
import { OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import { externalApiUrl } from "../../utils/api";
import { downloadWindowsAgent, downloadWindowsInstaller } from "../../utils/agentDownload";

function formatExpiryBadge(expiresAt) {
  if (!expiresAt) return "Expires in 24h";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `Expires in ${hours}h`;
  return `Expires in ${Math.max(1, Math.floor(ms / 60_000))}m`;
}

const codeCellStyle = {
  fontFamily: theme.font.mono,
  fontSize: 14,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const cmdBoxStyle = {
  background: theme.color.background,
  border: `1px solid ${theme.color.border}`,
  borderRadius: theme.radius.sm,
  padding: theme.space[4],
  fontFamily: theme.font.mono,
  fontSize: 14,
  color: theme.color.text,
  overflowX: "auto",
  whiteSpace: "nowrap",
};

// The "Enrollment credentials" card: Server URL / Agent ID / Key (reveal +
// copy) plus platform-specific install instructions. Shared by the
// just-generated flow (AgentEnrollmentPanel) and Settings -> Sources' agent
// list, which renders this for any still-pending, unexpired agent using
// Agent.enrollment_key — the backend keeps that decryptable for the same
// 24h window, so closing the "deploy an agent" panel no longer strands you
// without a way to see the credentials again.
// `embedded` drops the card's own border/background for use inside a
// container that already provides one (the Settings agent row), avoiding a
// double-boxed look.
export default function AgentCredentialsCard({ agent, enrollmentKey, platform, embedded = false }) {
  const [revealKey, setRevealKey] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  // A real absolute URL, not the SPA's own relative "/api" baseURL -- the
  // standalone agent process has no page to resolve a relative path against
  // (confirmed this session: copy-pasting the raw relative baseURL here
  // produced a Server URL the agent couldn't connect with at all).
  const serverUrl = externalApiUrl();
  const installCmd = `python tp_agent.py --url ${serverUrl} --id ${agent.id} --key ${enrollmentKey}`;

  async function handleDownloadWindowsAgent() {
    setDownloading(true);
    setError("");
    try {
      await downloadWindowsAgent({ id: agent.id, key: enrollmentKey });
    } catch {
      setError("Could not download the agent. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      style={
        embedded
          ? {}
          : {
              background: theme.color.surface,
              border: `1px solid ${theme.color.border}`,
              borderRadius: theme.radius.md,
              padding: theme.space[6],
            }
      }
    >
      <ErrorBanner>{error}</ErrorBanner>

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
          {formatExpiryBadge(agent.enrollment_expires_at)}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px minmax(0, 1fr) auto",
          gap: theme.space[4],
          alignItems: "center",
          marginBottom: theme.space[4],
        }}
      >
        <span style={{ fontSize: 14, color: theme.color.textMuted }}>Server URL</span>
        <code style={codeCellStyle}>{serverUrl}</code>
        <OutlineButton
          type="button"
          style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
          onClick={() => navigator.clipboard?.writeText(serverUrl)}
        >
          Copy
        </OutlineButton>

        <span style={{ fontSize: 14, color: theme.color.textMuted }}>Agent ID</span>
        <code style={codeCellStyle}>{agent.id}</code>
        <OutlineButton
          type="button"
          style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
          onClick={() => navigator.clipboard?.writeText(agent.id)}
        >
          Copy
        </OutlineButton>

        <span style={{ fontSize: 14, color: theme.color.textMuted }}>Enrollment key</span>
        <code style={codeCellStyle}>{revealKey ? enrollmentKey : "•".repeat(20)}</code>
        <OutlineButton
          type="button"
          style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
          onClick={() => setRevealKey((v) => !v)}
        >
          {revealKey ? "Hide" : "Reveal"}
        </OutlineButton>
      </div>

      {platform === "windows" ? (
        <>
          <PrimaryButton
            type="button"
            style={{ width: "auto", marginBottom: theme.space[3] }}
            onClick={downloadWindowsInstaller}
          >
            Download agent installer for Windows
          </PrimaryButton>
          <div style={{ fontSize: 13, color: theme.color.textFaint, marginBottom: theme.space[3] }}>
            Runs a normal Windows installer — license terms, install location, Start Menu shortcut, and a proper
            uninstaller under Settings → Apps. After installing, open the app and paste in the Server URL, Agent ID, and
            Enrollment key above.
          </div>
          <details>
            <summary style={{ cursor: "pointer", fontSize: 13, color: theme.color.textMuted }}>
              Advanced: portable .exe or run manually via Python
            </summary>
            <div style={{ marginTop: theme.space[3] }}>
              <OutlineButton
                type="button"
                style={{ width: "auto", marginBottom: theme.space[3] }}
                disabled={downloading}
                onClick={handleDownloadWindowsAgent}
              >
                {downloading ? "Preparing download…" : "Download pre-configured .exe (no installer)"}
              </OutlineButton>
              <div style={{ fontSize: 13, color: theme.color.textFaint, marginBottom: theme.space[3] }}>
                Downloads <code>truepositive-agent.exe</code> directly, already configured for this agent — nothing to
                paste, but no Start Menu entry or uninstaller either.
              </div>
              <div style={cmdBoxStyle}>$ {installCmd}</div>
            </div>
          </details>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: theme.color.textFaint, marginBottom: theme.space[3] }}>
            A packaged installer for {platform} is a future release — run this manually for now:
          </div>
          <div style={cmdBoxStyle}>$ {installCmd}</div>
        </>
      )}
    </div>
  );
}
