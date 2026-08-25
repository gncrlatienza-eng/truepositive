import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Radar, Siren, FileBarChart2, Compass, Clock, Inbox, Bell, Gauge, Search } from "lucide-react";
import { theme } from "../styles/theme";
import { PrimaryLink, OutlineLink } from "../components/auth/fields";

// Rebuilt 2026-08-22 against reference/"TruePositive Redesign.dc (1).html" —
// same layout/animations as that mockup, but with the copy corrected against
// what this product actually does. The mockup (a generic SaaS template) had
// a few claims that don't hold for this specific app and were fixed rather
// than shipped verbatim, per explicit user decision:
//   - "Zero agents to install" is false — TruePositive's whole architecture
//     depends on a real Windows agent. The 3-stat row below states real,
//     defensible facts instead of invented performance numbers (this app
//     has never measured a "setup to first alert" time, so it doesn't claim
//     one).
//   - "Role-based access" / "Integrations (SIEM/EDR/ticketing connectors)"
//     don't exist in this app at all — swapped for two real Sprint 6/8
//     features (incident workflow, threat intel lookups).
//   - "Audit-ready history... every change is logged" is currently false
//     (audit_log exists but nothing writes to it yet, per SECURITY.md) —
//     swapped for the real, working Compliance report feature instead.
//   - The "NEW ... now GA" badge implied a release cadence this project
//     doesn't have — dropped rather than faked.
//   - Fake footer columns (About/Careers/Contact/Privacy/Terms) were
//     dropped — a dead link is worse than no link on a page real people
//     will actually click around.
//   - The modal-based login/signup from the mockup was deliberately NOT
//     built — Log in / Create account still route to the existing
//     LoginPage/onboarding wizard, per explicit user scope decision.
//
// 2026-08-22, later same day: every section previously had its own
// independently-tuned maxWidth (880/1160/980/1680...), which meant each one
// centered against a different effective content width -- "How it works"
// sat visibly more indented than "Features" right below it, etc. Fixed by
// giving every section the same horizontal padding via the shared
// .tp-landing-section class (index.css) instead of a per-section JS
// maxWidth + margin:auto -- every section now starts at the exact same X
// offset from the true viewport edge, so left/right-edge alignment no
// longer depends on every section agreeing on one shared maxWidth number.
//
// 2026-08-22, later still (full-bleed pass): removed that shared maxWidth
// cap entirely, since capping the OUTER section at ~1300px left dead,
// contentless space on both sides on any screen wider than that -- cards,
// grids, and images all stayed clustered in the middle instead of using
// the screen. Sections now stretch to the full available width (viewport
// minus the .tp-landing-section padding). A few elements still keep their
// OWN small maxWidth, for a real reason rather than as a leftover:
//   - the "How it works" timeline's inner column (900px) -- long
//     paragraph lines get hard to read edge-to-edge on a wide monitor.
//   - the hero paragraph specifically (480px, set on the <p> itself, not
//     its parent column) -- same readability reason, kept narrower than
//     the headline/column around it on purpose.
//   - the CTA band (900px) -- a deliberately narrower, self-contained
//     callout card, not a left-aligned text block.
//
// 2026-08-22, later still again: the first full-bleed pass fixed the dead
// space at the section EDGES (above) but left a different version of the
// same problem in the hero and showcase -- both the hero text/visual and
// the showcase image were still hard-capped well below their actual
// available width, so on any screen wider than ~1400px that unused width
// just turned into one big gap instead of several small ones. Widened the
// hero text column to 640px and (at the time) the hero visual/showcase
// image, since both were still real screenshots then and had native-
// resolution headroom to grow into. The hero visual is pushed to the far
// right of its row via justifyContent: "space-between" (rather than
// sitting flush against the text column), so leftover width after both
// hit their caps becomes a normal-looking gap between them instead of
// dead space trailing after everything -- that positioning still applies.
//
// 2026-08-22, later still again: replaced both real screenshots with the
// live MiniDashboard below, which made the "grow it to use the native
// resolution" reasoning above moot -- there's no resolution to protect
// since it's rendered UI, not an image. Sized it back down to a compact,
// realistically-proportioned app-window width (620px hero / 760px
// showcase) instead of stretching it to fill the available space, since a
// wide mockup with 2-column stat cards and a flat, stretched chart read as
// sparse/empty rather than dense and real.

