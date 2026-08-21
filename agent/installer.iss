; TruePositive Agent — Windows installer (Inno Setup).
;
; Builds from the already-built PyInstaller output (dist\truepositive-agent.exe
; — run `pyinstaller tp_agent.spec` first, see README.md). Produces a single
; generic Setup.exe, identical for every org — no per-agent config is baked
; in here; the app itself shows a "paste your Server URL / Agent ID / Key"
; form on first launch (see _show_connect_form in tp_agent.py).
;
; Per-user, no-admin install (PrivilegesRequired=lowest) — matches the
; agent's existing no-admin-rights autostart design. Do NOT add a [Registry]
; entry that writes the Run key at install time: the app only registers
; autostart after its first *successful* connection (_ensure_windows_autostart
; in tp_agent.py), and this installer preserves that behavior rather than
; pre-creating the key. Cleanup of that runtime-created key on uninstall is
; handled explicitly in [Code] below instead.

#define MyAppName "TruePositive Agent"
#define MyAppVersion "1.0"
#define MyAppExeName "truepositive-agent.exe"

[Setup]
AppId={{A47E2C9B-6F3D-4E8A-9C1B-3D5F8A2E7B41}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=TruePositive
DefaultDirName={localappdata}\TruePositive Agent
DefaultGroupName=TruePositive Agent
PrivilegesRequired=lowest
LicenseFile=EULA.txt
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
OutputDir=dist
OutputBaseFilename=truepositive-agent-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableWelcomePage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "autopermissions"; Description: "Let the agent configure Windows log permissions automatically (recommended) — asks for administrator approval once now, instead of a separate prompt every time a new data source is turned on later"; GroupDescription: "Data collection:"

[Files]
Source: "dist\truepositive-agent.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Belt-and-suspenders: InitializeUninstall (below, in [Code]) is what
; actually has to kill the process — see that comment for why. This entry
; is a harmless no-op re-check in the normal case, and a fallback in case
; the process got started again in the window between the two.
Filename: "{cmd}"; Parameters: "/C taskkill /F /IM {#MyAppExeName}"; Flags: runhidden; StatusMsg: "Stopping the agent…"; RunOnceId: "KillAgent"

[UninstallDelete]
; These are all written by the running app (or this installer's own
; diagnostics) at runtime, not installed by Setup, so Inno's automatic
; per-file uninstall tracking doesn't know about them — remove explicitly.
Type: files; Name: "{app}\agent_config.json"
Type: files; Name: "{app}\agent_state.json"
Type: files; Name: "{app}\agent_status.json"
Type: files; Name: "{app}\agent_crash_log.json"
Type: files; Name: "{app}\elevated_action_result.json"
Type: files; Name: "{app}\elevated_actions.log"
Type: files; Name: "{app}\install_debug.log"
Type: dirifempty; Name: "{app}"

[Code]
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  // Best-effort: if a previous install is already running (e.g. reinstalling
  // over a live one), close it first so the [Files] copy below doesn't fail
  // with a "file in use" error. Ignoring the result is deliberate: nothing
  // running is the common case.
  Exec('taskkill.exe', '/F /IM {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;

// One-time, explicit, opt-in setup (the "autopermissions" task above) for
// the two fixed, non-parameterized Scheduled Tasks tp_agent.py's
// _run_privileged_action looks for -- "TruePositive Agent\GrantLogAccess"
// and "TruePositive Agent\InstallSysmon". Each task's action is a fixed
// command line (this app's own .exe, called with one fixed --elevated-action
// flag) decided here at install time, not something the running agent (or
// anything else) can alter later -- and each is scoped to /RU {username},
// the specific person installing, not a system-wide account, so a
// different standard user on a shared machine can't invoke them.
//
// One real UAC prompt covers creating both tasks (batched into one elevated
// cmd.exe call) rather than two separate prompts. If the user declines it,
// this is a soft failure, not a fatal one: the app already has a working
// per-action fallback (tp_agent.py's _run_privileged_action prompts UAC on
// demand instead) -- see the message shown below on failure.
// Uses the exact same elevation pattern already proven live to trigger a
// real UAC prompt (tp_agent.py's _run_elevated_powershell: an elevated
// PowerShell script via ShellExec's 'runas' verb) rather than a separate,
// never-live-tested cmd.exe/batch-file mechanism -- consistency with a
// known-working approach matters more here than it looks, since a subtle
// difference (a batch file vs. a .ps1, cmd.exe vs. powershell.exe as the
// elevated target) is exactly the kind of thing that can silently behave
// differently. Also writes a plain-text log (install_debug.log, next to
// the app itself) at every step, including from *inside* the elevated
// script -- this procedure previously failed with no visible symptom at
// all (no UAC prompt, no error message), which isn't otherwise diagnosable
// without a log to actually read afterward.
procedure CreateScheduledTasksElevated();
var
  ExePath, ScriptPath, ScriptContent, LogPath, LaunchOkStr: String;
  ResultCode: Integer;
  LaunchOk: Boolean;
begin
  LogPath := ExpandConstant('{app}\install_debug.log');
  SaveStringToFile(LogPath, 'CreateScheduledTasksElevated: starting' + #13#10, True);

  ExePath := ExpandConstant('{app}\{#MyAppExeName}');
  ScriptPath := ExpandConstant('{tmp}\tp_create_tasks.ps1');

  // Two real quoting bugs found and fixed by directly testing this exact
  // script content live (not by reasoning about it):
  // 1. /TR's value needs its own embedded double-quotes around the exe
  //    path (there's a space in "TruePositive Agent"). A bare embedded `"`
  //    -- even built via a PowerShell variable, not a literal string --
  //    gets mangled by PowerShell's native-command argument re-parsing
  //    (schtasks received a truncated, invalid fragment). Escaping the
  //    embedded quotes as a literal `\"` two-character sequence instead of
  //    a real `"` character is what native Windows argument parsing
  //    (CommandLineToArgvW, which schtasks.exe uses) actually expects, and
  //    is what fixed it.
  // 2. /RU with a bare username ("Gio") failed with "The parameter is
  //    incorrect" -- the same class of identity-resolution issue already
  //    found and fixed in tp_agent.py's _do_grant_log_access. Same fix
  //    here: resolve the fully-qualified COMPUTERNAME\Username via
  //    WindowsIdentity instead of Inno's bare {username} constant.
  ScriptContent :=
    '$exePath = "' + ExePath + '"' + #13#10 +
    '$userName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name' + #13#10 +
    '$tr1 = "\`"$exePath\`" --elevated-action grant_log_access"' + #13#10 +
    '$tr2 = "\`"$exePath\`" --elevated-action install_sysmon"' + #13#10 +
    '"[elevated script] running as $userName; tr1=$tr1" | Out-File -FilePath ''' + LogPath + ''' -Append' + #13#10 +
    'schtasks /Create /TN "TruePositive Agent\GrantLogAccess" /TR $tr1 /SC ONCE /ST 00:00 /RU $userName /RL HIGHEST /F 2>&1 | Out-File -FilePath ''' + LogPath + ''' -Append' + #13#10 +
    '$r1 = $LASTEXITCODE' + #13#10 +
    'schtasks /Create /TN "TruePositive Agent\InstallSysmon" /TR $tr2 /SC ONCE /ST 00:00 /RU $userName /RL HIGHEST /F 2>&1 | Out-File -FilePath ''' + LogPath + ''' -Append' + #13#10 +
    '$r2 = $LASTEXITCODE' + #13#10 +
    '"[elevated script] r1=$r1 r2=$r2" | Out-File -FilePath ''' + LogPath + ''' -Append' + #13#10 +
    'if ($r1 -ne 0 -or $r2 -ne 0) { exit 1 } else { exit 0 }' + #13#10;

  SaveStringToFile(ScriptPath, ScriptContent, False);
  SaveStringToFile(LogPath, 'About to ShellExec runas powershell.exe -File "' + ScriptPath + '"' + #13#10, True);

  LaunchOk := ShellExec('runas', 'powershell.exe',
    '-NoProfile -ExecutionPolicy Bypass -File "' + ScriptPath + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  if LaunchOk then LaunchOkStr := 'True' else LaunchOkStr := 'False';
  SaveStringToFile(LogPath, 'ShellExec returned LaunchOk=' + LaunchOkStr + ' ResultCode=' + IntToStr(ResultCode) + #13#10, True);

  DeleteFile(ScriptPath);

  if (not LaunchOk) or (ResultCode <> 0) then
  begin
    SaveStringToFile(LogPath, 'Automatic permission setup did not complete.' + #13#10, True);
    MsgBox(
      'Automatic data-source permissions weren''t set up (the administrator prompt was ' +
      'declined or failed, or something went wrong — see install_debug.log next to the app ' +
      'for details). This is fine — the agent will still ask for one-time approval later, ' +
      'individually, whenever a data source that needs it is turned on.',
      mbInformation, MB_OK);
  end
  else
    SaveStringToFile(LogPath, 'Automatic permission setup completed successfully.' + #13#10, True);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  LogPath, SelectedStr: String;
  Selected: Boolean;
begin
  if CurStep = ssPostInstall then
  begin
    LogPath := ExpandConstant('{app}\install_debug.log');
    Selected := WizardIsTaskSelected('autopermissions');
    if Selected then SelectedStr := 'True' else SelectedStr := 'False';
    SaveStringToFile(LogPath, 'CurStepChanged(ssPostInstall): autopermissions selected=' + SelectedStr + #13#10, True);
    if Selected then
      CreateScheduledTasksElevated();
  end;
end;

// Best-effort, non-elevated cleanup -- deleting a task's *definition* is
// normally permitted for its own creator without needing to re-elevate
// (RunLevel only governs what the task runs *as*, not who may delete it),
// so this deliberately does NOT force a fresh UAC prompt during uninstall
// just to remove two scheduled tasks. If it does fail on some
// configuration, the worst case is an orphaned, harmless disabled-by-time
// task left behind -- not a blocked or failed uninstall.
procedure DeleteScheduledTasksBestEffort();
var
  ResultCode: Integer;
begin
  Exec('schtasks.exe', '/Delete /TN "TruePositive Agent\GrantLogAccess" /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('schtasks.exe', '/Delete /TN "TruePositive Agent\InstallSysmon" /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  // Kill the running process *before* Inno gets a chance to notice it.
  // Empirically verified (no AppMutex directive is even set in this script)
  // that Inno 6.7 still auto-detects the target exe is locked/running and
  // shows its built-in "Uninstall has detected that ... is currently
  // running" prompt — which, under /SUPPRESSMSGBOXES (any real silent/
  // scripted uninstall), defaults to Cancel and aborts the whole uninstall
  // before [UninstallRun] ever executes. InitializeUninstall is the
  // earliest uninstall hook available, called before that automatic check,
  // so killing the process here preempts it entirely rather than racing it.
  Exec('taskkill.exe', '/F /IM {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  // The app (not this installer) writes this Run-key value on its first
  // successful connection — see _ensure_windows_autostart in tp_agent.py.
  // Deleting it here, rather than declaring it in [Registry], means Setup
  // never creates it itself, preserving that "only after a real connection"
  // behavior while still guaranteeing uninstall cleans it up.
  if CurUninstallStep = usUninstall then
  begin
    RegDeleteValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Run', 'TruePositiveAgent');
    DeleteScheduledTasksBestEffort();
  end;
end;
