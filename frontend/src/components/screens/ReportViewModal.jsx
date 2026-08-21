import { theme } from "../../styles/theme";
import Modal from "../common/Modal";

const TREND_ARROW = { up: "▲", down: "▼", flat: "•" };

function trendColor(trendGood) {
  if (trendGood == null) return theme.color.textFaint;
  return trendGood ? theme.color.severity.ok : theme.color.severity.critical;
}

function KpiRow({ kpis }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: theme.space[3],
        marginBottom: theme.space[5],
      }}
    >
      {kpis.map((k) => (
        <div
          key={k.label}
          style={{
            padding: theme.space[3],
            background: theme.color.background,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.color.border}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: theme.color.textFaint,
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {k.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 600 }}>{k.value ?? "—"}</span>
            {k.delta_pct != null && (
              <span style={{ fontSize: 11, fontFamily: theme.font.mono, color: trendColor(k.trend_good) }}>
                {TREND_ARROW[k.trend]} {Math.abs(k.delta_pct)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SimpleBars({ items, labelKey, valueKey }) {
  const max = Math.max(1, ...items.map((i) => i[valueKey]));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100, marginBottom: theme.space[5] }}>
      {items.map((item) => (
        <div
          key={item[labelKey]}
          title={`${item[labelKey]}: ${item[valueKey]}`}
          style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end" }}
        >
          <div
            style={{
              width: "100%",
              height: `${Math.round((item[valueKey] / max) * 100)}%`,
              background: theme.color.accent,
              opacity: 0.75,
              borderRadius: "2px 2px 0 0",
            }}
          />
        </div>
      ))}
    </div>
  );
}

// Displays a saved report's data — the exact shape depends on report.type,
// mirroring ReportsPage.jsx's per-type tabs but simplified (this is a
// review view, not an interactive dashboard).
export default function ReportViewModal({ open, onClose, report }) {
  if (!report) return null;

  const title = `${report.type.charAt(0).toUpperCase()}${report.type.slice(1)} Report — ${report.period_start} to ${report.period_end}`;
  const d = report.data ?? {};

  return (
    <Modal open={open} onClose={onClose} title={title} width={760}>
      {report.type === "compliance" ? (
        <div style={{ border: `1px solid ${theme.color.border}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
          <table className="tp-table">
            <thead>
              <tr>
                <th>Framework</th>
                <th>Control</th>
                <th>Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(d.framework_rows ?? []).map((row, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: theme.font.mono, fontSize: 12 }}>{row.framework}</td>
                  <td>{row.control}</td>
                  <td style={{ fontFamily: theme.font.mono }}>{row.value}</td>
                  <td style={{ textTransform: "capitalize" }}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : report.type === "monthly" ? (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: theme.color.textMuted, marginTop: 0 }}>
            {d.executive_summary}
          </p>
          {d.kpis && <KpiRow kpis={d.kpis} />}
        </>
      ) : (
        <>
          {d.kpis && <KpiRow kpis={d.kpis} />}
          {d.hour_bars?.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: theme.color.textMuted, marginBottom: theme.space[2] }}>
                Events by hour (today)
              </div>
              <SimpleBars items={d.hour_bars} labelKey="hour" valueKey="today_count" />
            </>
          )}
          {d.alerts_by_day?.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: theme.color.textMuted, marginBottom: theme.space[2] }}>
                Alerts by day
              </div>
              <SimpleBars items={d.alerts_by_day} labelKey="date" valueKey="count" />
            </>
          )}
          {d.top_event_types?.length > 0 && (
            <div style={{ marginBottom: theme.space[5] }}>
              <div style={{ fontSize: 12, color: theme.color.textMuted, marginBottom: theme.space[2] }}>
                Top event types
              </div>
              {d.top_event_types.map((e) => (
                <div
                  key={e.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    padding: "4px 0",
                    borderBottom: `1px solid ${theme.color.border}`,
                  }}
                >
                  <span>{e.name}</span>
                  <span style={{ fontFamily: theme.font.mono, color: theme.color.textMuted }}>{e.count}</span>
                </div>
              ))}
            </div>
          )}
          {d.trending_rules?.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: theme.color.textMuted, marginBottom: theme.space[2] }}>
                Trending rules
              </div>
              {d.trending_rules.map((r) => (
                <div
                  key={r.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    padding: "4px 0",
                    borderBottom: `1px solid ${theme.color.border}`,
                  }}
                >
                  <span>{r.name}</span>
                  <span style={{ fontFamily: theme.font.mono, color: theme.color.textMuted }}>{r.count}×</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
