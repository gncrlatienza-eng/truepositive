// Named, ready-to-use local log sources shown by LocalSourcePicker (onboarding
// step 3 and Settings -> "Connect data source"). `path` values must match real
// wevtutil channel names on Windows (no ".evtx" suffix — that's an exported
// file extension, not a live channel) or a literal file path on Linux.
// `needsAdmin` is only set true where elevation was actually confirmed
// necessary (Security, Sysmon) — see agent/tp_agent.py's docstring.
export const LOCAL_SOURCE_CATALOG = [
  {
    key: "windows-security",
    platform: "windows",
    name: "Windows Security Logs",
    path: "Security",
    description: "Logons, account changes, and privilege use — the primary audit trail for Windows security events.",
    recommended: true,
    needsAdmin: true,
  },
  {
    key: "windows-sysmon",
    platform: "windows",
    name: "Sysmon",
    path: "Microsoft-Windows-Sysmon/Operational",
    description: "Detailed process, network, and file activity. Requires Sysmon to already be installed on the host.",
    recommended: true,
    needsAdmin: true,
    // A genuinely separate blocker from needsAdmin: even an elevated agent
    // gets "channel could not be found" if Sysmon itself was never
    // installed (the common case) -- the "Needs Administrator" badge alone
    // was misleading here, implying elevation was the only thing standing
    // between this source and working.
    requiresSysmon: true,
  },
  {
    key: "windows-powershell",
    platform: "windows",
    name: "PowerShell Activity",
    path: "Microsoft-Windows-PowerShell/Operational",
    description: "Script block execution and command activity — a common attacker tool. No elevation needed.",
    recommended: true,
    needsAdmin: false,
  },
  {
    key: "windows-system",
    platform: "windows",
    name: "Windows System Log",
    path: "System",
    description: "OS-level events: service start/stop, driver issues, system health.",
    recommended: false,
    needsAdmin: false,
  },
  {
    key: "windows-application",
    platform: "windows",
    name: "Windows Application Log",
    path: "Application",
    description: "Application crashes and errors reported by installed software.",
    recommended: false,
    needsAdmin: false,
  },
  {
    key: "windows-firewall",
    platform: "windows",
    name: "Windows Firewall",
    path: "Microsoft-Windows-Windows Firewall With Advanced Security/Firewall",
    description: "Network connections allowed or blocked by the local firewall.",
    recommended: false,
    needsAdmin: false,
  },
  {
    key: "windows-dns-client",
    platform: "windows",
    name: "DNS Client Activity",
    path: "Microsoft-Windows-DNS-Client/Operational",
    description: "Domain lookups made by this host — useful for spotting C2/beaconing.",
    recommended: false,
    needsAdmin: false,
  },
  {
    key: "linux-auth",
    platform: "linux",
    name: "Linux Auth Log",
    path: "/var/log/auth.log",
    description: "SSH logons, sudo use, and authentication events (Debian/Ubuntu path).",
    recommended: true,
    needsAdmin: false,
  },
  {
    key: "linux-syslog",
    platform: "linux",
    name: "Linux System Log",
    path: "/var/log/syslog",
    description: "General system activity and service logs (Debian/Ubuntu path).",
    recommended: false,
    needsAdmin: false,
  },
];

export function catalogForPlatform(platform) {
  const key = platform === "linux" ? "linux" : "windows";
  return LOCAL_SOURCE_CATALOG.filter((entry) => entry.platform === key);
}
