import { theme } from "../../styles/theme";
import { Card } from "../common/Card";
import { ProgressBar } from "../charts/ProgressBar";

export function SeverityBreakdownCard({ bars, onSelect }) {
  const empty = bars.every((b) => b.count === 0);
  return (
    <Card title="Severity breakdown">
      <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {empty && <div style={{ fontSize: 13, color: theme.color.textFaint }}>No active alerts yet.</div>}
        {bars.map((b) => (
          <div
            key={b.severity}
            onClick={() => onSelect(b.severity)}
            role="button"
            tabIndex={0}
            style={{ cursor: "pointer" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: theme.color.severity[b.severity],
                    display: "inline-block",
                  }}
                />
                {b.label}
              </span>
              <span style={{ color: theme.color.textMuted }}>
                {b.count} · {b.pct}%
              </span>
            </div>
            <ProgressBar pct={b.pct} color={theme.color.severity[b.severity]} />
          </div>
        ))}
      </div>
    </Card>
  );
}
