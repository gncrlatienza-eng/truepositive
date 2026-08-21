import { theme } from "../styles/theme";
import { Link } from "react-router-dom";
import { Inbox, Bell, Gauge, Search, ChevronRight } from "lucide-react";
import { PrimaryLink } from "../components/auth/fields";

const PIPELINE_STEPS = [
  { icon: Inbox, label: "Real-time log ingestion", desc: "Windows, syslog, and Sysmon events land here first." },
  { icon: Bell, label: "Alert detection & rule tuning", desc: "Your rules turn matching events into alerts." },
  { icon: Gauge, label: "Threat severity scoring", desc: "Every alert is ranked so the worst ones surface first." },
  { icon: Search, label: "Timeline investigations", desc: "Trace an alert back through the events that led to it." },
];

// Nav is the only place to Log in / Create account — the hero CTA row and
// the closing CTA band were dropped as redundant with it (three copies of
// the same two actions on one page). Log in gets the primary pill now, not
// Create account — the nav is the single source for both, not a duplicate
// of a hero action.
export default function LandingPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.color.background,
        color: theme.color.text,
        fontFamily: theme.font.body,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24px 40px",
          borderBottom: `1px solid ${theme.color.border}`,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>
          True<span style={{ color: theme.color.accent }}>Positive</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: theme.space[5] }}>
          <Link
            to="/onboarding"
            style={{ fontSize: 14, color: theme.color.textMuted, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Create account
          </Link>
          <PrimaryLink to="/login" style={{ padding: "9px 20px", fontSize: 14 }}>
            Log in
          </PrimaryLink>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "100px 40px 60px", textAlign: "center" }}>
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
        <h1 style={{ fontSize: 46, lineHeight: 1.15, margin: 0 }}>Stop chasing false positives.</h1>
        <p
          style={{
            fontSize: 17,
            color: theme.color.textMuted,
            marginTop: theme.space[4],
            lineHeight: 1.6,
            maxWidth: 560,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          TruePositive ingests your Windows, syslog and Sysmon events, scores them against your rules, and shows you
          only what deserves an analyst.
        </p>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 40px 120px" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 1.5,
            fontFamily: theme.font.mono,
            color: theme.color.textMuted,
            textAlign: "center",
            marginBottom: theme.space[6],
          }}
        >
          HOW IT WORKS
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: theme.space[2] }}>
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.label} style={{ display: "flex", alignItems: "flex-start", flex: 1, minWidth: 0 }}>
              <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: theme.radius.md,
                    background: "rgba(8, 144, 177, 0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto",
                    marginBottom: theme.space[4],
                  }}
                >
                  <step.icon size={20} color={theme.color.accent} strokeWidth={2} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{step.label}</div>
                <p
                  style={{
                    fontSize: 13,
                    color: theme.color.textMuted,
                    marginTop: theme.space[2],
                    lineHeight: 1.5,
                    padding: "0 8px",
                  }}
                >
                  {step.desc}
                </p>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <ChevronRight
                  size={18}
                  color={theme.color.border}
                  strokeWidth={2}
                  style={{ flexShrink: 0, marginTop: 12 }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
