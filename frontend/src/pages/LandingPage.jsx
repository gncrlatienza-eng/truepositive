import { theme } from "../styles/theme";

export default function LandingPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.color.background,
        color: theme.color.text,
        fontFamily: theme.font.body,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 32, marginBottom: 12 }}>
          True<span style={{ color: theme.color.accent }}>Positive</span>
        </h1>
        <p style={{ color: theme.color.textMuted }}>
          Scaffold is up. Build screens against the mockup in reference/.
        </p>
      </div>
    </div>
  );
}
