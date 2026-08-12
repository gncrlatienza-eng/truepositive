import { theme } from "../styles/theme";
import AuthShell from "../components/auth/AuthShell";
import { PrimaryLink, OutlineLink } from "../components/auth/fields";

const VALUE_STEPS = [
  { n: "01", label: "Real-time log ingestion" },
  { n: "02", label: "Alert detection & rule tuning" },
  { n: "03", label: "Threat severity scoring" },
  { n: "04", label: "Timeline investigations" },
];

export default function LandingPage() {
  return (
    <AuthShell>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 1.5,
          fontFamily: theme.font.mono,
          color: theme.color.accent,
          marginBottom: theme.space[4],
        }}
      >
        LOG ANALYSIS &amp; ALERT TRIAGE
      </div>
      <h1 style={{ fontSize: 46, lineHeight: 1.1 }}>Stop chasing false positives.</h1>
      <p style={{ fontSize: 17, color: theme.color.textMuted, marginTop: theme.space[4], lineHeight: 1.6 }}>
        TruePositive ingests your Windows, syslog and Sysmon events, scores them against your rules, and shows you only
        what deserves an analyst.
      </p>

      <div style={{ margin: `${theme.space[7]}px 0` }}>
        {VALUE_STEPS.map((step) => (
          <div
            key={step.n}
            style={{
              display: "flex",
              alignItems: "center",
              gap: theme.space[4],
              padding: `${theme.space[4]}px 0`,
              borderBottom: `1px solid ${theme.color.border}`,
            }}
          >
            <span style={{ fontFamily: theme.font.mono, fontWeight: 600, color: theme.color.accent, fontSize: 14 }}>
              {step.n}
            </span>
            <span style={{ fontSize: 16 }}>{step.label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: theme.space[3] }}>
        <PrimaryLink to="/onboarding" style={{ flex: 1 }}>
          Create account
        </PrimaryLink>
        <OutlineLink to="/login" style={{ flex: 1 }}>
          Log in
        </OutlineLink>
      </div>

      <div
        style={{
          marginTop: theme.space[7],
          display: "flex",
          alignItems: "center",
          gap: theme.space[3],
          color: theme.color.textMuted,
          fontSize: 14,
        }}
      >
        <div style={{ display: "flex" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: theme.color.accent,
                border: `2px solid ${theme.color.background}`,
                marginLeft: i === 0 ? 0 : -10,
              }}
            />
          ))}
        </div>
        <span>Used by 240+ analysts across 38 security teams</span>
      </div>
    </AuthShell>
  );
}
