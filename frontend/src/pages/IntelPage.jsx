import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { theme } from "../styles/theme";
import {
  getFeedInfo,
  getMitreCoverage,
  getWorkspaceHits,
  linkIocToIncident,
  listFeedIndicators,
  lookupIoc,
} from "../api/intel";
import { createWhitelistEntry } from "../api/whitelist";
import { createRule } from "../api/alerts";
import { listIncidents } from "../api/incidents";
import { useToast } from "../components/common/Toast";
import { Button } from "../components/common/Button";
import { FieldLabel, Select, TextInput } from "../components/common/Input";
import { Badge, SeverityBadge } from "../components/common/Badge";
import { severityLabel } from "../utils/severity";
import { RadialGauge } from "../components/charts/RadialGauge";
import { ProgressBar } from "../components/charts/ProgressBar";
import Modal from "../components/common/Modal";
import { Card } from "../components/common/Card";
import { SetupLockOverlay } from "../components/common/SetupLockOverlay";

const RECENT_LOOKUPS_KEY = "tp_intel_recent_lookups";
const MAX_RECENT = 5;
const IOC_TYPES = [
  { value: "ip", label: "IP Address" },
  { value: "domain", label: "Domain" },
  { value: "hash", label: "File Hash (MD5/SHA-256)" },
];

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_LOOKUPS_KEY)) || [];
  } catch {
    return [];
  }
}
function saveRecent(list) {
  localStorage.setItem(RECENT_LOOKUPS_KEY, JSON.stringify(list));
}

function downloadBlob(blob, filename) {
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

function formatCategory(cat) {
  if (!cat) return "—";
  const lower = cat.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// ── Small shared card primitives (deliberately duplicated from
// ReportsPage.jsx's identical SectionCard/ProgressRow rather than adding a
// new shared file — matches this codebase's existing pattern of
// per-page-local copies of small display components, e.g. ReportViewModal's
// own KpiRow). ──────────────────────────────────────────────────────────────

// Delegates to the same shared Card every other page uses, so headers match
// pixel-for-pixel instead of a hand-rolled lookalike with different sizing.
function SectionCard({ title, badge, children }) {
  return (
    <Card
      title={title}
      action={badge && <span style={{ fontSize: 12, color: theme.color.textMuted, fontWeight: 600 }}>{badge}</span>}
      bodyStyle={{ padding: theme.space[4] }}
    >
      {children}
    </Card>
  );
}

function ProgressRow({ label, count, pct, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: theme.space[3], padding: `${theme.space[2]}px 0` }}>
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
        {label}
      </span>
      <div style={{ width: 100, flexShrink: 0 }}>
        <ProgressBar pct={pct} color={color} />
      </div>
      <span
        style={{
          fontSize: 13,
          color: theme.color.textMuted,
          width: 32,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {count}
      </span>
    </div>
  );
}

// ── Reputation gauge ─────────────────────────────────────────────────────────

function scoreBand(score) {
  if (score == null) return { label: "Unknown", color: theme.color.textFaint };
  if (score < 25) return { label: "Low", color: theme.color.severity.ok };
  if (score < 50) return { label: "Medium", color: theme.color.severity.medium };
  if (score < 75) return { label: "Elevated", color: theme.color.severity.high };
  return { label: "High", color: theme.color.severity.critical };
}

const REPUTATION_BANDS = [
  { max: 25, color: theme.color.severity.ok, label: "Low" },
  { max: 50, color: theme.color.severity.medium, label: "Medium" },
  { max: 75, color: theme.color.severity.high, label: "Elevated" },
  { max: 100, color: theme.color.severity.critical, label: "High" },
];

function ReputationGauge({ score }) {
  const band = scoreBand(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: theme.space[4] }}>
      <RadialGauge value={score ?? 0} bands={REPUTATION_BANDS} size={104} thickness={11} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 26, fontWeight: 600, fontFamily: theme.font.mono, color: band.color }}>
          {score ?? "—"}
        </span>
        <span style={{ fontSize: 11, color: theme.color.textFaint, fontFamily: theme.font.mono }}>/100 risk</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: band.color }}>{band.label}</span>
      </div>
    </div>
  );
}

