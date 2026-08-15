import { Link, useNavigate } from "react-router-dom";
import { theme } from "../../styles/theme";
import { useSetupStatus } from "../../hooks/useSetupStatus";
import { Button } from "./Button";
import { ProgressBar } from "../charts/ProgressBar";

// Contextual headline for whichever setup step is still outstanding — e.g.
// a page with an agent+source but no rule yet gets a different message than
// a page with nothing deployed at all, rather than one generic line.
const PENDING_HEADLINE = {
  agent: {
    title: "No agent deployed yet",
    subtitle: "Nothing here will reflect real activity until an agent connects.",
  },
  // Same missing step, different situation: an org that deployed an agent
  // before but it's currently offline (e.g. the host rebooted and the agent
  // hasn't been started back up yet) shouldn't see "no agent deployed" —
  // that reads as if setup was never done at all.
  agentOffline: {
    title: "Agent offline",
    subtitle: "You've deployed an agent before, but none are connected right now — start it back up on its host.",
  },
  source: {
    title: "No log source configured yet",
    subtitle: "The agent is connected, but hasn't been told what to collect.",
  },
  rule: {
    title: "No detection rule enabled yet",
    subtitle: "Logs are flowing in — finish setup by enabling at least one rule.",
  },
};

function AgentIcon({ size = 20, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 7l5 5-5 5" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SourceIcon({ size = 20, color }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="M9 12h6M9 15.5h6M9 9h2" />
    </svg>
  );
}

function RuleIcon({ size = 20, color }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a5 5 0 00-5 5v3.2c0 .5-.2 1-.6 1.4L5 14h14l-1.4-1.4a2 2 0 01-.6-1.4V8a5 5 0 00-5-5z" />
      <path d="M9.5 17a2.5 2.5 0 005 0" />
    </svg>
  );
}

function CheckIcon({ size = 14, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5l4.5 4.5L19 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon({ size = 22, color }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

const STEP_ICONS = { agent: AgentIcon, source: SourceIcon, rule: RuleIcon };

function StepIconBadge({ step }) {
  const Icon = STEP_ICONS[step.key];
  const tint = step.done ? theme.color.severity.ok : theme.color.accent;
  return (
    <span
      style={{
        width: 38,
        height: 38,
        borderRadius: theme.radius.md,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `${tint}1F`,
      }}
    >
      {step.done ? <CheckIcon size={16} color={tint} /> : <Icon size={20} color={tint} />}
    </span>
  );
}

// The "home base" treatment — full checklist, progress bar, step icons.
// Used on the Overview page, where setup actually happens (every step
// links out to Settings from here).
function HeroPanel({ steps, headline, doneCount }) {
  return (
    <div
      className="tp-chart-in"
      style={{
        width: "100%",
        maxWidth: 600,
        maxHeight: "92%",
        overflowY: "auto",
        background: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        padding: theme.space[7],
        boxSizing: "border-box",
      }}
    >
      {/* Same flat mark as the real logo in TopBar.jsx — scaled up, not
          reinvented (no gradient/glow), so this reads as the app's actual
          brand rather than a generic decorative icon. */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 11,
          background: theme.color.accent,
          color: "#0F1219",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: theme.space[5],
          fontFamily: theme.font.mono,
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        &gt;
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: theme.color.accent,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: theme.space[2],
        }}
      >
        Setup required
      </div>
      <h2 style={{ fontSize: 30, marginBottom: theme.space[2], letterSpacing: "-0.02em" }}>
        {headline?.title || "Finish setting up"}
      </h2>
      <div style={{ fontSize: 15, color: theme.color.textMuted, marginBottom: theme.space[5] }}>
        {headline?.subtitle || "Complete these steps and this page will start showing real data."}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: theme.space[3], marginBottom: theme.space[6] }}>
        <div style={{ flex: 1 }}>
          <ProgressBar pct={(doneCount / steps.length) * 100} height={7} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.color.textMuted, whiteSpace: "nowrap" }}>
          {doneCount} of {steps.length} done
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: theme.space[3] }}>
        {steps.map((s) => (
          <div
            key={s.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: theme.space[4],
              padding: theme.space[4],
              borderRadius: theme.radius.md,
              border: `1px solid ${s.done ? "transparent" : theme.color.border}`,
              background: s.done ? "transparent" : theme.color.background,
              opacity: s.done ? 0.55 : 1,
            }}
          >
            <StepIconBadge step={s} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, textDecoration: s.done ? "line-through" : "none" }}>
                {s.label}
              </div>
              <div style={{ fontSize: 13, color: theme.color.textFaint, marginTop: 2 }}>{s.why}</div>
            </div>
            {!s.done && (
              <Link
                to={s.to}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: theme.color.accent,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {s.cta} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// The lighter treatment for secondary pages (Logs/Alerts) — the full
// checklist already lives on Overview, so this doesn't repeat it verbatim;
// it just explains why the page is empty and points back to the one place
// setup actually happens.
function CompactPanel({ headline, doneCount, totalSteps }) {
  const navigate = useNavigate();
  return (
    <div
      className="tp-chart-in"
      style={{
        width: "100%",
        maxWidth: 440,
        background: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        padding: theme.space[7],
        boxSizing: "border-box",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: `${theme.color.accent}1F`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto",
          marginBottom: theme.space[4],
        }}
      >
        <LockIcon size={24} color={theme.color.accent} />
      </div>
      <h3 style={{ fontSize: 21, marginBottom: theme.space[2] }}>{headline?.title || "Setup required"}</h3>
      <div style={{ fontSize: 14, color: theme.color.textMuted, marginBottom: theme.space[6] }}>
        {headline?.subtitle || "This page will start showing real data once setup is complete."}
      </div>
      <Button size="lg" style={{ width: "100%" }} onClick={() => navigate("/app")}>
        Finish setup on Overview →
      </Button>
      <div style={{ fontSize: 13, color: theme.color.textFaint, marginTop: theme.space[4] }}>
        {doneCount} of {totalSteps} steps done
      </div>
    </div>
  );
}

// Wraps a page's content: blurred, dimmed, and non-interactive ("locked")
// behind a centered "Get set up" panel until an org has deployed an agent,
// added a log source, and enabled a rule. `variant="hero"` (Overview — the
// full checklist) or `"compact"` (Logs/Alerts — a one-line nudge back to
// Overview, since repeating the whole checklist on every page was noisy).
export function SetupLockOverlay({ children, variant = "hero" }) {
  const { loading, ready, steps, hasAnyAgent } = useSetupStatus();
  const locked = !loading && !ready;
  const firstPending = steps.find((s) => !s.done);
  const headlineKey = firstPending?.key === "agent" && hasAnyAgent ? "agentOffline" : firstPending?.key;
  const headline = firstPending && PENDING_HEADLINE[headlineKey];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          filter: locked ? "blur(6px)" : "none",
          opacity: locked ? 0.5 : 1,
          pointerEvents: locked ? "none" : "auto",
          userSelect: locked ? "none" : "auto",
          transition: "filter 200ms ease-out, opacity 200ms ease-out",
        }}
        aria-hidden={locked ? true : undefined}
      >
        {children}
      </div>

      {locked && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "rgba(15, 18, 25, 0.5)",
          }}
        >
          {variant === "compact" ? (
            <CompactPanel headline={headline} doneCount={doneCount} totalSteps={steps.length} />
          ) : (
            <HeroPanel steps={steps} headline={headline} doneCount={doneCount} />
          )}
        </div>
      )}
    </div>
  );
}
