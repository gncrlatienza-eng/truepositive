import { Link } from "react-router-dom";
import "./landing.css";

// Marketing page, redesigned 2026-11-06 to read as a real product page rather
// than a generated one: light page, one typeface (Public Sans) with mono used
// only for actual log text, real screenshots instead of illustrations, and a
// single motion moment (the hero's alert arriving after the raw event).
// Every claim below is something the app does today; the "What it is and
// isn't" section states the real limits instead of implying more.

const REPO_URL = "https://github.com/gncrlatienza-eng/truepositive";

const STEPS = [
  {
    title: "Install the agent",
    body: "Download the Windows installer from your dashboard and paste in the three values it shows you. It starts with Windows and sends new events over HTTPS.",
  },
  {
    title: "Rules check every event",
    body: "Detection rules, mapped to MITRE ATT&CK, score each event as it arrives. Known-bad IPs, domains and hashes from the threat feed are matched too.",
  },
  {
    title: "Read what happened",
    body: "Anything that matters becomes an alert that says what happened, on which device, and why the rule fired, in plain language.",
  },
];

const FEATURES = [
  {
    title: "Alerts you can read",
    body: "Each alert explains the Windows event behind it, what the MITRE technique means, and what to check next.",
  },
  {
    title: "Rules you can change",
    body: "Write conditions on event type, severity or message text, and they apply to the next event. No redeploy.",
  },
  {
    title: "Incidents",
    body: "Group related alerts into an incident with a status, a response deadline and a full history of who changed what.",
  },
  {
    title: "Reports",
    body: "Daily, weekly, monthly and compliance reports are generated every night and export to PDF.",
  },
  {
    title: "Every device in one place",
    body: "See each PC on its own or all of them together, with a heartbeat that tells you when one stops reporting.",
  },
];

const LIMITS = [
  {
    title: "Windows only, for now",
    body: "The agent collects Windows event logs. Linux collection exists in the code but isn't tested.",
  },
  {
    title: "The installer isn't signed",
    body: "Windows SmartScreen will warn the first time you run it. Choose More info, then Run anyway.",
  },
  {
    title: "Built to learn from",
    body: "It's a portfolio project and a teaching tool, not a replacement for a staffed security team.",
  },
  {
    title: "Open source",
    body: "MIT licensed. Run the hosted version or self-host the whole stack with Docker Compose.",
  },
];

function Nav() {
  return (
    <header className="lp-nav">
      <div className="lp-wrap lp-nav-inner">
        <Link to="/" className="lp-logo">
          <img src="/tp-logo.png" alt="" width={26} height={26} />
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
          <Link to="/demo" className="lp-btn lp-btn-primary lp-btn-sm">
            Try the demo
          </Link>
        </div>
      </div>
    </header>
  );
}

function Translation() {
  return (
    <div className="lp-translate">
      <pre className="lp-raw lp-mono" aria-label="Raw Windows Security event">
        <span className="k">2026-11-06 09:14:22 WIN-SOC-01 Security</span>
        {"\n"}
        <span className="k">EventID </span>4625 <span className="k">An account failed to log on.</span>
        {"\n"}
        <span className="k">TargetUserName </span>admin <span className="k"> LogonType </span>3{"\n"}
        <span className="k">IpAddress </span>
        <span className="hl">203.0.113.47</span>
        <span className="k"> Status </span>0xC000006A
        {"\n"}
        <span className="k">… repeated </span>
        <span className="hl">14 times</span>
        <span className="k"> in 2 minutes</span>
      </pre>
      <p className="lp-raw-caption">What Windows records</p>

      <article className="lp-alert lp-alert-animate" aria-label="The same event as a TruePositive alert">
        <div className="lp-alert-head">
          <span className="lp-sev">High</span>
          <h2 className="lp-alert-title">Repeated failed sign-ins on WIN-SOC-01</h2>
        </div>
        <p className="lp-alert-body">
          Someone at 203.0.113.47 tried to sign in as admin over the network and got the password wrong 14 times in two
          minutes. That pattern usually means a password-guessing attempt.
        </p>
        <p className="lp-alert-why">
          <strong>Why this fired:</strong> the Failed login burst rule matched. MITRE ATT&amp;CK T1110, Brute Force.
        </p>
      </article>
      <p className="lp-alert-caption">What TruePositive shows you</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="lp">
      <Nav />

      <main>
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div>
              <h1 className="lp-h1">Security logs, in plain English.</h1>
              <p className="lp-lede">
                TruePositive collects the event logs from your Windows PCs, checks them against detection rules, and
                tells you what happened in words you don&apos;t need a security team to read.
              </p>
              <div className="lp-hero-actions">
                <Link to="/demo" className="lp-btn lp-btn-primary">
                  Try the live demo
                </Link>
                <Link to="/onboarding" className="lp-btn lp-btn-secondary">
                  Create a workspace
                </Link>
              </div>
              <p className="lp-hero-note">The demo opens a read-only workspace with sample data. No signup.</p>
            </div>
            <Translation />
          </div>
        </section>

        <section className="lp-section" aria-labelledby="overview-heading">
          <div className="lp-wrap">
            <h2 id="overview-heading" className="lp-h2">
              One dashboard for every device you look after
            </h2>
            <p className="lp-section-lede">
              Events, open alerts and which devices are reporting, for the last day, week or month.
            </p>
            <figure className="lp-shot">
              <img
                src="/marketing/hero-dashboard.png"
                width={1400}
                height={1265}
                alt="The TruePositive overview: event counts, active and critical alerts, a risk score and an events timeline"
              />
              <figcaption>The overview page, with sample data.</figcaption>
            </figure>
          </div>
        </section>

        <section id="how-it-works" className="lp-section" aria-labelledby="how-heading">
          <div className="lp-wrap">
            <h2 id="how-heading" className="lp-h2">
              How it works
            </h2>
            <ol className="lp-steps">
              {STEPS.map((step) => (
                <li key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="lp-section" aria-labelledby="features-heading">
          <div className="lp-wrap">
            <h2 id="features-heading" className="lp-h2">
              What you get
            </h2>
            <div className="lp-features-grid">
              <ul className="lp-features">
                {FEATURES.map((feature) => (
                  <li key={feature.title}>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                  </li>
                ))}
              </ul>
              <figure className="lp-shot">
                <img
                  src="/marketing/alert-detail.png"
                  width={660}
                  height={544}
                  loading="lazy"
                  alt="An alert opened in TruePositive: severity, rule, status, the source log line, and buttons to acknowledge, resolve, assign or link it to an incident"
                />
                <figcaption>An alert opened from the queue, with the log line that triggered it.</figcaption>
              </figure>
            </div>
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
            <div className="lp-hero-actions">
              <Link to="/demo" className="lp-btn lp-btn-primary">
                Try the live demo
              </Link>
              <Link to="/onboarding" className="lp-btn lp-btn-secondary">
                Create a workspace
              </Link>
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