const STATS = [
  { value: "3 log types", label: "Windows, syslog, Sysmon" },
  { value: "1 agent", label: "Per monitored device" },
  { value: "Self-hosted", label: "Your data stays yours" },
];

const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Connect your sources",
    desc: "Deploy the lightweight Windows agent, then point it at your Windows, syslog, and Sysmon sources — no config files to hand-edit.",
  },
  {
    n: "02",
    title: "Rules go to work",
    desc: "Your detection rules score every incoming event the moment it lands — tune thresholds without a redeploy.",
  },
  {
    n: "03",
    title: "Noise falls away",
    desc: "Only alerts that clear your risk threshold reach an analyst's queue.",
  },
  {
    n: "04",
    title: "Investigate with context",
    desc: "Open any alert to see the events, related activity, and history behind it — not just a raw log line.",
  },
];

const FEATURES = [
  {
    span: true,
    icon: ClipboardList,
    title: "Custom detection rules",
    desc: "Write rules in plain conditions and see them apply immediately — no redeploy needed to change what counts as an alert.",
  },
  {
    icon: Radar,
    title: "Threat intel lookups",
    desc: "Cross-reference any IP, domain, or hash against a curated feed and your own historical logs.",
  },
  {
    icon: Siren,
    title: "Incident workflow",
    desc: "Escalate alerts into trackable incidents with notes, assignment, and a full status history.",
  },
  {
    icon: FileBarChart2,
    title: "Compliance-style reports",
    desc: "Track log retention, alert SLAs, and rule coverage against common framework baselines.",
  },
  {
    span: true,
    icon: Compass,
    title: "Guided triage",
    desc: "Each alert opens with the context an analyst needs first — no digging through raw logs.",
  },
  {
    icon: Clock,
    title: "Mean time to triage",
    desc: "See how fast your team moves from alert to resolution, tracked automatically.",
  },
];

const PIPELINE_ICONS = [Inbox, Bell, Gauge, Search];

// 2026-08-22, later still: replaced the hero/showcase real screenshots with
// a live, interactive mini dashboard (MiniDashboard below) -- clickable
// sidebar tabs and an openable alert detail pane, instead of a static
// image. This sidesteps the whole class of problems a fixed-resolution
// screenshot has in a fluid layout (crop risk, blur past native
// resolution, a hard-coded aspect ratio fighting the section's actual
// width) since a real component just reflows like the rest of the page.
// Data below is illustrative only, deliberately not wired to any API.
const MOCK_STATS = [
  { label: "Events / 24h", value: "18,402" },
  { label: "Active alerts", value: "68" },
  { label: "Critical", value: "15", tone: "critical" },
  { label: "Risk score", value: "148", tone: "critical" },
];

const MOCK_ALERTS = [
  {
    id: "a1",
    severity: "critical",
    rule: "New admin account created",
    detail: "Special privileges assigned to new logon",
    time: "29d 3h ago",
    status: "unresolved",
    source: "WIN-SOC-01",
  },
  {
    id: "a2",
    severity: "medium",
    rule: "Port scan detected",
    detail: "A network share object was accessed",
    time: "Aug 22, 06:05 AM",
    status: "unresolved",
    source: "WIN-SOC-01",
  },
  {
    id: "a3",
    severity: "ok",
    rule: "PowerShell command flagged",
    detail: "Encoded command executed via powershell.exe",
    time: "Aug 21, 05:13 PM",
    status: "acknowledged",
    source: "WIN-DEV-04",
  },
  {
    id: "a4",
    severity: "medium",
    rule: "Network share object accessed",
    detail: "Admin share reached outside business hours",
    time: "Aug 20, 11:41 PM",
    status: "resolved",
    source: "WIN-SOC-02",
  },
];

const MOCK_INCIDENTS = [
  {
    id: "i1",
    title: "Suspicious admin privilege escalation",
    severity: "critical",
    status: "investigating",
    assignee: "Alex Rivera",
  },
  {
    id: "i2",
    title: "Repeated failed logons on VPN gateway",
    severity: "medium",
    status: "open",
    assignee: "Unassigned",
  },
  {
    id: "i3",
    title: "Sysmon service stopped on WIN-SOC-01",
    severity: "ok",
    status: "resolved",
    assignee: "Alex Rivera",
  },
];

