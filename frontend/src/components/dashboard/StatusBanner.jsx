import { theme } from "../../styles/theme";

export function StatusBanner({ banner }) {
  const ok = banner.events_flowing;
  const color = ok ? theme.color.severity.ok : theme.color.severity.high;
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
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
        {ok ? "Events flowing" : "No recent events"}
      </span>
      <span style={{ width: 1, height: 16, background: theme.color.border }} />
      <span style={{ fontSize: 15, color: theme.color.textMuted }}>
        Agents online{" "}
        <span style={{ color: theme.color.text, fontWeight: 600 }}>
          {banner.agents_online}/{banner.agents_total}
        </span>
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 14, color: theme.color.textMuted }}>
        {banner.events_per_min.toFixed(0)} events/min · updated {new Date(banner.updated_at).toLocaleTimeString()}
      </span>
    </div>
  );
}
