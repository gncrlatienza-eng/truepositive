import { useState } from "react";
import { theme } from "../../styles/theme";
import { PillSelector } from "../common/PillSelector";
import { Badge, SeverityBadge } from "../common/Badge";

// Small previews of four screens, drawn with the app's own badges and
// tokens. The tab switch is the one piece of motion here, and it's the
// visitor's own action.

const TABS = [
  { id: "alerts", label: "Alerts" },
  { id: "incidents", label: "Incidents" },
  { id: "reports", label: "Reports" },
  { id: "intel", label: "Threat intel" },
];

const COPY = {
  alerts: {
    title: "Alerts that explain themselves",
    body: "Every alert shows the event behind it, what the MITRE technique means, and what to check next. Acknowledge it, escalate it, or link it to an incident.",
  },
  incidents: {
    title: "Incidents with a full history",
    body: "Group related alerts into one incident with a status, an owner and a response deadline. Every change is recorded, so you can see who did what and when.",
  },
  reports: {
    title: "Reports written every night",
    body: "Daily, weekly, monthly and compliance reports compare each period with the one before and export to PDF.",
  },
  intel: {
    title: "Threat intel checked against your logs",
    body: "Look up an IP, domain or file hash. TruePositive checks it against a curated feed and shows every log, alert and incident it appears in.",
  },
};

function Row({ label, children }) {
  return (
    <div className="lp-pane-row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function AlertsPane() {
  return (
    <>
      <div className="lp-pane-title">
        <SeverityBadge severity="critical" />
        New account added to Administrators
      </div>
      <Row label="Device">WIN-SOC-01</Row>
      <Row label="Rule">New admin account created</Row>
      <Row label="Technique">T1136.001 Create Account: Local</Row>
      <pre className="lp-pane-log">
        4732 A member was added to a security-enabled local group{"\n"}member=svc_backup2 group=Administrators
      </pre>
      <div className="lp-pane-actions">
        <span className="lp-chip is-primary">Acknowledge</span>
        <span className="lp-chip">Escalate</span>
        <span className="lp-chip">Link to incident</span>
      </div>
    </>
  );
}

function IncidentsPane() {
  const history = [
    ["09:41", "Status changed to investigating", "mreyes"],
    ["09:32", "Linked alert: Hidden, encoded PowerShell command", "mreyes"],
    ["09:30", "Assigned to mreyes", "jdoe"],
    ["09:28", "Created from alert: Repeated failed sign-ins", "auto"],
  ];
  return (
    <>
      <div className="lp-pane-title">
        <Badge color={theme.color.severity.high}>investigating</Badge>
        Password guessing on WIN-SOC-01
      </div>
      <Row label="Owner">mreyes</Row>
      <Row label="Response due">in 3h 12m</Row>
      <ol className="lp-pane-history">
        {history.map(([time, what, who]) => (
          <li key={time}>
            <span>{time}</span>
            <span>{what}</span>
            <span>{who}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

function ReportsPane() {
  const rows = [
    ["Events", "18,204", "16,190", "+12%"],
    ["Alerts", "41", "52", "−21%"],
    ["Critical alerts", "2", "5", "−60%"],
    ["Median time to acknowledge", "14 min", "31 min", "−55%"],
  ];
  return (
    <>
      <div className="lp-pane-title">Weekly report, Oct 27 to Nov 2</div>
      <table className="lp-pane-table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">This week</th>
            <th scope="col">Last week</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([metric, now, before, change]) => (
            <tr key={metric}>
              <th scope="row">{metric}</th>
              <td>{now}</td>
              <td>{before}</td>
              <td>{change}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function IntelPane() {
  return (
    <>
      <div className="lp-pane-search">203.0.113.47</div>
      <div className="lp-pane-title">
        <SeverityBadge severity="high" />
        Listed in the threat feed as a password-spraying source
      </div>
      <Row label="Seen in your logs">14 events, on 1 device</Row>
      <Row label="Alerts">1, Repeated failed sign-ins</Row>
      <Row label="Incidents">1, Password guessing on WIN-SOC-01</Row>
      <Row label="First seen">Today, 09:14</Row>
    </>
  );
}

const PANES = { alerts: AlertsPane, incidents: IncidentsPane, reports: ReportsPane, intel: IntelPane };

export default function FeatureTabs() {
  const [active, setActive] = useState("alerts");
  const Pane = PANES[active];
  return (
    <div className="lp-tabs">
      <PillSelector options={TABS} activeId={active} onSelect={setActive} />
      <div className="lp-tabs-body">
        <div className="lp-tabs-copy">
          <h3>{COPY[active].title}</h3>
          <p>{COPY[active].body}</p>
        </div>
        <div key={active} className="lp-pane" role="tabpanel" aria-label={`${COPY[active].title} preview`}>
          <Pane />
        </div>
      </div>
    </div>
  );
}
