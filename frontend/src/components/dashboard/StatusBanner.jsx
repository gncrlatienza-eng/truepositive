import { useEffect, useRef, useState } from "react";
import { theme } from "../../styles/theme";
import { formatFullTimestamp } from "../../utils/format";

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

  // Brief highlight on the "updated" timestamp so a real refresh (30s
  // auto-poll) is visible in the corner people are least likely to be
  // staring at, not just trusted to have happened.
  const prevUpdatedAt = useRef(banner.updated_at);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prevUpdatedAt.current !== banner.updated_at) {
      prevUpdatedAt.current = banner.updated_at;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [banner.updated_at]);
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
          className={ok ? "tp-pulse-dot" : ""}
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
        className={flash ? "tp-kpi-flash" : ""}
        style={{ fontSize: 14, color: theme.color.textMuted, borderRadius: 4, padding: "2px 4px" }}
      >
        {banner.events_per_min.toFixed(0)} events/min · updated{" "}
        <span style={{ fontFamily: theme.font.mono }}>{formatFullTimestamp(banner.updated_at)}</span>
      </span>
    </div>
  );
}
