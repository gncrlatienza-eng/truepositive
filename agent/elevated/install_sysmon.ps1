# TruePositive Agent: elevated action "install_sysmon".
#
# Downloads Sysmon from Sysinternals, checks that it has a valid Microsoft
# Authenticode signature, and installs it with the agent's bundled config.
#
# The same execution model as grant_log_access.ps1 (see that file's header):
# runs only from %ProgramFiles%\TruePositive\elevated or inline through
# -EncodedCommand. The download, the signature check and the install all
# happen inside a new working folder under %ProgramFiles%\TruePositive\work,
# which only administrators can write. So nothing can swap the binary
# between the signature check and the elevated run, unlike the old
# %TEMP%\tp_agent_sysmon64.exe path.
[CmdletBinding()]
param(
    # Base64 of sysmon_config.xml. The UAC fallback passes it (it has no file
    # on disk next to it). The Scheduled Task omits it, and the copy the
    # installer placed next to this script is used instead.
    [string]$ConfigB64
)

$ErrorActionPreference = 'Stop'
$Action = 'install_sysmon'
$Root = Join-Path $env:ProgramFiles 'TruePositive'
$ResultsDir = Join-Path $Root 'results'
$SysmonUrl = 'https://live.sysinternals.com/Sysmon64.exe'
$SysmonChannel = 'Microsoft-Windows-Sysmon/Operational'

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

function Install-Sysmon([string]$Work) {
    # Returns @($ok, $message) -- never exits, so the caller's cleanup of the
    # working folder always runs before the result is written.
    $config = Join-Path $Work 'sysmon_config.xml'
    if ($ConfigB64) {
        [System.IO.File]::WriteAllBytes($config, [Convert]::FromBase64String($ConfigB64))
    } else {
        Copy-Item -Path (Join-Path $PSScriptRoot 'sysmon_config.xml') -Destination $config
    }

    $exe = Join-Path $Work 'Sysmon64.exe'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $SysmonUrl -OutFile $exe -UseBasicParsing

    $sig = Get-AuthenticodeSignature -FilePath $exe
    if ($sig.Status -ne 'Valid') {
        return @($false, "Signature check failed ($($sig.Status)) - refusing to install an unverified binary.")
    }
    if ($sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
        return @($false, "Unexpected signer ($($sig.SignerCertificate.Subject)) - refusing to install.")
    }

    $output = & $exe -accepteula -i $config 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) {
        return @($true, 'Sysmon installed. The agent will pick up its channel on the next collection cycle.')
    }
    $detail = ($output -replace "`0", '').Trim()
    if ($detail.Length -gt 200) { $detail = $detail.Substring(0, 200) }
    return @($false, "Sysmon install failed (exit code $LASTEXITCODE): $detail")
}

& wevtutil.exe gl $SysmonChannel *> $null
if ($LASTEXITCODE -eq 0) {
    Write-ActionResult $true 'Sysmon is already installed - nothing to do.'
}

$work = Join-Path (Join-Path $Root 'work') ([guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Force -Path $work | Out-Null
    $ok, $message = Install-Sysmon $work
} catch {
    $ok, $message = $false, "Unexpected error: $($_.Exception.Message)"
} finally {
    Remove-Item -Recurse -Force -Path $work -ErrorAction SilentlyContinue
}
Write-ActionResult $ok $message
