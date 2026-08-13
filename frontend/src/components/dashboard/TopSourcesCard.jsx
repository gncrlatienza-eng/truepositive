import { theme } from "../../styles/theme";
import { Card } from "../common/Card";
import { ProgressBar } from "../charts/ProgressBar";

export function TopSourcesCard({ rows }) {
  return (
    <Card
      title="Top sources"
      action={
        <span style={{ fontSize: 13, color: theme.color.textMuted, letterSpacing: "0.06em" }}>BY ALERT COUNT</span>
      }
    >
      <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.length === 0 && <div style={{ fontSize: 13, color: theme.color.textFaint }}>No source activity yet.</div>}
        {rows.map((s) => (
          <div key={s.source_id}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
              <span>
                {s.name}
                {s.host ? ` · ${s.host}` : ""}
              </span>
              <span style={{ color: theme.color.textMuted }}>{s.count}</span>
            </div>
            <ProgressBar pct={s.pct} />
          </div>
        ))}
      </div>
    </Card>
  );
}
