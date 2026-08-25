import { useEffect, useMemo, useState } from "react";
import { Ban, CircleCheck, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { theme } from "../../styles/theme";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { CopyButton } from "../common/CopyButton";
import { extractIndicators } from "../../utils/iocExtract";
import { lookupIoc } from "../../api/intel";
import { createWhitelistEntry } from "../../api/whitelist";
import { formatTimestamp } from "../../utils/format";
import { useToast } from "../common/Toast";

const TYPE_LABEL = { ip: "IP", domain: "Domain", hash: "Hash" };

function scoreBand(score) {
  if (score == null) return { label: "Unknown", color: theme.color.textFaint };
  if (score < 25) return { label: "Low", color: theme.color.severity.ok };
  if (score < 50) return { label: "Medium", color: theme.color.severity.medium };
  if (score < 75) return { label: "Elevated", color: theme.color.severity.high };
  return { label: "High risk", color: theme.color.severity.critical };
}

function IndicatorSkeleton({ type, value, delayMs }) {
  return (
    <div
      className="tp-intel-card-in"
      style={{
        animationDelay: `${delayMs}ms`,
        padding: theme.space[3],
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.sm,
        background: theme.color.background,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Badge color={theme.color.textMuted}>{TYPE_LABEL[type]}</Badge>
        <span style={{ fontFamily: theme.font.mono, fontSize: 13 }}>{value}</span>
      </div>
      <div className="tp-intel-skeleton" style={{ height: 10, width: "70%", marginBottom: 6 }} />
      <div className="tp-intel-skeleton" style={{ height: 10, width: "40%" }} />
    </div>
  );
}

function IndicatorResult({ type, value, data, delayMs, onWhitelist, whitelisting }) {
  const band = scoreBand(data.score);
  const found = data.found_in_feed;
  const Icon = found ? ShieldAlert : data.log_count > 0 ? ShieldQuestion : ShieldCheck;

  return (
    <div
      className="tp-intel-card-in"
      style={{
        animationDelay: `${delayMs}ms`,
        padding: theme.space[3],
        border: `1px solid ${found ? band.color + "55" : theme.color.border}`,
        borderRadius: theme.radius.sm,
        background: theme.color.background,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <Icon size={14} color={found ? band.color : theme.color.textFaint} />
        <Badge color={theme.color.textMuted}>{TYPE_LABEL[type]}</Badge>
        <span style={{ fontFamily: theme.font.mono, fontSize: 13, flex: 1, minWidth: 0, wordBreak: "break-all" }}>
          {value}
        </span>
        <CopyButton value={value} />
        {found ? (
          <Badge color={band.color}>
            {band.label} · {data.score}
          </Badge>
        ) : (
          <Badge color={theme.color.textFaint}>Not in feed</Badge>
        )}
      </div>

      {found && (
        <div style={{ fontSize: 12, color: theme.color.textMuted, marginBottom: 6 }}>
          {data.category && <span style={{ textTransform: "capitalize" }}>{data.category.replace(/_/g, " ")}</span>}
          {data.description && <span> — {data.description}</span>}
        </div>
      )}

      {data.whitelist_status ? (
        <Badge color={data.whitelist_status === "block" ? theme.color.danger.text : theme.color.safe.text}>
          {data.whitelist_status === "block" ? "Blocked in whitelist" : "Allowed in whitelist"}
        </Badge>
      ) : (
        onWhitelist && (
          <div style={{ display: "flex", gap: 6 }}>
            <Button size="sm" variant="danger" disabled={whitelisting} onClick={() => onWhitelist("block")}>
              <Ban size={12} /> Block
            </Button>
            <Button size="sm" variant="safe" disabled={whitelisting} onClick={() => onWhitelist("allow")}>
              <CircleCheck size={12} /> Allow
            </Button>
          </div>
        )
      )}

      <div style={{ fontSize: 12, color: theme.color.textFaint, marginTop: 6 }}>
        {data.log_count > 0 ? (
          <>
            Seen {data.log_count} {data.log_count === 1 ? "time" : "times"} in your logs
            {data.first_seen && <> · first {formatTimestamp(data.first_seen)}</>}
            {data.last_seen && <> · last {formatTimestamp(data.last_seen)}</>}
          </>
        ) : (
          "Not seen elsewhere in your logs"
        )}
      </div>

      {(data.related_alerts?.length > 0 || data.related_incidents?.length > 0) && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {data.related_alerts?.length > 0 && (
            <Badge color={theme.color.accent}>
              {data.related_alerts.length} related {data.related_alerts.length === 1 ? "alert" : "alerts"}
            </Badge>
          )}
          {data.related_incidents?.length > 0 && (
            <Badge color={theme.color.accent}>
              {data.related_incidents.length} related {data.related_incidents.length === 1 ? "incident" : "incidents"}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// Real enrichment, not the old placeholder — extracts any IP/domain/hash-
// shaped token out of the log's own message (the agent doesn't ship
// structured EventData yet, so free text is all there is to scan — see
// utils/iocExtract.js) and looks each one up against the same curated feed
// + this org's own log/alert/incident history that IntelPage's manual
// search uses (GET /intel/lookup). Each card resolves independently as its
// own request lands, rather than waiting on the slowest one.
export function LogIntelPanel({ open, text }) {
  const indicators = useMemo(() => extractIndicators(text), [text]);
  const [results, setResults] = useState({});
  const [whitelisting, setWhitelisting] = useState(null);
  const showToast = useToast();

  useEffect(() => {
    if (!open) return;
    const found = extractIndicators(text);
    if (found.length === 0) {
      setResults({});
      return;
    }
    const initial = {};
    found.forEach((ind) => {
      initial[`${ind.type}:${ind.value}`] = { status: "loading" };
    });
    setResults(initial);

    found.forEach((ind) => {
      const key = `${ind.type}:${ind.value}`;
      lookupIoc(ind.type, ind.value)
        .then((data) => setResults((prev) => ({ ...prev, [key]: { status: "done", data } })))
        .catch(() => setResults((prev) => ({ ...prev, [key]: { status: "error" } })));
    });
  }, [open, text]);

  async function handleWhitelist(key, type, value, kind) {
    setWhitelisting(key);
    try {
      await createWhitelistEntry({ type, value, kind, reason: "Added from threat intel enrichment" });
      setResults((prev) => ({
        ...prev,
        [key]: { ...prev[key], data: { ...prev[key].data, whitelist_status: kind } },
      }));
      showToast(`${value} added to the ${kind === "block" ? "blocklist" : "allowlist"}.`, "success");
    } catch {
      showToast(`Could not ${kind} that indicator.`, "error");
    } finally {
      setWhitelisting(null);
    }
  }

  if (indicators.length === 0) {
    return (
      <div style={{ fontSize: 13, color: theme.color.textFaint, display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldQuestion size={14} />
        No IP, domain, or file-hash values found in this log to check.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.space[2] }}>
      {indicators.map((ind, i) => {
        const key = `${ind.type}:${ind.value}`;
        const result = results[key];
        if (!result || result.status === "loading") {
          return <IndicatorSkeleton key={key} type={ind.type} value={ind.value} delayMs={i * 60} />;
        }
        if (result.status === "error") {
          return (
            <div key={key} style={{ fontSize: 12, color: theme.color.textFaint }}>
              Could not look up {ind.value}.
            </div>
          );
        }
        return (
          <IndicatorResult
            key={key}
            type={ind.type}
            value={ind.value}
            data={result.data}
            delayMs={i * 60}
            whitelisting={whitelisting === key}
            onWhitelist={(kind) => handleWhitelist(key, ind.type, ind.value, kind)}
          />
        );
      })}
    </div>
  );
}