const STATUS_STYLE = {
  unresolved: { label: "Unresolved", bg: theme.color.danger.bg, text: theme.color.danger.text },
  open: { label: "Open", bg: theme.color.danger.bg, text: theme.color.danger.text },
  acknowledged: { label: "Acknowledged", bg: `${theme.color.severity.medium}22`, text: theme.color.severity.medium },
  investigating: { label: "Investigating", bg: `${theme.color.severity.medium}22`, text: theme.color.severity.medium },
  resolved: { label: "Resolved", bg: theme.color.safe.bg, text: theme.color.safe.text },
};

const SEVERITY_LABEL = { critical: "Critical", high: "High", medium: "Medium", ok: "Low" };

const MINI_NAV = [
  { key: "overview", label: "Overview", icon: Gauge },
  { key: "alerts", label: "Alerts", icon: Bell },
  { key: "incidents", label: "Incidents", icon: Siren },
];

function useReveal() {
  const els = useRef(new Set());
  const register = (dir) => (el) => {
    if (el && !els.current.has(el)) {
      el.dataset.dir = dir || "";
      els.current.add(el);
    }
  };
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            setTimeout(() => {
              el.style.opacity = "1";
              el.style.transform = "translate(0, 0)";
            }, i * 60);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.2 },
    );
    els.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return register;
}

