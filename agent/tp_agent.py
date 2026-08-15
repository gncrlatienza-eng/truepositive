#!/usr/bin/env python3
"""TruePositive agent (Sprint 5 — see agent/README.md).

Registers with the backend using a one-time enrollment key, sends a
heartbeat every 30 seconds, and — new this sprint — actually reads its
assigned local log sources and ships batches to the backend. Local only:
Windows Event Log channels (Security/Sysmon/PowerShell Operational — read
via the built-in `wevtutil`, no extra dependency) or a local file to tail on
Linux. Remote (SSH) sources aren't collected by this script.

Three ways to run it:

1. The dashboard's "Download agent installer for Windows" button — a real
   Windows installer (EULA, install location, Start Menu shortcut, proper
   uninstall via Add/Remove Programs). Same installer for every org; on
   first launch it shows a small form to paste the Server URL/Agent ID/Key
   from the dashboard's enrollment panel (see `_show_connect_form`).

2. Advanced: a single, already-configured .exe (no installer) — your
   connection details are embedded directly in the file (see CONFIG_MARKER
   below), nothing to type. Opens a small status window instead of a
   terminal. (A standalone `agent_config.json` file next to it also works,
   for anyone assembling a deployment manually.)

3. From a terminal, with explicit arguments (useful on Linux/macOS, or for
   scripting):
    python tp_agent.py --url http://localhost:8000 --id <agent_id> --key <enrollment_key>

Stdlib only — no `pip install` required to run the .py directly. Reading the
Security or Sysmon channels needs an elevated (Administrator) process; a
non-elevated run still works fine for PowerShell Operational and any local
file source, and logs a clear one-line warning instead of crashing when a
channel it can't read is skipped. Every cycle also reports each source's real
collection outcome (ok, or an error with a specific reason) back to the
backend, so Settings can show a genuinely agent-observed health status
instead of a guess.

The packaged .exe is `truepositive-agent.exe` — PyInstaller's onefile mode
means it re-extracts itself to a temp dir on every launch, which is slow
enough that double/triple-clicking is common; a single-instance lock (see
`_acquire_single_instance_lock`) stops extra clicks from piling up duplicate
running agents.
"""

import argparse
import json
import platform
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

HEARTBEAT_INTERVAL_SECONDS = 30
CONFIG_FILENAME = "agent_config.json"
STATE_FILENAME = "agent_state.json"
COLLECT_BATCH_LIMIT = 200
# Must match the backend's routes/agents.py — the dashboard's one-click
# download appends this marker + a JSON config directly onto a copy of this
# program's own compiled .exe, so double-clicking it needs nothing else next
# to it. PyInstaller's onefile bootloader tolerates arbitrary trailing bytes
# after its own archive (verified empirically — same principle Authenticode
# code-signing relies on when it appends a signature to an .exe).
CONFIG_MARKER = b"\n#TPCONFIG_V1#\n"

_EVENT_NS = "{http://schemas.microsoft.com/win/2004/08/events/event}"
_LEVEL_TEXT_TO_SEVERITY = {
    "Critical": "critical",
    "Error": "high",
    "Warning": "medium",
    "Information": "ok",
    "Verbose": "ok",
}


class AgentRequestError(Exception):
    pass


