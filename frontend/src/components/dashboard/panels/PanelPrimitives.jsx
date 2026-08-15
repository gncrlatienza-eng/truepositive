import { theme } from "../../../styles/theme";
import { ProgressBar } from "../../charts/ProgressBar";

export function BigStat({ value, label, color }) {
  return (
    <div>
      <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em", color: color || theme.color.text }}>
        {value}
      </div>
      {label && <div style={{ fontSize: 14, color: theme.color.textMuted, marginTop: 4 }}>{label}</div>}
    </div>
  );
}

export function Section({ title, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {title && (
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: theme.color.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {title}
          </div>
          {hint && <div style={{ fontSize: 11, color: theme.color.textFaint, marginTop: 2 }}>{hint}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: theme.color.textMuted, textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: theme.color.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function EmptyNote({ children = "No data yet." }) {
  return <div style={{ fontSize: 13, color: theme.color.textFaint }}>{children}</div>;
}

export function RowBar({ label, count, pct }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>
          {label}
        </span>
        <span style={{ color: theme.color.textMuted, flexShrink: 0 }}>
          {count} · {pct}%
        </span>
      </div>
      <ProgressBar pct={pct} />
    </div>
  );
}