function InfoCard({ title, badge, children }) {
  return (
    <div
      className="tp-card"
      style={{ padding: theme.space[4], minHeight: 220, display: "flex", flexDirection: "column", gap: theme.space[3] }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: 13,
            color: theme.color.textMuted,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ── MITRE coverage matrix (dashboard default view + per-lookup section) ─────

function MitreCoverageMatrix() {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    getMitreCoverage()
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;
  const { tactics, techniques } = data;
  const totalTechniques = tactics.reduce((s, t) => s + t.techniques_total, 0);
  const coveredTechniques = tactics.reduce((s, t) => s + t.techniques_covered, 0);

  return (
    <Card
      title="MITRE ATT&CK coverage"
      action={
        <span style={{ fontSize: 12, color: theme.color.textMuted, fontWeight: 600 }}>
          {coveredTechniques} of {totalTechniques} techniques covered
        </span>
      }
      bodyStyle={{ padding: 0 }}
    >
      <div style={{ padding: theme.space[4], display: "flex", gap: theme.space[3], overflowX: "auto" }}>
        {tactics.map((t) => {
          const pct = t.techniques_total ? t.techniques_covered / t.techniques_total : 0;
          return (
            <div
              key={t.tactic}
              title={`${t.techniques_covered}/${t.techniques_total} techniques covered`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                minWidth: 80,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  color: theme.color.textMuted,
                  textAlign: "center",
                  letterSpacing: "0.03em",
                }}
              >
                {t.tactic}
              </span>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 6,
                  border: `1px solid ${theme.color.border}`,
                  background: pct > 0 ? `rgba(8, 144, 177, ${0.15 + pct * 0.55})` : theme.color.background,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: pct > 0 ? theme.color.text : theme.color.textFaint,
                  }}
                >
                  {t.techniques_covered}/{t.techniques_total}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {techniques.length === 0 ? (
        <div
          style={{ padding: `0 ${theme.space[4]}px ${theme.space[4]}px`, fontSize: 14, color: theme.color.textMuted }}
        >
          Tag your detection rules with MITRE technique IDs to light up this matrix.{" "}
          <Link to="/settings?tab=rules" style={{ color: theme.color.accent }}>
            Go to Settings → Rules
          </Link>
        </div>
      ) : (
        <table className="tp-table">
          <thead>
            <tr>
              <th>Technique</th>
              <th>Name</th>
              <th>Tactic</th>
              <th>Rules tagged</th>
              <th>Alert count</th>
            </tr>
          </thead>
          <tbody>
            {techniques.map((row) => (
              <>
                <tr
                  key={row.technique_id}
                  onClick={() => setExpanded((c) => (c === row.technique_id ? null : row.technique_id))}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ fontFamily: theme.font.mono }}>{row.technique_id}</td>
                  <td>{row.technique_name || "—"}</td>
                  <td style={{ color: theme.color.textMuted }}>{row.tactic || "—"}</td>
                  <td>{row.rule_count}</td>
                  <td>{row.alert_count}</td>
                </tr>
                {expanded === row.technique_id && (
                  <tr key={`${row.technique_id}-d`}>
                    <td
                      colSpan={5}
                      style={{ background: theme.color.background, fontSize: 13, color: theme.color.textMuted }}
                    >
                      Rules: {row.rules.join(", ")}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ── Default dashboard view (renders before any lookup) ──────────────────────

function riskColor(score) {
  if (score >= 80) return theme.color.severity.critical;
  if (score >= 50) return theme.color.severity.medium;
  return theme.color.severity.ok;
}

function FeedHealthCard({ feedInfo, typeCounts }) {
  if (!feedInfo) return null;
  return (
    <div className="tp-card" style={{ padding: theme.space[5] }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: theme.space[3] }}>
        <span
          style={{ width: 8, height: 8, borderRadius: "50%", background: theme.color.severity.ok, flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: theme.color.textMuted,
          }}
        >
          Feed status
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{feedInfo.name}</div>
      <div style={{ fontSize: 13, color: theme.color.textMuted, marginBottom: theme.space[4] }}>
        {feedInfo.size} indicators · {feedInfo.type === "static" ? "Static feed" : feedInfo.type} · No auto-refresh
      </div>
      <div style={{ display: "flex", gap: theme.space[6] }}>
        {[
          ["IPs", typeCounts.ip || 0],
          ["Domains", typeCounts.domain || 0],
          ["Hashes", typeCounts.hash || 0],
        ].map(([label, count]) => (
          <div key={label}>
            <div
              style={{
                fontSize: 12,
                color: theme.color.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: theme.color.accent }}>{count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopRiskCard({ indicators, onLookup }) {
  return (
    <SectionCard title="Top indicators by risk">
      {indicators.length === 0 ? (
        <div style={{ fontSize: 13, color: theme.color.textFaint }}>Loading feed…</div>
      ) : (
        indicators.map((i) => (
          <div
            key={`${i.type}-${i.value}`}
            onClick={() => onLookup(i.type, i.value)}
            role="button"
            tabIndex={0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: theme.space[3],
              padding: `${theme.space[2]}px 0`,
              borderBottom: `1px solid ${theme.color.border}`,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontFamily: theme.font.mono,
                color: theme.color.accent,
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {i.value}
            </span>
            <span style={{ fontSize: 11, color: theme.color.textMuted }}>{formatCategory(i.category)}</span>
            <span style={{ fontSize: 12, fontFamily: theme.font.mono, fontWeight: 600, color: riskColor(i.score) }}>
              {i.score}
            </span>
          </div>
        ))
      )}
    </SectionCard>
  );
}

function WorkspaceHitsCard({ hits, onLookup }) {
  return (
    <SectionCard title="Seen in your environment" badge="LAST 7 DAYS">
      {hits === null ? (
        <div style={{ fontSize: 13, color: theme.color.textFaint }}>Loading…</div>
      ) : hits.length === 0 ? (
        <div style={{ fontSize: 13, color: theme.color.textMuted, lineHeight: 1.6 }}>
          No feed indicators matched your logs in the last 7 days. This is good — it means none of the known-bad IOCs in
          the feed have appeared in your environment.
        </div>
      ) : (
        hits.map((h) => (
          <div
            key={`${h.type}-${h.value}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: theme.space[3],
              padding: `${theme.space[2]}px 0`,
              borderBottom: `1px solid ${theme.color.border}`,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontFamily: theme.font.mono,
                color: theme.color.text,
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {h.value}
            </span>
            <span style={{ fontSize: 11, color: theme.color.textMuted }}>{formatCategory(h.category)}</span>
            <span style={{ fontSize: 11, fontFamily: theme.font.mono, color: theme.color.textFaint }}>
              {h.alert_count} alert{h.alert_count === 1 ? "" : "s"}
            </span>
            <span style={{ fontSize: 11, fontFamily: theme.font.mono, color: theme.color.textFaint }}>
              {h.last_seen ? new Date(h.last_seen).toLocaleDateString() : "—"}
            </span>
            <Button variant="secondary" size="sm" onClick={() => onLookup(h.type, h.value)}>
              View
            </Button>
          </div>
        ))
      )}
    </SectionCard>
  );
}

function IntelDashboard({ feedInfo, onLookup }) {
  const [feed, setFeed] = useState([]);
  const [hits, setHits] = useState(null);

  useEffect(() => {
    listFeedIndicators()
      .then(setFeed)
      .catch(() => setFeed([]));
    getWorkspaceHits(7)
      .then(setHits)
      .catch(() => setHits([]));
  }, []);

  const typeCounts = feed.reduce((acc, i) => {
    acc[i.type] = (acc[i.type] || 0) + 1;
    return acc;
  }, {});

  const categoryCounts = Object.entries(
    feed.reduce((acc, i) => {
      acc[i.category] = (acc[i.category] || 0) + 1;
      return acc;
    }, {}),
  )
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
  const maxCategoryCount = Math.max(1, ...categoryCounts.map((c) => c.count));

  const topRisk = [...feed].sort((a, b) => b.score - a.score).slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: theme.space[5] }}>
      <FeedHealthCard feedInfo={feedInfo} typeCounts={typeCounts} />

      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: theme.space[4] }}
      >
        <SectionCard title="Indicator categories">
          {categoryCounts.length === 0 ? (
            <div style={{ fontSize: 13, color: theme.color.textFaint }}>Loading feed…</div>
          ) : (
            categoryCounts.map((c) => (
              <ProgressRow
                key={c.category}
                label={formatCategory(c.category)}
                count={c.count}
                pct={Math.round((c.count / maxCategoryCount) * 100)}
              />
            ))
          )}
        </SectionCard>
        <TopRiskCard indicators={topRisk} onLookup={onLookup} />
      </div>

      <WorkspaceHitsCard hits={hits} onLookup={onLookup} />

      <MitreCoverageMatrix />
    </div>
  );
}

// ── Action modals (unchanged behavior, restyled buttons) ────────────────────

function BlockAllowModal({ open, onClose, kind, ioc, onConfirmed }) {
  const isBlock = kind === "block";
  const [reason, setReason] = useState(isBlock ? "Malware C2" : "Trusted vendor");
  const [notes, setNotes] = useState("");
  const [expiryOn, setExpiryOn] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    if (open) {
      setReason(isBlock ? "Malware C2" : "Trusted vendor");
      setNotes("");
      setExpiryOn(false);
      setExpiryDate("");
    }
  }, [open, isBlock]);

  async function handleConfirm() {
    setSaving(true);
    try {
      await createWhitelistEntry({
        type: ioc.type,
        value: ioc.value,
        kind,
        reason: notes.trim() ? `${reason} — ${notes.trim()}` : reason,
        expires_at: expiryOn && expiryDate ? new Date(expiryDate).toISOString() : null,
      });
      showToast(`${ioc.value} added to the ${isBlock ? "blocklist" : "allowlist"}.`, "success");
      onConfirmed();
      onClose();
    } catch {
      showToast(`Could not ${isBlock ? "block" : "allow"} that indicator.`, "error");
    } finally {
      setSaving(false);
    }
  }

  const reasonOptions = isBlock
    ? ["Malware C2", "Brute force source", "DGA", "Custom"]
    : ["Trusted vendor", "Internal service", "Testing", "Custom"];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add ${ioc?.value ?? ""} to ${isBlock ? "blocklist" : "allowlist"}?`}
      width={420}
    >
      <p style={{ fontSize: 12, color: theme.color.textMuted, marginTop: 0 }}>
        {isBlock
          ? "Creates a real blocklist record for this indicator."
          : "This indicator will be excluded from future alerts."}
      </p>
      <FieldLabel label="Reason">
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          {reasonOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </FieldLabel>
      <FieldLabel label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes…"
          className="tp-field-input"
          style={{ width: "100%", minHeight: 60, resize: "vertical", boxSizing: "border-box" }}
        />
      </FieldLabel>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          fontSize: 13,
          color: theme.color.textMuted,
          cursor: "pointer",
          marginBottom: theme.space[5],
        }}
      >
        <input type="checkbox" checked={expiryOn} onChange={(e) => setExpiryOn(e.target.checked)} />
        {isBlock ? "Block" : "Allow"} until:{" "}
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          disabled={!expiryOn}
          className="tp-field-input"
          style={{ width: "auto" }}
        />
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space[3] }}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={isBlock ? "danger" : "safe"} onClick={handleConfirm} disabled={saving}>
          {saving ? "Saving…" : isBlock ? "Add to Blocklist" : "Add to Allowlist"}
        </Button>
      </div>
    </Modal>
  );
}

function CreateRuleModal({ open, onClose, ioc, onConfirmed }) {
  const [name, setName] = useState("");
  const [severity, setSeverity] = useState("high");
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    if (open && ioc) setName(`Alert on traffic from ${ioc.value}`);
  }, [open, ioc]);

  async function handleConfirm() {
    setSaving(true);
    try {
      await createRule({
        name: name.trim() || `Alert on ${ioc.value}`,
        conditions: { message_contains: ioc.value },
        severity,
        enabled: true,
      });
      showToast("Alert rule created for " + ioc.value, "success");
      onConfirmed();
      onClose();
    } catch {
      showToast("Could not create that rule.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create alert rule" width={440}>
      <div
        style={{
          fontSize: 11,
          fontFamily: theme.font.mono,
          color: theme.color.textFaint,
          marginTop: -12,
          marginBottom: theme.space[4],
        }}
      >
        For {ioc?.value}
      </div>
      <FieldLabel label="Rule name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </FieldLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.space[3] }}>
        <FieldLabel label="Condition">
          <TextInput value="Log message contains" disabled />
        </FieldLabel>
        <FieldLabel label="Value">
          <TextInput value={ioc?.value ?? ""} disabled style={{ fontFamily: theme.font.mono }} />
        </FieldLabel>
      </div>
      <FieldLabel label="Severity">
        <div style={{ display: "flex", gap: theme.space[4], flexWrap: "wrap" }}>
          {["ok", "medium", "high", "critical"].map((sev) => (
            <label key={sev} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="radio" checked={severity === sev} onChange={() => setSeverity(sev)} />
              <span>{severityLabel(sev)}</span>
            </label>
          ))}
        </div>
      </FieldLabel>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space[3], marginTop: theme.space[5] }}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={saving}>
          {saving ? "Creating…" : "Create Rule"}
        </Button>
      </div>
    </Modal>
  );
}

function LinkIncidentModal({ open, onClose, ioc, onConfirmed }) {
  const [q, setQ] = useState("");
  const [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    if (!open) return;
    listIncidents({ q: q || undefined, limit: 20 })
      .then((r) => setIncidents(r.items))
      .catch(() => setIncidents([]));
  }, [open, q]);

  async function handleConfirm() {
    if (!selected) return;
    setSaving(true);
    try {
      const result = await linkIocToIncident(ioc.type, ioc.value, selected.id);
      showToast(
        `Linked ${result.alert_count > 0 ? `${result.alert_count} related alert(s)` : "indicator"} to "${selected.title}".`,
        "success",
      );
      onConfirmed();
      onClose();
    } catch {
      showToast("Could not link to that incident.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Link to incident" width={420}>
      <div
        style={{
          fontSize: 11,
          fontFamily: theme.font.mono,
          color: theme.color.textFaint,
          marginTop: -12,
          marginBottom: theme.space[4],
        }}
      >
        {ioc?.value} — links every alert this indicator is really related to
      </div>
      <TextInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search incidents…"
        style={{ width: "100%", marginBottom: theme.space[3] }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          maxHeight: 220,
          overflow: "auto",
          marginBottom: theme.space[4],
        }}
      >
        {incidents.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.color.textFaint, padding: theme.space[2] }}>No incidents found.</div>
        ) : (
          incidents.map((inc) => (
            <label
              key={inc.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 4px",
                cursor: "pointer",
                borderBottom: `1px solid ${theme.color.border}`,
              }}
            >
              <input
                type="radio"
                name="link-incident"
                checked={selected?.id === inc.id}
                onChange={() => setSelected(inc)}
              />
              <span
                style={{
                  fontSize: 12,
                  color: theme.color.text,
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {inc.title}
              </span>
              <span style={{ fontSize: 11, color: theme.color.textFaint, textTransform: "capitalize" }}>
                {inc.status}
              </span>
            </label>
          ))
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space[3] }}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={!selected || saving}>
          {saving ? "Linking…" : "Link"}
        </Button>
      </div>
    </Modal>
  );
}

export default function IntelPage() {
  const [type, setType] = useState("ip");
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedInfo, setFeedInfo] = useState(null);
  const [recent, setRecent] = useState(loadRecent);
  const [modal, setModal] = useState(null); // "block" | "allow" | "rule" | "link" | null
  const showToast = useToast();

  useEffect(() => {
    getFeedInfo()
      .then(setFeedInfo)
      .catch(() => {});
  }, []);

  async function runLookup(lookupType = type, lookupValue = value) {
    const v = lookupValue.trim();
    if (!v) return;
    setType(lookupType);
    setValue(v);
    setLoading(true);
    try {
      const r = await lookupIoc(lookupType, v);
      setResult(r);
      setRecent((prev) => {
        const next = [v, ...prev.filter((x) => x !== v)].slice(0, MAX_RECENT);
        saveRecent(next);
        return next;
      });
      showToast("Lookup complete for " + v, "success");
    } catch {
      showToast("Lookup failed.", "error");
    } finally {
      setLoading(false);
    }
  }

  function refreshAfterAction() {
    runLookup();
  }

  function exportIndicatorCard() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${result.type}_${result.value}_summary.json`);
  }

  const ioc = result ? { type: result.type, value: result.value, category: result.category } : null;

  return (
    <SetupLockOverlay variant="compact">
      {({ agentOfflineOnly }) => (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ padding: theme.space[7], boxSizing: "border-box" }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: theme.color.textMuted,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                marginBottom: 9,
              }}
            >
              Enrichment &amp; lookup
            </div>
            <h1 style={{ fontSize: 34, margin: 0, marginBottom: theme.space[5], letterSpacing: "-0.025em" }}>
              Threat intelligence
            </h1>

            <div
              className="tp-card"
              style={{
                padding: theme.space[4],
                marginBottom: theme.space[5],
                display: "flex",
                flexDirection: "column",
                gap: theme.space[3],
              }}
            >
              <div style={{ display: "flex", gap: theme.space[2] }}>
                <Select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 190, flexShrink: 0 }}>
                  {IOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <TextInput
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runLookup()}
                  placeholder="Search an IP, domain, or hash…"
                  style={{ flex: 1, fontFamily: theme.font.mono }}
                />
                <Button onClick={() => runLookup()} disabled={loading}>
                  {loading ? "Looking up…" : "Lookup"}
                </Button>
              </div>
              {recent.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: theme.space[2], flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontFamily: theme.font.mono, color: theme.color.textFaint }}>
                    Recent
                  </span>
                  {recent.map((v) => (
                    <span
                      key={v}
                      role="button"
                      tabIndex={0}
                      onClick={() => runLookup(type, v)}
                      className="tp-card"
                      style={{
                        fontSize: 11,
                        fontFamily: theme.font.mono,
                        color: theme.color.accent,
                        padding: "4px 8px",
                        borderRadius: theme.radius.sm,
                        cursor: "pointer",
                      }}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Everything below the search bar reflects this org's own recent
            log/alert data (cross-references, "seen in workspace", the
            dashboard's environment-hit list) — dimmed while the agent is
            offline so it doesn't read as a current view when nothing new
            can be arriving, same treatment as Logs/Alerts/Incidents. */}
            <div
              className={agentOfflineOnly ? "tp-agent-offline" : ""}
              style={{
                opacity: agentOfflineOnly ? 0.55 : 1,
                filter: agentOfflineOnly ? "grayscale(65%)" : "none",
                transition: "opacity 200ms ease-out, filter 200ms ease-out",
              }}
            >
              {result ? (
                <>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    style={{
                      background: "none",
                      border: "none",
                      color: theme.color.accent,
                      cursor: "pointer",
                      fontSize: 13,
                      padding: 0,
                      marginBottom: theme.space[4],
                    }}
                  >
                    ← Back to overview
                  </button>

                  {!result.found_in_feed && (
                    <div style={{ fontSize: 13, color: theme.color.textFaint, marginBottom: theme.space[5] }}>
                      Not in the curated feed — showing only real workspace cross-references below.
                    </div>
                  )}

                  {result.whitelist_status && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: theme.space[2],
                        marginBottom: theme.space[5],
                      }}
                    >
                      <Badge
                        color={result.whitelist_status === "block" ? theme.color.danger.text : theme.color.safe.text}
                      >
                        {result.whitelist_status === "block" ? "Currently blocked" : "Currently allowed"}
                      </Badge>
                      <span style={{ fontSize: 12, color: theme.color.textFaint }}>
                        {result.whitelist_status === "block"
                          ? "Alerts referencing this indicator are treated as confirmed threats."
                          : "This indicator is excluded from future alerts."}
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: theme.space[4],
                      marginBottom: theme.space[5],
                    }}
                  >
                    <InfoCard title="Reputation">
                      <ReputationGauge score={result.score} />
                      <div style={{ fontSize: 12, color: theme.color.textMuted, marginTop: "auto" }}>
                        {result.found_in_feed
                          ? `Confidence: ${result.confidence} (${result.source})`
                          : "No score — this indicator isn't in the curated feed."}
                      </div>
                    </InfoCard>

                    <InfoCard title="Category">
                      {result.category ? (
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            padding: "8px 12px",
                            background: theme.color.background,
                            border: `1px solid ${theme.color.border}`,
                            borderRadius: theme.radius.sm,
                          }}
                        >
                          <span style={{ fontSize: 11, color: theme.color.text, fontWeight: 600, flex: 1 }}>
                            {result.category}
                          </span>
                          <span style={{ fontSize: 11, fontFamily: theme.font.mono, color: theme.color.textFaint }}>
                            ({result.source})
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: theme.color.textFaint }}>
                          No category — not in the curated feed.
                        </div>
                      )}
                      {result.description && (
                        <div style={{ fontSize: 12, color: theme.color.textMuted, marginTop: "auto" }}>
                          {result.description}
                        </div>
                      )}
                    </InfoCard>

                    <InfoCard title="Seen in workspace">
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          padding: "9px 0",
                          borderBottom: `1px solid ${theme.color.border}`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: theme.color.textFaint,
                            letterSpacing: "0.04em",
                          }}
                        >
                          FIRST SEEN
                        </span>
                        <span style={{ fontSize: 12, fontFamily: theme.font.mono, fontWeight: 600 }}>
                          {result.first_seen ? new Date(result.first_seen).toLocaleString() : "Never"}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          padding: "9px 0",
                          borderBottom: `1px solid ${theme.color.border}`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: theme.color.textFaint,
                            letterSpacing: "0.04em",
                          }}
                        >
                          LAST SEEN
                        </span>
                        <span style={{ fontSize: 12, fontFamily: theme.font.mono, fontWeight: 600 }}>
                          {result.last_seen ? new Date(result.last_seen).toLocaleString() : "—"}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "9px 0" }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: theme.color.textFaint,
                            letterSpacing: "0.04em",
                          }}
                        >
                          ALERTS TRIGGERED
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontFamily: theme.font.mono,
                            fontWeight: 600,
                            color: theme.color.accent,
                          }}
                        >
                          {result.related_alerts.length}
                        </span>
                      </div>
                    </InfoCard>
                  </div>

                  <div style={{ marginBottom: theme.space[5] }}>
                    <MitreCoverageMatrix />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))",
                      gap: theme.space[4],
                      marginBottom: theme.space[5],
                    }}
                  >
                    <Card
                      title="Related incidents"
                      action={
                        <span style={{ fontSize: 12, color: theme.color.textMuted, fontWeight: 600 }}>
                          {result.related_incidents.length} incidents
                        </span>
                      }
                      bodyStyle={{ padding: 0 }}
                    >
                      {result.related_incidents.length === 0 ? (
                        <div style={{ padding: theme.space[4], fontSize: 14, color: theme.color.textMuted }}>
                          No incidents involve this indicator.
                        </div>
                      ) : (
                        result.related_incidents.map((inc) => (
                          <div
                            key={inc.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "10px 16px",
                              borderBottom: `1px solid ${theme.color.border}`,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                color: theme.color.text,
                                flex: 1,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {inc.title}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: theme.color.textMuted,
                                textTransform: "capitalize",
                              }}
                            >
                              {inc.status}
                            </span>
                          </div>
                        ))
                      )}
                    </Card>

                    <Card
                      title="Recent alerts"
                      action={
                        <span style={{ fontSize: 12, color: theme.color.textMuted, fontWeight: 600 }}>
                          {result.related_alerts.length} alerts
                        </span>
                      }
                      bodyStyle={{ padding: 0 }}
                    >
                      {result.related_alerts.length === 0 ? (
                        <div style={{ padding: theme.space[4], fontSize: 14, color: theme.color.textMuted }}>
                          No alerts have fired for this indicator.
                        </div>
                      ) : (
                        result.related_alerts.map((a) => (
                          <div
                            key={a.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "10px 16px",
                              borderBottom: `1px solid ${theme.color.border}`,
                            }}
                          >
                            <SeverityBadge severity={a.severity} />
                            <span
                              style={{
                                fontSize: 13,
                                color: theme.color.text,
                                flex: 1,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {a.title}
                            </span>
                            <span style={{ fontSize: 12, fontFamily: theme.font.mono, color: theme.color.textFaint }}>
                              {new Date(a.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        ))
                      )}
                    </Card>
                  </div>

                  <div
                    className="tp-card"
                    style={{
                      padding: theme.space[4],
                      display: "flex",
                      gap: theme.space[3],
                      flexWrap: "wrap",
                    }}
                  >
                    <Button
                      variant="danger"
                      onClick={() => setModal("block")}
                      disabled={result.whitelist_status === "block"}
                    >
                      {result.whitelist_status === "block" ? "Blocked" : "Block"}
                    </Button>
                    <Button
                      variant="safe"
                      onClick={() => setModal("allow")}
                      disabled={result.whitelist_status === "allow"}
                    >
                      {result.whitelist_status === "allow" ? "Allowed" : "Allow"}
                    </Button>
                    <div style={{ flex: 1 }} />
                    <Button variant="secondary" onClick={() => setModal("rule")}>
                      Create Alert Rule
                    </Button>
                    <Button variant="secondary" onClick={() => setModal("link")}>
                      Link to Incident
                    </Button>
                    <Button variant="secondary" onClick={exportIndicatorCard}>
                      Export indicator card
                    </Button>
                  </div>
                </>
              ) : (
                <IntelDashboard feedInfo={feedInfo} onLookup={runLookup} />
              )}
            </div>
          </div>

          <BlockAllowModal
            open={modal === "block"}
            kind="block"
            ioc={ioc}
            onClose={() => setModal(null)}
            onConfirmed={refreshAfterAction}
          />
          <BlockAllowModal
            open={modal === "allow"}
            kind="allow"
            ioc={ioc}
            onClose={() => setModal(null)}
            onConfirmed={refreshAfterAction}
          />
          <CreateRuleModal
            open={modal === "rule"}
            ioc={ioc}
            onClose={() => setModal(null)}
            onConfirmed={refreshAfterAction}
          />
          <LinkIncidentModal
            open={modal === "link"}
            ioc={ioc}
            onClose={() => setModal(null)}
            onConfirmed={refreshAfterAction}
          />
        </div>
      )}
    </SetupLockOverlay>
  );
}
