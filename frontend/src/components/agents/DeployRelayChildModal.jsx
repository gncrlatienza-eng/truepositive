import { useState } from "react";
import { theme } from "../../styles/theme";
import { OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import { createRelayChild } from "../../api/agents";
import { downloadWindowsInstaller } from "../../utils/agentDownload";
import Modal from "../common/Modal";

const PLATFORMS = [
  { id: "windows", label: "Windows" },
  { id: "linux", label: "Linux" },
];

const codeCellStyle = {
  fontFamily: theme.font.mono,
  fontSize: 14,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const fieldRowStyle = {
  display: "grid",
  gridTemplateColumns: "120px minmax(0, 1fr) auto",
  gap: theme.space[4],
  alignItems: "center",
};

// Phase 1 manual pairing: generates a relay child's credentials directly
// from the dashboard — creating them here *is* the authorization, same
// trust model as the normal "Deploy an agent" flow (see
// relay_service.create_relay_child's own docstring for why). What's
// different from a normal agent: this device connects to the *hub's* local
// network address, not the public Server URL, so the installer's connect
// screen needs "Connect through a hub on this network" picked explicitly.
export default function DeployRelayChildModal({ open, onClose, hub, onChildCreated }) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("windows");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { agent, enrollment_key, hub_relay_addr }
  const [revealKey, setRevealKey] = useState(false);

  function handleClose() {
    setName("");
    setPlatform("windows");
    setError("");
    setResult(null);
    setRevealKey(false);
    onClose();
  }

  async function handleGenerate() {
    setError("");
    setCreating(true);
    try {
      const created = await createRelayChild({
        hub_agent_id: hub.id,
        name: name.trim() || `${platform}-device`,
        platform,
      });
      setResult(created);
      onChildCreated?.(created.agent);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not generate credentials. Try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Deploy a device under ${hub?.name || "the hub"}`} width={640}>
      <p style={{ fontSize: 14, color: theme.color.textMuted, marginBottom: theme.space[5] }}>
        This device&apos;s logs will route through <strong>{hub?.name}</strong> instead of connecting to the server
        directly — {hub?.name} needs to stay running and connected for this device&apos;s data to reach the dashboard.
      </p>

      <ErrorBanner>{error}</ErrorBanner>

      {!result ? (
        <>
          <div style={{ marginBottom: theme.space[4] }}>
            <label style={{ fontSize: 13, color: theme.color.textMuted, display: "block", marginBottom: 6 }}>
              Device name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kid's laptop"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: theme.radius.sm,
                border: `1px solid ${theme.color.border}`,
                background: theme.color.background,
                color: theme.color.text,
                fontSize: 14,
              }}
            />
          </div>
          <div style={{ display: "flex", gap: theme.space[3], marginBottom: theme.space[5] }}>
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                style={{
                  flex: 1,
                  padding: theme.space[3],
                  borderRadius: theme.radius.md,
                  border: `1px solid ${platform === p.id ? theme.color.accent : theme.color.border}`,
                  background: platform === p.id ? "rgba(8, 144, 177, 0.1)" : theme.color.surface,
                  color: theme.color.text,
                  cursor: "pointer",
                  textAlign: "center",
                  fontSize: 14,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <PrimaryButton type="button" style={{ width: "auto" }} disabled={creating} onClick={handleGenerate}>
            {creating ? "Generating…" : "Generate credentials"}
          </PrimaryButton>
        </>
      ) : (
        <div>
          <div style={{ ...fieldRowStyle, marginBottom: theme.space[4] }}>
            <span style={{ fontSize: 14, color: theme.color.textMuted }}>Hub address</span>
            {result.hub_relay_addr ? (
              <>
                <code style={codeCellStyle}>{result.hub_relay_addr}</code>
                <OutlineButton
                  type="button"
                  style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
                  onClick={() => navigator.clipboard?.writeText(result.hub_relay_addr)}
                >
                  Copy
                </OutlineButton>
              </>
            ) : (
              <span style={{ fontSize: 13, color: theme.color.severity.medium, gridColumn: "2 / span 2" }}>
                Not known yet — make sure {hub?.name}&apos;s agent is running and connected, then close and reopen this
                dialog.
              </span>
            )}

            <span style={{ fontSize: 14, color: theme.color.textMuted }}>Agent ID</span>
            <code style={codeCellStyle}>{result.agent.id}</code>
            <OutlineButton
              type="button"
              style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
              onClick={() => navigator.clipboard?.writeText(result.agent.id)}
            >
              Copy
            </OutlineButton>

            <span style={{ fontSize: 14, color: theme.color.textMuted }}>Enrollment key</span>
            <code style={codeCellStyle}>{revealKey ? result.enrollment_key : "•".repeat(20)}</code>
            <OutlineButton
              type="button"
              style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
              onClick={() => setRevealKey((v) => !v)}
            >
              {revealKey ? "Hide" : "Reveal"}
            </OutlineButton>
          </div>

          {platform === "windows" && (
            <PrimaryButton
              type="button"
              style={{ width: "auto", marginBottom: theme.space[3] }}
              onClick={downloadWindowsInstaller}
            >
              Download agent installer for Windows
            </PrimaryButton>
          )}
          <div style={{ fontSize: 13, color: theme.color.textFaint, marginBottom: theme.space[4] }}>
            Install this on the other device the normal way. When it asks how to connect, choose{" "}
            <strong>&quot;Connect through a hub on this network&quot;</strong> (not the default &quot;Connect directly
            to server&quot;) and paste in the three values above instead of a Server URL.
          </div>

          <OutlineButton type="button" style={{ width: "auto" }} onClick={handleClose}>
            Done
          </OutlineButton>
        </div>
      )}
    </Modal>
  );
}
