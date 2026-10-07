# TruePositive Agent: elevated action "grant_log_access".
#
# Adds a Windows user to the built-in "Event Log Readers" group so the
# (never-elevated) agent can read Security/System/Sysmon channels.
#
# Runs with administrator rights, either from the pre-authorized Scheduled
# Task (installer.iss copies this file to %ProgramFiles%\TruePositive\elevated,
# a folder only administrators can write) or from the agent's one-off UAC
# fallback (passed inline via -EncodedCommand, never as a file). It never
# runs anything from a user-writable location, so a process running as the
# normal user can't swap what gets executed with admin rights.
#
# The result goes to %ProgramFiles%\TruePositive\results\ (readable by users,
# writable only by administrators), so an elevated write can't be pointed at
# another file through a junction planted in a user-writable folder.
[CmdletBinding()]
param(
    # Omitted by the Scheduled Task, which runs as the installing user (so the
    # current identity is the right one). The UAC fallback passes the agent's
    # own unelevated identity, because a standard user approving the prompt
    # with an admin's credentials would otherwise make GetCurrent() the admin.
    [string]$UserName
)

$ErrorActionPreference = 'Stop'
$Action = 'grant_log_access'
$ResultsDir = Join-Path $env:ProgramFiles 'TruePositive\results'

function Write-ActionResult([bool]$Ok, [string]$Message) {
    New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null
    $record = [ordered]@{
        action      = $Action
        success     = $Ok
        message     = $Message
        finished_at = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    }
    $record | ConvertTo-Json -Compress | Set-Content -Path (Join-Path $ResultsDir "$Action.json") -Encoding UTF8
    "$([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')) action=$Action success=$Ok message=$Message" |
        Add-Content -Path (Join-Path $ResultsDir 'elevated_actions.log') -Encoding UTF8
    if ($Ok) { exit 0 } else { exit 1 }
}

try {
    if (-not $UserName) {
        $UserName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    }
    # net.exe, not Add-LocalGroupMember: the latter has a known name-resolution
    # bug on some machines ("Member ... was not found").
    $output = & net.exe localgroup 'Event Log Readers' $UserName /add 2>&1 | Out-String
    # 1378 = ERROR_MEMBER_IN_ALIAS (already a member), language-independent.
    if ($LASTEXITCODE -eq 0 -or $output -match '1378') {
        Write-ActionResult $true ("Access granted. You'll need to log out and back in (or restart) before this " +
            "takes effect - Windows only applies new group membership on your next login.")
    }
    $detail = $output.Trim()
    if ($detail.Length -gt 200) { $detail = $detail.Substring(0, 200) }
    Write-ActionResult $false "Could not grant access (exit code $LASTEXITCODE): $detail"
} catch {
    Write-ActionResult $false "Unexpected error: $($_.Exception.Message)"
}