def _post(url: str, agent_key: str, body: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Agent-Key": agent_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise AgentRequestError(f"Request to {url} failed ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise AgentRequestError(f"Could not reach {url}: {exc.reason}") from exc


def _get(url: str, agent_key: str) -> object:
    request = urllib.request.Request(url, headers={"X-Agent-Key": agent_key}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise AgentRequestError(f"Request to {url} failed ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise AgentRequestError(f"Could not reach {url}: {exc.reason}") from exc


def _app_dir() -> Path:
    # PyInstaller's --onefile build unpacks to a temp dir at runtime, but
    # sys.executable still points at the launched .exe itself — that's the
    # folder the user actually put agent_config.json in.
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _load_embedded_config() -> dict | None:
    if not getattr(sys, "frozen", False):
        return None
    try:
        data = Path(sys.executable).read_bytes()
    except OSError:
        return None
    marker_index = data.rfind(CONFIG_MARKER)
    if marker_index == -1:
        return None
    try:
        return json.loads(data[marker_index + len(CONFIG_MARKER) :].decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None


def _load_config() -> dict | None:
    embedded = _load_embedded_config()
    if embedded is not None:
        return embedded

    config_path = _app_dir() / CONFIG_FILENAME
    if not config_path.exists():
        return None
    return json.loads(config_path.read_text(encoding="utf-8"))


# Bookmarks (per source_id: Windows EventRecordID, or byte offset for a
# tailed file) persist across restarts so a reboot resumes where it left
# off instead of re-shipping everything or silently skipping the gap —
# this is what makes "download once, never touch again" actually true.
def _load_state() -> dict:
    state_path = _app_dir() / STATE_FILENAME
    if not state_path.exists():
        return {"bookmarks": {}}
    try:
        return json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"bookmarks": {}}


def _save_state(state: dict) -> None:
    state_path = _app_dir() / STATE_FILENAME
    try:
        state_path.write_text(json.dumps(state), encoding="utf-8")
    except OSError:
        pass  # Non-fatal — worst case, the next cycle re-derives bookmarks.


def _normalize_timestamp(raw: str) -> str:
    # Windows TimeCreated uses up to 7 fractional-second digits (100ns
    # ticks); Python/Pydantic datetimes only support 6 (microseconds).
    match = re.match(r"^(.*\.\d{6})\d*(Z)?$", raw)
    if match:
        return match.group(1) + (match.group(2) or "Z")
    return raw


def _parse_windows_event(xml_text: str) -> dict | None:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return None

    system = root.find(f"{_EVENT_NS}System")
    if system is None:
        return None
    record_id_el = system.find(f"{_EVENT_NS}EventRecordID")
    time_el = system.find(f"{_EVENT_NS}TimeCreated")
    event_id_el = system.find(f"{_EVENT_NS}EventID")
    provider_el = system.find(f"{_EVENT_NS}Provider")
    if record_id_el is None or record_id_el.text is None or time_el is None:
        return None

    rendering = root.find(f"{_EVENT_NS}RenderingInfo")
    message_el = rendering.find(f"{_EVENT_NS}Message") if rendering is not None else None
    task_el = rendering.find(f"{_EVENT_NS}Task") if rendering is not None else None
    level_text_el = rendering.find(f"{_EVENT_NS}Level") if rendering is not None else None
    keywords_el = rendering.find(f"{_EVENT_NS}Keywords") if rendering is not None else None
    keywords = [k.text for k in keywords_el.findall(f"{_EVENT_NS}Keyword") if k.text] if keywords_el is not None else []

    # RenderingInfo's Level is the human-readable string ("Information",
    # "Error", ...) straight from the provider — more reliable than
    # decoding System/Level's raw numeric code ourselves. "Audit Failure"
    # is a pragmatic bump for Security-style events, most of which report
    # Level=0 (LogAlways) and carry the real signal in Keywords instead.
    level_text = level_text_el.text if level_text_el is not None and level_text_el.text else None
    if "Audit Failure" in keywords:
        severity = "high"
    elif level_text and level_text in _LEVEL_TEXT_TO_SEVERITY:
        severity = _LEVEL_TEXT_TO_SEVERITY[level_text]
    else:
        severity = _LEVEL_TEXT_TO_SEVERITY.get("Information", "ok")

    event_id = event_id_el.text if event_id_el is not None and event_id_el.text else "?"
    event_type = (task_el.text if task_el is not None and task_el.text else None) or f"EventID {event_id}"
    provider_name = provider_el.get("Name", "Unknown") if provider_el is not None else "Unknown"
    message = (message_el.text or "").strip() if message_el is not None and message_el.text else ""
    if not message:
        message = f"{provider_name} event {event_id}"

    try:
        record_id = int(record_id_el.text)
    except ValueError:
        return None  # malformed EventRecordID — skip just this event, not the whole cycle

    return {
        "record_id": record_id,
        "timestamp": _normalize_timestamp(time_el.get("SystemTime", "")),
        "severity": severity,
        "event_type": event_type[:100],
        "message": message[:4000],
    }


# Channels that have already produced a warning this process lifetime don't
# warn again — a restart (e.g. after granting Administrator rights) retries
# and re-warns if still failing, so this is deliberately not persisted.
_warned_channels: set[str] = set()


def _warn_channel_once(channel: str, reason: str, log_fn) -> None:
    if channel in _warned_channels:
        return
    _warned_channels.add(channel)
    log_fn(f"Could not read Windows Event Log channel '{channel}': {reason}. Skipping it this and future cycles until restart.")


def _query_windows_channel(
    channel: str, after_record_id: int | None, limit: int, log_fn=print, newest_first: bool = False
) -> tuple[list[dict], str, str | None]:
    if shutil.which("wevtutil") is None:
        reason = "wevtutil not found on PATH"
        _warn_channel_once(channel, reason, log_fn)
        return [], "error", reason
    xpath = "*" if after_record_id is None else f"*[System[EventRecordID>{after_record_id}]]"
    # Without this, every wevtutil call briefly flashes a console window on
    # screen — the packaged agent is a windowed (console=False) build, but a
    # child process that owns its own console (like wevtutil.exe) still pops
    # one up unless explicitly suppressed. CREATE_NO_WINDOW doesn't exist on
    # POSIX, hence the platform guard.
    creationflags = subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0
    rd_flag = "true" if newest_first else "false"
    try:
        result = subprocess.run(  # noqa: S603 — fixed executable name, no shell, args are ints/literals
            ["wevtutil", "qe", channel, f"/q:{xpath}", "/f:RenderedXml", f"/rd:{rd_flag}", f"/c:{limit}"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
            creationflags=creationflags,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        reason = f"could not run wevtutil ({exc})"
        _warn_channel_once(channel, reason, log_fn)
        return [], "error", reason

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        if "access is denied" in stderr.lower():
            reason = "Access denied — run the agent as Administrator to read this channel."
        elif stderr:
            reason = stderr[:200]
        else:
            reason = f"wevtutil exited {result.returncode}"
        _warn_channel_once(channel, reason, log_fn)
        return [], "error", reason

    if not result.stdout.strip():
        return [], "ok", None  # normal: no new events since the last bookmark, not a failure

    events = []
    for chunk in result.stdout.split("</Event>"):
        chunk = chunk.strip()
        if not chunk:
            continue
        parsed = _parse_windows_event(chunk + "</Event>")
        if parsed is not None:
            events.append(parsed)
    return events, "ok", None


_SEVERITY_KEYWORDS = [
    ("critical", "critical"),
    ("fatal", "critical"),
    ("error", "high"),
    ("fail", "high"),
    ("warn", "medium"),
]


def _guess_line_severity(line: str) -> str:
    lowered = line.lower()
    for keyword, severity in _SEVERITY_KEYWORDS:
        if keyword in lowered:
            return severity
    return "ok"


def _tail_local_file(path: str, offset: int, limit: int) -> tuple[list[dict], int, str, str | None]:
    file_path = Path(path)
    if not file_path.exists():
        return [], offset, "error", f"File not found: {path}"
    events = []
    new_offset = offset
    try:
        with file_path.open("r", encoding="utf-8", errors="replace") as handle:
            handle.seek(offset)
            for _ in range(limit):
                line = handle.readline()
                if not line:
                    break
                stripped = line.rstrip("\n")
                if stripped:
                    events.append(
                        {
                            "timestamp": None,  # no reliable per-line timestamp — ship() fills in "now"
                            "severity": _guess_line_severity(stripped),
                            "event_type": "log line",
                            "message": stripped[:4000],
                        }
                    )
            new_offset = handle.tell()
    except OSError as exc:
        return [], offset, "error", f"Could not read file ({exc})"
    return events, new_offset, "ok", None


def _collect_source(source: dict, bookmark, log_fn=print) -> tuple[list[dict], object, str, str | None]:
    path = source.get("path")
    if not path:
        return [], bookmark, "error", "No path configured for this source."

    if platform.system() == "Windows":
        if bookmark is None:
            # First-ever cycle for this source: fetch just the single newest
            # event to learn where "now" is. Paging forward from record id 0
            # in COLLECT_BATCH_LIMIT-sized chunks (the old approach) would
            # backfill and ship the channel's entire pre-existing history,
            # 200 events at a time, over however many cycles that takes.
            latest, status, reason = _query_windows_channel(path, None, 1, log_fn, newest_first=True)
            if not latest:
                return [], bookmark, status, reason
            return [], latest[0]["record_id"], status, reason
        events, status, reason = _query_windows_channel(path, bookmark, COLLECT_BATCH_LIMIT, log_fn)
        if not events:
            return [], bookmark, status, reason
        new_bookmark = max(e["record_id"] for e in events)
        return events, new_bookmark, status, reason

    if bookmark is None:
        # Same first-cycle rule as above, applied via byte offset: start from
        # end-of-file rather than 0, so an existing file's history isn't
        # slowly replayed as "new" lines.
        file_path = Path(path)
        if not file_path.exists():
            return [], bookmark, "error", f"File not found: {path}"
        try:
            eof_offset = file_path.stat().st_size
        except OSError as exc:
            return [], bookmark, "error", f"Could not read file ({exc})"
        return [], eof_offset, "ok", None

    events, new_offset, status, reason = _tail_local_file(path, bookmark, COLLECT_BATCH_LIMIT)
    return events, new_offset, status, reason


def _collect_and_ship(base: str, agent_id: str, agent_key: str, state: dict, log_fn=print) -> None:
    try:
        sources = _get(f"{base}/agents/{agent_id}/sources", agent_key)
    except AgentRequestError as exc:
        log_fn(f"Could not fetch assigned sources: {exc}")
        return

    bookmarks = state.setdefault("bookmarks", {})
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    batch = []
    # New bookmarks are staged separately and only merged into `bookmarks`
    # (and persisted) once the batch actually ships — advancing them
    # unconditionally here would drop this cycle's events for good if the
    # POST below fails, since the in-memory position would already have
    # moved past them even without a restart to reload the old on-disk value.
    staged_bookmarks = {}
    source_results = []
    for source in sources:
        source_id = source["id"]
        events, new_bookmark, status, reason = _collect_source(source, bookmarks.get(source_id), log_fn)
        staged_bookmarks[source_id] = new_bookmark
        source_results.append({"source_id": source_id, "status": status, "reason": reason})
        for event in events:
            batch.append(
                {
                    "source_id": source_id,
                    "timestamp": event["timestamp"] or now_iso,
                    "severity": event["severity"],
                    "event_type": event["event_type"],
                    "message": event["message"],
                    "raw": {},
                }
            )

    # Reported every cycle regardless of whether anything shipped, so
    # Settings' health indicator reflects the agent's real last attempt —
    # not just "silence" when a channel legitimately had nothing new.
    if source_results:
        try:
            _post(f"{base}/agents/{agent_id}/sources/status", agent_key, {"results": source_results})
        except AgentRequestError as exc:
            log_fn(f"Could not report source status: {exc}")

    if not batch:
        bookmarks.update(staged_bookmarks)
        _save_state(state)
        return

    try:
        result = _post(f"{base}/agents/{agent_id}/logs", agent_key, {"logs": batch})
        log_fn(f"shipped {result['ingested']} log(s), {result['alerts_created']} alert(s) triggered")
        bookmarks.update(staged_bookmarks)
        _save_state(state)
    except AgentRequestError as exc:
        log_fn(f"Failed to ship logs: {exc}")
        # Bookmarks intentionally left unadvanced — retry the same window
        # next cycle rather than silently dropping events that never made
        # it to the backend.


# Only for the packaged, frozen .exe — not a plain `python tp_agent.py` dev
# run, so testing/scripting on Windows never silently touches the registry.
# Registers a per-user auto-start entry (no admin rights needed) so the
# agent survives a reboot/logout without anyone re-running it by hand,
# matching the "download once, done" experience the packaged .exe is for.
def _ensure_windows_autostart(log_fn=print) -> None:
    if platform.system() != "Windows" or not getattr(sys, "frozen", False):
        return
    try:
        import winreg
    except ImportError:
        return
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE
        ) as key:
            winreg.SetValueEx(key, "TruePositiveAgent", 0, winreg.REG_SZ, f'"{sys.executable}"')
        log_fn("Registered to auto-start at Windows login.")
    except OSError as exc:
        log_fn(f"Could not register auto-start (non-fatal): {exc}")


# PyInstaller's onefile bootloader re-extracts the whole bundle to a temp
# dir on *every* launch before Python even starts, which is slow — slow
# enough that impatient double/triple-clicking is common, and each extra
# click was silently starting its own full duplicate agent process. This
# can't make the extraction itself faster (that happens before any of our
# code runs), but it stops the pile-up: the second process to actually reach
# main() finds the mutex already held and exits with one clear message
# instead of quietly running alongside the first. Global\\ (not Local\\) so
# it applies across all sessions, not just the current user's. Frozen-only —
# a `python tp_agent.py` dev run never touches this, so running two agents
# from a terminal for local testing still works.
def _acquire_single_instance_lock() -> bool:
    if platform.system() != "Windows" or not getattr(sys, "frozen", False):
        return True
    try:
        import ctypes

        ctypes.windll.kernel32.CreateMutexW(None, False, "Global\\TruePositiveAgentSingleInstance")
        return ctypes.windll.kernel32.GetLastError() != 183  # ERROR_ALREADY_EXISTS
    except OSError:
        return True  # never block startup over a failed lock attempt


def _show_already_running_message() -> None:
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showinfo("TruePositive Agent", "TruePositive Agent is already running in the background.")
    except Exception:
        print("TruePositive Agent is already running in the background.", file=sys.stderr)


# The Run key above launches the exe with no arguments, so a CLI-args launch
# (truepositive-agent.exe --url ... --id ... --key ...) needs its connection details
# saved somewhere _load_config() will find on that bare relaunch — unless
# they're already embedded in the binary itself (the dashboard's one-click
# download), in which case there's nothing to persist.
def _ensure_local_config_persisted(url: str, agent_id: str, agent_key: str) -> None:
    if not getattr(sys, "frozen", False) or _load_embedded_config() is not None:
        return
    config_path = _app_dir() / CONFIG_FILENAME
    if config_path.exists():
        return
    try:
        config_path.write_text(json.dumps({"url": url, "id": agent_id, "key": agent_key}), encoding="utf-8")
    except OSError:
        pass


def run_cli(base: str, agent_id: str, agent_key: str) -> None:
    hostname = socket.gethostname()
    print(f"Registering agent {agent_id} as '{hostname}'...", flush=True)
    try:
        agent = _post(f"{base}/agents/{agent_id}/register", agent_key, {"hostname": hostname})
    except AgentRequestError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
    print(f"Connected. status={agent['status']} hostname={agent['hostname']}", flush=True)
    print(f"Sending a heartbeat every {HEARTBEAT_INTERVAL_SECONDS}s. Press Ctrl+C to stop.", flush=True)
    _ensure_local_config_persisted(base, agent_id, agent_key)
    _ensure_windows_autostart()

    state = _load_state()
    try:
        while True:
            time.sleep(HEARTBEAT_INTERVAL_SECONDS)
            beat = _post(f"{base}/agents/{agent_id}/heartbeat", agent_key, {})
            print(f"heartbeat ok — last_seen_at={beat['last_seen_at']}", flush=True)
            _collect_and_ship(base, agent_id, agent_key, state)
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(0)
    except AgentRequestError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)


def run_gui(base: str, agent_id: str, agent_key: str) -> None:
    import tkinter as tk
    from tkinter import scrolledtext

    root = tk.Tk()
    root.title("TruePositive Agent")
    root.geometry("440x260")
    root.resizable(False, False)

    status_var = tk.StringVar(value="Connecting…")
    detail_var = tk.StringVar(value=f"Agent ID: {agent_id}")

    tk.Label(root, text="TruePositive Agent", font=("Segoe UI", 14, "bold")).pack(pady=(16, 4))
    tk.Label(root, textvariable=status_var, font=("Segoe UI", 12)).pack()
    tk.Label(root, textvariable=detail_var, font=("Segoe UI", 9), fg="#666666").pack(pady=(2, 12))

    log_box = scrolledtext.ScrolledText(root, height=7, width=52, state="disabled", font=("Consolas", 8))
    log_box.pack(padx=12)
    tk.Label(
        root,
        text="Closing this window keeps the agent running in the background.",
        font=("Segoe UI", 8),
        fg="#999999",
    ).pack(pady=(8, 4))

    stop_event = threading.Event()

    def on_exit() -> None:
        stop_event.set()
        root.destroy()

    tk.Button(root, text="Exit", command=on_exit, width=10).pack(pady=(0, 10))

    def log(message: str) -> None:
        def _append() -> None:
            log_box.configure(state="normal")
            log_box.insert(tk.END, message + "\n")
            log_box.see(tk.END)
            log_box.configure(state="disabled")

        root.after(0, _append)

    def set_status(status: str, detail: str) -> None:
        root.after(0, lambda: (status_var.set(status), detail_var.set(detail)))

    def worker() -> None:
        hostname = socket.gethostname()
        log(f"Registering as '{hostname}'...")
        try:
            agent = _post(f"{base}/agents/{agent_id}/register", agent_key, {"hostname": hostname})
        except AgentRequestError as exc:
            set_status("Connection failed", str(exc))
            log(str(exc))
            return

        set_status("Connected", f"{agent['hostname']} · registered")
        log(f"Connected. Sending a heartbeat every {HEARTBEAT_INTERVAL_SECONDS}s.")
        _ensure_local_config_persisted(base, agent_id, agent_key)
        _ensure_windows_autostart(log_fn=log)

        state = _load_state()
        while not stop_event.is_set():
            if stop_event.wait(HEARTBEAT_INTERVAL_SECONDS):
                break
            try:
                beat = _post(f"{base}/agents/{agent_id}/heartbeat", agent_key, {})
                set_status("Connected", f"last heartbeat {beat['last_seen_at']}")
                log(f"heartbeat ok — last_seen_at={beat['last_seen_at']}")
            except AgentRequestError as exc:
                set_status("Heartbeat failed", str(exc))
                log(str(exc))
            _collect_and_ship(base, agent_id, agent_key, state, log_fn=log)

    def on_close() -> None:
        # The close button used to stop_event.set() + destroy() the whole
        # process — closing the window silently killed collection until the
        # next login. Hiding it instead lets the worker thread (and its 30s
        # collection loop) keep running unattended, matching the "download
        # once, keep running" experience the packaged .exe is for.
        root.withdraw()

    root.protocol("WM_DELETE_WINDOW", on_close)
    threading.Thread(target=worker, daemon=True).start()
    root.mainloop()
    # mainloop() only returns once root.destroy() has run — i.e. the user
    # clicked Exit, not just closed the window (on_close only withdraws it).
    sys.exit(0)


def _validate_connect_fields(url: str, agent_id: str, agent_key: str) -> dict | None:
    url = url.strip().rstrip("/")
    agent_id = agent_id.strip()
    agent_key = agent_key.strip()
    if not url or not agent_id or not agent_key:
        return None
    return {"url": url, "id": agent_id, "key": agent_key}


# Shown when no config was found (installer path — a generic Setup.exe, same
# for every org, has nothing embedded). The dashboard's enrollment panel
# shows these same three values with copy buttons, so this is a paste, not a
# lookup. Returns None if the window is closed without connecting.
def _show_connect_form() -> dict | None:
    import tkinter as tk

    result: dict | None = None
    root = tk.Tk()
    root.title("TruePositive Agent — Connect")
    root.resizable(False, False)

    tk.Label(root, text="Connect this agent", font=("Segoe UI", 13, "bold")).pack(pady=(16, 4), padx=16)
    tk.Label(
        root,
        text="Paste the Server URL, Agent ID, and Enrollment Key shown\non the dashboard's agent enrollment screen.",
        font=("Segoe UI", 9),
        fg="#666666",
        justify="left",
    ).pack(padx=16, pady=(0, 12))

    form = tk.Frame(root)
    form.pack(padx=16, pady=(0, 4))

    url_var = tk.StringVar()
    id_var = tk.StringVar()
    key_var = tk.StringVar()
    error_var = tk.StringVar()

    fields = [("Server URL", url_var, None), ("Agent ID", id_var, None), ("Enrollment Key", key_var, "*")]
    for row, (label_text, var, show) in enumerate(fields):
        tk.Label(form, text=label_text, font=("Segoe UI", 9)).grid(row=row, column=0, sticky="w", pady=4)
        tk.Entry(form, textvariable=var, width=36, show=show or "").grid(row=row, column=1, pady=4, padx=(8, 0))

    tk.Label(root, textvariable=error_var, font=("Segoe UI", 8), fg="#c0392b").pack(padx=16)

    def on_connect() -> None:
        nonlocal result
        validated = _validate_connect_fields(url_var.get(), id_var.get(), key_var.get())
        if validated is None:
            error_var.set("All three fields are required.")
            return
        result = validated
        root.destroy()

    tk.Button(root, text="Connect", command=on_connect, width=14).pack(pady=(8, 16))
    root.bind("<Return>", lambda _event: on_connect())
    root.mainloop()
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=None, help="Backend base URL, e.g. http://localhost:8000")
    parser.add_argument("--id", dest="agent_id", default=None, help="Agent ID shown during enrollment")
    parser.add_argument("--key", dest="agent_key", default=None, help="One-time enrollment key shown during enrollment")
    args = parser.parse_args()

    cli_fields = (args.url, args.agent_id, args.agent_key)
    if any(cli_fields) and not all(cli_fields):
        parser.error("--url, --id, and --key must all be provided together")

    if all(cli_fields):
        run_cli(args.url.rstrip("/"), args.agent_id, args.agent_key)
        return

    if not _acquire_single_instance_lock():
        _show_already_running_message()
        sys.exit(0)

    config = _load_config()
    if config is None:
        config = _show_connect_form()
        if config is None:
            sys.exit(0)

    run_gui(config["url"].rstrip("/"), config["id"], config["key"])


if __name__ == "__main__":
    main()
