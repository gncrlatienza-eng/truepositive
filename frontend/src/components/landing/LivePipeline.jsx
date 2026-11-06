import { useEffect, useState } from "react";
import { theme } from "../../styles/theme";
import { SeverityBadge } from "../common/Badge";

function clock(ms) {
  // 24-hour, like the timestamps in a real event log.
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function EventFeed({ stream }) {
  return (
    <div className="lp-feed" aria-label="Incoming Windows events (sample)">
      <div className="lp-feed-head">
        <span className="lp-live-dot" aria-hidden="true" />
        Incoming events
        <span className="lp-feed-sources">Security, PowerShell, System</span>
      </div>
      <ol className="lp-feed-lines">
        {stream.map((line) => (
          <li
            key={line.key}
            className={line.detection ? "lp-feed-line is-detection" : "lp-feed-line"}
            style={line.detection ? { "--lp-sev": theme.color.severity[line.detection.severity] } : undefined}
          >
            <span className="lp-feed-time">{clock(line.at)}</span>
            <span className="lp-feed-host">{line.host}</span>
            <span className="lp-feed-id">{line.id}</span>
            <span className="lp-feed-text">
              {line.text}
              {line.detail && <span className="lp-feed-detail"> {line.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AlertCard({ detection, detectedAt }) {
  const now = useNow();
  const secs = Math.max(0, Math.round((now - detectedAt) / 1000));
  return (
    <article className="lp-alert">
      <div className="lp-alert-head">
        <SeverityBadge severity={detection.severity} />
        <h2 className="lp-alert-title">{detection.title}</h2>
      </div>
      <p className="lp-alert-meta">
        {detection.host}, detected {secs < 2 ? "just now" : `${secs}s ago`}
      </p>
      <p className="lp-alert-summary">{detection.summary}</p>
      <p className="lp-alert-next">
        <span>What to do</span>
        {detection.next}
      </p>
      <dl className="lp-alert-facts">
        <div>
          <dt>Rule</dt>
          <dd>{detection.rule}</dd>
        </div>
        <div>
          <dt>MITRE ATT&amp;CK</dt>
          <dd>{detection.mitre}</dd>
        </div>
      </dl>
    </article>
  );
}

export default function LivePipeline({ stream, active, activeAt }) {
  return (
    <div className="lp-pipeline">
      <EventFeed stream={stream} />
      <div className="lp-pipeline-link" aria-hidden="true">
        <span key={activeAt} className="lp-pipeline-pulse" />
      </div>
      {/* Keyed on the detection time: each new alert remounts and plays its arrival once. */}
      <AlertCard key={activeAt} detection={active} detectedAt={activeAt} />
    </div>
  );
}
