// Plain-language MITRE ATT&CK technique explanations for people new to the
// framework — surfaced as an InfoTooltip next to technique badges in
// AlertDetailModal/IncidentDetailModal, same pattern as KpiCard's KPI_HELP.
//
// Curated, not exhaustive: this app's own AlertRule.mitre_technique field is
// freeform text (e.g. "T1078 — Valid Accounts", see intel_service.py's own
// tactic table) with no seeded default rule set behind it — an org's actual
// rules can reference any technique ID a user types in. Covers the
// well-known techniques most starter/example rules would realistically use;
// anything not in this dict gets the generic fallback below rather than a
// fabricated explanation.
export const MITRE_TECHNIQUE_GLOSSARY = {
  T1078:
    "Valid Accounts — an attacker using real, legitimate credentials instead of malware, which makes their activity blend in with normal logons.",
  T1110:
    "Brute Force — repeatedly guessing passwords, either many attempts against one account or one attempt across many accounts.",
  T1566: "Phishing — a malicious link, attachment, or message used to get initial access or steal credentials.",
  T1059:
    "Command and Scripting Interpreter — running commands via PowerShell, cmd, or a similar shell, often to execute malicious code.",
  T1053:
    "Scheduled Task/Job — creating a scheduled task so malicious code runs automatically later or on every reboot.",
  T1003:
    "OS Credential Dumping — extracting stored passwords or password hashes from the operating system's memory or files.",
  T1021:
    "Remote Services — using RDP, SSH, or similar remote-access protocols to move between machines on the network.",
  T1047:
    "Windows Management Instrumentation — using WMI to run commands or gather information, often to blend in with normal admin activity.",
  T1055: "Process Injection — running malicious code inside another, legitimate process to hide from basic monitoring.",
  T1068:
    "Exploitation for Privilege Escalation — using a software vulnerability to gain higher-level access than originally granted.",
  T1070: "Indicator Removal — deleting or altering logs and other evidence to cover tracks after an intrusion.",
  T1082:
    "System Information Discovery — gathering details about the host (OS version, hardware, config) to plan further action.",
  T1105: "Ingress Tool Transfer — downloading additional tools or malware onto a compromised host.",
  T1136:
    "Create Account — creating a new local or domain account, often to maintain access even if the original foothold is removed.",
  T1204:
    "User Execution — getting a person to run a malicious file or link themselves, rather than exploiting a technical flaw.",
  T1486: "Data Encrypted for Impact — ransomware-style encryption of files to extort the victim.",
  T1490:
    "Inhibit System Recovery — deleting backups or disabling recovery features, usually to make a ransomware attack harder to undo.",
  T1543:
    "Create or Modify System Process — installing a malicious service so code runs automatically and persists across reboots.",
  T1548:
    "Abuse Elevation Control Mechanism — bypassing or tricking a permission prompt (like UAC) to gain higher privileges.",
  T1552: "Unsecured Credentials — finding passwords or keys left in plaintext files, scripts, or configuration.",
};

const GENERIC_TECHNIQUE_HELP =
  "A MITRE ATT&CK technique ID — a standardized label security teams use for a specific method attackers use. See attack.mitre.org for the full reference.";

// Rules store this as freeform "T1078 — Valid Accounts" text (see
// intel_service.py's own technique.partition("—") parsing) — pull just the
// ID out the same way so a lookup works whether the caller passes the bare
// ID or the full "ID — Name" string.
export function mitreTechniqueHelp(raw) {
  if (!raw) return GENERIC_TECHNIQUE_HELP;
  const [idPart] = raw.split("—");
  const id = idPart.trim().toUpperCase();
  return MITRE_TECHNIQUE_GLOSSARY[id] || GENERIC_TECHNIQUE_HELP;
}

// Plain-language help for incident/alert status and SLA jargon — same
// InfoTooltip pattern, just not keyed on a per-item id.
export const STATUS_HELP = {
  open: "Not yet looked at.",
  ack: "Acknowledged — someone has seen this and is on it.",
  investigating: "Actively being worked by whoever is assigned.",
  escalated: "Raised to a higher priority — usually means initial triage found something worth deeper attention.",
  resolved: "Handled — the issue was real and has been dealt with.",
  false_positive: "Reviewed and determined not to be a real issue — helps tune detection rules over time.",
};

export const SLA_HELP =
  'The time budget for responding to this incident before it counts as overdue. "SLA breached" means that window has passed with the incident still open.';
