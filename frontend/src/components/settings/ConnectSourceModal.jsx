import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { Field, Select, TextInput, OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import Modal from "../common/Modal";
import { createSource, updateSource } from "../../api/sources";

const EMPTY = {
  name: "",
  mode: "local",
  agentId: "",
  path: "",
  protocol: "ssh",
  host: "",
  port: "22",
  username: "",
  credentialType: "ssh_key",
  credential: "",
};

export default function ConnectSourceModal({ open, onClose, onSaved, agents, source }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!source;

  useEffect(() => {
    if (!open) return;
    setError("");
    if (source) {
      setForm({
        name: source.name,
        mode: source.type,
        agentId: source.agent_id || "",
        path: source.path || "",
        protocol: source.protocol || "ssh",
        host: source.host || "",
        port: source.port ? String(source.port) : "22",
        username: source.username || "",
        credentialType: source.credential_type || "ssh_key",
        credential: "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, source]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const base = { name: form.name, tags: [] };
      const payload =
        form.mode === "local"
          ? { ...base, type: "local", agent_id: form.agentId || null, path: form.path || null }
          : {
              ...base,
              type: "remote",
              protocol: form.protocol,
              host: form.host,
              port: Number(form.port) || 22,
              username: form.username,
              ...(form.credential ? { credential_type: form.credentialType, credential: form.credential } : {}),
            };

      const saved = isEdit ? await updateSource(source.id, payload) : await createSource(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map((d) => d.msg).join(" ") : detail || "Check the form and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit data source" : "Connect data source"}>
      <form onSubmit={handleSubmit}>
        <ErrorBanner>{error}</ErrorBanner>

        <Field label="Name">
          <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Sysmon" required />
        </Field>

        <div style={{ display: "flex", gap: theme.space[3], marginBottom: theme.space[4] }}>
          {["local", "remote"].map((m) => (
            <button
              key={m}
              type="button"
              disabled={isEdit}
              onClick={() => set("mode", m)}
              style={{
                flex: 1,
                padding: "10px 16px",
                borderRadius: 999,
                border: `1px solid ${form.mode === m ? theme.color.accent : theme.color.border}`,
                background: form.mode === m ? "rgba(8, 145, 178, 0.1)" : "transparent",
                color: theme.color.text,
                cursor: isEdit ? "default" : "pointer",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {m === "local" ? "Local" : "Remote"}
            </button>
          ))}
        </div>

        {form.mode === "local" ? (
          <>
            <Field label="Agent" hint="Optional — the host this source is collected from">
              <Select value={form.agentId} onChange={(e) => set("agentId", e.target.value)}>
                <option value="">No agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.status})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Path">
              <TextInput
                value={form.path}
                onChange={(e) => set("path", e.target.value)}
                placeholder="Microsoft-Windows-Sysmon/Operational"
              />
            </Field>
          </>
        ) : (
          <>
            <div className="tp-grid-2">
              <Field label="Protocol">
                <Select value={form.protocol} onChange={(e) => set("protocol", e.target.value)}>
                  <option value="ssh">SSH</option>
                  <option value="winrm" disabled>
                    WinRM — coming soon
                  </option>
                  <option value="syslog" disabled>
                    Syslog — coming soon
                  </option>
                </Select>
              </Field>
              <Field label="Host">
                <TextInput
                  value={form.host}
                  onChange={(e) => set("host", e.target.value)}
                  placeholder="10.0.4.22"
                  required
                />
              </Field>
              <Field label="Port">
                <TextInput value={form.port} onChange={(e) => set("port", e.target.value)} placeholder="22" />
              </Field>
              <Field label="Username">
                <TextInput
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  placeholder="svc_truepositive"
                  required
                />
              </Field>
              <Field label="Authentication">
                <Select value={form.credentialType} onChange={(e) => set("credentialType", e.target.value)}>
                  <option value="ssh_key">SSH private key</option>
                  <option value="password">Password</option>
                  <option value="kerberos" disabled>
                    Kerberos — coming soon
                  </option>
                </Select>
              </Field>
              <Field label="Credential" hint={isEdit ? "Leave blank to keep the current credential" : undefined}>
                <TextInput
                  type="password"
                  value={form.credential}
                  onChange={(e) => set("credential", e.target.value)}
                  placeholder={isEdit ? "Replace credential" : "id_ed25519"}
                  required={!isEdit}
                />
              </Field>
            </div>
            <div style={{ fontSize: 13, color: theme.color.textFaint, margin: `${theme.space[3]}px 0` }}>
              Credentials are encrypted at rest. Connection testing arrives with the real collector in a later sprint.
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space[3], marginTop: theme.space[5] }}>
          <OutlineButton type="button" style={{ width: "auto" }} onClick={onClose}>
            Cancel
          </OutlineButton>
          <PrimaryButton type="submit" style={{ width: "auto" }} disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Connect source"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
