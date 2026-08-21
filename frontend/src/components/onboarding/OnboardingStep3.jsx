import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { theme } from "../../styles/theme";
import { Field, Select, TextInput, OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import { createSource } from "../../api/sources";
import LocalSourcePicker from "../settings/LocalSourcePicker";

export default function OnboardingStep3({ onBack, agentId, platform = "windows" }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("local");
  const [remote, setRemote] = useState({
    protocol: "ssh",
    host: "",
    port: "22",
    username: "",
    authMethod: "ssh_key",
    credential: "",
  });
  const [localSources, setLocalSources] = useState([]);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  const modeHint =
    mode === "local"
      ? "Collects from this host directly. No credentials needed."
      : "Connects to a remote host over the network using the credentials below.";

  async function startCollection() {
    setError("");
    setStarting(true);
    try {
      if (mode === "local") {
        for (const s of localSources) {
          await createSource({ name: s.name, type: "local", agent_id: agentId || null, path: s.path, tags: [] });
        }
      } else {
        await createSource({
          name: `${remote.host} (${remote.protocol})`,
          type: "remote",
          protocol: remote.protocol,
          host: remote.host,
          port: Number(remote.port) || 22,
          username: remote.username,
          credential_type: remote.authMethod,
          credential: remote.credential,
          tags: [],
        });
      }
      navigate("/app");
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        Array.isArray(detail)
          ? detail.map((d) => d.msg).join(" ")
          : detail || "Could not save your sources. Try again.",
      );
      setStarting(false);
    }
  }

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
        STEP 3 OF 3
      </div>
      <h1 style={{ fontSize: 34, margin: `${theme.space[3]}px 0` }}>Choose what to collect</h1>
      <p style={{ fontSize: 16, color: theme.color.textMuted, marginBottom: theme.space[7], maxWidth: 640 }}>
        Start narrow. Every source you enable adds noise as well as coverage — you can add more once your rules are
        tuned.
      </p>

      <ErrorBanner>{error}</ErrorBanner>

      <div style={{ display: "flex", gap: theme.space[3], marginBottom: theme.space[2] }}>
        {["local", "remote"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              flex: 1,
              padding: "13px 20px",
              borderRadius: 999,
              border: `1px solid ${mode === m ? theme.color.accent : theme.color.border}`,
              background: mode === m ? "rgba(8, 144, 177, 0.1)" : "transparent",
              color: theme.color.text,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {m === "local" ? "Local — this host" : "Remote — over network"}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: theme.color.textFaint, marginBottom: theme.space[6] }}>{modeHint}</div>

      {mode === "remote" && (
        <div
          style={{
            background: theme.color.surface,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.md,
            padding: theme.space[5],
            marginBottom: theme.space[5],
          }}
        >
          <div className="tp-grid-2">
            <Field label="Protocol">
              <Select value={remote.protocol} onChange={(e) => setRemote({ ...remote, protocol: e.target.value })}>
                <option value="ssh">SSH</option>
                <option value="winrm" disabled>
                  WinRM — coming soon
                </option>
                <option value="syslog" disabled>
                  Syslog (UDP/TCP) — coming soon
                </option>
              </Select>
            </Field>
            <Field label="Host">
              <TextInput
                value={remote.host}
                onChange={(e) => setRemote({ ...remote, host: e.target.value })}
                placeholder="10.0.4.22"
              />
            </Field>
            <Field label="Port">
              <TextInput
                value={remote.port}
                onChange={(e) => setRemote({ ...remote, port: e.target.value })}
                placeholder="22"
              />
            </Field>
            <Field label="Username">
              <TextInput
                value={remote.username}
                onChange={(e) => setRemote({ ...remote, username: e.target.value })}
                placeholder="svc_truepositive"
              />
            </Field>
            <Field label="Authentication">
              <Select value={remote.authMethod} onChange={(e) => setRemote({ ...remote, authMethod: e.target.value })}>
                <option value="ssh_key">SSH private key</option>
                <option value="password">Password</option>
                <option value="kerberos" disabled>
                  Kerberos — coming soon
                </option>
              </Select>
            </Field>
            <Field label="Credential">
              <TextInput
                type="password"
                value={remote.credential}
                onChange={(e) => setRemote({ ...remote, credential: e.target.value })}
                placeholder="id_ed25519"
              />
            </Field>
          </div>
          <div style={{ fontSize: 13, color: theme.color.textFaint, marginTop: theme.space[4] }}>
            Credentials are encrypted at rest and never leave your workspace. Connection testing arrives with the real
            collector in a later sprint.
          </div>
        </div>
      )}

      {mode === "local" && (
        <div
          style={{
            background: theme.color.surface,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.md,
            padding: theme.space[5],
            marginBottom: theme.space[5],
          }}
        >
          <LocalSourcePicker key={platform} platform={platform} onChange={setLocalSources} />
        </div>
      )}

      <div className="tp-grid-3" style={{ marginBottom: theme.space[2] }}>
        <Field label="Poll interval">
          <Select disabled value="Real-time (tail)" onChange={() => {}}>
            <option>Real-time (tail)</option>
          </Select>
        </Field>
        <Field label="Batch size">
          <Select disabled value="1,000 events" onChange={() => {}}>
            <option>1,000 events</option>
          </Select>
        </Field>
        <Field label="Retention">
          <Select disabled value="30 days hot" onChange={() => {}}>
            <option>30 days hot</option>
          </Select>
        </Field>
      </div>
      <div style={{ fontSize: 13, color: theme.color.textFaint, marginBottom: theme.space[6] }}>
        Collector tuning (poll interval, batch size, retention) arrives with real log ingestion in a later sprint.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <OutlineButton type="button" style={{ width: "auto" }} onClick={onBack}>
          Back
        </OutlineButton>
        <div style={{ display: "flex", alignItems: "center", gap: theme.space[4] }}>
          <PrimaryButton
            type="button"
            style={{ width: "auto" }}
            disabled={starting || (mode === "local" ? localSources.length === 0 : !remote.host || !remote.credential)}
            onClick={startCollection}
          >
            {starting ? "Starting…" : "Start collection"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
