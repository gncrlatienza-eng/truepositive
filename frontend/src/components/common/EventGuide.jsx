import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { theme } from "../../styles/theme";
import { getEventGuide } from "../../data/eventGuides";

function Section({ label, children }) {
  return (
    <div style={{ marginTop: theme.space[3] }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.color.textMuted, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

// Real, curated educational content for the event types this app actually
// produces (see data/eventGuides.js) — collapsed by default so it doesn't
// crowd out the log/alert's own detail on first open, but real and one
// click away rather than hidden in a separate reference page. Silently
// renders nothing for an event type with no guide yet, same "don't
// fabricate what we don't have" convention as the intel-enrichment toggle
// this sits next to.
export function EventGuide({ eventType }) {
  const [open, setOpen] = useState(false);
  const guide = getEventGuide(eventType);
  if (!guide) return null;

  return (
    <div style={{ marginTop: theme.space[5] }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: theme.color.text,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <BookOpen size={14} color={theme.color.accent} />
        Learn about this event
        <span style={{ fontWeight: 400, color: theme.color.textFaint }}>({guide.eventId})</span>
      </button>

      {open && (
        <div
          style={{
            marginTop: theme.space[3],
            padding: theme.space[4],
            background: theme.color.background,
            border: `1px solid ${theme.color.border}`,
            borderRadius: theme.radius.sm,
          }}
        >
          <Section label="What it means">{guide.whatItMeans}</Section>
          <Section label="Why it matters">{guide.whyItMatters}</Section>
          <Section label="Common benign causes">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {guide.commonCauses.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Section>
          <Section label="What to check">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {guide.whatToCheck.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
}
