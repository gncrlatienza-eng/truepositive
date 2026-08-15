// Plain-English learning content for analysts who are new to what a given
// event type actually means — surfaced in LogDetailModal/AlertDetailModal
// next to the raw event, not as a separate reference page nobody will find.
//
// Scoped deliberately to the 7 event_type strings this app actually
// produces (scripts/seed_dashboard_data.py's EVENT_TYPES, the same
// taxonomy the starter rule catalog in RulesTab.jsx uses) — not a generic
// "every possible Windows event" reference we can't back up. Each of these
// corresponds to a real, well-documented Windows Security/PowerShell
// Operational auditing event (the ID is noted below for anyone who wants
// to cross-reference Microsoft's own docs), but the app's own event_type
// text is a readable paraphrase, not guaranteed byte-for-byte production
// telemetry — see the Sprint 5 note in docs/SPRINT_PLAN.md about the
// starter rules' PowerShell event_type not matching the real channel's
// actual message text. Treat "eventId" here as "the general class this is
// modeled on," not a literal field-level promise.
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
};

export function getEventGuide(eventType) {
  return EVENT_GUIDES[eventType] || null;
}
