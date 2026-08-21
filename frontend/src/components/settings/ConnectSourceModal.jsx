import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { Field, Select, TextInput, OutlineButton, PrimaryButton, ErrorBanner } from "../auth/fields";
import Modal from "../common/Modal";
import { createSource, updateSource } from "../../api/sources";
import LocalSourcePicker from "./LocalSourcePicker";

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

export default function ConnectSourceModal({ open, onClose, onSaved, agents, sources = [], source }) {
  const [form, setForm] = useState(EMPTY);
  const [localSources, setLocalSources] = useState([]);
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
      setLocalSources([]);
    }
  }, [open, source]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const selectedAgent = agents.find((a) => a.id === form.agentId);
  const selectedPlatform = selectedAgent?.platform || "windows";
  // What's already configured for this agent, so the picker doesn't offer a
  // duplicate of something already connected.
  const existingPaths = sources
    .filter((s) => s.type === "local" && (s.agent_id || "") === (form.agentId || ""))
    .map((s) => s.path)
    .filter(Boolean);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (isEdit) {
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
        const saved = await updateSource(source.id, payload);
        onSaved(saved);
      } else if (form.mode === "local") {
        // Each source is its own request — if one fails partway through,
        // the ones already created stay live (onSaved already merged them
        // into the parent's list) but must come out of `localSources`, or a
        // retry would resubmit and duplicate them.
        const remaining = [...localSources];
        let createdCount = 0;
        try {
          while (remaining.length > 0) {
            const s = remaining[0];
            const saved = await createSource({
              name: s.name,
              type: "local",
              agent_id: form.agentId || null,
              path: s.path,
              tags: [],
            });
            onSaved(saved);
            createdCount += 1;
            remaining.shift();
          }
        } catch (err) {
          setLocalSources(remaining);
          const detail = err.response?.data?.detail;
          const detailText = Array.isArray(detail)
            ? detail.map((d) => d.msg).join(" ")
            : detail || "Check the form and try again.";
          setError(
            createdCount > 0
              ? `Connected ${createdCount} of ${createdCount + remaining.length} source(s) so far. ${detailText}`
              : detailText,
          );
          return;
        }
      } else {
        const saved = await createSource({
          name: form.name,
          type: "remote",
          protocol: form.protocol,
          host: form.host,
          port: Number(form.port) || 22,
          username: form.username,
          credential_type: form.credentialType,
          credential: form.credential,
          tags: [],
        });
        onSaved(saved);
      }
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

        {(isEdit || form.mode === "remote") && (
          <Field label="Name">
            <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Sysmon" required />
          </Field>
        )}

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
                background: form.mode === m ? "rgba(8, 144, 177, 0.1)" : "transparent",
                color: theme.color.text,
                cursor: isEdit ? "default" : "pointer",
                fontSize: 14,
                fontWeight: 600,
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
            {isEdit ? (
              <Field label="Path">
                <TextInput
                  value={form.path}
                  onChange={(e) => set("path", e.target.value)}
                  placeholder="Microsoft-Windows-Sysmon/Operational"
                />
              </Field>
            ) : (
              <LocalSourcePicker
                key={`${selectedPlatform}-${form.agentId}`}
                platform={selectedPlatform}
                existingPaths={existingPaths}
                onChange={setLocalSources}
              />
            )}
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
          <PrimaryButton
            type="submit"
            style={{ width: "auto" }}
            disabled={submitting || (!isEdit && form.mode === "local" && localSources.length === 0)}
          >
            {submitting
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : form.mode === "local" && localSources.length > 1
                  ? "Connect sources"
                  : "Connect source"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
