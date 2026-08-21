import { Link, useNavigate } from "react-router-dom";
import { theme } from "../../styles/theme";
import { useSetupStatus } from "../../hooks/useSetupStatus";
import { Button } from "./Button";
import { ProgressBar } from "../charts/ProgressBar";

// Contextual headline for whichever setup step is still outstanding — e.g.
// a page with an agent+source but no rule yet gets a different message than
// a page with nothing deployed at all, rather than one generic line.
//
// Deliberately has no "agent currently offline" entry — that case doesn't
// use this full-block modal at all (see AgentOfflineBanner below). These
// three are all genuine first-time-setup gaps (agent/source/rule never
// done at all), which is the only situation where blocking the whole page
// behind "Setup required" actually makes sense — there's truly nothing to
// show yet.
const PENDING_HEADLINE = {
  agent: {
    title: "No agent deployed yet",
    subtitle: "Nothing here will reflect real activity until an agent connects.",
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
      {/* Same real logo mark as TopBar.jsx — scaled up, not reinvented, so
          this reads as the app's actual brand rather than a generic
          decorative icon. */}
      <img src="/tp-logo.png" alt="" width={48} height={48} style={{ marginBottom: theme.space[5] }} />

      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
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

// Shown while useSetupStatus's very first check is still in flight — before
// this resolves, there's no way to know yet whether the page should render
// live data or the locked panel, so blur+wait rather than either flashing
// unblurred content for a moment or guessing. Only ever shows once, on
// initial mount (useSetupStatus's `loading` never goes true again on later
// polls — see its own comment), not on every 30s/focus recheck.
function LoadingPanel() {
  return (
    <div
      className="tp-chart-in"
      style={{
        width: "100%",
        maxWidth: 360,
        background: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        padding: theme.space[7],
        boxSizing: "border-box",
        textAlign: "center",
      }}
    >
      <img
        src="/tp-logo.png"
        alt=""
        width={48}
        height={48}
        style={{ display: "block", margin: "0 auto", marginBottom: theme.space[4] }}
      />
      <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: theme.space[5] }}>
        <span style={{ color: theme.color.text }}>True</span>
        <span style={{ color: theme.color.accent }}>Positive</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <span
          className="tp-pulse-dot"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: theme.color.accent,
            "--tp-pulse-color": theme.color.accent,
          }}
        />
        <span style={{ fontSize: 14, color: theme.color.textMuted }}>Checking agent status, please wait…</span>
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

// Not the same situation as the full-block panels above, deliberately —
// per direct user feedback, once an org has genuinely finished setup
// (agent deployed, source added, rule enabled — all real, at some point),
// the agent later going offline shouldn't regress the page back to looking
// like setup was never done. Whatever was already collected is still real
// and worth seeing, so this is a plain top-of-page notice, not a blur+lock:
// the page underneath stays fully visible and interactive.
function AgentOfflineBanner() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 18px",
        margin: `${theme.space[7]}px ${theme.space[7]}px 0`,
        background: "rgba(220, 38, 38, 0.08)",
        border: `1px solid ${theme.color.severity.critical}`,
        borderRadius: 8,
        flexWrap: "wrap",
      }}
    >
      <span
        className="tp-pulse-dot"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: theme.color.severity.critical,
          flexShrink: 0,
          "--tp-pulse-color": theme.color.severity.critical,
        }}
      />
      <span style={{ fontSize: 14, fontWeight: 600, color: theme.color.severity.critical, whiteSpace: "nowrap" }}>
        Agent offline
      </span>
      <span style={{ fontSize: 13, color: theme.color.textMuted, flex: 1, minWidth: 200 }}>
        You&rsquo;re looking at data from its last connection — nothing new is coming in. Relaunch the agent on its host
        to resume live collection.
      </span>
      <Link
        to="/settings"
        style={{ fontSize: 13, fontWeight: 600, color: theme.color.accent, textDecoration: "none", flexShrink: 0 }}
      >
        Settings →
      </Link>
    </div>
  );
}

// Wraps a page's content: blurred, dimmed, and non-interactive ("locked")
// behind a centered "Get set up" panel until an org has deployed an agent,
// added a log source, and enabled a rule for the *first* time. `variant="hero"`
// (Overview — the full checklist) or `"compact"` (Logs/Alerts — a one-line
// nudge back to Overview, since repeating the whole checklist on every page
// was noisy). Once that first-time setup is genuinely done, an agent going
// offline afterward no longer blocks the page at all — see
// AgentOfflineBanner above.
export function SetupLockOverlay({ children, variant = "hero" }) {
  const { loading, ready, steps, hasAnyAgent } = useSetupStatus();
  const firstPending = steps.find((s) => !s.done);
  // The one already-completed-setup case: an agent was deployed before
  // (hasAnyAgent) and is the only outstanding step (source/rule are still
  // genuinely done) — that's "temporarily offline," not "never set up."
  // Everything else missing (agent never deployed at all, or source/rule
  // never done) is real first-time setup and still gets the full block.
  const agentOfflineOnly = !loading && !ready && firstPending?.key === "agent" && hasAnyAgent;
  const trulyLocked = !loading && !ready && !agentOfflineOnly;
  // Blur+cover while still checking, or genuinely not set up yet — children
  // stay inert (pointer-events: none) in both. Not for agentOfflineOnly:
  // that case shows real content plus a banner, see below.
  const covered = loading || trulyLocked;
  const headline = firstPending && PENDING_HEADLINE[firstPending.key];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {agentOfflineOnly && <AgentOfflineBanner />}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          filter: covered ? "blur(6px)" : "none",
          opacity: covered ? 0.5 : 1,
          pointerEvents: covered ? "none" : "auto",
          userSelect: covered ? "none" : "auto",
          transition: "filter 200ms ease-out, opacity 200ms ease-out",
        }}
        aria-hidden={covered ? true : undefined}
      >
        {/* `children` can be a plain node, or a render function receiving
            { agentOfflineOnly } for pages that want to visually de-emphasize
            their own "live" surface (Overview's KPIs/charts/breakdowns,
            Logs'/Alerts' filter+table) without a second, duplicate
            useSetupStatus() poll to get that flag. */}
        {typeof children === "function" ? children({ agentOfflineOnly }) : children}
      </div>

      {covered && (
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
          {loading ? (
            <LoadingPanel />
          ) : variant === "compact" ? (
            <CompactPanel headline={headline} doneCount={doneCount} totalSteps={steps.length} />
          ) : (
            <HeroPanel steps={steps} headline={headline} doneCount={doneCount} />
          )}
        </div>
      )}
    </div>
  );
}
