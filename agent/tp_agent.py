#!/usr/bin/env python3
"""TruePositive scripted-stub agent (Sprint 3 — see agent/README.md).

Registers with the backend using a one-time enrollment key, then sends a
heartbeat every 30 seconds until stopped. This is what actually flips an
agent from "pending" to "connected" in the dashboard — a real running
process, not a curl one-liner. It does not read or ship any log data; that
lands with the real collector in a later sprint.

Two ways to run it:

1. Double-click (packaged .exe, no arguments): the dashboard's "Download
   agent" button downloads a single, already-configured .exe — your
   connection details are embedded directly in the file (see CONFIG_MARKER
   below), nothing to type, nothing else to download or place alongside it.
   Opens a small status window instead of a terminal. (A standalone
   `agent_config.json` file next to it also works, for anyone assembling a
   deployment manually.)

2. From a terminal, with explicit arguments (useful on Linux/macOS, or for
   scripting):
    python tp_agent.py --url http://localhost:8000 --id <agent_id> --key <enrollment_key>

Stdlib only — no `pip install` required to run the .py directly.
"""
import argparse
import json
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

HEARTBEAT_INTERVAL_SECONDS = 30
CONFIG_FILENAME = "agent_config.json"
# Must match the backend's routes/agents.py — the dashboard's one-click
# download appends this marker + a JSON config directly onto a copy of this
# program's own compiled .exe, so double-clicking it needs nothing else next
# to it. PyInstaller's onefile bootloader tolerates arbitrary trailing bytes
# after its own archive (verified empirically — same principle Authenticode
# code-signing relies on when it appends a signature to an .exe).
CONFIG_MARKER = b"\n#TPCONFIG_V1#\n"


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

    try:
        while True:
            time.sleep(HEARTBEAT_INTERVAL_SECONDS)
            beat = _post(f"{base}/agents/{agent_id}/heartbeat", agent_key, {})
            print(f"heartbeat ok — last_seen_at={beat['last_seen_at']}", flush=True)
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
    tk.Label(root, text="You can close this window to stop the agent.", font=("Segoe UI", 8), fg="#999999").pack(
        pady=(8, 0)
    )

    stop_event = threading.Event()

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

    def on_close() -> None:
        stop_event.set()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)
    threading.Thread(target=worker, daemon=True).start()
    root.mainloop()


def _show_missing_config_message() -> None:
    message = (
        f"No connection details found.\n\n"
        f"Download the agent from the dashboard's \"Download agent\" button — it comes pre-configured, "
        f"nothing to set up. (If you copied this file manually, place a '{CONFIG_FILENAME}' file next to "
        f"it, or run from a terminal with --url/--id/--key.)"
    )
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("TruePositive Agent", message)
    except Exception:
        print(message, file=sys.stderr)


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

    config = _load_config()
    if config is None:
        _show_missing_config_message()
        sys.exit(1)

    run_gui(config["url"].rstrip("/"), config["id"], config["key"])


if __name__ == "__main__":
    main()
