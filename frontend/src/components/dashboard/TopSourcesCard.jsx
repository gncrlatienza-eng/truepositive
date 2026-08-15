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
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
      bodyStyle={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
    >
      <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.length === 0 && <div style={{ fontSize: 13, color: theme.color.textFaint }}>No source activity yet.</div>}
        {rows.map((s) => (
          <div key={s.source_id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize: 14,
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {s.name}
              {s.host ? ` · ${s.host}` : ""}
            </span>
            <div style={{ width: 64, flexShrink: 0 }}>
              <ProgressBar pct={s.pct} />
            </div>
            <span style={{ color: theme.color.textMuted, fontSize: 13, width: 28, textAlign: "right", flexShrink: 0 }}>
              {s.count}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
