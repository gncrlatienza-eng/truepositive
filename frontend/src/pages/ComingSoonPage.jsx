import { theme } from "../styles/theme";

// Shared stub for sidebar sections with no real content yet (Incidents —
// Sprint 6; Reports/Intel — Sprint 8). Keeps every sidebar item routing and
// highlighting correctly per this sprint's AC without building next
// sprints' pages early.
export default function ComingSoonPage({ title, sprint }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.space[3],
        textAlign: "center",
        padding: theme.space[7],
      }}
    >
      <h1 style={{ fontSize: 28 }}>{title}</h1>
      <p style={{ fontSize: 15, color: theme.color.textMuted, maxWidth: 420 }}>
        {title} lands in Sprint {sprint} per the project&rsquo;s sprint plan. Nothing to show here yet.
      </p>
    </div>
  );
}
