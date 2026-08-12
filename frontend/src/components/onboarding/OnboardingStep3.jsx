import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { theme } from "../../styles/theme";
import { Field, Select, TextInput, OutlineButton, PrimaryButton } from "../auth/fields";

// Sprint 2 scope: source selection is UI-only, matching the mockup's structure.
// Real log_source persistence + remote protocol handling is Sprint 3 (see docs/SPRINT_PLAN.md).
const SOURCES = [
  {
    id: "security",
    name: "Windows Security Event Log",
    path: "Security.evtx",
    vol: "12k/day",
    tag: "High Volume",
    tagColor: "high",
  },
  {
    id: "sysmon",
    name: "Sysmon",
    path: "Microsoft-Windows-Sysmon/Operational",
    vol: "4.2k/day",
    tag: "Recommended",
    tagColor: "ok",
  },
  {
    id: "powershell",
    name: "PowerShell Operational",
    path: "Microsoft-Windows-PowerShell/Operational",
    vol: "800/day",
    tag: "Recommended",
    tagColor: "ok",
  },
  { id: "system", name: "System Event Log", path: "System.evtx", vol: "3k/day", tag: "Low Volume", tagColor: "medium" },
];

export default function OnboardingStep3({ onBack }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("local");
  const [remote, setRemote] = useState({
    protocol: "ssh",
    host: "",
    port: "22",
    username: "",
    authMethod: "key",
    credential: "",
  });
  const [testResult, setTestResult] = useState("");
  const [selected, setSelected] = useState({ security: true, sysmon: true, powershell: false, system: false });
  const [pollInterval, setPollInterval] = useState("Real-time (tail)");
  const [batchSize, setBatchSize] = useState("1,000 events");
  const [retention, setRetention] = useState("30 days hot");
  const [starting, setStarting] = useState(false);

  const selectedSources = SOURCES.filter((s) => selected[s.id]);

  const modeHint =
    mode === "local"
      ? "Collects from this host directly. No credentials needed."
      : "Connects to a remote host over the network using the credentials below.";

  function toggleSource(id) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function testConnection() {
    setTestResult("Connected — reachable and credentials accepted.");
  }

  function startCollection() {
    setStarting(true);
    navigate("/app");
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
              background: mode === m ? "rgba(8, 145, 178, 0.1)" : "transparent",
              color: theme.color.text,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 500,
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
                <option value="winrm">WinRM</option>
                <option value="syslog">Syslog (UDP/TCP)</option>
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
                <option value="key">SSH private key</option>
                <option value="password">Password</option>
                <option value="kerberos">Kerberos</option>
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: theme.space[4],
            }}
          >
            <span style={{ fontSize: 13, color: theme.color.textFaint }}>
              Credentials are encrypted at rest and never leave your workspace.
            </span>
            <OutlineButton type="button" style={{ width: "auto" }} onClick={testConnection}>
              Test connection
            </OutlineButton>
          </div>
          {testResult && (
            <div style={{ marginTop: theme.space[3], fontSize: 13, color: theme.color.severity.ok }}>{testResult}</div>
          )}
        </div>
      )}

      <div
        style={{
          background: theme.color.surface,
          border: `1px solid ${theme.color.border}`,
          borderRadius: theme.radius.md,
          padding: theme.space[5],
          marginBottom: theme.space[5],
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: theme.space[4] }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Available log sources</h3>
          <span style={{ fontSize: 13, color: theme.color.textMuted }}>
            {selectedSources.length} of {SOURCES.length} selected
          </span>
        </div>
        {SOURCES.map((s) => (
          <label
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: theme.space[3],
              padding: `${theme.space[3]}px 0`,
              borderBottom: `1px solid ${theme.color.border}`,
              cursor: "pointer",
            }}
          >
            <input type="checkbox" checked={!!selected[s.id]} onChange={() => toggleSource(s.id)} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15 }}>{s.name}</div>
              <div style={{ fontSize: 13, color: theme.color.textFaint, fontFamily: theme.font.mono }}>{s.path}</div>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                padding: "3px 10px",
                borderRadius: 999,
                border: `1px solid ${theme.color.severity[s.tagColor]}`,
                color: theme.color.severity[s.tagColor],
              }}
            >
              {s.tag}
            </span>
            <span style={{ fontSize: 13, color: theme.color.textMuted, width: 70, textAlign: "right" }}>{s.vol}</span>
          </label>
        ))}
      </div>

      <div className="tp-grid-3" style={{ marginBottom: theme.space[6] }}>
        <Field label="Poll interval">
          <Select value={pollInterval} onChange={(e) => setPollInterval(e.target.value)}>
            <option>Real-time (tail)</option>
            <option>Every 30 seconds</option>
            <option>Every 5 minutes</option>
          </Select>
        </Field>
        <Field label="Batch size">
          <Select value={batchSize} onChange={(e) => setBatchSize(e.target.value)}>
            <option>500 events</option>
            <option>1,000 events</option>
            <option>5,000 events</option>
          </Select>
        </Field>
        <Field label="Retention">
          <Select value={retention} onChange={(e) => setRetention(e.target.value)}>
            <option>30 days hot</option>
            <option>90 days hot</option>
            <option>1 year hot</option>
          </Select>
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <OutlineButton type="button" style={{ width: "auto" }} onClick={onBack}>
          Back
        </OutlineButton>
        <div style={{ display: "flex", alignItems: "center", gap: theme.space[4] }}>
          <span style={{ fontSize: 13, color: theme.color.textFaint }}>
            {selectedSources.length} source{selectedSources.length === 1 ? "" : "s"} selected
          </span>
          <PrimaryButton type="button" style={{ width: "auto" }} disabled={starting} onClick={startCollection}>
            {starting ? "Starting…" : "Start collection"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
