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
; agent_config.json and agent_state.json are written by the running app at
; runtime, not installed by Setup, so Inno's automatic per-file uninstall
; tracking doesn't know about them — remove them explicitly.
Type: files; Name: "{app}\agent_config.json"
Type: files; Name: "{app}\agent_state.json"
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
  end;
end;
