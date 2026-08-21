import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { TextInput, OutlineButton } from "../auth/fields";
import { catalogForPlatform } from "../../data/logSourceCatalog";

function Badge({ color, children }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// Named, checkbox-driven picker for local log sources — used by onboarding
// step 3 and Settings -> "Connect data source" so people don't have to
// already know the exact Windows Event Log channel name to get started.
// Mount with a `key={platform}` at the call site so switching platforms
// resets the selection instead of mixing stale entries from another catalog.
export default function LocalSourcePicker({ platform = "windows", existingPaths = [], onChange }) {
  const catalog = catalogForPlatform(platform);
  // Recommended-but-unmet-prerequisite sources (needs Administrator, needs
  // Sysmon installed) are shown and still explicitly selectable, but not
  // auto-checked -- silently pre-enrolling a fresh setup into a channel
  // that will just fail forever, with the only feedback being a console
  // warning most people never see, is a worse default than asking for one
  // deliberate opt-in click from someone who's confirmed the prerequisite.
  const [sources, setSources] = useState(() =>
    catalog
      .filter((c) => c.recommended && !c.needsAdmin && !c.requiresSysmon && !existingPaths.includes(c.path))
      .map((c) => ({ name: c.name, path: c.path })),
  );
  const [addingCustom, setAddingCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPath, setCustomPath] = useState("");

  useEffect(() => {
    onChange(sources);
    // Only re-notify when the selection itself changes — including `onChange`
    // here would refire on every parent render (it's a fresh function each
    // time) and risks a render loop once the parent's setState comes back around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  function toggle(entry) {
    if (existingPaths.includes(entry.path)) return;
    setSources((prev) =>
      prev.some((s) => s.path === entry.path)
        ? prev.filter((s) => s.path !== entry.path)
        : [...prev, { name: entry.name, path: entry.path }],
    );
  }

  function addCustom() {
    const name = customName.trim();
    const path = customPath.trim();
    if (!name || !path || sources.some((s) => s.path === path)) return;
    setSources((prev) => [...prev, { name, path }]);
    setCustomName("");
    setCustomPath("");
    setAddingCustom(false);
  }

  function removeCustom(path) {
    setSources((prev) => prev.filter((s) => s.path !== path));
  }

  const customEntries = sources.filter((s) => !catalog.some((c) => c.path === s.path));

  return (
    <div>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: theme.space[3] }}
      >
        <h4 style={{ margin: 0, fontSize: 15 }}>Choose what to collect</h4>
        <span style={{ fontSize: 13, color: theme.color.textMuted }}>{sources.length} selected</span>
      </div>

      {catalog.map((entry) => {
        const alreadyAdded = existingPaths.includes(entry.path);
        const checked = alreadyAdded || sources.some((s) => s.path === entry.path);
        return (
          <label
            key={entry.key}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: theme.space[3],
              padding: `${theme.space[3]}px 0`,
              borderBottom: `1px solid ${theme.color.border}`,
              cursor: alreadyAdded ? "default" : "pointer",
              opacity: alreadyAdded ? 0.6 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={alreadyAdded}
              onChange={() => toggle(entry)}
              style={{ marginTop: 3 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: theme.space[2], fontSize: 14, fontWeight: 600 }}
              >
                {entry.name}
                {alreadyAdded && <Badge color={theme.color.severity.ok}>Already added</Badge>}
                {!alreadyAdded && entry.recommended && <Badge color={theme.color.severity.ok}>Recommended</Badge>}
                {entry.needsAdmin && <Badge color={theme.color.severity.medium}>Needs Administrator</Badge>}
                {entry.requiresSysmon && <Badge color={theme.color.severity.high}>Requires Sysmon installed</Badge>}
              </div>
              <div style={{ fontSize: 12, color: theme.color.textFaint, marginTop: 2 }}>{entry.description}</div>
              <div style={{ fontSize: 12, color: theme.color.textFaint, fontFamily: theme.font.mono, marginTop: 2 }}>
                {entry.path}
              </div>
            </div>
          </label>
        );
      })}

      {customEntries.map((s) => (
        <div
          key={s.path}
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.space[3],
            padding: `${theme.space[3]}px 0`,
            borderBottom: `1px solid ${theme.color.border}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
            <div style={{ fontSize: 12, color: theme.color.textFaint, fontFamily: theme.font.mono }}>{s.path}</div>
          </div>
          <button
            type="button"
            onClick={() => removeCustom(s.path)}
            style={{
              background: "none",
              border: "none",
              color: theme.color.textFaint,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Remove
          </button>
        </div>
      ))}

      {addingCustom ? (
        <div style={{ display: "flex", gap: theme.space[2], marginTop: theme.space[3], alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <TextInput value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Name" />
          </div>
          <div style={{ flex: 1 }}>
            <TextInput
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="Channel or file path"
            />
          </div>
          <OutlineButton type="button" style={{ width: "auto" }} onClick={addCustom}>
            Add
          </OutlineButton>
          <OutlineButton type="button" style={{ width: "auto" }} onClick={() => setAddingCustom(false)}>
            Cancel
          </OutlineButton>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingCustom(true)}
          style={{
            marginTop: theme.space[3],
            background: "none",
            border: "none",
            color: theme.color.accent,
            cursor: "pointer",
            fontSize: 13,
            padding: 0,
          }}
        >
          + Add a custom source
        </button>
      )}
    </div>
  );
}