function useParallax() {
  const ref = useRef(null);
  useEffect(() => {
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect();
          const vh = window.innerHeight || 800;
          const progress = (vh - rect.top) / (vh + rect.height);
          const clamped = Math.max(-1, Math.min(1, progress - 0.5));
          ref.current.style.transform = `translateY(${clamped * -24}px)`;
        }
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return ref;
}

function usePulseOnView() {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.animation = "tp-cta-pulse-glow 1.4s ease-out";
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return ref;
}

const revealBase = {
  opacity: 0,
  transition: "opacity 0.6s ease-out, transform 0.6s ease-out",
};

export default function LandingPage() {
  const registerReveal = useReveal();
  const showcaseRef = useParallax();
  const ctaRef = usePulseOnView();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 4);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.color.background,
        backgroundImage: `radial-gradient(${theme.color.raised} 1px, transparent 1px)`,
        backgroundSize: "30px 30px",
        color: theme.color.text,
        fontFamily: theme.font.body,
      }}
    >
      {/* HEADER */}
      <header
        className="tp-landing-section"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          paddingTop: 0,
          paddingBottom: 0,
          height: 64,
          borderBottom: `1px solid ${theme.color.border}`,
          background: scrolled ? `${theme.color.background}dd` : "transparent",
          backdropFilter: scrolled ? "blur(8px)" : "none",
          transition: "background 0.2s ease, backdrop-filter 0.2s ease",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
          True<span style={{ color: theme.color.accent }}>Positive</span>
        </div>
        <nav className="tp-landing-header-nav">
          <a
            href="#how-it-works"
            style={{ color: theme.color.textMuted, fontSize: 14, fontWeight: 500, textDecoration: "none" }}
          >
            How it works
          </a>
          <a
            href="#features"
            style={{ color: theme.color.textMuted, fontSize: 14, fontWeight: 500, textDecoration: "none" }}
          >
            Features
          </a>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <OutlineLink
            to="/onboarding"
            style={{ width: "auto", whiteSpace: "nowrap", padding: "9px 18px", fontSize: 14 }}
          >
            Create account
          </OutlineLink>
          <PrimaryLink to="/login" style={{ width: "auto", whiteSpace: "nowrap", padding: "9px 20px", fontSize: 14 }}>
            Log in
          </PrimaryLink>
        </div>
      </header>

      {/* HERO */}
      <section
        className="tp-landing-section"
        style={{
          minHeight: "calc(100vh - 64px)",
          boxSizing: "border-box",
          paddingTop: 48,
          paddingBottom: 48,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 56,
          alignItems: "center",
        }}
      >
        <div style={{ flex: "1 1 420px", minWidth: 300, maxWidth: 640 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 1.5,
              fontFamily: theme.font.mono,
              color: theme.color.accent,
              textTransform: "uppercase",
              marginBottom: 18,
            }}
          >
            Threat detection &amp; triage
          </div>
          <h1 style={{ fontSize: "clamp(32px, 4.4vw, 52px)", lineHeight: 1.12, fontWeight: 700, margin: "0 0 20px" }}>
            Find the alert that matters, before it becomes an incident.
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              color: theme.color.textMuted,
              maxWidth: 480,
              margin: "0 0 32px",
            }}
          >
            TruePositive ingests Windows, syslog, and Sysmon events, scores every alert against your detection rules,
            and puts only what&apos;s worth an analyst&apos;s time in front of your team.
          </p>

          <div className="tp-landing-hero-stats" style={{ display: "flex", marginBottom: 36 }}>
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div style={{ fontSize: 26, fontWeight: 700, color: theme.color.accent }}>{stat.value}</div>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: theme.color.textFaint,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    marginTop: 4,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: 18 }}>
            <PrimaryLink to="/onboarding" style={{ width: "auto", padding: "14px 28px", fontSize: 15 }}>
              Create your workspace
            </PrimaryLink>
            <a
              href="#how-it-works"
              className="tp-link-hover-underline"
              style={{
                color: theme.color.textMuted,
                opacity: 0.65,
                fontWeight: 600,
                fontSize: 14,
                whiteSpace: "nowrap",
              }}
            >
              See how it works
            </a>
          </div>
        </div>

        <div style={{ position: "relative", flex: "1 1 420px", minWidth: 340, maxWidth: 680 }}>
          <MiniDashboard defaultTab="overview" />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="tp-landing-section" style={{ paddingBottom: 110 }}>
        {/* Narrower inner column, deliberately -- long paragraph lines are
            hard to read edge-to-edge on a wide monitor, so this column
            recenters within the now full-width section above. */}
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: 1.5,
                color: theme.color.textFaint,
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              How it works
            </div>
            <h2 style={{ fontSize: "clamp(26px, 3.2vw, 38px)", fontWeight: 700, margin: 0 }}>
              From raw logs to a ranked, traceable alert
            </h2>
          </div>

          <div style={{ position: "relative", padding: "0 4px" }}>
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                bottom: 0,
                width: 1,
                background: `linear-gradient(180deg, ${theme.color.accent}, transparent)`,
                transform: "translateX(-0.5px)",
              }}
            />
            {HOW_IT_WORKS.map((step, i) => {
              const left = i % 2 === 0;
              return (
                <div
                  key={step.n}
                  ref={registerReveal(left ? "left" : "right")}
                  className="tp-landing-timeline-row"
                  style={{
                    ...revealBase,
                    marginBottom: i < HOW_IT_WORKS.length - 1 ? 64 : 0,
                    transform: `translateX(${left ? -32 : 32}px)`,
                  }}
                >
                  <div style={{ textAlign: left ? "right" : "left", paddingRight: left ? 8 : 0 }}>
                    {left && <StepBody step={step} icon={PIPELINE_ICONS[i]} />}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", paddingTop: 6 }}>
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: theme.color.accent,
                        boxShadow: `0 0 0 4px ${theme.color.background}, 0 0 0 6px ${theme.color.accent}44`,
                      }}
                    />
                  </div>
                  <div style={{ textAlign: left ? "right" : "left", paddingLeft: left ? 0 : 8 }}>
                    {!left && <StepBody step={step} icon={PIPELINE_ICONS[i]} align="left" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="tp-landing-section" style={{ paddingBottom: 110 }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 1.5,
              color: theme.color.textFaint,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Features
          </div>
          <h2 style={{ fontSize: "clamp(26px, 3.2vw, 38px)", fontWeight: 700, margin: "0 0 12px" }}>
            Built for lean security teams
          </h2>
          <p style={{ fontSize: 16, color: theme.color.textMuted, maxWidth: 500, margin: "0 auto" }}>
            Everything you need to go from noisy logs to confident decisions, without another dashboard to babysit.
          </p>
        </div>

        <div className="tp-landing-features-grid" style={{ display: "grid" }}>
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} registerReveal={registerReveal} />
          ))}
        </div>
      </section>

      {/* SHOWCASE */}
      <section className="tp-landing-section" style={{ paddingBottom: 120, textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(24px, 3.4vw, 42px)", fontWeight: 700, margin: "0 0 16px" }}>
          See the full picture, not just the alert
        </h2>
        <p
          style={{
            fontSize: 17,
            color: theme.color.textMuted,
            maxWidth: 540,
            margin: "0 auto 48px",
            lineHeight: 1.6,
          }}
        >
          Every alert opens with the context and history behind it — not just a raw log line.
        </p>
        {/* Capped well below the section's full width and recentered --
            it's real UI content now, not an image, so there's no reason to
            stretch it edge to edge; a dense, realistically-proportioned
            app window reads better than a wide, sparse one. Opens straight
            to the Alerts tab with a2's detail pane already expanded, so
            the "context and history" copy above has something concrete to
            point at; a visitor can still click through to
            Overview/Incidents or close the detail pane and open a
            different alert. */}
        <div ref={showcaseRef} style={{ maxWidth: 760, margin: "0 auto" }}>
          <MiniDashboard defaultTab="alerts" defaultAlertId="a2" />
        </div>
      </section>

      {/* CTA BAND -- deliberately narrower than the other (now full-width)
          sections: it's a self-contained, fully centered card (border +
          background of its own), not a left-aligned text block, so a
          narrower width here reads as an intentional callout rather than
          unused space. */}
      <section className="tp-landing-section" style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 90 }}>
        <div
          ref={ctaRef}
          className="tp-landing-cta-card"
          style={{
            background: `linear-gradient(135deg, ${theme.color.raised} 0%, ${theme.color.background} 100%)`,
            border: `1px solid ${theme.color.border}`,
            borderRadius: 20,
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "clamp(24px, 3.2vw, 40px)", fontWeight: 700, margin: "0 0 14px" }}>
            Stop drowning in alerts.
          </h2>
          <p style={{ fontSize: 17, color: theme.color.textMuted, maxWidth: 460, margin: "0 auto 36px" }}>
            Create your workspace and see how your logs turn into ranked, traceable alerts.
          </p>
          <PrimaryLink
            to="/onboarding"
            style={{ width: "auto", display: "inline-block", padding: "14px 32px", fontSize: 15 }}
          >
            Create your workspace
          </PrimaryLink>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        className="tp-landing-section"
        style={{ borderTop: `1px solid ${theme.color.border}`, paddingTop: 64, paddingBottom: 32 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 40,
            marginBottom: 32,
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
              True<span style={{ color: theme.color.accent }}>Positive</span>
            </div>
            <div style={{ fontSize: 13.5, color: theme.color.textFaint, maxWidth: 260, lineHeight: 1.6 }}>
              Log analysis and alert triage built to teach security operations, not another console for veterans.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                color: theme.color.textFaint,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Product
            </div>
            <a href="#features" style={{ fontSize: 14, color: theme.color.textMuted }}>
              Features
            </a>
            <a href="#how-it-works" style={{ fontSize: 14, color: theme.color.textMuted }}>
              How it works
            </a>
            <Link to="/login" style={{ fontSize: 14, color: theme.color.textMuted }}>
              Log in
            </Link>
          </div>
        </div>
        <div
          style={{
            borderTop: `1px solid ${theme.color.border}`,
            paddingTop: 20,
            fontSize: 12,
            color: theme.color.textFaint,
          }}
        >
          Built for lean security teams.
        </div>
      </footer>
    </div>
  );
}

