import { theme } from "../../styles/theme";
import { Card } from "../common/Card";
import { ProgressBar } from "../charts/ProgressBar";

export function TopAlertTypesCard({ rows, onSelect }) {
  return (
    <Card
      title="Top alert types"
      action={<span style={{ fontSize: 13, color: theme.color.textMuted, letterSpacing: "0.06em" }}>BY RULE</span>}
    >
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
        {rows.length === 0 && <div style={{ fontSize: 13, color: theme.color.textFaint }}>No alerts yet.</div>}
        {rows.map((r) => (
          <div
            key={r.rule_id}
            onClick={() => onSelect(r.rule_id)}
            role="button"
            tabIndex={0}
            style={{ cursor: "pointer" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, marginBottom: 8 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>
                {r.label}
              </span>
              <span style={{ color: theme.color.textMuted, flexShrink: 0 }}>
                {r.count} · {r.pct}%
              </span>
            </div>
            <ProgressBar pct={r.pct} height={10} />
          </div>
        ))}
      </div>
    </Card>
  );
}
