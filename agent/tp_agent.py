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
import base64
import hashlib
import http.server
import json
import os
import platform
import re
import shutil
import socket
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

HEARTBEAT_INTERVAL_SECONDS = 30
CONFIG_FILENAME = "agent_config.json"
STATE_FILENAME = "agent_state.json"
# What the "already running" dialog reads (see _show_already_running_message)
# — the *only* way to see this agent's live status once it's running
# silently in the background (auto-start's --silent mode has no window at
# all, and a normal window closes to hidden, not destroyed) with nothing to
# click past. Written on every status change by both run_gui and run_silent.
STATUS_FILENAME = "agent_status.json"
COLLECT_BATCH_LIMIT = 200
# Must stay <= the backend's LogIngestRequest.logs max_length (see
# backend/app/schemas/logs.py) -- a single source can return up to
# COLLECT_BATCH_LIMIT events, so with several sources assigned, one combined
# cycle can otherwise exceed the backend's cap and get a permanent 422 (see
# _collect_and_ship's chunking).
MAX_INGEST_BATCH_SIZE = 500
# See _register_with_retry — capped exponential backoff (5s, 10s, 20s, 40s,
# 60s, 60s, ...) for up to ~5 minutes, so a Docker cold-start after a reboot
# (routinely 30s-2min+) doesn't strand a login-time launch with a near-
# instant give-up. Shared by run_silent and run_gui's worker() so both modes
# behave the same way instead of diverging.
REGISTER_RETRY_INITIAL_DELAY_SECONDS = 5
REGISTER_RETRY_MAX_DELAY_SECONDS = 60
REGISTER_RETRY_BACKOFF_MULTIPLIER = 2
REGISTER_RETRY_GIVE_UP_AFTER_SECONDS = 300
# See _run_with_crash_recovery / _record_crash_and_should_restart — bounds
# how many times an unhandled crash will self-relaunch the process within a
# rolling window, so a persistent bug can't turn into an infinite fast
# crash-restart loop.
CRASH_LOG_FILENAME = "agent_crash_log.json"
MAX_RESTARTS_IN_WINDOW = 5
RESTART_WINDOW_SECONDS = 600
# Hub-and-spoke relay (Phase 1: manual pairing, full isolation — see
# _run_relay_http_server / _relay_call). Arbitrary, fixed port a hub agent
# listens on for its own relay children's LAN-local traffic; must match
# nowhere server-side since the backend never talks to this port directly —
# only another instance of this same script (running as a relay child) does.
RELAY_LISTEN_PORT = 47824
# Must match the backend's routes/agents.py — the dashboard's one-click
# download appends this marker + a JSON config directly onto a copy of this
# program's own compiled .exe, so double-clicking it needs nothing else next
# to it. PyInstaller's onefile bootloader tolerates arbitrary trailing bytes
# after its own archive (verified empirically — same principle Authenticode
# code-signing relies on when it appends a signature to an .exe).
CONFIG_MARKER = b"\n#TPCONFIG_V1#\n"
# Microsoft's own direct-download endpoint for the current Sysmon build (no
# version pinned in the URL -- always serves latest, which is the whole
# point of fetching at install time instead of bundling a copy that goes
# stale). Same domain family as download.sysinternals.com; both are
# Microsoft-owned and served over HTTPS.
SYSMON_DOWNLOAD_URL = "https://live.sysinternals.com/Sysmon64.exe"
SYSMON_CHANNEL = "Microsoft-Windows-Sysmon/Operational"

_EVENT_NS = "{http://schemas.microsoft.com/win/2004/08/events/event}"
_LEVEL_TEXT_TO_SEVERITY = {
    "Critical": "critical",
    "Error": "high",
    "Warning": "medium",
    "Information": "ok",
    "Verbose": "ok",
}


class AgentRequestError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class AgentCredentialsError(AgentRequestError):
    """A 401 on /register: the agent key is wrong or stale. Retrying can
    never fix this — the server already gave a definitive answer — so
    _register_with_retry raises this immediately instead of consuming any
    retry budget on a hopeless case."""


def _safe_console_log(message: str) -> None:
    # A real crash caught live: a log_fn that was bare `print` received a
    # message built from a Sysinternals tool's raw subprocess output, which
    # contained characters the console's active codepage can't represent --
    # print() raised UnicodeEncodeError and took the whole action down.
    # Text arriving here can be anything an external process wrote; it must
    # never be trusted to be safely printable. sys.stdout is also None
    # outright for a frozen windowed (console=False) build -- nothing to
    # write to in that case, not an error.
    stream = sys.stdout
    if stream is None:
        return
    try:
        print(message)
    except UnicodeEncodeError:
        encoding = getattr(stream, "encoding", None) or "utf-8"
        try:
            stream.write(message.encode(encoding, errors="replace").decode(encoding, errors="replace") + "\n")
            stream.flush()
        except OSError:
            pass


# Real DNS-resolution hangs happen in the wild -- especially right after a
# laptop wakes from sleep, a VPN reconnects, or Wi-Fi power-saving cycles the
# adapter -- and urlopen's own `timeout=` parameter does NOT cover them:
# getaddrinfo is a separate blocking OS call that happens before the
# socket's timeout is even in play, and Python's stdlib has no way to bound
# it directly. Left alone, this silently froze the heartbeat loop forever
# with no exception ever raised for anything to catch -- the agent stayed
# alive in Task Manager but stopped reporting, with last_seen_at frozen and
# nothing logged, until someone noticed and manually restarted it.
NETWORK_HARD_TIMEOUT_SECONDS = 20


def _call_with_hard_timeout(fn):
    """Runs fn() in a throwaway daemon thread and joins it with a hard
    wall-clock timeout, so a hang anywhere inside fn (including a stuck DNS
    lookup urlopen's own timeout can't reach) can never block the calling
    thread forever. A Python thread can't be forcibly killed -- if fn is
    still hung when the timeout is hit, the thread keeps running harmlessly
    in the background (daemon=True, so it never blocks process exit either)
    until whatever it's stuck on eventually resolves on its own; the caller
    just stops waiting on it and treats this as a failed call.
    """
    result: dict = {}

    def _target() -> None:
        try:
            result["value"] = fn()
        except Exception as exc:  # noqa: BLE001 — re-raised on the caller's thread below, not swallowed
            result["error"] = exc

    thread = threading.Thread(target=_target, daemon=True)
    thread.start()
    thread.join(timeout=NETWORK_HARD_TIMEOUT_SECONDS)
    if thread.is_alive():
        raise AgentRequestError(
            f"Timed out after {NETWORK_HARD_TIMEOUT_SECONDS}s waiting for a response -- the request may still "
            "be hanging in the background (e.g. a stuck DNS lookup after a network change)."
        )
    if "error" in result:
        raise result["error"]
    return result["value"]


def _open_and_parse(request: urllib.request.Request, url: str) -> dict | object:
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise AgentRequestError(_http_error_message(url, exc), status_code=exc.code) from exc
    except urllib.error.URLError as exc:
        raise AgentRequestError(f"Could not reach {url}: {exc.reason}") from exc


def _post(url: str, agent_key: str, body: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Agent-Key": agent_key},
        method="POST",
    )
    return _call_with_hard_timeout(lambda: _open_and_parse(request, url))


def _get(url: str, agent_key: str) -> object:
    request = urllib.request.Request(url, headers={"X-Agent-Key": agent_key}, method="GET")
    return _call_with_hard_timeout(lambda: _open_and_parse(request, url))


def _http_error_message(url: str, exc: urllib.error.HTTPError) -> str:
    detail = exc.read().decode("utf-8", errors="replace")
    if exc.code == 401:
        return (
            f"Credentials rejected by {url} (401 Not authenticated). The agent key is likely wrong or "
            "stale (e.g. rotated from Settings -> Sources) -- reconnecting with a fresh key is the fix; "
            f"this will not resolve on its own. Server said: {detail}"
        )
    return f"Request to {url} failed ({exc.code}): {detail}"


# ── Connection abstraction: direct-to-backend vs. relay-through-hub ────────
# Every call site that used to build a URL as f"{base}/agents/{agent_id}/..."
# now goes through one of the five wrappers below instead, keyed off a small
# `conn` dict built once by main() (or internally by run_cli, for the CLI
# path) from the loaded config: {"mode": "direct", "base": <real backend
# URL>} preserves today's exact behavior, while {"mode": "relay",
# "hub_relay_url": <hub's local LAN address>} sends the same logical request
# to the hub's local relay listener instead (see _run_relay_http_server for
# the other end of that hop), which makes the real call to the backend on
# this agent's behalf. Every other function in this file that talks to "the
# backend" -- _collect_and_ship, run_cli/run_gui/run_silent -- goes through
# `conn`, never a bare `base` string, so relay mode needed no changes
# anywhere except these wrappers and the three entry points that build `conn`.
# ────────────────────────────────────────────────────────────────────────────


