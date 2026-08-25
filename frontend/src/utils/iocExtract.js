// Pulls IP/domain/hash-shaped tokens out of free text (a log's message —
// the only place this app's real log pipeline currently puts detail, since
// the agent doesn't yet ship structured EventData; see LogDetailModal).
// Best-effort and client-side only: false positives (a version number that
// looks like an IP) are possible, which is why every result still goes
// through a real /intel/lookup rather than being trusted on its own.

const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const HASH_RE = /\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b/g;
// Deliberately conservative: requires a known-shaped TLD-like suffix and no
// surrounding word chars, so it doesn't also match hostnames like
// "lnx-jump-04" or version strings.
const DOMAIN_RE =
  /\b(?!(?:\d{1,3}\.){3}\d{1,3}\b)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|co|ru|cn|xyz|info|biz|top|club|online|site|dev|app)\b/g;

const LOCAL_IP_PREFIXES = ["10.", "127.", "192.168.", "0.0.0.0", "255.255.255.255"];

function isLikelyLocal(ip) {
  if (LOCAL_IP_PREFIXES.some((p) => ip.startsWith(p))) return true;
  // 172.16.0.0 – 172.31.255.255
  const parts = ip.split(".").map(Number);
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

function hashType(hash) {
  if (hash.length === 32) return "md5";
  if (hash.length === 40) return "sha1";
  return "sha256";
}

// Returns a deduped list of { type: "ip"|"domain"|"hash", value, label }.
// `label` is a short human tag for hash length — cosmetic only, the API
// treats every hash length the same way (type: "hash").
export function extractIndicators(text, { maxPerType = 4 } = {}) {
  if (!text) return [];
  const seen = new Set();
  const results = [];

  function add(type, value, label) {
    const key = `${type}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    if (results.filter((r) => r.type === type).length >= maxPerType) return;
    seen.add(key);
    results.push({ type, value, label });
  }

  for (const ip of text.match(IPV4_RE) || []) {
    if (isLikelyLocal(ip)) continue;
    add("ip", ip, "IP");
  }
  for (const domain of text.match(DOMAIN_RE) || []) {
    add("domain", domain.toLowerCase(), "Domain");
  }
  for (const hash of text.match(HASH_RE) || []) {
    add("hash", hash.toLowerCase(), hashType(hash).toUpperCase());
  }

  return results;
}
