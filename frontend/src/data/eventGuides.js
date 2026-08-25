// Plain-English learning content for analysts who are new to what a given
// event type actually means — surfaced in LogDetailModal/AlertDetailModal
// next to the raw event, not as a separate reference page nobody will find.
//
// Two tiers of keys: the first 7 are the readable-paraphrase event_type
// strings the demo seed data uses (scripts/seed_dashboard_data.py's
// EVENT_TYPES, the same taxonomy the starter rule catalog in RulesTab.jsx
// uses) — kept for seeded demo orgs. Below the "Real agent event types"
// divider are the actual Task Category strings a real agent reports
// (agent/tp_agent.py's _parse_windows_event derives event_type from
// Windows' own RenderingInfo/Task field), confirmed against the real
// PowerShell Operational channel values documented in docs/SPRINT_PLAN.md.
// Not a generic "every possible Windows event" reference we can't back up —
// each entry corresponds to a real, well-documented Windows Security/
// PowerShell Operational auditing event (the ID is noted below for anyone
// who wants to cross-reference Microsoft's own docs). Treat "eventId" here
// as "the general class this is modeled on," not a literal field-level
// promise — Task Category is coarse and several Event IDs can share one.
//
// Unknown event types intentionally get no guide at all (getEventGuide
// returns null) rather than a generic "no guide available" filler on every
// single row — most real-world event types won't be in this curated set
// yet, and that would be more noise than signal.
export const EVENT_GUIDES = {
  "An account failed to log on": {
    eventId: "Windows Security 4625",
    whatItMeans: "A logon attempt was rejected — wrong password, disabled account, or the account/method wasn't valid.",
    whyItMatters:
      "One failure is almost always nothing. A burst against a single account, or one source hitting many different accounts in a short window, is the classic signature of brute-force or password-spray attacks.",
    commonCauses: [
      "Expired or recently-changed password",
      "Caps Lock",
      "A stale saved credential on a phone or service",
    ],
    whatToCheck: [
      "How many failures, over what time window, from how many source hosts",
      "Is it many attempts against one account (brute-force) or one source against many accounts (spray)?",
      "Did a successful logon follow shortly after the failures?",
    ],
  },
  "An account was successfully logged on": {
    eventId: "Windows Security 4624",
    whatItMeans: "An authentication attempt succeeded — someone or something logged on.",
    whyItMatters:
      "Necessary baseline noise — most of these are completely normal and this event type alone is rarely alert-worthy. It becomes interesting in context: a logon at 3am for an account that never works nights, a service account logging on interactively, or a success immediately after a burst of failures.",
    commonCauses: ["Normal daily sign-ins", "Scheduled tasks running under a service account", "RDP/remote sessions"],
    whatToCheck: [
      "Logon type — interactive vs. network vs. service — and whether that's normal for this account",
      "Time-of-day against the account's usual pattern",
      "Whether this followed a failed-logon burst on the same account",
    ],
  },
  "A process was created": {
    eventId: "Windows Security 4688",
    whatItMeans: "A new process started on the host.",
    whyItMatters:
      "Extremely high volume, low signal on its own — this fires constantly and is almost never alert-worthy by itself. It's most useful as supporting evidence once you already have a reason to look at a specific host/time window.",
    commonCauses: ["Essentially everything — this is one of the highest-volume event types on any host"],
    whatToCheck: [
      "The parent→child relationship (an office document or browser spawning a shell is a classic red flag)",
      "The command line, if captured",
      "Whether it lines up in time with a more specific suspicious event",
    ],
  },
  "PowerShell script block logged": {
    eventId: "PowerShell Operational 4104 (script block logging)",
    whatItMeans: "A block of PowerShell script actually executed, with its content captured.",
    whyItMatters:
      "Attackers commonly use PowerShell post-compromise, often obfuscated or encoded to slip past basic detection. Legitimate admin scripting looks similar on the surface, so the event type alone doesn't tell you much — the actual script content is what matters.",
    commonCauses: [
      "Admin/automation scripts",
      "Scheduled maintenance tasks",
      "Software installers that shell out to PowerShell",
    ],
    whatToCheck: [
      "Is the script obfuscated (base64 blobs, string concatenation tricks, character-code arrays)?",
      "Does it touch credentials, download remote content, or try to disable security tooling?",
      "Who ran it, from where, and was that expected for this account?",
    ],
  },
  "A privileged service was called": {
    eventId: "Windows Security 4673",
    whatItMeans: "A process invoked a Windows service/API that requires elevated rights to call.",
    whyItMatters:
      "A step attackers take when escalating privileges or performing sensitive operations — but this also fires for a lot of routine system and admin activity, so on its own it's noisy rather than damning.",
    commonCauses: ["Normal OS/service operations", "Backup software", "Legitimate admin tooling"],
    whatToCheck: [
      "Which specific privilege was invoked",
      "What process called it, and whether that process normally needs it",
      "Whether this combination (process + privilege + host) is normal here",
    ],
  },
  "Special privileges assigned to new logon": {
    eventId: "Windows Security 4672",
    whatItMeans: "A newly-created logon session was granted administrator-equivalent privileges.",
    whyItMatters:
      'Every legitimate admin logon triggers this — which is exactly why an attacker who\'s escalated to admin and logged on triggers the identical event. Read it as "this account now has the keys," not as inherently malicious.',
    commonCauses: ["IT staff signing in to do admin work", "Service accounts that run with elevated rights by design"],
    whatToCheck: [
      "Is this account normally an administrator?",
      "Does the logon time and source match how this account usually operates?",
      "Is there a change ticket or known reason for admin access right now?",
    ],
  },
  "A network share object was accessed": {
    eventId: "Windows Security 5140",
    whatItMeans: "Something connected to a network share (e.g. \\\\host\\share).",
    whyItMatters:
      "Normal file-server traffic day to day — but it's also exactly what lateral movement and pre-exfiltration data staging look like: an attacker enumerating shares or copying data off a server.",
    commonCauses: ["Routine file access", "Backup jobs", "Mapped drives reconnecting at login"],
    whatToCheck: [
      "Is this share/account combination normal, or has this account never touched this share before?",
      "Unusual volume or off-hours timing",
      "Whether the accessing host is one that's normally supposed to reach this share",
    ],
  },

  // ── Real agent event types ──────────────────────────────────────────────
  // The keys above are readable paraphrases used by the demo seed data
  // (scripts/seed_dashboard_data.py) — a real agent instead reports
  // event_type as whatever Windows itself renders into a log's own
  // RenderingInfo/Task field (agent/tp_agent.py's _parse_windows_event), a
  // coarse "Task Category" string that's often shared across several
  // distinct Event IDs (e.g. both a successful and a failed logon render as
  // Task="Logon"). The entries below target those real values, confirmed
  // against docs/SPRINT_PLAN.md's own note on what the PowerShell Operational
  // channel actually produces — purely additive, the demo keys above are
  // unchanged and still work for seeded orgs.
  Logon: {
    eventId: "Windows Security 4624 / 4625 (Task Category: Logon)",
    whatItMeans:
      "An authentication attempt — successful or failed — was recorded. Windows groups both under this one label.",
    whyItMatters:
      "Most of these are completely normal daily sign-ins. It becomes interesting in context: a burst of these in a short window (brute-force/spray), a logon at an unusual hour, or a logon type that doesn't match how this account normally connects.",
    commonCauses: ["Normal daily sign-ins", "Scheduled tasks running under a service account", "RDP/remote sessions"],
    whatToCheck: [
      "Open the log's own message text to see whether this specific one succeeded or failed",
      "How many of these happened in a short window, from how many source hosts",
      "Logon type (interactive/network/service) and whether that's normal for this account",
    ],
  },
  "Process Creation": {
    eventId: "Windows Security 4688 (Task Category: Process Creation)",
    whatItMeans: "A new process started on the host.",
    whyItMatters:
      "Extremely high volume, low signal on its own — this fires constantly and is almost never alert-worthy by itself. It's most useful as supporting evidence once you already have a reason to look at a specific host/time window.",
    commonCauses: ["Essentially everything — this is one of the highest-volume event types on any host"],
    whatToCheck: [
      "The parent→child relationship (an office document or browser spawning a shell is a classic red flag)",
      "The command line, if captured",
      "Whether it lines up in time with a more specific suspicious event",
    ],
  },
  "Sensitive Privilege Use": {
    eventId: "Windows Security 4673 (Task Category: Sensitive Privilege Use)",
    whatItMeans: "A process invoked a Windows service/API that requires elevated rights to call.",
    whyItMatters:
      "A step attackers take when escalating privileges or performing sensitive operations — but this also fires for a lot of routine system and admin activity, so on its own it's noisy rather than damning.",
    commonCauses: ["Normal OS/service operations", "Backup software", "Legitimate admin tooling"],
    whatToCheck: [
      "Which specific privilege was invoked",
      "What process called it, and whether that process normally needs it",
      "Whether this combination (process + privilege + host) is normal here",
    ],
  },
  "Special Logon": {
    eventId: "Windows Security 4672 (Task Category: Special Logon)",
    whatItMeans: "A newly-created logon session was granted administrator-equivalent privileges.",
    whyItMatters:
      'Every legitimate admin logon triggers this — which is exactly why an attacker who\'s escalated to admin and logged on triggers the identical event. Read it as "this account now has the keys," not as inherently malicious.',
    commonCauses: ["IT staff signing in to do admin work", "Service accounts that run with elevated rights by design"],
    whatToCheck: [
      "Is this account normally an administrator?",
      "Does the logon time and source match how this account usually operates?",
      "Is there a change ticket or known reason for admin access right now?",
    ],
  },
  "File Share": {
    eventId: "Windows Security 5140 / 5145 (Task Category: File Share)",
    whatItMeans: "Something connected to, or checked access to a file on, a network share (e.g. \\\\host\\share).",
    whyItMatters:
      "Normal file-server traffic day to day — but it's also exactly what lateral movement and pre-exfiltration data staging look like: an attacker enumerating shares or copying data off a server.",
    commonCauses: ["Routine file access", "Backup jobs", "Mapped drives reconnecting at login"],
    whatToCheck: [
      "Is this share/account combination normal, or has this account never touched this share before?",
      "Unusual volume or off-hours timing",
      "Whether the accessing host is one that's normally supposed to reach this share",
    ],
  },
  Logoff: {
    eventId: "Windows Security 4634/4647 (Task Category: Logoff)",
    whatItMeans: "A logon session ended.",
    whyItMatters:
      "Almost always routine bookkeeping. Mainly useful paired with its matching Logon event to see how long a session lasted, not as a standalone signal.",
    commonCauses: ["Normal end of a work session", "System reboot/shutdown", "RDP session ending"],
    whatToCheck: ["Whether the session duration between logon and logoff makes sense for the account/activity"],
  },
  "Account Lockout": {
    eventId: "Windows Security 4740 (Task Category: User Account Management)",
    whatItMeans: "An account was locked out after too many failed logon attempts.",
    whyItMatters:
      "A strong, fairly specific signal — this is what a failed brute-force or password-spray attempt against a real account often produces, rather than just noisy failed logons on their own.",
    commonCauses: [
      "A person mistyping their own password repeatedly",
      "A stale saved credential retrying automatically",
    ],
    whatToCheck: [
      "How many failed attempts preceded the lockout, and from where",
      "Whether the same source is doing this to multiple accounts",
      "Whether the account owner actually caused this (ask them) before assuming an attack",
    ],
  },
  "Credential Validation": {
    eventId: "Windows Security 4776 (Task Category: Credential Validation)",
    whatItMeans: "A domain controller checked a username/password pair against its stored credentials.",
    whyItMatters:
      "The domain-controller-side counterpart to a workstation Logon event — useful for spotting the same brute-force/spray patterns, but from the authentication server's point of view instead of the target machine's.",
    commonCauses: ["Normal domain sign-ins", "Applications that authenticate against Active Directory"],
    whatToCheck: [
      "Volume and pattern of failures — one account vs. many accounts from one source",
      "Whether this correlates with a Logon/Account Lockout event on a specific workstation",
    ],
  },
  "Execute a Remote Command": {
    eventId: "PowerShell Operational (Task Category: Execute a Remote Command)",
    whatItMeans:
      "A PowerShell command was run against this host remotely, rather than typed locally at its own console.",
    whyItMatters:
      "Remote PowerShell execution is both a standard admin tool (WinRM-based remote management) and a common attacker technique for lateral movement — the event type alone doesn't distinguish the two; the source and the command itself do.",
    commonCauses: ["IT remote administration via WinRM/Enter-PSSession", "Automation/orchestration tooling"],
    whatToCheck: [
      "Which host/account the command came from, and whether that's an expected admin source",
      "What the command actually did, if captured",
      "Whether this account normally performs remote administration",
    ],
  },
  "PowerShell Console Startup": {
    eventId: "PowerShell Operational (Task Category: PowerShell Console Startup)",
    whatItMeans: "A PowerShell session (console host) started on this machine.",
    whyItMatters:
      "Very common baseline noise from routine admin/scripting use. Only becomes interesting alongside what that session then did — this event alone just marks that a shell was opened.",
    commonCauses: [
      "Admin scripting",
      "Scheduled maintenance tasks",
      "Software installers that shell out to PowerShell",
    ],
    whatToCheck: [
      "Who started it, from where, and whether that's expected for this account",
      "What ran in the session afterward (look for accompanying script-block or command events)",
    ],
  },
  "PowerShell Named Pipe IPC": {
    eventId: "PowerShell Operational (Task Category: PowerShell Named Pipe IPC)",
    whatItMeans:
      "Two PowerShell processes communicated with each other over a local named pipe — normal inter-process plumbing PowerShell uses internally (e.g. for remoting sessions).",
    whyItMatters:
      "Usually just PowerShell's own internal mechanics rather than something to act on directly — worth noting mainly as supporting context around a remoting session you're already investigating for another reason.",
    commonCauses: ["Normal PowerShell remoting/session internals"],
    whatToCheck: ["Whether it's part of a remoting session that's otherwise already under review"],
  },
};

export function getEventGuide(eventType) {
  return EVENT_GUIDES[eventType] || null;
}
