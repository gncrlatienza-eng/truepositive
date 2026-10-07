import { useEffect, useRef, useState } from "react";
import { theme } from "../../styles/theme";

function agoLabel(iso, nowMs) {
  if (!iso) return "no data received yet";
  const secs = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `last batch ${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `last batch ${mins}m ago`;
  return `last batch ${Math.round(mins / 60)}h ago`;
}

export function StatusBanner({ banner, onOpenAgents }) {
  const ok = banner.events_flowing;
  const color = ok ? theme.color.severity.ok : theme.color.severity.high;

  const agentsColor =
    banner.agents_total === 0
      ? theme.color.textFaint
      : banner.agents_online === banner.agents_total
        ? theme.color.severity.ok
        : banner.agents_online === 0
          ? theme.color.severity.critical
          : theme.color.severity.high;
  const agentsNeedAttention = banner.agents_total > 0 && banner.agents_online < banner.agents_total;

  // The dot and the rate text pulse once when a new batch actually reaches
  // the server (about every 30s per agent) -- not on every 2s dashboard
  // poll, and not on a decorative infinite loop, so the motion means
  // something.
  const prevReceivedAt = useRef(banner.last_received_at);
  const [beat, setBeat] = useState(false);
  useEffect(() => {
    if (prevReceivedAt.current !== banner.last_received_at) {
      prevReceivedAt.current = banner.last_received_at;
      setBeat(true);
      const t = setTimeout(() => setBeat(false), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [banner.last_received_at]);

  // "last batch Ns ago" ticks between polls without refetching.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "12px 18px",
        background: `${color}0F`,
        border: `1px solid ${color}40`,
        borderRadius: 8,
        flexWrap: "wrap",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color }}>
        <span
          className={beat ? "tp-pulse-once" : ""}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            display: "inline-block",
            "--tp-pulse-color": color,
          }}
        />
        {ok ? "Events flowing" : "No recent events"}
      </span>
      <span style={{ width: 1, height: 16, background: theme.color.border }} />
      <span
        onClick={onOpenAgents}
        role={onOpenAgents ? "button" : undefined}
        tabIndex={onOpenAgents ? 0 : undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 15,
          color: theme.color.textMuted,
          cursor: onOpenAgents ? "pointer" : "default",
        }}
      >
        <span
          className={agentsNeedAttention ? "tp-pulse-dot" : ""}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: agentsColor,
            display: "inline-block",
            flexShrink: 0,
            "--tp-pulse-color": agentsColor,
          }}
        />
        Agents online{" "}
        <span style={{ color: theme.color.text, fontWeight: 600 }}>
          {banner.agents_online}/{banner.agents_total}
        </span>
        {onOpenAgents && <span style={{ color: theme.color.accent }}> →</span>}
      </span>
      <span style={{ flex: 1 }} />
      <span
        className={beat ? "tp-kpi-flash" : ""}
        title="Average over the last 5 minutes, counted when logs reach the server"
        style={{ fontSize: 14, color: theme.color.textMuted, borderRadius: 4, padding: "2px 4px" }}
      >
        {banner.events_per_min.toFixed(0)} events/min · {agoLabel(banner.last_received_at, nowMs)}
      </span>
    </div>
  );
}