def _relay_call(conn: dict, kind: str, agent_id: str, agent_key: str, **extra) -> dict:
    # agent_key travels over this LAN hop in the clear (plain HTTP, no TLS)
    # -- an accepted, documented v1 trade-off (see SECURITY.md), but not a
    # meaningless one: the hub's local listener forwards it to the real
    # backend, which verifies it against this exact agent's own
    # agent_key_hash before acting on anything (relay_service._get_relay_
    # child) -- this is what stops a LAN-adjacent caller who merely observes
    # this agent's id (also visible on the wire here) from impersonating it.
    body = {"id": agent_id, "key": agent_key, "kind": kind, **extra}
    url = f"{conn['hub_relay_url']}/relay/proxy"
    request = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST"
    )
    return _call_with_hard_timeout(lambda: _open_and_parse(request, url))


def _register(conn: dict, agent_id: str, agent_key: str, hostname: str) -> dict:
    if conn["mode"] == "relay":
        result = _relay_call(conn, "register", agent_id, agent_key, hostname=hostname)["heartbeat"]
    else:
        result = _post(f"{conn['base']}/agents/{agent_id}/register", agent_key, {"hostname": hostname})
    # Relay's response is heartbeat-shaped (id/status/last_seen_at/is_primary)
    # -- it never echoes hostname back, since the child already knows its own.
    # A direct-mode response already has it (the real backend's AgentOut).
    result.setdefault("hostname", hostname)
    return result


def _heartbeat(conn: dict, agent_id: str, agent_key: str, *, relay_listen_addr: str | None = None) -> dict:
    if conn["mode"] == "relay":
        return _relay_call(conn, "heartbeat", agent_id, agent_key)["heartbeat"]
    body = {"relay_listen_addr": relay_listen_addr} if relay_listen_addr is not None else {}
    # Only ever populated direct-mode, same as relay_listen_addr above -- a
    # relay child's capabilities aren't reported yet (out of scope, see
    # implementation plan: relay_proxy's "heartbeat" kind carries no such
    # field today).
    body.update(_capabilities_for_heartbeat())
    return _post(f"{conn['base']}/agents/{agent_id}/heartbeat", agent_key, body)


def _get_sources(conn: dict, agent_id: str, agent_key: str) -> list:
    if conn["mode"] == "relay":
        return _relay_call(conn, "sources", agent_id, agent_key)["sources"]
    return _get(f"{conn['base']}/agents/{agent_id}/sources", agent_key)


def _report_source_status(conn: dict, agent_id: str, agent_key: str, results: list[dict]) -> dict:
    if conn["mode"] == "relay":
        return _relay_call(conn, "source_status", agent_id, agent_key, source_status_results=results)["source_status"]
    return _post(f"{conn['base']}/agents/{agent_id}/sources/status", agent_key, {"results": results})


def _ingest_logs(conn: dict, agent_id: str, agent_key: str, batch: list[dict]) -> dict:
    if conn["mode"] == "relay":
        return _relay_call(conn, "logs", agent_id, agent_key, logs=batch)["logs"]
    return _post(f"{conn['base']}/agents/{agent_id}/logs", agent_key, {"logs": batch})


def _conn_from_config(config: dict) -> dict:
    # config["relay_mode"] is set by _show_connect_form's "Connect through a
    # hub" choice (or an installer/agent_config.json set up that way by
    # hand) -- see that function's docstring for the full shape.
    if config.get("relay_mode"):
        return {"mode": "relay", "hub_relay_url": config["hub_relay_url"].rstrip("/")}
    return {"mode": "direct", "base": config["url"].rstrip("/")}


def _register_with_retry(
    conn: dict,
    agent_id: str,
    agent_key: str,
    hostname: str,
    *,
    on_retry=lambda attempt, delay, exc: None,
    stop_event: threading.Event | None = None,
    give_up_after_seconds: float | None = REGISTER_RETRY_GIVE_UP_AFTER_SECONDS,
) -> dict | None:
    """POSTs /register (direct or relayed, per `conn` -- see above) with
    capped backoff (5s, 10s, 20s, 40s, 60s, 60s, ...). A 401 raises
    AgentCredentialsError immediately -- never retried, since a wrong/stale
    key won't fix itself by waiting. Gives up and returns None once
    give_up_after_seconds has elapsed (or immediately if stop_event fires
    during a wait), matching "the next login tries again". on_retry is
    called after each retryable failure so callers can update their own
    status surface (console log vs. Tk label) without this function knowing
    about either.
    """
    attempt = 0
    delay = REGISTER_RETRY_INITIAL_DELAY_SECONDS
    started = time.monotonic()
    while True:
        attempt += 1
        try:
            return _register(conn, agent_id, agent_key, hostname)
        except AgentRequestError as exc:
            if exc.status_code == 401:
                raise AgentCredentialsError(str(exc), status_code=401) from exc
            if give_up_after_seconds is not None and time.monotonic() - started >= give_up_after_seconds:
                return None
            on_retry(attempt, delay, exc)
            if stop_event is not None:
                if stop_event.wait(delay):
                    return None
            else:
                time.sleep(delay)
            delay = min(delay * REGISTER_RETRY_BACKOFF_MULTIPLIER, REGISTER_RETRY_MAX_DELAY_SECONDS)


def _cert_sha256_fingerprint(host: str, port: int, timeout: float = 10.0) -> str:
    pem = ssl.get_server_certificate((host, port), timeout=timeout)
    der = ssl.PEM_cert_to_DER_cert(pem)
    return hashlib.sha256(der).hexdigest()


# Optional, off-by-default advanced setting: an admin who has manually
# obtained the backend's real certificate fingerprint (out of band — there
# is no UI flow to help discover it yet) can add a "pinned_cert_sha256" key
# to agent_config.json. If present, refuse to talk to the server unless its
# certificate matches — protects the copy-paste "Server URL" setup against
# a DNS-spoofed or MITM'd endpoint silently capturing a live enrollment
# key. Checked once at startup rather than on every request: re-verifying
# every 30s heartbeat would mean a full extra TLS handshake per cycle for a
# threat model (an attacker intercepting the initial connection) this
# already covers. Unset — the default for every existing installation —
# leaves behavior completely unchanged: normal system CA validation only.
def _verify_pinned_cert(base_url: str, pinned_sha256: str, log_fn=print) -> bool:
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme != "https":
        log_fn("pinned_cert_sha256 is set but the server URL isn't https:// — nothing to pin, skipping.")
        return True
    host = parsed.hostname
    if not host:
        log_fn(f"Could not parse a hostname out of {base_url!r} to verify the pinned certificate.")
        return False
    port = parsed.port or 443
    try:
        actual = _cert_sha256_fingerprint(host, port)
    except (OSError, ssl.SSLError) as exc:
        log_fn(f"Could not fetch the server certificate to verify against pinned_cert_sha256: {exc}")
        return False
    expected = pinned_sha256.strip().lower().replace(":", "")
    if actual != expected:
        log_fn(
            f"Refusing to connect: server certificate fingerprint ({actual}) does not match the "
            f"configured pinned_cert_sha256 ({expected}). This could mean the server's certificate "
            "was legitimately renewed, or that this connection is being intercepted."
        )
        return False
    return True


# ── Hub-relay listener: the LAN-facing side of the connection abstraction
# above. Only ever runs on a device that (a) connects directly (conn["mode"]
# == "direct" -- see _maybe_activate_hub_mode) and (b) has learned
# is_primary=True from its own register/heartbeat response. A relay child by
# definition can never legitimately run this too -- there's no support for
# a child-of-a-child in this design (see relay_service._require_hub's
# matching no-chaining rejection server-side); gating hub-mode activation on
# conn["mode"] == "direct" is what keeps that true agent-side as well, with
# no separate flag to keep in sync.
# ────────────────────────────────────────────────────────────────────────────


def _local_lan_ip() -> str | None:
    # The standard portable trick for "what's this machine's real LAN IP":
    # open a UDP socket and ask the OS which local address it would use to
    # reach an external host. UDP has no handshake, so connect() here never
    # actually sends a packet -- it just consults local routing, making this
    # safe to call even with no real connectivity to 8.8.8.8 (or any
    # internet access at all, on a LAN-only segment).
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return None


