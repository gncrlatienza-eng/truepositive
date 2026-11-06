// Sample events and detections for the landing page's live simulation.
// Event IDs, channels and field names are real Windows ones; the hosts,
// users and addresses are made up (203.0.113.0/24 is a documentation range).

export const BENIGN_EVENTS = [
  { host: "WIN-SOC-01", id: 4624, text: "An account was successfully logged on", detail: "user=jdoe LogonType=2" },
  { host: "WIN-SOC-01", id: 4634, text: "An account was logged off", detail: "user=jdoe" },
  {
    host: "FINANCE-LT-07",
    id: 5156,
    text: "Windows Filtering Platform permitted a connection",
    detail: "chrome.exe 142.250.66.78:443",
  },
  { host: "FINANCE-LT-07", id: 3008, text: "DNS query completed", detail: "update.microsoft.com" },
  { host: "LAB-PC-02", id: 4672, text: "Special privileges assigned to new logon", detail: "user=SYSTEM" },
  {
    host: "WIN-SOC-01",
    id: 4688,
    text: "A new process has been created",
    detail: "C:\\Windows\\System32\\svchost.exe",
  },
  { host: "LAB-PC-02", id: 7036, text: "The Windows Update service entered the running state", detail: "" },
  { host: "FINANCE-LT-07", id: 4798, text: "A user's local group membership was enumerated", detail: "user=mreyes" },
];

export const DETECTIONS = [
  {
    id: "brute-force",
    severity: "high",
    host: "WIN-SOC-01",
    event: { id: 4625, text: "An account failed to log on", detail: "user=admin ip=203.0.113.47 (14 in 2 min)" },
    title: "Repeated failed sign-ins",
    summary:
      "Someone at 203.0.113.47 tried to sign in as admin over the network and got the password wrong 14 times in two minutes. That pattern usually means a password-guessing attempt.",
    next: "Check whether 203.0.113.47 is one of your devices. If it isn't, block it and make sure admin has a strong password.",
    rule: "Failed login burst",
    mitre: "T1110 Brute Force",
  },
  {
    id: "encoded-powershell",
    severity: "high",
    host: "FINANCE-LT-07",
    event: { id: 4104, text: "PowerShell script block logged", detail: "powershell.exe -NoP -W Hidden -Enc SQBFAFgA…" },
    title: "Hidden, encoded PowerShell command",
    summary:
      "A hidden PowerShell window ran a command that was encoded so it can't be read at a glance. Attackers use this to download and run tools without leaving an obvious trace.",
    next: "Decode the command from the alert's source log and check which user ran it.",
    rule: "Obfuscated PowerShell command",
    mitre: "T1059.001 PowerShell",
  },
  {
    id: "new-admin",
    severity: "critical",
    host: "WIN-SOC-01",
    event: {
      id: 4732,
      text: "A member was added to a security-enabled local group",
      detail: "member=svc_backup2 group=Administrators",
    },
    title: "New account added to Administrators",
    summary:
      "A new account, svc_backup2, was created and added to the Administrators group seconds later. If nobody on your team did this, someone may be setting up a way back in.",
    next: "Confirm who created it. If no one did, disable the account and reset the admin passwords.",
    rule: "New admin account created",
    mitre: "T1136.001 Create Account: Local",
  },
  {
    id: "remote-service",
    severity: "medium",
    host: "LAB-PC-02",
    event: { id: 7045, text: "A service was installed in the system", detail: "ServiceName=PSEXESVC" },
    title: "Remote admin tool installed as a service",
    summary:
      "PsExec's service was installed, which means someone ran commands on this PC from another machine. IT admins do this, and so do attackers moving between computers.",
    next: "Ask whoever manages LAB-PC-02 whether they used PsExec at this time.",
    rule: "Remote service installed",
    mitre: "T1569.002 Service Execution",
  },
];

// Alerts already in the queue when the page loads, oldest last.
export const INITIAL_QUEUE = [
  { minutesAgo: 6, detection: "remote-service", status: "ack" },
  { minutesAgo: 47, detection: "encoded-powershell", status: "escalated" },
  { minutesAgo: 95, detection: "new-admin", status: "resolved" },
];
