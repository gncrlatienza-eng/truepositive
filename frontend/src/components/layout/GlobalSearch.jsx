import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { theme } from "../../styles/theme";
import { listLogs } from "../../api/logs";
import { listAlerts, listRules } from "../../api/alerts";
import { SeverityBadge } from "../common/Badge";
import { useDelayedHover } from "../../hooks/useDelayedHover";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 4;

const EMPTY = { logs: { items: [], total: 0 }, alerts: { items: [], total: 0 }, rules: { items: [], total: 0 } };

function ResultGroup({ label, total, onSeeAll, children }) {
  return (
    <div style={{ borderBottom: `1px solid ${theme.color.border}` }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px 4px",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: theme.color.textFaint,
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {total > RESULT_LIMIT && (
          <button
            type="button"
            onClick={onSeeAll}
            style={{
              background: "none",
              border: "none",
              color: theme.color.accent,
              fontSize: 11,
              cursor: "pointer",
              padding: 0,
            }}
          >
            See all {total} →
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ResultRow({ onClick, primary, secondary, severity }) {
  return (
    <div
      role="option"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        cursor: "pointer",
      }}
      className="tp-search-result-row"
    >
      {severity && <SeverityBadge severity={severity} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            color: theme.color.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {primary}
        </div>
        {secondary && (
          <div
            style={{
              fontSize: 12,
              color: theme.color.textFaint,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {secondary}
          </div>
        )}
      </div>
    </div>
  );
}

// Real global search — was a decorative, non-functional box. Hits the same
// `q` param the Logs/Alerts pages' own search boxes already use
// (GET /logs?q=, GET /alerts?q=) plus rules (GET /alerts/rules?q=), so
// there's no new backend surface here, just wiring the existing one up.
export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(EMPTY);
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const navigate = useNavigate();
  const boxHover = useDelayedHover();

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_CHARS) {
      setResults(EMPTY);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      Promise.all([
        listLogs({ q: query, limit: RESULT_LIMIT }).catch(() => ({ items: [], total: 0 })),
        listAlerts({ q: query, limit: RESULT_LIMIT }).catch(() => ({ items: [], total: 0 })),
        listRules({ q: query }).catch(() => []),
      ]).then(([logsRes, alertsRes, rulesRes]) => {
        const rules = Array.isArray(rulesRes) ? rulesRes : [];
        setResults({
          logs: { items: logsRes.items || [], total: logsRes.total || 0 },
          alerts: { items: alertsRes.items || [], total: alertsRes.total || 0 },
          rules: { items: rules.slice(0, RESULT_LIMIT), total: rules.length },
        });
        setLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  function goTo(path) {
    setOpen(false);
    setQ("");
    navigate(path);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter" && q.trim().length >= MIN_CHARS) {
      // No single result selected — Enter defaults to the broadest surface
      // (raw logs) rather than guessing which of the three the user meant.
      goTo(`/app/logs?q=${encodeURIComponent(q.trim())}`);
    }
  }

  const query = q.trim();
  const hasResults = results.logs.items.length || results.alerts.items.length || results.rules.items.length;

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <div
        className={`tp-topbar-search tp-glass-subtle tp-glass-subtle-text${boxHover.hovered ? " tp-hover-brighten" : ""}`}
        onMouseEnter={boxHover.onMouseEnter}
        onMouseLeave={boxHover.onMouseLeave}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          borderRadius: 7,
          padding: "8px 10px 8px 12px",
          width: 220,
          boxSizing: "border-box",
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search events, IPs, rules"
          style={{
            flex: 1,
            minWidth: 0,
            background: "none",
            border: "none",
            outline: "none",
            fontSize: 13,
            color: theme.color.text,
            fontFamily: "inherit",
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontFamily: theme.font.mono,
            color: theme.color.textMuted,
            border: `1px solid ${theme.color.border}`,
            borderRadius: 3,
            padding: "1px 5px",
            flexShrink: 0,
          }}
        >
          ⌘K
        </span>
      </div>

      {open && query.length >= MIN_CHARS && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 360,
            maxHeight: 420,
            overflowY: "auto",
            background: "rgba(20, 20, 23, 0.78)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 12px 32px rgba(0, 0, 0, 0.45)",
            zIndex: 300,
          }}
        >
          {loading && <div style={{ padding: 16, fontSize: 13, color: theme.color.textFaint }}>Searching…</div>}
          {!loading && !hasResults && (
            <div style={{ padding: 16, fontSize: 13, color: theme.color.textFaint }}>
              No results for &quot;{query}&quot;
            </div>
          )}
          {!loading && results.alerts.items.length > 0 && (
            <ResultGroup
              label="Alerts"
              total={results.alerts.total}
              onSeeAll={() => goTo(`/app/alerts?q=${encodeURIComponent(query)}`)}
            >
              {results.alerts.items.map((a) => (
                <ResultRow
                  key={a.id}
                  severity={a.severity}
                  primary={a.title}
                  onClick={() => goTo(`/app/alerts?q=${encodeURIComponent(query)}`)}
                />
              ))}
            </ResultGroup>
          )}
          {!loading && results.logs.items.length > 0 && (
            <ResultGroup
              label="Logs"
              total={results.logs.total}
              onSeeAll={() => goTo(`/app/logs?q=${encodeURIComponent(query)}`)}
            >
              {results.logs.items.map((l) => (
                <ResultRow
                  key={l.id}
                  severity={l.severity}
                  primary={l.event_type}
                  secondary={l.message}
                  onClick={() => goTo(`/app/logs?q=${encodeURIComponent(query)}`)}
                />
              ))}
            </ResultGroup>
          )}
          {!loading && results.rules.items.length > 0 && (
            <ResultGroup label="Rules" total={results.rules.total} onSeeAll={() => goTo("/settings?tab=rules")}>
              {results.rules.items.map((r) => (
                <ResultRow
                  key={r.id}
                  severity={r.severity}
                  primary={r.name}
                  secondary={r.description}
                  onClick={() => goTo("/settings?tab=rules")}
                />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </div>
  );
}