def _make_relay_request_handler(base: str, hub_agent_id: str, hub_agent_key: str, log_fn):
    """Builds the request handler class for the hub's local relay listener.
    One fixed endpoint, POST /relay/proxy, mirroring the backend's own
    POST /agents/{hub_id}/relay-proxy shape almost exactly -- a relay child
    posts {id, key, kind, ...}, this forwards it to the real backend as
    {child_id, key, kind, ...} authenticated as *this hub* (the X-Agent-Key
    header proves the hub itself is legitimate; the child's own key inside
    the body is what proves this call is genuinely acting on behalf of
    *that* child -- the backend verifies it against the child's real
    agent_key_hash before doing anything, see relay_service._get_relay_child),
    and relays the backend's JSON response straight back down to the child
    unchanged.

    This local listener itself still performs no authentication of its own
    beyond "does the payload have the right shape" -- it deliberately trusts
    the child key it receives to the real backend rather than trying to
    verify it locally (this process has no access to any hash to check it
    against). A live security review confirmed that previously, hub
    ownership of *a* child_id was being treated by the backend as
    authorization for *any* child_id, which meant an untrusted LAN caller
    who simply observed a child_id (transmitted here in the clear on every
    legitimate call) could impersonate that child with no real credential
    at all -- fixed by requiring and verifying the key server-side; see
    SECURITY.md.
    """

    class RelayProxyHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format_str, *args) -> None:
            pass  # silence default stderr access logging -- nothing to print to on a windowed build

        def _reply(self, status_code: int, payload: dict | None = None) -> None:
            data = json.dumps(payload if payload is not None else {}).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            try:
                self.wfile.write(data)
            except OSError:
                pass  # child disconnected mid-response -- nothing more to do

        def do_POST(self) -> None:
            if self.path != "/relay/proxy":
                self._reply(404)
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                payload = json.loads(self.rfile.read(length) or b"{}")
            except (ValueError, OSError, json.JSONDecodeError):
                self._reply(400)
                return

            child_id = payload.get("id")
            child_key = payload.get("key")
            kind = payload.get("kind")
            if not child_id or not child_key or kind not in ("register", "heartbeat", "sources", "source_status", "logs"):
                self._reply(400)
                return

            body = {"child_id": child_id, "key": child_key, "kind": kind}
            if kind == "register":
                body["hostname"] = payload.get("hostname")
            elif kind == "source_status":
                body["source_status_results"] = payload.get("source_status_results")
            elif kind == "logs":
                body["logs"] = payload.get("logs")

            try:
                result = _post(f"{base}/agents/{hub_agent_id}/relay-proxy", hub_agent_key, body)
            except AgentRequestError as exc:
                log_fn(f"Relay proxy call failed for child {child_id} ({kind}): {exc}")
                self._reply(exc.status_code or 502)
                return
            self._reply(200, result)

    return RelayProxyHandler


def _run_relay_http_server(base: str, hub_agent_id: str, hub_agent_key: str, log_fn=_safe_console_log) -> None:
    """Runs forever in its own daemon thread once hub mode activates (see
    _maybe_activate_hub_mode) -- never explicitly stopped, same pattern as
    every other background thread in this file; it just dies with the
    process. Binds 0.0.0.0 (every local interface), not just one -- a
    consumer laptop's real LAN-facing address can change (Wi-Fi vs.
    Ethernet, a new DHCP lease) without this needing to know which one.
    """
    handler_cls = _make_relay_request_handler(base, hub_agent_id, hub_agent_key, log_fn)
    try:
        server = http.server.ThreadingHTTPServer(("0.0.0.0", RELAY_LISTEN_PORT), handler_cls)
    except OSError as exc:
        log_fn(
            f"Could not start the hub relay listener on port {RELAY_LISTEN_PORT} (non-fatal -- this device just "
            f"won't be able to host relay children until this is resolved): {exc}"
        )
        return
    server.daemon_threads = True
    log_fn(f"Hub relay listener started on 0.0.0.0:{RELAY_LISTEN_PORT} — this device can now host relay children.")
    server.serve_forever()


# Module-level, not per-conn state: a process only ever runs one agent
# identity, so "have I already started the relay listener this run" is
# meaningfully global, not something to thread through every call site.
_hub_relay_server_started = threading.Event()


def _maybe_activate_hub_mode(conn: dict, agent_id: str, agent_key: str, is_primary: bool, log_fn) -> None:
    """Called after every successful register/heartbeat, direct-mode or not
    (cheap no-op otherwise) -- so an agent marked primary well after it first
    connected still picks up hub behavior on its very next heartbeat, no
    restart needed. Relay mode is deliberately excluded (conn["mode"] !=
    "direct" short-circuits immediately): a relay child can never
    legitimately act as a hub in this design (see this section's own
    docstring above) regardless of what is_primary happens to say.
    """
    if conn["mode"] != "direct" or not is_primary or _hub_relay_server_started.is_set():
        return
    _hub_relay_server_started.set()
    threading.Thread(
        target=_run_relay_http_server, args=(conn["base"], agent_id, agent_key, log_fn), daemon=True
    ).start()


def _current_relay_listen_addr() -> str | None:
    """What this agent reports as its relay_listen_addr on every heartbeat
    once hub mode is active (see HeartbeatRequest server-side) -- None until
    then, and None again if the LAN IP can't be determined, both of which
    the backend already treats as "nothing to show yet" rather than an error.
    """
    if not _hub_relay_server_started.is_set():
        return None
    ip = _local_lan_ip()
    return f"{ip}:{RELAY_LISTEN_PORT}" if ip else None


def _app_dir() -> Path:
    # PyInstaller's --onefile build unpacks to a temp dir at runtime, but
    # sys.executable still points at the launched .exe itself — that's the
    # folder the user actually put agent_config.json in.
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _resource_dir() -> Path:
    # Bundled read-only assets (icon.ico) -- distinct from _app_dir() above.
    # PyInstaller's --onefile build extracts bundled `datas` to a separate
    # temp dir at sys._MEIPASS, not next to the real .exe, so config/state
    # (which belongs next to the exe) and bundled assets (which don't) need
    # two different base paths.
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", _app_dir()))
    return Path(__file__).resolve().parent


def _set_window_icon(root) -> None:
    # Same TP brand mark as the built .exe's own file icon (tp_agent.spec's
    # icon=['icon.ico']) and the dashboard's favicon/logo (both generated
    # from the same reference/tp_logo.png by generate_icon.py) -- previously
    # only the file icon was branded; the live running window(s) fell back
    # to Tk's default icon. Best-effort: a missing/corrupt icon file (e.g. a
    # dev checkout that never ran generate_icon.py) must never crash the
    # agent over something this cosmetic.
    if platform.system() != "Windows":
        return
    try:
        root.iconbitmap(str(_resource_dir() / "icon.ico"))
    except Exception:  # noqa: BLE001, S110 — purely cosmetic; a missing/corrupt icon must never crash the agent
        pass


# ── One-time, explicit, user-triggered fixes for the two log sources that
# can't collect out of the box -- Security logs (needs a one-time permission
# grant, not standing elevation) and Sysmon (needs a real install, which
# Windows will always gate behind a UAC prompt no matter what). Both run a
# small elevated helper for only the one privileged step, not the whole
# agent -- the agent process itself never runs elevated.
# ──────────────────────────────────────────────────────────────────────────


# ── Privileged data-source setup: two fixed actions ("grant_log_access",
# "install_sysmon") that need administrator rights. Each is a self-contained
# PowerShell script in agent/elevated/, and this (never-elevated) agent only
# ever *asks* for one to run, via one of two paths:
#
#   1. A pre-authorized Scheduled Task, created once during install with the
#      user's real consent (see installer.iss). It runs the script from
#      %ProgramFiles%\TruePositive\elevated, a folder only administrators can
#      write, so triggering it later needs no UAC prompt and a same-user
#      process can't swap what it executes. (The old design pointed the task
#      at this .exe in user-writable %LOCALAPPDATA% -- replacing the exe and
#      running the task was a silent route to admin.)
#   2. If that task doesn't exist (skipped during install, or an older
#      install predating this feature), fall back to an ad-hoc UAC prompt
#      running the same script text inline via -EncodedCommand -- no script
#      file on disk to tamper with between the prompt and execution.
#
# Results come back through ELEVATED_RESULTS_DIR (admin-write, user-read).
# ──────────────────────────────────────────────────────────────────────────

TASK_NAMES = {
    "grant_log_access": r"TruePositive Agent\GrantLogAccess",
    "install_sysmon": r"TruePositive Agent\InstallSysmon",
}
# Written only by the elevated scripts (agent/elevated/*.ps1). Program Files
# is admin-writable / user-readable by default, which is the point: see
# _read_elevated_result.
ELEVATED_RESULTS_DIR = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "TruePositive" / "results"
_CACHED_WINDOWS_IDENTITY_UNSET = object()
_cached_windows_identity_value: str | None | object = _CACHED_WINDOWS_IDENTITY_UNSET


def _cached_windows_identity() -> str | None:
    # A process's real identity never changes mid-run -- memoize so callers
    # that need it repeatedly (e.g. _tighten_file_permissions, invoked on
    # every _save_state) don't each spawn their own powershell.exe just to
    # ask the same question again.
    global _cached_windows_identity_value
    if _cached_windows_identity_value is _CACHED_WINDOWS_IDENTITY_UNSET:
        _cached_windows_identity_value = _current_windows_identity()
    return _cached_windows_identity_value


def _current_windows_identity() -> str | None:
    # Reads the calling process's actual security token instead of trusting
    # the USERNAME environment variable -- see elevated/grant_log_access.ps1's
    # docstring for the real, live-observed reason this matters. Returns a
    # fully-qualified "COMPUTERNAME\Username" (or "DOMAIN\Username") form,
    # which net.exe localgroup accepts directly and unambiguously.
    try:
        result = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "[System.Security.Principal.WindowsIdentity]::GetCurrent().Name",
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    name = (result.stdout or "").strip()
    return name or None


