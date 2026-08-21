import { theme } from "../../styles/theme";
import Modal from "../common/Modal";
import { LOCAL_SOURCE_CATALOG } from "../../data/logSourceCatalog";
import { computeSourceHealth, HEALTH_COLOR_HEX } from "../../utils/sourceHealth";
import { formatFullTimestamp } from "../../utils/format";

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const ICON_PATHS = {
  ok: <path d="M5 10.5l3.2 3.2L15 6.5" />,
  warn: (
    <>
      <path d="M10 2.5l7.5 13H2.5z" />
      <path d="M10 8v3.2" />
      <path d="M10 13.8h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.2 7.2l5.6 5.6M12.8 7.2l-5.6 5.6" />
    </>
  ),
  paused: (
    <>
      <rect x="6.5" y="5.5" width="2.4" height="9" rx="0.6" />
      <rect x="11.1" y="5.5" width="2.4" height="9" rx="0.6" />
    </>
  ),
};

function StatusIcon({ kind, color }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[kind] || ICON_PATHS.warn}
    </svg>
  );
}

function StatTile({ label, children, mono }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: theme.color.background,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.md,
        padding: theme.space[3],
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.color.textFaint, marginBottom: 4, letterSpacing: 0.3 }}>
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: 13,
          color: theme.color.text,
          fontFamily: mono ? theme.font.mono : theme.font.body,
          wordBreak: "break-word",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Chip({ color, children }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

const ICON_KIND = { green: "ok", yellow: "warn", red: "error", grey: "paused" };

// Named, container-click detail view for a data source — the health badge
// here is never guessed: it's derived from the agent's own last-reported
// collection outcome (see utils/sourceHealth.js), so "not working" always
// comes with a real reason.
export default function SourceDetailModal({ open, onClose, source, agents }) {
  if (!source) return null;

  const health = computeSourceHealth(source, agents);
  const colorKey = HEALTH_COLOR_HEX[health.color];
  const statusColor = colorKey ? theme.color.severity[colorKey] : theme.color.textMuted;
  const iconKind = ICON_KIND[health.color];

  const catalogEntry = source.type === "local" ? LOCAL_SOURCE_CATALOG.find((c) => c.path === source.path) : null;
  const description =
    catalogEntry?.description ||
    (source.type === "remote"
      ? `Reads from ${source.host || "a remote host"} over ${source.protocol?.toUpperCase() || "SSH"}.`
      : "Custom source — no catalog description available.");

  return (
    <Modal open={open} onClose={onClose} title={source.name} width={480}>
      {/* Status */}
      <div
        style={{
          display: "flex",
          gap: theme.space[3],
          alignItems: "flex-start",
          background: hexToRgba(statusColor, 0.1),
          border: `1px solid ${hexToRgba(statusColor, 0.35)}`,
          borderRadius: theme.radius.md,
          padding: theme.space[4],
          marginBottom: theme.space[4],
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: hexToRgba(statusColor, 0.18),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <StatusIcon kind={iconKind} color={statusColor} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: statusColor, marginBottom: 2 }}>{health.label}</div>
          <div style={{ fontSize: 13, color: theme.color.textMuted, lineHeight: 1.5 }}>{health.reason}</div>
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: theme.space[4] }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.space[2],
            fontSize: 11,
            fontWeight: 600,
            color: theme.color.textFaint,
            letterSpacing: 0.3,
            marginBottom: 6,
          }}
        >
          WHAT IT RECORDS
          {catalogEntry?.recommended && <Chip color={theme.color.severity.ok}>Recommended</Chip>}
          {catalogEntry?.needsAdmin && <Chip color={theme.color.severity.high}>Needs Administrator</Chip>}
        </div>
        <div style={{ fontSize: 14, color: theme.color.text, lineHeight: 1.5 }}>{description}</div>
      </div>

      {/* Meta */}
      <div style={{ display: "flex", gap: theme.space[3] }}>
        <StatTile label={source.type === "local" ? "Channel / path" : "Host"} mono>
          {source.type === "local" ? source.path || "—" : `${source.host}:${source.port}`}
        </StatTile>
        <StatTile label="Last collection attempt">
          {source.last_collected_at ? formatFullTimestamp(source.last_collected_at) : "Never reported yet"}
        </StatTile>
      </div>
    </Modal>
  );
}
