import { useState } from "react";
import { theme } from "../../styles/theme";
import { Card } from "../common/Card";

const STORAGE_KEY = "tp_pipeline_explainer_dismissed";

const STEPS = [
  { label: "Log", desc: "a raw event ingested from a source" },
  { label: "Alert", desc: "fires when a log matches a detection rule" },
  { label: "Incident", desc: "groups related alerts for tracking and response" },
];

// New to SIEM concepts, the Log → Alert → Incident hierarchy is the one
// thing this app never explained anywhere in the UI (per-event-type help
// exists via EventGuide/InfoTooltip, but not the object model itself) —
// small and dismissible, not a blocking onboarding flow, so it doesn't nag
// a returning user forever once they've read it.
export function PipelineExplainer() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  }

  return (
    // flexShrink:0 — Card sets `overflow:hidden` inline, which (per the CSS
    // flexbox spec) changes a flex item's automatic minimum size to 0
    // instead of its content size. Placed bare as a flex-column child here
    // (unlike StatusBanner/CriticalActionStrip, which are plain divs, not
    // Card), that collapsed this card to ~2px tall — confirmed live via a
    // real getBoundingClientRect() check before landing on this fix.
    <Card
      style={{ flexShrink: 0 }}
      action={
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            background: "none",
            border: "none",
            color: theme.color.textMuted,
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      }
    >
      <div
        style={{
          padding: `${theme.space[3]}px ${theme.space[4]}px`,
          display: "flex",
          alignItems: "center",
          gap: theme.space[3],
          flexWrap: "wrap",
          fontSize: 13,
        }}
      >
        {STEPS.map((s, i) => (
          <span key={s.label} style={{ display: "flex", alignItems: "center", gap: theme.space[3] }}>
            <span style={{ color: theme.color.textMuted }}>
              <strong style={{ color: theme.color.text, fontWeight: 600 }}>{s.label}</strong> — {s.desc}
            </span>
            {i < STEPS.length - 1 && <span style={{ color: theme.color.textFaint }}>→</span>}
          </span>
        ))}
      </div>
    </Card>
  );
}