function StepBody({ step, icon: Icon, align }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: align === "left" ? "flex-start" : "flex-end",
          marginBottom: 8,
        }}
      >
        {align === "left" && <Icon size={18} color={theme.color.accent} strokeWidth={2} />}
        <div style={{ fontSize: 30, fontWeight: 700, color: theme.color.accent }}>{step.n}</div>
        {align !== "left" && <Icon size={18} color={theme.color.accent} strokeWidth={2} />}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{step.title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: theme.color.textMuted }}>{step.desc}</div>
    </div>
  );
}

function FeatureCard({ feature, registerReveal }) {
  const [hover, setHover] = useState(false);
  const Icon = feature.icon;
  return (
    <div
      ref={registerReveal("up")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={feature.span ? "tp-landing-feature-card-span" : undefined}
      style={{
        ...revealBase,
        background: theme.color.surface,
        border: `1px solid ${hover ? theme.color.accent : theme.color.border}`,
        borderRadius: theme.radius.lg,
        padding: 32,
        position: "relative",
        overflow: "hidden",
        transform: "translateY(24px)",
        boxShadow: hover ? `0 20px 40px ${theme.color.accent}1a` : "none",
        transition: "opacity 0.6s ease-out, transform 0.6s ease-out, border-color 0.3s ease, box-shadow 0.3s ease",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: theme.radius.md,
          background: theme.color.raised,
          color: theme.color.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>{feature.title}</div>
      <div
        style={{ fontSize: 14, lineHeight: 1.6, color: theme.color.textMuted, maxWidth: feature.span ? 420 : "none" }}
      >
        {feature.desc}
      </div>
    </div>
  );
}

const miniPillBase = {
  fontSize: 10,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 999,
  whiteSpace: "nowrap",
};

const miniActionBtnBase = {
  fontSize: 11.5,
  fontWeight: 700,
  padding: "6px 12px",
  borderRadius: theme.radius.sm,
  cursor: "default",
};

// Fixed so switching tabs never resizes the mockup -- Overview (the tallest
// pane, thanks to the stat grid + chart) sets the floor; Alerts/Incidents/
// the alert-detail pane all pad up to match it instead of the whole
// MiniDashboard box visibly shrinking and growing as you click around.
const MINI_PANE_MIN_HEIGHT = 484;

function MiniDashboard({ defaultTab = "overview", defaultAlertId = null }) {
  const [tab, setTab] = useState(defaultTab);
  const [openAlertId, setOpenAlertId] = useState(defaultAlertId);
  const openAlert = MOCK_ALERTS.find((a) => a.id === openAlertId) || null;
  const paneKey = tab === "alerts" ? (openAlert ? `alert-${openAlert.id}` : "alerts") : tab;

  return (
    <div
      style={{
        borderRadius: theme.radius.lg,
        border: `1px solid ${theme.color.raised}`,
        background: `linear-gradient(135deg, ${theme.color.raised} 0%, ${theme.color.background} 100%)`,
        boxShadow: `0 50px 110px -30px rgba(0,0,0,0.85), 0 0 90px -20px ${theme.color.accent}33`,
        overflow: "hidden",
      }}
    >
      {/* Fake browser chrome -- purely decorative, matches the real app's URL. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderBottom: `1px solid ${theme.color.raised}`,
        }}
      >
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: theme.color.severity.critical }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: theme.color.severity.medium }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: theme.color.severity.ok }} />
        <div style={{ marginLeft: 8, fontFamily: theme.font.mono, fontSize: 13.5, color: theme.color.textMuted }}>
          app.truepositive.io
        </div>
      </div>

      {/* Fake app shell -- a real, clickable, drastically simplified stand-in
          for the actual Overview/Alerts/Incidents pages. Sidebar is
          icon-over-label (rather than the real app's icon-beside-label) so
          it stays legible down to the visual column's 360px minWidth. */}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div
          style={{
            width: 76,
            flexShrink: 0,
            borderRight: `1px solid ${theme.color.raised}`,
            padding: "14px 6px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {MINI_NAV.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setTab(item.key);
                  if (item.key !== "alerts") setOpenAlertId(null);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "9px 2px",
                  borderRadius: theme.radius.md,
                  border: "none",
                  cursor: "pointer",
                  background: active ? theme.color.raised : "transparent",
                  fontFamily: theme.font.body,
                  transition: "background 0.25s ease",
                }}
              >
                <Icon
                  size={16}
                  strokeWidth={2}
                  color={active ? theme.color.accent : theme.color.textMuted}
                  style={{ transition: "color 0.25s ease" }}
                />
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: active ? 700 : 500,
                    color: active ? theme.color.text : theme.color.textMuted,
                    lineHeight: 1.1,
                    transition: "color 0.25s ease",
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0, padding: 22, minHeight: MINI_PANE_MIN_HEIGHT, boxSizing: "border-box" }}>
          <div key={paneKey} className="tp-mini-pane-enter">
            {tab === "overview" && <MiniOverviewPane />}
            {tab === "alerts" &&
              (openAlert ? (
                <MiniAlertDetailPane alert={openAlert} onClose={() => setOpenAlertId(null)} />
              ) : (
                <MiniAlertsPane onOpen={setOpenAlertId} />
              ))}
            {tab === "incidents" && <MiniIncidentsPane />}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniPaneHeading({ eyebrow, title }) {
  return (
    <>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 1,
          color: theme.color.textFaint,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {eyebrow}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>{title}</div>
    </>
  );
}

function MiniOverviewPane() {
  const gradientId = useId();
  return (
    <div>
      <MiniPaneHeading eyebrow="Overview" title="Detection posture" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", marginBottom: 20 }}>
        {MOCK_STATS.map((stat, i) => (
          <div
            key={stat.label}
            style={{
              padding: "14px 18px",
              borderRight: i % 2 === 0 ? `1px solid ${theme.color.raised}` : "none",
              borderBottom: i < 2 ? `1px solid ${theme.color.raised}` : "none",
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                color: theme.color.textFaint,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 8,
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontSize: 27,
                fontWeight: 700,
                color: stat.tone === "critical" ? theme.color.severity.critical : theme.color.text,
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>
      <div style={{ border: `1px solid ${theme.color.raised}`, borderRadius: theme.radius.md, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 10 }}>Events over last 24h</div>
        <svg viewBox="0 0 300 110" width="100%" height="110" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.color.accent} stopOpacity="0.35" />
              <stop offset="100%" stopColor={theme.color.accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,83 L30,55 L60,73 L90,37 L120,65 L150,77 L180,45 L210,70 L240,28 L270,55 L300,10 L300,110 L0,110 Z"
            fill={`url(#${gradientId})`}
            stroke="none"
          />
          <polyline
            points="0,83 30,55 60,73 90,37 120,65 150,77 180,45 210,70 240,28 270,55 300,10"
            fill="none"
            stroke={theme.color.accent}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

function MiniAlertsPane({ onOpen }) {
  return (
    <div>
      <MiniPaneHeading eyebrow="Alerts" title="Active alerts" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {MOCK_ALERTS.map((alert) => {
          const status = STATUS_STYLE[alert.status];
          return (
            <button
              key={alert.id}
              type="button"
              onClick={() => onOpen(alert.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
                padding: "9px 12px",
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.color.raised}`,
                background: "transparent",
                cursor: "pointer",
                fontFamily: theme.font.body,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: theme.color.severity[alert.severity],
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.color.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {alert.rule}
                </div>
                <div style={{ fontSize: 11, color: theme.color.textFaint }}>{alert.time}</div>
              </div>
              <span style={{ ...miniPillBase, background: status.bg, color: status.text }}>{status.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MiniAlertDetailPane({ alert, onClose }) {
  const status = STATUS_STYLE[alert.status];
  return (
    <div>
      <MiniPaneHeading eyebrow="Alerts" title="Active alerts" />
      <div
        style={{
          border: `1px solid ${theme.color.raised}`,
          borderRadius: theme.radius.md,
          padding: 14,
          background: theme.color.surface,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, paddingRight: 12, lineHeight: 1.4 }}>
            {alert.rule} — {alert.detail}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close alert detail"
            style={{
              background: "none",
              border: "none",
              color: theme.color.textFaint,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: theme.color.textFaint, marginBottom: 2 }}>SEVERITY</div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: theme.color.severity[alert.severity] }}>
              {SEVERITY_LABEL[alert.severity]}
            </span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: theme.color.textFaint, marginBottom: 2 }}>STATUS</div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: status.text }}>{status.label}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: theme.color.textFaint, marginBottom: 2 }}>SOURCE</div>
            <span style={{ fontSize: 12.5 }}>{alert.source}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: theme.color.textFaint, marginBottom: 2 }}>DETECTED</div>
            <span style={{ fontSize: 12.5 }}>{alert.time}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...miniActionBtnBase, background: theme.color.accent, color: theme.color.background }}>
            Acknowledge
          </span>
          <span
            style={{
              ...miniActionBtnBase,
              background: "transparent",
              border: `1px solid ${theme.color.borderStrong}`,
              color: theme.color.textMuted,
            }}
          >
            Resolve
          </span>
          <span
            style={{
              ...miniActionBtnBase,
              background: "transparent",
              border: `1px solid ${theme.color.borderStrong}`,
              color: theme.color.textMuted,
            }}
          >
            Link to incident
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniIncidentsPane() {
  return (
    <div>
      <MiniPaneHeading eyebrow="Incidents" title="Tracked incidents" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {MOCK_INCIDENTS.map((incident) => {
          const status = STATUS_STYLE[incident.status];
          return (
            <div
              key={incident.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.color.raised}`,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: theme.color.severity[incident.severity],
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {incident.title}
                </div>
                <div style={{ fontSize: 11, color: theme.color.textFaint }}>{incident.assignee}</div>
              </div>
              <span style={{ ...miniPillBase, background: status.bg, color: status.text }}>{status.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
