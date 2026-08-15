# TruePositive Agent

`tp_agent.py` is a real, runnable agent process. It registers with the backend, sends heartbeats, and — as of Sprint 5 — actually reads its assigned log sources and ships batches of real log data.

**What it does:** registers with a one-time enrollment key (generated from the dashboard's onboarding step 2 or Settings → Sources → "Deploy agent"), then every 30 seconds sends a heartbeat and collects+ships any new log activity from its assigned sources (fetched from `GET /agents/{id}/sources` each cycle — add, edit, or pause a source in Settings and the agent picks it up on its next cycle, no redeploy needed).

**What it collects — local sources only, no remote/SSH:**
- **Windows Event Log channels** (e.g. `Security`, `Microsoft-Windows-Sysmon/Operational`, `Microsoft-Windows-PowerShell/Operational` — whatever channel name is in a source's `path`), read via the built-in `wevtutil` command (no extra Python dependency). **Reading `Security` or `Sysmon` needs an elevated (Administrator) process** — a non-elevated run still works fine for `PowerShell Operational` and logs a one-line warning (not a crash) for any channel it can't read.
- **A local file to tail** on Linux (source `path` is a literal file path, e.g. `/var/log/auth.log`) — line-by-line, with a simple keyword heuristic (`error`/`fail`/`warn`/`critical`) for severity since plain text lines have no structured level field.

Each source's read position (a Windows `EventRecordID` or a file byte offset) is saved to `agent_state.json` next to the agent and reloaded on startup, so a restart resumes from where it left off — nothing is re-shipped or silently skipped. The very first cycle for a brand-new source deliberately doesn't backfill its entire history; it just notes the current position and starts collecting from there.

**Survives reboots on its own, invisibly** — the packaged `.exe` registers itself to auto-start at Windows login on its first successful connection (a per-user Registry `Run` key, no admin rights needed), so installing and connecting it once is really once: log out, reboot, whatever — it comes back on its own and keeps collecting. That login-time relaunch runs with a `--silent` flag: no window, no taskbar entry, nothing to close or click past — it registers, then heartbeats and collects in the background exactly like the visible mode does, just with no UI at all (`run_silent()` in `tp_agent.py`, no Tkinter involved). A fresh boot can win the race against the network actually being up, so the first registration attempt retries a few times (3 tries, 10s apart) before giving up for that login. A manual double-click of the Start Menu shortcut (or the portable `.exe`) never carries `--silent`, so that always opens the normal visible window — auto-start is the only thing that's silent. Closing that visible window keeps it running too: the window just hides (`root.withdraw()`), the collection loop keeps running in the background — click the window's **Exit** button (not the X) to actually stop the process, or uninstall it (below) to stop and remove it entirely. None of this applies to a plain `python tp_agent.py` dev/terminal run, so testing locally never touches your registry. If the exe was launched with `--url/--id/--key` rather than a pre-configured download, it also writes those details to a local `agent_config.json` next to itself the first time, so the silent auto-started relaunch (which runs with no `--url/--id/--key`, just `--silent`) still has something to connect with.

## Three ways to run it

**1. Windows installer (the primary path — a real install/uninstall experience).** The dashboard's "Download agent installer for Windows" button downloads `truepositive-agent-setup.exe` — one file, the same for every org (no per-agent config baked in). Running it is a normal Windows install: license terms, a per-user install location (`%LOCALAPPDATA%\TruePositive Agent`, no admin rights/UAC prompt), a Start Menu shortcut, and a real uninstaller registered in Windows Settings → Apps (or Control Panel → Programs and Features). On first launch, the app shows a small "Connect this agent" form — paste in the Server URL, Agent ID, and Enrollment Key shown on the dashboard's enrollment panel (each has its own Copy button there) and click Connect.

Uninstalling stops the background process (`taskkill /F` on the exe, run before any files are removed — see `agent/installer.iss`'s `[UninstallRun]`), removes the Registry `Run` key the app wrote at connect time, and deletes the install directory including `agent_config.json`/`agent_state.json`.

**2. Advanced: portable, pre-configured `.exe` (no installer).** The enrollment panel's "Advanced" section downloads a single `truepositive-agent.exe`, already configured for that specific agent — its connection details are embedded directly in the file server-side (see `CONFIG_MARKER` in `tp_agent.py`), nothing to paste. Double-click it and it opens the same small status window. No Start Menu entry, no uninstaller — stopping it means clicking its Exit button or killing the process by hand, and removing it means deleting the file yourself plus (if it auto-started at least once) the `TruePositiveAgent` Registry `Run` value under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

Onefile mode re-extracts the whole bundle to a temp dir on every launch, which is slow enough that double/triple-clicking is common — a single-instance lock (Windows named mutex, frozen-only) means extra clicks just show "already running" instead of quietly starting duplicate agent processes. That dialog now also shows the running instance's actual last-known status (Connected / Connection failed / Heartbeat failed, its Agent ID, and when that was last updated) — both `run_gui` and `run_silent` write this to `agent_status.json` next to the agent on every status change, since it's otherwise the only way to check on a silently-autostarted (no window at all) or hidden (closed-to-tray-less-background) instance without killing and relaunching it.

A standalone `agent_config.json` placed next to either `.exe` also works (checked as a fallback if no config is embedded) — useful if you're assembling a deployment by hand rather than through the dashboard.

**3. From a terminal, with explicit arguments** (Linux/macOS, or for scripting):
```bash
python tp_agent.py --url http://localhost:8000 --id <agent_id> --key <enrollment_key>
```
Requires Python 3.9+, stdlib only — no `pip install` needed to run the `.py` directly this way.

`--silent` is the fourth flag (no window, no taskbar entry) — it's what the Registry `Run` key uses for the login-time auto-start relaunch, not meant for a human to type. It composes with `--url/--id/--key` too (useful for testing this mode directly, without needing to fake a persisted `agent_config.json`), but without those it only does anything if a config is already persisted or embedded — it deliberately won't show the "Connect this agent" form, since a silent launch that pops a GUI to ask for input defeats the point.

## Building the Windows `.exe` and installer

Both build steps produce gitignored artifacts under `agent/dist/`. The backend reads that directory from a read-only bind mount (`agent/dist/` → `/app/agent_dist` in `docker-compose.yml`) at three endpoints, all 404ing with a helpful message if their file hasn't been built yet:
- `GET /agents/download/windows` — the raw, unconfigured `.exe` (no auth).
- `POST /agents/download/windows` (user JWT; body `{url, id, key}`) — the same `.exe` with that agent's config appended; the enrollment panel's "Advanced" download.
- `GET /agents/download/windows-installer` — the installer (no auth, nothing agent-specific to embed); the enrollment panel's primary download.

**Step 1 — the `.exe` (PyInstaller):**
```bash
pip install pyinstaller
pyinstaller tp_agent.spec
```
Produces `agent/dist/truepositive-agent.exe`, named `truepositive-agent` and using `icon.ico` (tracked — regenerate with `python generate_icon.py` if the brand mark ever changes) per `tp_agent.spec` (tracked, records the exact build config for reproducibility — build from the `.spec`, not a bare `pyinstaller tp_agent.py`, or these settings are silently lost). UPX compression is deliberately off (`upx=False`) — it doesn't help onefile's mandatory per-launch extraction step and only adds decompression work. `pyinstaller` itself doesn't need to stay installed afterward — it's a one-time build tool, not a runtime dependency.

**Step 2 — the installer (Inno Setup), built from that `.exe`:**
```bash
winget install JRSoftware.InnoSetup   # one-time, same as installing PyInstaller above
iscc installer.iss
```
Produces `agent/dist/truepositive-agent-setup.exe` from `installer.iss` (tracked — per-user install, no admin rights, license terms from `EULA.txt`, which is a template and needs real legal review before wide distribution). Requires step 1 to have already produced `dist/truepositive-agent.exe`.

Only a Windows build exists today. Native installers for Linux/Docker/Kubernetes are a future release — those platforms use the terminal-args path above in the meantime.

## Roadmap

Packaged installers for other platforms, and remote (SSH) log collection, are future work beyond this sprint.
