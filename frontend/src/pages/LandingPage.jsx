import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { theme } from "../styles/theme";
import { PrimaryLink, OutlineLink } from "../components/auth/fields";
import LivePipeline from "../components/landing/LivePipeline";
import LiveDashboard from "../components/landing/LiveDashboard";
import FeatureTabs from "../components/landing/FeatureTabs";
import { useLiveDemo } from "../components/landing/useLiveDemo";
import "./landing.css";

// Marketing page (2026-11-06). Same dark tokens, font, buttons and dashboard
// components as the app, so the page is a preview of the product rather
// than a separate look. Motion comes from one simulation (useLiveDemo): an
// event arrives, a rule matches, an alert appears, and the dashboard
// updates, the same pipeline the product runs. It pauses while the tab is
// hidden and stays still for prefers-reduced-motion.

const REPO_URL = "https://github.com/gncrlatienza-eng/truepositive";

const STEPS = [
  {
    title: "Install the agent",
    body: "Download the Windows installer from your dashboard and paste in the three values it shows. It starts with Windows and sends new events over HTTPS.",
  },
  {
    title: "Rules check every event",
    body: "Detection rules mapped to MITRE ATT&CK score each event as it arrives, and known-bad IPs, domains and hashes from the threat feed are matched too.",
  },
  {
    title: "Read what happened",
    body: "Anything that matters becomes an alert that says what happened, on which device, and why the rule fired.",
  },
];

const LIMITS = [
  {
    title: "Windows only, for now",
    body: "The agent collects Windows event logs. Linux collection exists in the code but isn't tested yet.",
  },
  {
    title: "The installer isn't signed",
    body: "Windows SmartScreen warns the first time you run it. Choose More info, then Run anyway.",
  },
  {
    title: "Built to learn from",
    body: "A portfolio project and a teaching tool, not a replacement for a staffed security team.",
  },
  {
    title: "Open source",
    body: "MIT licensed. Use the hosted version or run the whole stack yourself with Docker Compose.",
  },
];

// Adds .is-visible the first time an element scrolls into view.
function useInView() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);
  return [ref, visible];
}

const buttonStyle = { display: "inline-flex", width: "auto", padding: "12px 24px", fontSize: 15 };

function Nav() {
  return (
    <header className="lp-nav">
      <div className="lp-wrap lp-nav-inner">
        <Link to="/" className="lp-logo">
          <img src="/tp-logo.png" alt="" width={28} height={28} />
          TruePositive
        </Link>
        <nav className="lp-nav-links" aria-label="Page sections">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href={REPO_URL}>GitHub</a>
        </nav>
        <div className="lp-nav-actions">
          <Link to="/login" className="lp-nav-login">
            Log in
          </Link>
          <PrimaryLink to="/demo" style={{ ...buttonStyle, padding: "8px 18px", fontSize: 14 }}>
            Try the demo
          </PrimaryLink>
        </div>
      </div>
    </header>
  );
}

function HowItWorks() {
  const [ref, visible] = useInView();
  return (
    <ol ref={ref} className={visible ? "lp-steps is-visible" : "lp-steps"}>
      {STEPS.map((step) => (
        <li key={step.title}>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

export default function LandingPage() {
  const live = useLiveDemo();

  return (
    <div
      className="lp"
      style={{
        "--lp-bg": theme.color.background,
        "--lp-surface": theme.color.surface,
        "--lp-raised": theme.color.raised,
        "--lp-border": theme.color.border,
        "--lp-border-strong": theme.color.borderStrong,
        "--lp-accent": theme.color.accent,
        "--lp-text": theme.color.text,
        "--lp-muted": theme.color.textMuted,
        "--lp-faint": theme.color.textFaint,
        "--lp-ok": theme.color.severity.ok,
        "--lp-font": theme.font.body,
        "--lp-mono": theme.font.mono,
      }}
    >
      <Nav />

      <main>
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <h1 className="lp-h1">Security logs, in plain English.</h1>
              <p className="lp-lede">
                TruePositive collects the event logs from your Windows PCs, checks each one against detection rules, and
                tells you what happened in words you don&apos;t need a security team to read.
              </p>
              <div className="lp-actions">
                <PrimaryLink to="/demo" style={buttonStyle}>
                  Try the live demo
                </PrimaryLink>
                <OutlineLink to="/onboarding" style={buttonStyle}>
                  Create a workspace
                </OutlineLink>
              </div>
              <p className="lp-note">The demo is a read-only workspace with sample data. No signup.</p>
            </div>
            <LivePipeline stream={live.stream} active={live.active} activeAt={live.activeAt} />
          </div>
        </section>

        <section className="lp-section" aria-labelledby="dashboard-heading">
          <div className="lp-wrap">
            <h2 id="dashboard-heading" className="lp-h2">
              Every device on one screen
            </h2>
            <p className="lp-section-lede">
              Which devices are reporting, how many events came in, and which alerts are still open. The alerts the feed
              above detects land here too.
            </p>
            <LiveDashboard dashboard={live.dashboard} />
            <p className="lp-caption">Sample data, drawn with the same components as the app.</p>
          </div>
        </section>

        <section id="how-it-works" className="lp-section" aria-labelledby="how-heading">
          <div className="lp-wrap">
            <h2 id="how-heading" className="lp-h2">
              How it works
            </h2>
            <HowItWorks />
          </div>
        </section>

        <section id="features" className="lp-section" aria-labelledby="features-heading">
          <div className="lp-wrap">
            <h2 id="features-heading" className="lp-h2">
              From alert to report
            </h2>
            <FeatureTabs />
          </div>
        </section>

        <section className="lp-section" aria-labelledby="limits-heading">
          <div className="lp-wrap">
            <h2 id="limits-heading" className="lp-h2">
              What it is and isn&apos;t
            </h2>
            <ul className="lp-limits">
              {LIMITS.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  {item.body}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="cta-heading">
          <div className="lp-wrap lp-cta">
            <h2 id="cta-heading" className="lp-h2">
              See it with sample data first.
            </h2>
            <div className="lp-actions">
              <PrimaryLink to="/demo" style={buttonStyle}>
                Try the live demo
              </PrimaryLink>
              <OutlineLink to="/onboarding" style={buttonStyle}>
                Create a workspace
              </OutlineLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <span>TruePositive, an open-source SIEM for small teams.</span>
          <nav aria-label="Footer">
            <a href={REPO_URL}>GitHub</a>
            <Link to="/login">Log in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