CAPABILITIES_CHECK_INTERVAL_SECONDS = 300

_capabilities_cache: dict = {}
_capabilities_last_checked = 0.0


def _is_event_log_reader_member() -> bool | None:
    """Proactive read-access check -- distinct from the grant_log_access action
    (which only *fixes* an existing source's failure reactively, via
    _maybe_auto_fix_source). Lists the Event Log Readers local group and
    looks for the current user, so onboarding/Settings can show a real
    "you already have access" status instead of the old static "Needs
    Administrator" badge. Returns None (not False) if the check itself
    couldn't run, so "unknown" is never conflated with "definitely not a
    member" -- the backend/frontend both treat None as "not yet reported".
    """
    identity = _cached_windows_identity()
    if not identity:
        return None
    # net.exe localgroup /add accepts "DOMAIN\Username" (see
    # elevated/grant_log_access.ps1), but membership listing just prints bare
    # usernames -- compare against the part after the backslash.
    bare_username = identity.rsplit("\\", 1)[-1]
    try:
        result = subprocess.run(
            ["net.exe", "localgroup", "Event Log Readers"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return bare_username.lower() in (result.stdout or "").lower()


def _check_capabilities() -> dict:
    """Windows-only real capability snapshot, reported on the heartbeat
    (see _capabilities_for_heartbeat) so LocalSourcePicker can show a real
    status instead of static catalog badges. Empty on non-Windows -- there's
    nothing analogous to check there yet.
    """
    if platform.system() != "Windows":
        return {}
    return {
        "event_log_reader_member": _is_event_log_reader_member(),
        "sysmon_installed": _is_sysmon_installed(),
    }


def _capabilities_for_heartbeat() -> dict:
    # The checks above spawn a couple of subprocesses -- cheap, but no
    # reason to pay that cost on every ~30s heartbeat when the answer only
    # ever changes after a manual permission grant or a Sysmon install (both
    # already logged/handled elsewhere). Recomputed at most once per
    # CAPABILITIES_CHECK_INTERVAL_SECONDS; the cached value is still resent
    # on every heartbeat in between so a slow first check doesn't leave the
    # backend without a value for minutes.
    global _capabilities_cache, _capabilities_last_checked
    now = time.monotonic()
    if not _capabilities_cache or now - _capabilities_last_checked >= CAPABILITIES_CHECK_INTERVAL_SECONDS:
        _capabilities_cache = _check_capabilities()
        _capabilities_last_checked = now
    return _capabilities_cache


def _is_sysmon_installed() -> bool:
    # No admin needed just to check whether the channel exists. Deliberately
    # NOT reusing _query_windows_channel here: it shares a module-level
    # "warn about this channel once" tracker with the periodic collection
    # loop (_warn_channel_once) -- calling it from this pre-install check
    # would consume that one-time slot silently (this check always passes a
    # no-op log_fn) and mute the *real* periodic warning later if the
    # install doesn't happen or fails. `wevtutil gl` (get channel config) is
    # a separate, lighter existence check with no such side effect.
    if shutil.which("wevtutil") is None:
        return False
    creationflags = subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0
    try:
        result = subprocess.run(
            ["wevtutil", "gl", SYSMON_CHANNEL],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
            creationflags=creationflags,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0


def _scheduled_task_exists(name: str) -> bool:
    if platform.system() != "Windows":
        return False
    try:
        result = subprocess.run(
            ["schtasks", "/Query", "/TN", name],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0


def _read_elevated_result(action: str, not_before: float) -> tuple[bool, str] | None:
    # The elevated scripts (agent/elevated/*.ps1) write their outcome to an
    # admin-only folder this unelevated process can read but not write, so a
    # result can't be forged and an elevated write can't be redirected. That
    # also means a stale result can't be deleted from here -- instead it's
    # only accepted if it finished after this attempt started.
    try:
        data = json.loads((ELEVATED_RESULTS_DIR / f"{action}.json").read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return None
    if data.get("action") != action or float(data.get("finished_at", 0)) < not_before:
        return None
    return bool(data.get("success")), str(data.get("message", "Done."))


def _trigger_scheduled_task_and_wait(action: str, timeout: int = 180) -> tuple[bool, str]:
    # schtasks /Run returns almost immediately -- it only signals the task
    # to start, it doesn't wait for it. Rather than parse schtasks' own
    # human-formatted /Query output to detect completion (fragile across
    # locales/Windows versions), poll for the result the elevated script
    # writes when it finishes.
    started = int(time.time()) - 2  # small allowance for clock granularity
    try:
        subprocess.run(
            ["schtasks", "/Run", "/TN", TASK_NAMES[action]], capture_output=True, text=True, timeout=10, check=False
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, f"Could not start the pre-authorized task: {exc}"
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = _read_elevated_result(action, started)
        if result is not None:
            return result
        time.sleep(0.5)
    return False, "Timed out waiting for the pre-authorized task to finish."


def _ps_quote(value: str) -> str:
    # PowerShell single-quoted literal: the only special character is the
    # quote itself, escaped by doubling. Used for every value interpolated
    # into a PowerShell command, so a path or username containing an
    # apostrophe (C:\Users\O'Brien) can't break out of the string.
    return "'" + value.replace("'", "''") + "'"


def _encoded_command(script: str) -> str:
    return base64.b64encode(script.encode("utf-16-le")).decode("ascii")


def _elevated_fallback_command(action: str) -> str | None:
    """The full PowerShell script the UAC fallback runs elevated: the bundled
    elevated/<action>.ps1 text plus its arguments, wrapped in a scriptblock.
    Passed with -EncodedCommand, so no script file sits on disk between the
    UAC prompt and execution where a same-user process could rewrite it.
    """
    try:
        script = (_resource_dir() / "elevated" / f"{action}.ps1").read_text(encoding="utf-8")
    except OSError:
        return None
    args = ""
    if action == "grant_log_access":
        identity = _cached_windows_identity()
        if identity:
            args = f" -UserName {_ps_quote(identity)}"
    elif action == "install_sysmon":
        try:
            config = (_resource_dir() / "sysmon_config.xml").read_bytes()
        except OSError:
            return None
        args = f" -ConfigB64 {_ps_quote(base64.b64encode(config).decode('ascii'))}"
    return f"& {{\n{script}\n}}{args}"


def _run_elevated_fallback(action: str, timeout: int = 180) -> tuple[bool, str]:
    """Ad-hoc UAC prompt for one fixed action, used when the installer's
    pre-authorized Scheduled Task isn't there (or didn't run). Translates
    "user clicked No" (Start-Process throws) into Win32 ERROR_CANCELLED
    (1223) so it reads as a decline rather than a generic failure.
    """
    if platform.system() != "Windows":
        return False, "This action is only available on Windows."
    inner = _elevated_fallback_command(action)
    if inner is None:
        return False, f"The bundled script for '{action}' is missing from this build."
    # One line, passed as plain -Command (not a second -EncodedCommand): the
    # inner encoded script is already ~18k characters for install_sysmon, and
    # re-encoding it would blow past Windows' 32,767-character command-line
    # limit. The launcher itself only contains single-quoted literals.
    launcher = (
        "try { $p = Start-Process -FilePath 'powershell.exe' -ArgumentList "
        "'-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',"
        f"{_ps_quote(_encoded_command(inner))} -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ErrorAction Stop; "
        "exit $p.ExitCode } catch { exit 1223 }"
    )
    started = int(time.time()) - 2
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", launcher],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, f"Could not launch the elevated helper: {exc}"
    if result.returncode == 1223:
        return False, "You declined the administrator prompt, so nothing was changed."
    outcome = _read_elevated_result(action, started)
    if outcome is not None:
        return outcome
    if result.returncode == 0:
        return True, "Done."
    detail = (result.stderr or "").strip()[:200]
    return False, f"The elevated step failed (exit code {result.returncode}){': ' + detail if detail else ''}"


def _run_privileged_action(action: str, log_fn=_safe_console_log, allow_prompt: bool = True) -> None:
    if _scheduled_task_exists(TASK_NAMES[action]):
        log_fn("Using the administrator access set up during installation — no prompt needed...")
        # A short timeout, not the 180s a fresh ad-hoc elevation reasonably
        # deserves (that one is genuinely waiting on a human to click a UAC
        # prompt) -- this path is supposed to be near-instant with nobody to
        # wait on, so a long hang here is itself evidence something's wrong.
        ok, message = _trigger_scheduled_task_and_wait(action, timeout=30)
        if ok:
            log_fn(message)
            return
        # Confirmed live on a real machine: a pre-authorized Scheduled Task
        # can report "Last Result: 0" (success) via `schtasks /Query` while
        # never actually launching a process at all. Fall through to the
        # same ad-hoc prompt used when no pre-authorized task exists, rather
        # than give up -- a real, if less convenient, path still exists.
        log_fn(f"The pre-authorized setup didn't complete as expected ({message}) — falling back to a direct prompt...")

    if not allow_prompt:
        # Running unattended (run_silent, the login-time autostart path with
        # no window at all) -- a surprise UAC dialog with no visible agent
        # window to explain it would be alarming, not helpful. Only the
        # pre-authorized task (above) can fix things silently; without it,
        # just log and wait for an interactive session (the GUI, or run_cli)
        # to pick this up instead.
        log_fn(
            f"'{action}' needs one-time administrator approval that wasn't set up during install "
            "— open the agent's window to approve it, or reinstall with automatic permissions enabled."
        )
        return

    log_fn("No pre-authorized setup found — requesting one-time administrator approval...")
    _ok, message = _run_elevated_fallback(action)
    log_fn(message)


# Tracks which privileged actions this *process* has already attempted, so a
# source that keeps failing (declined prompt, a real unrelated error) gets
# tried once per run and then left alone -- not re-prompted or re-attempted
# every 30s collection cycle forever. Reset naturally on the next process
# start (crash-recovery restart, next login, etc.), which is exactly when
# retrying again is actually reasonable.
_AUTO_FIX_ATTEMPTED: set[str] = set()


def _maybe_auto_fix_source(source: dict, status: str, reason: str | None, log_fn, allow_prompt: bool) -> None:
    """Called for every source on every collection cycle -- automatic,
    no button, no manual trigger. If a source is failing for a reason this
    agent knows how to fix (needs the log-read permission grant, or needs
    Sysmon installed), it fixes it itself: uses the pre-authorized
    Scheduled Task if install set one up (silent, no prompt at all), or
    prompts once if running somewhere that's allowed to (see
    _run_privileged_action). Already-satisfied cases are true no-ops, not
    reinstalls: install_sysmon's own _is_sysmon_installed() check means a
    machine that already has Sysmon (installed by this agent before, by
    another tool, or by IT) is left alone and simply gets read once the
    permission side is granted -- there's nothing to "install" there.
    """
    if platform.system() != "Windows" or status != "error" or not reason:
        return
    # Matches both this agent's own wording ("Access denied — run the agent
    # as Administrator...", from _query_windows_channel) and Windows' own
    # system error text ("Access is denied.") -- caught live via direct
    # testing that checking for the exact phrase "access is denied" missed
    # this agent's actual, more common wording entirely.
    if "denied" in reason.lower():
        action = "grant_log_access"
    elif source.get("path") == SYSMON_CHANNEL:
        action = "install_sysmon"
    else:
        return  # not a failure mode this agent knows how to fix automatically
    if action in _AUTO_FIX_ATTEMPTED:
        return
    _AUTO_FIX_ATTEMPTED.add(action)
    log_fn(f"'{source.get('name', source.get('path'))}' isn't collecting yet ({reason}) — attempting a fix...")
    threading.Thread(target=_run_privileged_action, args=(action, log_fn, allow_prompt), daemon=True).start()


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
    try:
        return json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        # Called unconditionally near the top of main(), before dispatch to
        # run_gui/run_silent/run_cli — an uncaught exception here used to
        # take down *every* launch (GUI, silent autostart, everything)
        # outright, confirmed live: a bad _tighten_file_permissions grant
        # (see that function) left this exact file unreadable by the
        # account that owns it, so literally every future launch attempt —
        # including the crash-recovery wrapper's own self-relaunch — hit
        # this same PermissionError instantly, burning through the
        # crash-loop budget within minutes and then refusing to start at
        # all. _tighten_file_permissions is fixed now, but self-heal a file
        # already left broken by the old bug rather than requiring the user
        # to find and delete it by hand: re-apply permissions (now correct)
        # and retry the read once before giving up.
        _safe_console_log(f"Could not read {config_path.name} ({exc}) — attempting to restore access...")
        _tighten_file_permissions(config_path, log_fn=_safe_console_log)
        try:
            return json.loads(config_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None


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


# Best-effort: restrict a newly-written credential/state file to the
# current user only. agent_config.json in particular carries the
# enrollment key in plain JSON with no expiry check on the agent side — a
# leaked copy on a shared machine grants durable log-injection ability for
# that org, so this is real defense-in-depth, not tidiness. Never fatal: a
# filesystem that doesn't support ACLs/POSIX permissions (some network
# shares, some removable media) just leaves the file at its default
# permissions instead of crashing the agent.
_TIGHTENED_PATHS: set[str] = set()


def _tighten_file_permissions(path: Path, log_fn=print) -> None:
    # The ACL is already correct after the first successful pass this
    # process has made over this exact path — _save_state calls this on
    # every ~30s collection cycle, and re-running icacls that often for no
    # behavioral change is pure overhead (a fresh powershell.exe spawn via
    # _cached_windows_identity() on top, before that was memoized too).
    key = str(path)
    if key in _TIGHTENED_PATHS:
        return
    try:
        if platform.system() == "Windows":
            # _current_windows_identity() (real security token), not the
            # USERNAME environment variable -- confirmed live on this exact
            # machine that the env var route produces a grantee icacls can't
            # actually resolve (observed as an empty "COMPUTERNAME\" grant
            # with no valid account behind it). /inheritance:r + /grant:r
            # then *replaces* the file's whole ACL with that one bad grant --
            # not a partial/best-effort miss, a real lockout: the very same
            # user who just wrote the file loses all further read/write
            # access to it, which is exactly what the grant_log_access action's own
            # identical USERNAME-across-elevation bug already taught this
            # codebase not to trust (see that script's header). Same
            # fix here: resolve the real identity instead.
            identity = _cached_windows_identity()
            if not identity:
                return
            result = subprocess.run(
                ["icacls", str(path), "/inheritance:r", "/grant:r", f"{identity}:F"],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            if result.returncode != 0:
                # Don't mark as done — icacls itself reported failure (e.g.
                # a transiently locked file), so a later write attempting
                # this again is the right behavior, not a permanent skip.
                log_fn(f"Could not tighten permissions on {path.name} (non-fatal): {result.stderr.strip()}")
                return
        else:
            path.chmod(0o600)
    except (OSError, subprocess.SubprocessError) as exc:
        log_fn(f"Could not tighten permissions on {path.name} (non-fatal): {exc}")
        return
    _TIGHTENED_PATHS.add(key)


def _save_state(state: dict) -> None:
    state_path = _app_dir() / STATE_FILENAME
    try:
        state_path.write_text(json.dumps(state), encoding="utf-8")
        _tighten_file_permissions(state_path)
    except OSError:
        pass  # Non-fatal — worst case, the next cycle re-derives bookmarks.


def _write_status(status: str, detail: str, agent_id: str) -> None:
    payload = {
        "status": status,
        "detail": detail,
        "agent_id": agent_id,
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
    }
    try:
        (_app_dir() / STATUS_FILENAME).write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        pass  # Non-fatal — worst case, the "already running" dialog just can't show it.


def _read_status() -> dict | None:
    status_path = _app_dir() / STATUS_FILENAME
    if not status_path.exists():
        return None
    try:
        return json.loads(status_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


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
    log_fn(
        f"Could not read Windows Event Log channel '{channel}': {reason}. Skipping it this and future cycles until restart."
    )


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
        result = subprocess.run(
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


def _tail_local_file(path: str, offset: int, limit: int, log_fn=print) -> tuple[list[dict], int, str, str | None]:
    file_path = Path(path)
    if not file_path.exists():
        return [], offset, "error", f"File not found: {path}"
    events = []
    new_offset = offset
    try:
        # A rotated or truncated-in-place log file (logrotate, a service
        # restart that recreates the file, ...) leaves the stored byte
        # offset pointing past the new file's end. Seeking there makes
        # readline() return "" immediately -- zero events, and the same
        # stale offset gets re-persisted every cycle forever, permanently
        # and silently stopping collection for this source with no error
        # ever surfaced. Detected via a plain size-shrink check rather than
        # also tracking inode across restarts (st_ino would need widening
        # the on-disk bookmark schema from a bare int to a struct for every
        # existing installation, for a case a size check already catches in
        # practice: a rotated file is smaller until it grows past the old
        # offset again).
        current_size = file_path.stat().st_size
        if current_size < offset:
            log_fn(
                f"Log source at {path} appears to have been rotated or truncated — resuming from the start of the new file."
            )
            offset = 0
            new_offset = 0
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
            if status == "ok":
                # A real "nothing new since last cycle" looks identical to a
                # channel that got cleared/reset out from under a now-stale
                # bookmark (same failure shape _tail_local_file's rotation
                # guard above handles for local files) -- EventRecordID>
                # {bookmark} then matches nothing forever, silently freezing
                # this source with no error ever surfaced. Cheaply confirm
                # the bookmark is still behind the channel's real newest
                # event; if the channel has since reset to something lower,
                # rebaseline instead of polling a dead bookmark forever.
                latest, latest_status, latest_reason = _query_windows_channel(
                    path, None, 1, log_fn, newest_first=True
                )
                if latest and latest[0]["record_id"] < bookmark:
                    log_fn(
                        f"Log channel {path} appears to have been cleared or reset — "
                        "resuming from the newest event."
                    )
                    return [], latest[0]["record_id"], latest_status, latest_reason
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

    events, new_offset, status, reason = _tail_local_file(path, bookmark, COLLECT_BATCH_LIMIT, log_fn)
    return events, new_offset, status, reason


def _collect_and_ship(
    conn: dict, agent_id: str, agent_key: str, state: dict, log_fn=print, allow_auto_fix_prompt: bool = False
) -> None:
    try:
        sources = _get_sources(conn, agent_id, agent_key)
    except AgentRequestError as exc:
        log_fn(f"Could not fetch assigned sources: {exc}")
        return

    bookmarks = state.setdefault("bookmarks", {})
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    # Per-source event batches, kept separate (rather than one combined list)
    # so shipping can be chunked below without ever splitting one source's
    # own events across two requests -- each source maxes out at
    # COLLECT_BATCH_LIMIT, which is always <= MAX_INGEST_BATCH_SIZE, so a
    # source's events are always small enough to fit in a single chunk.
    source_batches = []  # list of (source_id, [event dict, ...])
    source_results = []
    for source in sources:
        source_id = source["id"]
        events, new_bookmark, status, reason = _collect_source(source, bookmarks.get(source_id), log_fn)
        source_results.append({"source_id": source_id, "status": status, "reason": reason})
        _maybe_auto_fix_source(source, status, reason, log_fn, allow_auto_fix_prompt)
        if events:
            source_batches.append(
                (
                    source_id,
                    new_bookmark,
                    [
                        {
                            "source_id": source_id,
                            "timestamp": event["timestamp"] or now_iso,
                            "severity": event["severity"],
                            "event_type": event["event_type"],
                            "message": event["message"],
                            "raw": {},
                        }
                        for event in events
                    ],
                )
            )
        else:
            # Nothing to ship for this source this cycle -- its bookmark
            # (unchanged, or rebaselined per _collect_source) can't be lost
            # by a POST failure, so it's safe to persist right away rather
            # than gate it behind any chunk's shipping outcome below.
            bookmarks[source_id] = new_bookmark

    # Reported every cycle regardless of whether anything shipped, so
    # Settings' health indicator reflects the agent's real last attempt —
    # not just "silence" when a channel legitimately had nothing new.
    if source_results:
        try:
            _report_source_status(conn, agent_id, agent_key, source_results)
        except AgentRequestError as exc:
            log_fn(f"Could not report source status: {exc}")

    if not source_batches:
        _save_state(state)
        return

    # Greedily group sources into chunks that stay under the backend's
    # ingest cap. Each chunk ships independently: a failure in one chunk
    # (e.g. after a long offline gap produces an oversized combined backlog)
    # no longer wedges every other source's progress for good — only that
    # chunk's sources are retried next cycle.
    chunks = []
    current_chunk: list[tuple[str, object, list[dict]]] = []
    current_size = 0
    for source_id, new_bookmark, events in source_batches:
        if current_chunk and current_size + len(events) > MAX_INGEST_BATCH_SIZE:
            chunks.append(current_chunk)
            current_chunk = []
            current_size = 0
        current_chunk.append((source_id, new_bookmark, events))
        current_size += len(events)
    if current_chunk:
        chunks.append(current_chunk)

    for chunk in chunks:
        flat_batch = [event for _source_id, _new_bookmark, events in chunk for event in events]
        try:
            result = _ingest_logs(conn, agent_id, agent_key, flat_batch)
            log_fn(f"shipped {result['ingested']} log(s), {result['alerts_created']} alert(s) triggered")
            for source_id, new_bookmark, _events in chunk:
                bookmarks[source_id] = new_bookmark
            _save_state(state)
        except AgentRequestError as exc:
            log_fn(f"Failed to ship logs: {exc}")
            _write_status("Collection failed", str(exc), agent_id)
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
        # --silent so the login-time relaunch runs headless (see run_silent)
        # instead of popping the GUI window/taskbar entry on every login —
        # a manual double-click from the Start Menu shortcut (no --silent)
        # still shows the normal window. Re-set on every successful
        # connection (not just once), so an agent that registered this key
        # before --silent existed self-heals to the silent command the next
        # time it connects, with no separate migration needed.
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE
        ) as key:
            winreg.SetValueEx(key, "TruePositiveAgent", 0, winreg.REG_SZ, f'"{sys.executable}" --silent')
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


# This dialog is the *only* thing a manual double-click can ever show once a
# background instance already holds the lock (see _acquire_single_instance_lock)
# — silent auto-start has no window to reopen, and a visible window that was
# closed is only hidden, not destroyed, so relaunching never gets a fresh one
# either. Without the running instance's own last-known status folded in
# here, "already running" tells the user nothing about *why* the dashboard
# might still show it offline (wrong URL, failed heartbeat, wrong agent ID,
# ...) — exactly the gap that made this confusing to debug from the outside.
def _format_already_running_message(status: dict | None) -> str:
    base = "TruePositive Agent is already running in the background."
    if not status:
        return base + "\n\nNo status has been recorded yet — it may still be starting up."
    lines = [
        base,
        "",
        f"Status: {status.get('status', 'Unknown')}",
    ]
    if status.get("detail"):
        lines.append(status["detail"])
    lines.append("")
    lines.append(f"Agent ID: {status.get('agent_id', 'unknown')}")
    lines.append(f"Last updated: {status.get('updated_at', 'unknown')}")
    return "\n".join(lines)


def _show_already_running_message() -> None:
    # The fallback here used to be `print(message, file=sys.stderr)` -- but
    # sys.stderr is None on this frozen windowed (console=False) build (see
    # tp_agent.spec), so if the Tkinter dialog above ever failed for any
    # reason, that fallback line itself raised AttributeError. Since this
    # function is called with no enclosing try/except in main(), that
    # exception reached _run_with_crash_recovery, which relaunches the
    # process -- straight back into the same "already running" mutex check,
    # crashing the same way again, burning through all 5 restart attempts in
    # seconds with zero visible feedback: exactly "I double-click it and
    # nothing happens." _show_crash_giveup_message already uses the correct
    # safe-no-op pattern below; this one just never got the same fix.
    message = _format_already_running_message(_read_status())
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        _set_window_icon(root)
        messagebox.showinfo("TruePositive Agent", message)
    except Exception:  # noqa: BLE001, S110 — this dialog is a courtesy, never let it mask the real exit
        pass


# The Run key above launches the exe with no arguments, so a CLI-args launch
# (truepositive-agent.exe --url ... --id ... --key ...) needs its connection details
# saved somewhere _load_config() will find on that bare relaunch — unless
# they're already embedded in the binary itself (the dashboard's one-click
# download), in which case there's nothing to persist. Takes the whole
# config dict (not separate url/id/key) so a relay child's relay_mode/
# hub_relay_url round-trips through a relaunch exactly like a direct-connect
# child's url does — same function, no special-casing needed per mode.
def _ensure_local_config_persisted(config: dict) -> None:
    if not getattr(sys, "frozen", False) or _load_embedded_config() is not None:
        return
    config_path = _app_dir() / CONFIG_FILENAME
    if config_path.exists():
        return
    try:
        config_path.write_text(json.dumps(config), encoding="utf-8")
        _tighten_file_permissions(config_path)
    except OSError:
        pass


# CLI mode (--url/--id/--key) is direct-connect only in Phase 1 -- relay
# pairing is an installer/connect-form choice (see _show_connect_form), not
# a scripting flag. `base` stays the public signature (main()'s dispatch and
# any external scripting depend on it); `conn` is just built internally.
def run_cli(base: str, agent_id: str, agent_key: str) -> None:
    conn = {"mode": "direct", "base": base}
    hostname = socket.gethostname()
    print(f"Registering agent {agent_id} as '{hostname}'...", flush=True)
    try:
        agent = _register(conn, agent_id, agent_key, hostname)
    except AgentRequestError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
    print(f"Connected. status={agent['status']} hostname={agent['hostname']}", flush=True)
    print(f"Sending a heartbeat every {HEARTBEAT_INTERVAL_SECONDS}s. Press Ctrl+C to stop.", flush=True)
    _ensure_local_config_persisted({"url": base, "id": agent_id, "key": agent_key})
    _ensure_windows_autostart()
    _maybe_activate_hub_mode(conn, agent_id, agent_key, agent.get("is_primary", False), print)

    state = _load_state()
    try:
        while True:
            time.sleep(HEARTBEAT_INTERVAL_SECONDS)
            beat = _heartbeat(conn, agent_id, agent_key, relay_listen_addr=_current_relay_listen_addr())
            print(f"heartbeat ok — last_seen_at={beat['last_seen_at']}", flush=True)
            _maybe_activate_hub_mode(conn, agent_id, agent_key, beat.get("is_primary", False), print)
            _collect_and_ship(conn, agent_id, agent_key, state, allow_auto_fix_prompt=True)
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(0)
    except AgentRequestError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)


def run_gui(config: dict, agent_id: str, agent_key: str) -> None:
    import tkinter as tk
    from tkinter import scrolledtext

    conn = _conn_from_config(config)

    root = tk.Tk()
    root.title("TruePositive Agent")
    root.geometry("440x310")
    root.resizable(False, False)
    _set_window_icon(root)

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

    def log(message: str) -> None:
        def _append() -> None:
            log_box.configure(state="normal")
            log_box.insert(tk.END, message + "\n")
            log_box.see(tk.END)
            log_box.configure(state="disabled")

        root.after(0, _append)

    def on_exit() -> None:
        stop_event.set()
        root.destroy()

    tk.Button(root, text="Exit", command=on_exit, width=10).pack(pady=(0, 10))

    def set_status(status: str, detail: str) -> None:
        _write_status(status, detail, agent_id)
        root.after(0, lambda: (status_var.set(status), detail_var.set(detail)))

    def on_register_retry(attempt: int, delay: float, exc: Exception) -> None:
        set_status(f"Connecting… (retry {attempt})", str(exc))
        log(f"Registration attempt {attempt} failed: {exc} — retrying in {delay:.0f}s")

    def worker() -> None:
        hostname = socket.gethostname()
        log(f"Registering as '{hostname}'...")
        try:
            agent = _register_with_retry(
                conn,
                agent_id,
                agent_key,
                hostname,
                on_retry=on_register_retry,
                stop_event=stop_event,
            )
        except AgentCredentialsError as exc:
            set_status("Connection failed", str(exc))
            log(str(exc))
            return
        if agent is None:
            if not stop_event.is_set():
                set_status("Connection failed", "Could not reach the server after repeated retries.")
                log("Giving up on registration for this run.")
            return

        set_status("Connected", f"{agent['hostname']} · registered")
        log(f"Connected. Sending a heartbeat every {HEARTBEAT_INTERVAL_SECONDS}s.")
        _ensure_local_config_persisted(config)
        _ensure_windows_autostart(log_fn=log)
        _maybe_activate_hub_mode(conn, agent_id, agent_key, agent.get("is_primary", False), log)

        state = _load_state()
        while not stop_event.is_set():
            if stop_event.wait(HEARTBEAT_INTERVAL_SECONDS):
                break
            try:
                beat = _heartbeat(conn, agent_id, agent_key, relay_listen_addr=_current_relay_listen_addr())
                set_status("Connected", f"last heartbeat {beat['last_seen_at']}")
                log(f"heartbeat ok — last_seen_at={beat['last_seen_at']}")
                _maybe_activate_hub_mode(conn, agent_id, agent_key, beat.get("is_primary", False), log)
            except AgentRequestError as exc:
                set_status("Heartbeat failed", str(exc))
                log(str(exc))
            except Exception as exc:  # noqa: BLE001 — deliberately broad, same reasoning as
                # _collect_and_ship's guard just below: this call used to be caught only
                # by `except AgentRequestError`, so anything else it raised (a malformed
                # response missing an expected key, a raw socket exception urllib
                # didn't wrap as AgentRequestError, ...) escaped uncaught on this
                # background thread -- which Python just silently kills. No crash log,
                # no relaunch (_run_with_crash_recovery only supervises the main
                # thread), just a GUI that keeps showing its last real status forever
                # with last_seen_at frozen. Confirmed live: a heartbeat that landed
                # during a backend container restart's brief connection-refused
                # window did exactly this -- the agent never recovered on its own
                # until manually relaunched, even minutes after the backend was
                # healthy again. Log and keep looping instead.
                set_status("Heartbeat failed", f"Unexpected error: {exc}")
                log(f"Heartbeat cycle failed unexpectedly: {exc}")
            try:
                _collect_and_ship(conn, agent_id, agent_key, state, log_fn=log, allow_auto_fix_prompt=True)
            except Exception as exc:  # noqa: BLE001 — deliberately broad: this call used
                # to sit outside any try/except, so anything it raised (not just
                # AgentRequestError — e.g. a transient OSError from a Windows Event
                # Log read, or a network hiccup mid-request during a backend
                # restart) permanently killed this whole thread with no way to
                # recover short of relaunching the agent. Real-world symptom: an
                # agent that looks "running" in Task Manager but has a frozen
                # last_seen_at forever. Log and keep looping instead.
                log(f"Collection cycle failed unexpectedly: {exc}")

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


# Used for the Registry Run key's login-time relaunch (see
# _ensure_windows_autostart) — no Tkinter at all, not even withdrawn, so
# there's never a window or taskbar entry to begin with. Deliberately
# mirrors run_gui's worker() loop resilience (log a failed heartbeat and
# keep going) rather than run_cli's — run_cli exits the whole process on
# the first AgentRequestError, which is fine for an interactive terminal
# session but would silently kill an unattended background agent over one
# transient network blip.
def run_silent(config: dict, agent_id: str, agent_key: str) -> None:
    conn = _conn_from_config(config)
    hostname = socket.gethostname()

    # A Docker cold-start after a reboot routinely takes 30s-2min+ to become
    # reachable, so this retries with backoff. Unlike run_gui's connect flow,
    # run_silent has no user watching and no "next login" to fall back on if
    # this process is the one already running post-wake/post-reboot (the
    # Registry Run key only fires at login, not on every resume/relaunch) --
    # giving up here would mean nothing ever brings the agent back except a
    # human logging in again, so give_up_after_seconds=None keeps retrying
    # indefinitely at the capped interval instead, matching the same
    # never-silently-die posture as the heartbeat loop just below.
    try:
        agent = _register_with_retry(
            conn,
            agent_id,
            agent_key,
            hostname,
            on_retry=lambda attempt, delay, exc: _write_status("Connection failed", str(exc), agent_id),
            give_up_after_seconds=None,
        )
    except AgentCredentialsError as exc:
        _write_status("Connection failed", str(exc), agent_id)
        return

    _write_status("Connected", f"{agent['hostname']} · registered", agent_id)
    _ensure_local_config_persisted(config)
    _ensure_windows_autostart(log_fn=lambda _msg: None)
    _maybe_activate_hub_mode(conn, agent_id, agent_key, agent.get("is_primary", False), lambda _msg: None)

    state = _load_state()
    while True:
        time.sleep(HEARTBEAT_INTERVAL_SECONDS)
        try:
            beat = _heartbeat(conn, agent_id, agent_key, relay_listen_addr=_current_relay_listen_addr())
            _write_status("Connected", f"last heartbeat {beat['last_seen_at']}", agent_id)
            _maybe_activate_hub_mode(conn, agent_id, agent_key, beat.get("is_primary", False), lambda _msg: None)
        except AgentRequestError as exc:
            _write_status("Heartbeat failed", str(exc), agent_id)
        except Exception as exc:  # noqa: BLE001 — see worker()'s identical guard for the full
            # rationale: an exception here other than AgentRequestError used to escape
            # uncaught on this thread and silently wedge the agent forever (no crash
            # log, no relaunch, no further heartbeats) instead of just failing this
            # one cycle and trying again next time.
            _write_status("Heartbeat failed", f"Unexpected error: {exc}", agent_id)
        try:
            _collect_and_ship(conn, agent_id, agent_key, state, log_fn=lambda _msg: None)
        except Exception as exc:  # noqa: BLE001 — see worker()'s identical guard above
            _write_status("Collection failed", str(exc), agent_id)


def _validate_connect_fields(address: str, agent_id: str, agent_key: str, *, relay: bool = False) -> dict | None:
    address = address.strip().rstrip("/")
    agent_id = agent_id.strip()
    agent_key = agent_key.strip()
    if not address or not agent_id or not agent_key:
        return None
    if relay:
        # See _conn_from_config -- this is the one config shape relay mode
        # needs beyond what direct-connect already has: no "url" at all,
        # since this device is never meant to reach the real backend itself.
        return {"relay_mode": True, "hub_relay_url": address, "id": agent_id, "key": agent_key}
    return {"url": address, "id": agent_id, "key": agent_key}


# Shown when no config was found (installer path — a generic Setup.exe, same
# for every org, has nothing embedded). The dashboard's enrollment panel
# shows these same three values (or, for a relay child, the hub's LAN
# address in place of a Server URL — see the "Deploy a device under <hub>"
# flow) with copy buttons, so this is a paste, not a lookup. Returns None if
# the window is closed without connecting.
#
# "Connect directly to server" vs "Connect through a hub on this network" is
# the one connection choice made here, and only here -- a *hub* device is
# never chosen at install time (see this file's hub-relay-listener section
# above); it's always installed the plain direct way and only starts acting
# as a hub afterward, once the dashboard's existing "Mark as primary" toggle
# is flipped and this same process learns is_primary=True on its own next
# register/heartbeat.
def _show_connect_form() -> dict | None:
    import tkinter as tk

    result: dict | None = None
    root = tk.Tk()
    root.title("TruePositive Agent — Connect")
    root.resizable(False, False)
    _set_window_icon(root)

    tk.Label(root, text="Connect this agent", font=("Segoe UI", 13, "bold")).pack(pady=(16, 4), padx=16)

    mode_var = tk.StringVar(value="direct")
    mode_frame = tk.Frame(root)
    mode_frame.pack(padx=16, pady=(0, 8), anchor="w")
    tk.Radiobutton(mode_frame, text="Connect directly to server", variable=mode_var, value="direct").pack(anchor="w")
    tk.Radiobutton(mode_frame, text="Connect through a hub on this network", variable=mode_var, value="relay").pack(
        anchor="w"
    )

    address_label_var = tk.StringVar(
        value="Paste the Server URL, Agent ID, and Enrollment Key shown\non the dashboard's agent enrollment screen."
    )
    hint_label = tk.Label(root, textvariable=address_label_var, font=("Segoe UI", 9), fg="#666666", justify="left")
    hint_label.pack(padx=16, pady=(0, 12))

    form = tk.Frame(root)
    form.pack(padx=16, pady=(0, 4))

    address_var = tk.StringVar()
    id_var = tk.StringVar()
    key_var = tk.StringVar()
    error_var = tk.StringVar()

    address_field_label = tk.StringVar(value="Server URL")
    tk.Label(form, textvariable=address_field_label, font=("Segoe UI", 9)).grid(row=0, column=0, sticky="w", pady=4)
    tk.Entry(form, textvariable=address_var, width=36).grid(row=0, column=1, pady=4, padx=(8, 0))
    fields = [("Agent ID", id_var, None), ("Enrollment Key", key_var, "*")]
    for row, (label_text, var, show) in enumerate(fields, start=1):
        tk.Label(form, text=label_text, font=("Segoe UI", 9)).grid(row=row, column=0, sticky="w", pady=4)
        tk.Entry(form, textvariable=var, width=36, show=show or "").grid(row=row, column=1, pady=4, padx=(8, 0))

    def on_mode_change(*_args) -> None:
        if mode_var.get() == "relay":
            address_field_label.set("Hub address")
            address_label_var.set(
                "Paste the hub's local network address (shown on the dashboard's\n"
                '"Deploy a device under <hub>" screen), plus the Agent ID and\nEnrollment Key from that same screen.'
            )
        else:
            address_field_label.set("Server URL")
            address_label_var.set(
                "Paste the Server URL, Agent ID, and Enrollment Key shown\non the dashboard's agent enrollment screen."
            )

    mode_var.trace_add("write", on_mode_change)

    tk.Label(root, textvariable=error_var, font=("Segoe UI", 8), fg="#c0392b").pack(padx=16)

    def on_connect() -> None:
        nonlocal result
        validated = _validate_connect_fields(
            address_var.get(), id_var.get(), key_var.get(), relay=mode_var.get() == "relay"
        )
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
    parser.add_argument(
        "--silent",
        action="store_true",
        help="No window/taskbar entry — used by the Windows auto-start Registry key, not meant for manual use",
    )
    args = parser.parse_args()

    cli_fields = (args.url, args.agent_id, args.agent_key)
    if any(cli_fields) and not all(cli_fields):
        parser.error("--url, --id, and --key must all be provided together")

    if all(cli_fields):
        if args.silent:
            run_silent({"url": args.url.rstrip("/")}, args.agent_id, args.agent_key)
        else:
            run_cli(args.url.rstrip("/"), args.agent_id, args.agent_key)
        return

    if not _acquire_single_instance_lock():
        # Silent launches shouldn't ever pop this dialog — if a silent
        # instance is already running, a second silent launch (e.g. two
        # logins in a row without a reboot) should just quietly step aside,
        # not put a message box on screen that was explicitly asked not to
        # show one.
        if not args.silent:
            _show_already_running_message()
        sys.exit(0)

    config = _load_config()
    if config is None:
        if args.silent:
            # Silent mode only makes sense once a prior run already
            # persisted a config — that's exactly the state the Registry Run
            # key relaunch expects. Nothing to connect with and explicitly
            # asked not to show the connect form, so exit quietly rather
            # than popping a GUI anyway.
            sys.exit(0)
        config = _show_connect_form()
        if config is None:
            sys.exit(0)

    # Cert pinning only means anything for a direct TLS connection to the
    # real backend -- a relay child's config has no "url" at all (see
    # _validate_connect_fields), and its actual traffic is a LAN-local hop
    # to the hub, not a connection this setting was ever meant to protect.
    pinned_sha256 = config.get("pinned_cert_sha256")
    if pinned_sha256 and not config.get("relay_mode") and not _verify_pinned_cert(config["url"], pinned_sha256):
        if args.silent:
            _write_status(
                "Connection failed", "Pinned certificate mismatch — refusing to connect.", config.get("id", "unknown")
            )
        else:
            print("Refusing to connect: server certificate does not match pinned_cert_sha256.", file=sys.stderr)
        sys.exit(1)

    if args.silent:
        run_silent(config, config["id"], config["key"])
    else:
        run_gui(config, config["id"], config["key"])


def _load_crash_timestamps() -> list[float]:
    path = _app_dir() / CRASH_LOG_FILENAME
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return [float(t) for t in data if isinstance(t, (int, float))]
    except (OSError, ValueError):
        return []


def _save_crash_timestamps(timestamps: list[float]) -> None:
    path = _app_dir() / CRASH_LOG_FILENAME
    try:
        path.write_text(json.dumps(timestamps), encoding="utf-8")
    except OSError:
        pass


# Must persist to disk, not just an in-memory counter — os.execv (see
# _relaunch_self) replaces the whole process image, so any in-memory state
# is gone the instant a restart happens. Without this, a persistent bug
# (not a transient one) would fast-restart forever, which is worse than the
# original silently-dead-process bug this whole mechanism exists to fix.
def _record_crash_and_should_restart() -> bool:
    now = time.time()
    timestamps = [t for t in _load_crash_timestamps() if now - t < RESTART_WINDOW_SECONDS]
    timestamps.append(now)
    _save_crash_timestamps(timestamps)
    return len(timestamps) <= MAX_RESTARTS_IN_WINDOW


def _relaunch_self() -> None:
    if getattr(sys, "frozen", False):
        # Frozen: sys.executable *is* the running .exe, and sys.argv[0] is
        # already that same path — argv[1:] is the real arguments.
        argv = [sys.executable, *sys.argv[1:]]
    else:
        # Dev run (`python tp_agent.py ...`): sys.executable is the
        # interpreter, not the script, so the script path has to be
        # supplied explicitly as the thing to run.
        argv = [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]]
    os.execv(sys.executable, argv)


# Last line of defense: any exception that escapes main()'s entire call
# graph (a bug nothing else caught) used to just leave the process dead —
# silently, for a --silent background instance, since there's no window and
# no supervisor watching a bare .exe. This restarts it in place instead,
# bounded by _record_crash_and_should_restart's crash-loop guard above.
# Only covers unhandled *Python* exceptions; an OS-level crash (segfault, a
# forcibly killed process, an OOM-kill) never reaches this except handler at
# all and needs a true external supervisor (a real Windows service, not a
# single-file script) — out of scope here.
def _show_crash_giveup_message(exc: Exception) -> None:
    # The give-up path used to just sys.exit(1) with nothing but a stderr
    # print that goes nowhere on a frozen windowed (console=False) build —
    # confirmed live: a user hitting this saw literally no window, no
    # error, nothing, described as "I can't open the app" with no way to
    # tell why. Only for interactive launches (no --silent) — the login-time
    # autostart relaunch has no window to begin with and shouldn't suddenly
    # grow one just because it's failing.
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        _set_window_icon(root)
        messagebox.showerror(
            "TruePositive Agent",
            "The agent has crashed repeatedly and stopped trying to restart itself, "
            f"to avoid a crash loop.\n\nLast error: {exc}\n\n"
            f"It will try again automatically after {RESTART_WINDOW_SECONDS // 60} minutes, "
            "or you can close this and reopen the app once the underlying issue is fixed.",
        )
    except Exception:  # noqa: BLE001, S110 — this dialog is a courtesy, never let it mask the real exit
        pass


def _run_with_crash_recovery() -> None:
    try:
        main()
    except (SystemExit, KeyboardInterrupt):
        raise
    except Exception as exc:  # noqa: BLE001 — deliberately catches everything else
        _safe_console_log(f"Unhandled crash: {exc!r}")
        try:
            _write_status("Crashed", f"Unhandled error: {exc}", "unknown")
        except Exception as status_exc:  # noqa: BLE001 — never let status-writing itself block recovery
            _safe_console_log(f"(also failed to record crash status: {status_exc!r})")
        if not _record_crash_and_should_restart():
            _safe_console_log(
                f"Giving up after {MAX_RESTARTS_IN_WINDOW} crashes within {RESTART_WINDOW_SECONDS}s — "
                "not restarting again to avoid a crash loop."
            )
            if "--silent" not in sys.argv:
                _show_crash_giveup_message(exc)
            sys.exit(1)
        _safe_console_log("Restarting…")
        _relaunch_self()


if __name__ == "__main__":
    _run_with_crash_recovery()
