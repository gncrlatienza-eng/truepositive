import io
import subprocess
import threading
import urllib.error
from unittest.mock import call, patch

import tp_agent


def _make_http_error(code, body=b"detail"):
    return urllib.error.HTTPError("http://x", code, "msg", None, io.BytesIO(body))


def _fake_result(returncode, stdout="", stderr=""):
    class _Result:
        pass

    result = _Result()
    result.returncode = returncode
    result.stdout = stdout
    result.stderr = stderr
    return result


def test_no_new_events_does_not_warn():
    tp_agent._warned_channels.clear()
    warnings = []
    with (
        patch("tp_agent.shutil.which", return_value="wevtutil.exe"),
        patch("tp_agent.subprocess.run", return_value=_fake_result(0, stdout="")),
    ):
        events, status, reason = tp_agent._query_windows_channel(
            "PowerShell Operational", None, 200, log_fn=warnings.append
        )

    assert events == []
    assert status == "ok"
    assert reason is None
    assert warnings == []


def test_access_denied_warns_once_per_channel_and_reports_error():
    tp_agent._warned_channels.clear()
    warnings = []
    with (
        patch("tp_agent.shutil.which", return_value="wevtutil.exe"),
        patch("tp_agent.subprocess.run", return_value=_fake_result(1, stderr="Access is denied.")),
    ):
        events1, status1, reason1 = tp_agent._query_windows_channel("Security", None, 200, log_fn=warnings.append)
        events2, status2, reason2 = tp_agent._query_windows_channel("Security", None, 200, log_fn=warnings.append)

    assert events1 == [] and events2 == []
    assert status1 == "error" and status2 == "error"
    assert reason1 is not None and "access denied" in reason1.lower()
    assert reason2 == reason1
    assert len(warnings) == 1
    assert "access denied" in warnings[0].lower()


def test_collect_source_missing_path_reports_error():
    events, bookmark, status, reason = tp_agent._collect_source({"id": "x", "path": None}, None)
    assert events == []
    assert bookmark is None
    assert status == "error"
    assert reason == "No path configured for this source."


def test_collect_source_windows_idle_cycle_keeps_bookmark():
    # A genuinely quiet channel (no new events since last cycle) must not be
    # mistaken for a reset -- the reset-check's own newest-id query still
    # confirms the channel's real newest id is at/above the stale bookmark.
    calls = []

    def fake_query(_channel, after_record_id, _limit, _log_fn=print, newest_first=False):
        calls.append(newest_first)
        if newest_first:
            return [{"record_id": 500}], "ok", None
        return [], "ok", None

    with patch("tp_agent._query_windows_channel", side_effect=fake_query):
        events, bookmark, status, _reason = tp_agent._collect_source({"id": "x", "path": "Security"}, 500)

    assert events == []
    assert bookmark == 500
    assert status == "ok"
    assert calls == [False, True]


def test_collect_source_windows_rebaselines_after_channel_reset():
    # Reproduces the bug: the channel was cleared/reset, so its real newest
    # record id is now *below* the stale on-disk bookmark -- querying
    # EventRecordID>{stale_bookmark} matches nothing and would silently
    # freeze this source's collection forever without the reset check.
    logs = []

    def fake_query(_channel, _after_record_id, _limit, _log_fn=print, newest_first=False):
        if newest_first:
            return [{"record_id": 12}], "ok", None
        return [], "ok", None

    with patch("tp_agent._query_windows_channel", side_effect=fake_query):
        events, bookmark, status, _reason = tp_agent._collect_source(
            {"id": "x", "path": "Security"}, 5000, log_fn=logs.append
        )

    assert events == []
    assert bookmark == 12
    assert status == "ok"
    assert any("cleared or reset" in msg for msg in logs)


def test_collect_source_windows_error_status_skips_reset_check():
    # A real error (e.g. access denied) shouldn't spend an extra wevtutil
    # call every cycle probing for a reset that isn't what's wrong here.
    calls = []

    def fake_query(_channel, _after_record_id, _limit, _log_fn=print, newest_first=False):
        calls.append(newest_first)
        return [], "error", "Access denied — run the agent as Administrator to read this channel."

    with patch("tp_agent._query_windows_channel", side_effect=fake_query):
        events, bookmark, status, _reason = tp_agent._collect_source({"id": "x", "path": "Security"}, 5000)

    assert events == []
    assert bookmark == 5000
    assert status == "error"
    assert calls == [False]


def _fake_event(i):
    return {"timestamp": "2026-01-01T00:00:00Z", "severity": "info", "event_type": "Test", "message": f"event {i}"}


def test_collect_and_ship_chunks_combined_batch_over_backend_cap():
    # 3 sources x 200 events = 600, over the backend's 500-item cap -- must
    # be split into multiple _ingest_logs calls, none exceeding the cap, and
    # every source's bookmark should still advance once its chunk ships.
    sources = [{"id": f"src-{i}", "path": f"Channel{i}"} for i in range(3)]
    per_source_events = {s["id"]: [_fake_event(i) for i in range(200)] for s in sources}

    def fake_collect_source(source, _bookmark, _log_fn=print):
        return per_source_events[source["id"]], f"bookmark-{source['id']}", "ok", None

    ingest_calls = []

    def fake_ingest_logs(_conn, _agent_id, _agent_key, batch):
        ingest_calls.append(batch)
        return {"ingested": len(batch), "alerts_created": 0}

    state = {}
    with (
        patch("tp_agent._get_sources", return_value=sources),
        patch("tp_agent._collect_source", side_effect=fake_collect_source),
        patch("tp_agent._maybe_auto_fix_source"),
        patch("tp_agent._report_source_status"),
        patch("tp_agent._ingest_logs", side_effect=fake_ingest_logs),
        patch("tp_agent._save_state"),
        patch("tp_agent._write_status") as write_status,
    ):
        tp_agent._collect_and_ship({}, "agent-1", "key-1", state)

    assert len(ingest_calls) == 2
    assert all(len(batch) <= tp_agent.MAX_INGEST_BATCH_SIZE for batch in ingest_calls)
    assert sum(len(batch) for batch in ingest_calls) == 600
    assert state["bookmarks"] == {s["id"]: f"bookmark-{s['id']}" for s in sources}
    write_status.assert_not_called()


def test_collect_and_ship_failed_chunk_does_not_block_others():
    # One source's chunk fails (e.g. still over-quota after an offline gap);
    # a different source's already-succeeded chunk must still advance and
    # persist instead of the whole cycle being wedged.
    sources = [{"id": "good", "path": "A"}, {"id": "bad", "path": "B"}]
    per_source_events = {
        "good": [_fake_event(i) for i in range(200)],
        "bad": [_fake_event(i) for i in range(400)],  # forces its own chunk
    }

    def fake_collect_source(source, _bookmark, _log_fn=print):
        return per_source_events[source["id"]], f"bookmark-{source['id']}", "ok", None

    def fake_ingest_logs(_conn, _agent_id, _agent_key, batch):
        if len(batch) == 400:
            raise tp_agent.AgentRequestError("422 Unprocessable Entity")
        return {"ingested": len(batch), "alerts_created": 0}

    state = {}
    with (
        patch("tp_agent._get_sources", return_value=sources),
        patch("tp_agent._collect_source", side_effect=fake_collect_source),
        patch("tp_agent._maybe_auto_fix_source"),
        patch("tp_agent._report_source_status"),
        patch("tp_agent._ingest_logs", side_effect=fake_ingest_logs),
        patch("tp_agent._save_state"),
        patch("tp_agent._write_status") as write_status,
    ):
        tp_agent._collect_and_ship({}, "agent-1", "key-1", state)

    assert state["bookmarks"] == {"good": "bookmark-good"}
    write_status.assert_called_once()
    assert write_status.call_args.args[0] == "Collection failed"
    assert write_status.call_args.args[2] == "agent-1"


def test_collect_and_ship_zero_event_source_bookmark_persists_despite_other_failure():
    # A source with nothing new this cycle (e.g. a cheap rebaseline check)
    # isn't shipped at all, so its bookmark shouldn't be held hostage by a
    # different source's shipping failure.
    sources = [{"id": "quiet", "path": "A"}, {"id": "bad", "path": "B"}]

    def fake_collect_source(source, _bookmark, _log_fn=print):
        if source["id"] == "quiet":
            return [], "bookmark-quiet", "ok", None
        return [_fake_event(0)], "bookmark-bad", "ok", None

    def fake_ingest_logs(_conn, _agent_id, _agent_key, _batch):
        raise tp_agent.AgentRequestError("connection refused")

    state = {}
    with (
        patch("tp_agent._get_sources", return_value=sources),
        patch("tp_agent._collect_source", side_effect=fake_collect_source),
        patch("tp_agent._maybe_auto_fix_source"),
        patch("tp_agent._report_source_status"),
        patch("tp_agent._ingest_logs", side_effect=fake_ingest_logs),
        patch("tp_agent._save_state"),
        patch("tp_agent._write_status"),
    ):
        tp_agent._collect_and_ship({}, "agent-1", "key-1", state)

    assert state["bookmarks"] == {"quiet": "bookmark-quiet"}


def test_validate_connect_fields_rejects_missing_or_blank():
    assert tp_agent._validate_connect_fields("", "agent-1", "key-1") is None
    assert tp_agent._validate_connect_fields("http://localhost:8000", "   ", "key-1") is None
    assert tp_agent._validate_connect_fields("http://localhost:8000", "agent-1", "") is None


def test_validate_connect_fields_trims_and_normalizes():
    result = tp_agent._validate_connect_fields("  http://localhost:8000/  ", "  agent-1  ", "  key-1  ")
    assert result == {"url": "http://localhost:8000", "id": "agent-1", "key": "key-1"}


def test_register_with_retry_succeeds_after_transient_failures():
    calls = []

    def fake_post(_url, _key, _body):
        calls.append(1)
        if len(calls) < 3:
            raise tp_agent.AgentRequestError("connection refused")
        return {"status": "connected", "hostname": "h"}

    retries = []
    with (
        patch("tp_agent._post", side_effect=fake_post),
        patch("tp_agent.time.sleep") as mock_sleep,
    ):
        result = tp_agent._register_with_retry(
            {"mode": "direct", "base": "http://x"},
            "agent-1",
            "key-1",
            "host",
            on_retry=lambda attempt, delay, exc: retries.append((attempt, delay)),
        )

    assert result == {"status": "connected", "hostname": "h"}
    assert len(calls) == 3
    assert retries == [(1, 5), (2, 10)]
    assert mock_sleep.call_args_list == [call(5), call(10)]


def test_register_with_retry_fails_fast_on_401():
    # A wrong/stale key will never fix itself by waiting -- retrying it is
    # pointless, so this must raise immediately without consuming any of
    # the retry budget.
    calls = []
    retries = []

    def fake_post(_url, _key, _body):
        calls.append(1)
        raise tp_agent.AgentRequestError("nope", status_code=401)

    with (
        patch("tp_agent._post", side_effect=fake_post),
        patch("tp_agent.time.sleep") as mock_sleep,
    ):
        try:
            tp_agent._register_with_retry(
                {"mode": "direct", "base": "http://x"},
                "agent-1",
                "key-1",
                "host",
                on_retry=lambda *a: retries.append(a),
            )
            raise AssertionError("expected AgentCredentialsError")
        except tp_agent.AgentCredentialsError:
            pass

    assert len(calls) == 1
    assert retries == []
    mock_sleep.assert_not_called()


def test_register_with_retry_gives_up_after_bounded_window():
    def fake_post(_url, _key, _body):
        raise tp_agent.AgentRequestError("connection refused")

    with (
        patch("tp_agent._post", side_effect=fake_post),
        patch("tp_agent.time.sleep"),
        patch("tp_agent.time.monotonic", side_effect=[0, 100, 200, 301]),
    ):
        result = tp_agent._register_with_retry({"mode": "direct", "base": "http://x"}, "agent-1", "key-1", "host")

    assert result is None


def test_register_with_retry_stop_event_interrupts_wait():
    class _ImmediateStop:
        def is_set(self):
            return False

        def wait(self, _delay):
            return True  # simulate Exit clicked mid-wait

    def fake_post(_url, _key, _body):
        raise tp_agent.AgentRequestError("connection refused")

    with patch("tp_agent._post", side_effect=fake_post):
        result = tp_agent._register_with_retry(
            {"mode": "direct", "base": "http://x"}, "agent-1", "key-1", "host", stop_event=_ImmediateStop()
        )

    assert result is None


def test_run_silent_never_gives_up_on_registration():
    # Unlike run_gui's connect flow, a --silent instance has no user watching
    # and no "next login" to fall back on if it's already the process running
    # post-wake/post-reboot -- giving up here would mean nothing ever brings
    # it back. Proves registration keeps retrying past the ~5 min window that
    # used to end it (5 attempts here, well past the old 3-attempt give-up),
    # rather than returning and letting the process exit quietly.
    calls = []

    def fake_post(_url, _key, _body):
        calls.append(1)
        raise tp_agent.AgentRequestError("connection refused")

    with (
        patch("tp_agent._post", side_effect=fake_post),
        patch("tp_agent._write_status"),
        patch("tp_agent.time.sleep", side_effect=[None, None, None, None, _StopLoop()]),
    ):
        try:
            tp_agent.run_silent({"url": "http://x"}, "agent-1", "key-1")
        except _StopLoop:
            pass  # only way this loop ever ends without a real backend to succeed against

    assert len(calls) == 5


def test_run_silent_credentials_rejected_stops_immediately():
    calls = []
    written = []

    def fake_post(_url, _key, _body):
        calls.append(1)
        raise tp_agent.AgentRequestError("bad key", status_code=401)

    with (
        patch("tp_agent._post", side_effect=fake_post),
        patch("tp_agent._write_status", side_effect=lambda *a: written.append(a)),
        patch("tp_agent.time.sleep") as mock_sleep,
    ):
        tp_agent.run_silent({"url": "http://x"}, "agent-1", "key-1")

    assert len(calls) == 1
    mock_sleep.assert_not_called()
    assert len(written) == 1
    assert written[0][0] == "Connection failed"


class _StopLoop(Exception):
    pass


def test_run_silent_persists_config_and_reregisters_autostart_on_success():
    with (
        patch("tp_agent._post", return_value={"status": "connected", "hostname": "h"}),
        patch("tp_agent._ensure_local_config_persisted") as mock_persist,
        patch("tp_agent._ensure_windows_autostart") as mock_autostart,
        patch("tp_agent._write_status"),
        patch("tp_agent._load_state", return_value={}),
        patch("tp_agent._collect_and_ship"),
        patch("tp_agent.time.sleep", side_effect=_StopLoop),
    ):
        try:
            tp_agent.run_silent({"url": "http://x"}, "agent-1", "key-1")
        except _StopLoop:
            pass  # escapes the heartbeat loop on purpose once we've proven we reached it

    mock_persist.assert_called_once()
    mock_autostart.assert_called_once()


def test_run_silent_writes_status_on_register_failure_and_success():
    # A background --silent instance has no window at all — agent_status.json
    # (via _write_status) is the only place its real state is ever visible,
    # so a manual double-click's "already running" dialog can show it.
    written = []
    responses = iter(
        [
            tp_agent.AgentRequestError("connection refused"),
            {"status": "connected", "hostname": "h"},
        ]
    )

    def fake_post(_url, _key, _body):
        result = next(responses)
        if isinstance(result, Exception):
            raise result
        return result

    with (
        patch("tp_agent._post", side_effect=fake_post),
        patch("tp_agent._write_status", side_effect=lambda *a: written.append(a)),
        patch("tp_agent._ensure_local_config_persisted"),
        patch("tp_agent._ensure_windows_autostart"),
        patch("tp_agent._load_state", return_value={}),
        patch("tp_agent._collect_and_ship"),
        patch("tp_agent.time.sleep", side_effect=[None, _StopLoop()]),
    ):
        try:
            tp_agent.run_silent({"url": "http://x"}, "agent-1", "key-1")
        except _StopLoop:
            pass

    assert written[0] == ("Connection failed", "connection refused", "agent-1")
    assert written[1][0] == "Connected"
    assert written[1][2] == "agent-1"


def test_run_silent_survives_unexpected_heartbeat_exception():
    # Confirmed live: an exception from the heartbeat call *other* than
    # AgentRequestError (a malformed response, a raw socket error urllib
    # didn't wrap, ...) used to escape the narrow `except AgentRequestError`
    # uncaught, silently killing this loop for good with no crash log and no
    # relaunch (_run_with_crash_recovery only supervises the main thread) --
    # symptom: an agent that looks "running" but never heartbeats again.
    # Proves the broader guard now survives it and keeps looping.
    written = []
    heartbeat_calls = {"n": 0}

    def fake_post(url, _key, _body):
        if url.endswith("/register"):
            return {"status": "connected", "hostname": "h", "is_primary": False}
        heartbeat_calls["n"] += 1
        raise KeyError("boom")  # deliberately not an AgentRequestError

    with (
        patch("tp_agent._post", side_effect=fake_post),
        patch("tp_agent._write_status", side_effect=lambda *a: written.append(a)),
        patch("tp_agent._ensure_local_config_persisted"),
        patch("tp_agent._ensure_windows_autostart"),
        patch("tp_agent._load_state", return_value={}),
        patch("tp_agent._collect_and_ship"),
        patch("tp_agent.time.sleep", side_effect=[None, None, _StopLoop()]),
    ):
        try:
            tp_agent.run_silent({"url": "http://x"}, "agent-1", "key-1")
        except _StopLoop:
            pass

    # Both heartbeat cycles actually ran — the first failure didn't kill the loop.
    assert heartbeat_calls["n"] == 2
    heartbeat_failures = [w for w in written if w[0] == "Heartbeat failed"]
    assert len(heartbeat_failures) == 2
    assert "Unexpected error" in heartbeat_failures[0][1]
    assert "boom" in heartbeat_failures[0][1]


def test_format_already_running_message_includes_status_when_present():
    message = tp_agent._format_already_running_message(
        {
            "status": "Heartbeat failed",
            "detail": "Could not reach http://localhost:8000: [Errno 111] Connection refused",
            "agent_id": "agent-1",
            "updated_at": "2026-08-16 10:32:05",
        }
    )
    assert "already running" in message
    assert "Status: Heartbeat failed" in message
    assert "Connection refused" in message
    assert "Agent ID: agent-1" in message
    assert "Last updated: 2026-08-16 10:32:05" in message


def test_format_already_running_message_handles_no_status_recorded_yet():
    message = tp_agent._format_already_running_message(None)
    assert "already running" in message
    assert "still be starting up" in message


def test_http_error_message_401_is_actionable_and_distinct():
    exc = _make_http_error(401, b'{"detail":"Not authenticated"}')
    message = tp_agent._http_error_message("http://x/agents/1/register", exc)
    assert "Credentials rejected" in message
    assert "Settings" in message
    assert "will not resolve on its own" in message


def test_http_error_message_non_401_is_generic():
    exc = _make_http_error(500, b"boom")
    message = tp_agent._http_error_message("http://x/agents/1/heartbeat", exc)
    assert "Credentials rejected" not in message
    assert "failed (500)" in message


def test_post_sets_status_code_on_http_error():
    with patch("tp_agent.urllib.request.urlopen", side_effect=_make_http_error(401)):
        try:
            tp_agent._post("http://x", "key", {})
            raise AssertionError("expected AgentRequestError")
        except tp_agent.AgentRequestError as exc:
            assert exc.status_code == 401


def test_post_url_error_has_no_status_code():
    with patch("tp_agent.urllib.request.urlopen", side_effect=urllib.error.URLError("refused")):
        try:
            tp_agent._post("http://x", "key", {})
            raise AssertionError("expected AgentRequestError")
        except tp_agent.AgentRequestError as exc:
            assert exc.status_code is None
            assert "Could not reach" in str(exc)


def test_call_with_hard_timeout_returns_value_on_success():
    assert tp_agent._call_with_hard_timeout(lambda: 42) == 42


def test_call_with_hard_timeout_reraises_exception_from_fn():
    def boom():
        raise tp_agent.AgentRequestError("nope", status_code=500)

    try:
        tp_agent._call_with_hard_timeout(boom)
        raise AssertionError("expected AgentRequestError")
    except tp_agent.AgentRequestError as exc:
        assert exc.status_code == 500
        assert str(exc) == "nope"


def test_call_with_hard_timeout_raises_on_a_real_hang():
    # A hung DNS lookup (the real-world case this guards against) never
    # returns and never raises -- simulate that with a function that just
    # blocks forever, and confirm the caller gets control back anyway
    # rather than hanging for the real 20s, patch the threshold way down.
    never_finish = threading.Event()

    def hangs_forever():
        never_finish.wait()  # blocks until the test's own cleanup below
        return "should never get here"

    with patch("tp_agent.NETWORK_HARD_TIMEOUT_SECONDS", 0.05):
        try:
            tp_agent._call_with_hard_timeout(hangs_forever)
            raise AssertionError("expected AgentRequestError")
        except tp_agent.AgentRequestError as exc:
            assert "Timed out" in str(exc)
        finally:
            never_finish.set()  # let the leaked daemon thread finish so it doesn't linger past the test


# ── Hub-and-spoke relay (Phase 1: manual pairing, full isolation) ──────────


def test_validate_connect_fields_relay_mode():
    result = tp_agent._validate_connect_fields("  192.168.1.5:47824/  ", "  child-1  ", "  key-1  ", relay=True)
    assert result == {"relay_mode": True, "hub_relay_url": "192.168.1.5:47824", "id": "child-1", "key": "key-1"}


def test_validate_connect_fields_relay_mode_rejects_missing():
    assert tp_agent._validate_connect_fields("", "child-1", "key-1", relay=True) is None


def test_conn_from_config_direct_and_relay():
    assert tp_agent._conn_from_config({"url": "http://x:8000/"}) == {"mode": "direct", "base": "http://x:8000"}
    assert tp_agent._conn_from_config({"relay_mode": True, "hub_relay_url": "http://192.168.1.5:47824/"}) == {
        "mode": "relay",
        "hub_relay_url": "http://192.168.1.5:47824",
    }


def test_register_direct_mode_posts_and_keeps_backend_hostname():
    with patch(
        "tp_agent._post", return_value={"status": "connected", "hostname": "h", "is_primary": False}
    ) as mock_post:
        result = tp_agent._register({"mode": "direct", "base": "http://x"}, "agent-1", "key-1", "myhost")
    mock_post.assert_called_once_with("http://x/agents/agent-1/register", "key-1", {"hostname": "myhost"})
    assert result["hostname"] == "h"


def test_register_relay_mode_calls_relay_and_fills_in_hostname_locally():
    conn = {"mode": "relay", "hub_relay_url": "http://hub:47824"}
    with patch(
        "tp_agent._relay_call",
        return_value={"heartbeat": {"id": "agent-1", "status": "connected", "is_primary": False}},
    ) as mock_relay:
        result = tp_agent._register(conn, "agent-1", "key-1", "myhost")
    mock_relay.assert_called_once_with(conn, "register", "agent-1", "key-1", hostname="myhost")
    # Relay's heartbeat-shaped response never echoes hostname back -- the
    # wrapper fills it in locally since the caller already knows its own.
    assert result["hostname"] == "myhost"


def test_heartbeat_relay_mode_unwraps_and_ignores_listen_addr():
    conn = {"mode": "relay", "hub_relay_url": "http://hub:47824"}
    with patch("tp_agent._relay_call", return_value={"heartbeat": {"status": "connected"}}) as mock_relay:
        result = tp_agent._heartbeat(conn, "agent-1", "key-1", relay_listen_addr="192.168.1.5:47824")
    mock_relay.assert_called_once_with(conn, "heartbeat", "agent-1", "key-1")
    assert result == {"status": "connected"}


def test_heartbeat_direct_mode_only_includes_listen_addr_when_set():
    conn = {"mode": "direct", "base": "http://x"}
    # Capability reporting is exercised separately below -- stub it here so
    # this test isn't coupled to (or slowed down by) the real Windows checks.
    with (
        patch("tp_agent._post", return_value={"status": "connected"}) as mock_post,
        patch("tp_agent._capabilities_for_heartbeat", return_value={}),
    ):
        tp_agent._heartbeat(conn, "agent-1", "key-1")
    mock_post.assert_called_once_with("http://x/agents/agent-1/heartbeat", "key-1", {})

    with (
        patch("tp_agent._post", return_value={"status": "connected"}) as mock_post,
        patch("tp_agent._capabilities_for_heartbeat", return_value={}),
    ):
        tp_agent._heartbeat(conn, "agent-1", "key-1", relay_listen_addr="192.168.1.5:47824")
    mock_post.assert_called_once_with(
        "http://x/agents/agent-1/heartbeat", "key-1", {"relay_listen_addr": "192.168.1.5:47824"}
    )


def test_heartbeat_direct_mode_includes_reported_capabilities():
    conn = {"mode": "direct", "base": "http://x"}
    with (
        patch("tp_agent._post", return_value={"status": "connected"}) as mock_post,
        patch(
            "tp_agent._capabilities_for_heartbeat",
            return_value={"event_log_reader_member": True, "sysmon_installed": False},
        ),
    ):
        tp_agent._heartbeat(conn, "agent-1", "key-1")
    mock_post.assert_called_once_with(
        "http://x/agents/agent-1/heartbeat",
        "key-1",
        {"event_log_reader_member": True, "sysmon_installed": False},
    )


def test_heartbeat_relay_mode_never_calls_capabilities_check():
    conn = {"mode": "relay", "hub_relay_url": "http://hub:47824"}
    with (
        patch("tp_agent._relay_call", return_value={"heartbeat": {"status": "connected"}}),
        patch("tp_agent._capabilities_for_heartbeat") as mock_caps,
    ):
        tp_agent._heartbeat(conn, "agent-1", "key-1")
    mock_caps.assert_not_called()


def test_check_capabilities_empty_on_non_windows():
    with patch("tp_agent.platform.system", return_value="Linux"):
        assert tp_agent._check_capabilities() == {}


def test_check_capabilities_windows_combines_both_checks():
    with (
        patch("tp_agent.platform.system", return_value="Windows"),
        patch("tp_agent._is_event_log_reader_member", return_value=True),
        patch("tp_agent._is_sysmon_installed", return_value=False),
    ):
        assert tp_agent._check_capabilities() == {"event_log_reader_member": True, "sysmon_installed": False}


def test_is_event_log_reader_member_none_when_identity_unknown():
    with patch("tp_agent._cached_windows_identity", return_value=None):
        assert tp_agent._is_event_log_reader_member() is None


def test_is_event_log_reader_member_true_when_username_listed():
    fake_result = _fake_result(0, stdout="Members\n-------\nGIO\\Gio\nThe command completed.\n")
    with (
        patch("tp_agent._cached_windows_identity", return_value="GIO\\Gio"),
        patch("tp_agent.subprocess.run", return_value=fake_result),
    ):
        assert tp_agent._is_event_log_reader_member() is True


def test_is_event_log_reader_member_false_when_username_absent():
    fake_result = _fake_result(0, stdout="Members\n-------\nAdministrator\n")
    with (
        patch("tp_agent._cached_windows_identity", return_value="GIO\\Gio"),
        patch("tp_agent.subprocess.run", return_value=fake_result),
    ):
        assert tp_agent._is_event_log_reader_member() is False


def test_is_event_log_reader_member_none_on_command_failure():
    with (
        patch("tp_agent._cached_windows_identity", return_value="GIO\\Gio"),
        patch("tp_agent.subprocess.run", side_effect=OSError("net.exe not found")),
    ):
        assert tp_agent._is_event_log_reader_member() is None


def test_capabilities_for_heartbeat_caches_between_calls():
    tp_agent._capabilities_cache = {}
    tp_agent._capabilities_last_checked = 0.0
    with patch("tp_agent._check_capabilities", return_value={"event_log_reader_member": True}) as mock_check:
        first = tp_agent._capabilities_for_heartbeat()
        second = tp_agent._capabilities_for_heartbeat()
    assert first == second == {"event_log_reader_member": True}
    mock_check.assert_called_once()


def test_get_sources_relay_vs_direct():
    relay_conn = {"mode": "relay", "hub_relay_url": "http://hub"}
    with patch("tp_agent._relay_call", return_value={"sources": [{"id": "s1"}]}) as mock_relay:
        result = tp_agent._get_sources(relay_conn, "agent-1", "key-1")
    assert result == [{"id": "s1"}]
    mock_relay.assert_called_once_with(relay_conn, "sources", "agent-1", "key-1")

    direct_conn = {"mode": "direct", "base": "http://x"}
    with patch("tp_agent._get", return_value=[{"id": "s1"}]) as mock_get:
        result = tp_agent._get_sources(direct_conn, "agent-1", "key-1")
    assert result == [{"id": "s1"}]
    mock_get.assert_called_once_with("http://x/agents/agent-1/sources", "key-1")


def test_report_source_status_relay_vs_direct():
    results = [{"source_id": "s1", "status": "ok", "reason": None}]
    relay_conn = {"mode": "relay", "hub_relay_url": "http://hub"}
    with patch("tp_agent._relay_call", return_value={"source_status": {"updated": 1}}) as mock_relay:
        result = tp_agent._report_source_status(relay_conn, "agent-1", "key-1", results)
    assert result == {"updated": 1}
    mock_relay.assert_called_once_with(relay_conn, "source_status", "agent-1", "key-1", source_status_results=results)

    direct_conn = {"mode": "direct", "base": "http://x"}
    with patch("tp_agent._post", return_value={"updated": 1}) as mock_post:
        tp_agent._report_source_status(direct_conn, "agent-1", "key-1", results)
    mock_post.assert_called_once_with("http://x/agents/agent-1/sources/status", "key-1", {"results": results})


def test_ingest_logs_relay_vs_direct():
    batch = [{"source_id": "s1", "severity": "ok"}]
    relay_conn = {"mode": "relay", "hub_relay_url": "http://hub"}
    with patch("tp_agent._relay_call", return_value={"logs": {"ingested": 1, "alerts_created": 0}}) as mock_relay:
        result = tp_agent._ingest_logs(relay_conn, "agent-1", "key-1", batch)
    assert result == {"ingested": 1, "alerts_created": 0}
    mock_relay.assert_called_once_with(relay_conn, "logs", "agent-1", "key-1", logs=batch)

    direct_conn = {"mode": "direct", "base": "http://x"}
    with patch("tp_agent._post", return_value={"ingested": 1, "alerts_created": 0}) as mock_post:
        tp_agent._ingest_logs(direct_conn, "agent-1", "key-1", batch)
    mock_post.assert_called_once_with("http://x/agents/agent-1/logs", "key-1", {"logs": batch})


def test_relay_call_posts_to_hub_local_proxy_endpoint():
    import json as _json

    captured = {}

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"heartbeat": {"status": "connected"}}'

    def fake_urlopen(request, timeout=10):
        captured["url"] = request.full_url
        captured["body"] = request.data
        return _FakeResponse()

    with patch("tp_agent.urllib.request.urlopen", side_effect=fake_urlopen):
        result = tp_agent._relay_call(
            {"mode": "relay", "hub_relay_url": "http://192.168.1.5:47824"}, "heartbeat", "child-1", "key-1"
        )

    assert result == {"heartbeat": {"status": "connected"}}
    assert captured["url"] == "http://192.168.1.5:47824/relay/proxy"
    assert _json.loads(captured["body"]) == {"id": "child-1", "key": "key-1", "kind": "heartbeat"}


def test_maybe_activate_hub_mode_skips_relay_conn_and_non_primary():
    tp_agent._hub_relay_server_started.clear()
    with patch("tp_agent.threading.Thread") as mock_thread:
        tp_agent._maybe_activate_hub_mode({"mode": "relay", "hub_relay_url": "http://hub"}, "a1", "k1", True, print)
        tp_agent._maybe_activate_hub_mode({"mode": "direct", "base": "http://x"}, "a1", "k1", False, print)
    mock_thread.assert_not_called()
    assert not tp_agent._hub_relay_server_started.is_set()


def test_maybe_activate_hub_mode_starts_listener_once_when_direct_and_primary():
    tp_agent._hub_relay_server_started.clear()
    try:
        with patch("tp_agent.threading.Thread") as mock_thread:
            tp_agent._maybe_activate_hub_mode({"mode": "direct", "base": "http://x"}, "a1", "k1", True, print)
            tp_agent._maybe_activate_hub_mode({"mode": "direct", "base": "http://x"}, "a1", "k1", True, print)
        mock_thread.assert_called_once()
        assert tp_agent._hub_relay_server_started.is_set()
    finally:
        tp_agent._hub_relay_server_started.clear()


def test_current_relay_listen_addr_none_until_hub_mode_active():
    tp_agent._hub_relay_server_started.clear()
    assert tp_agent._current_relay_listen_addr() is None

    tp_agent._hub_relay_server_started.set()
    try:
        with patch("tp_agent._local_lan_ip", return_value="192.168.1.5"):
            assert tp_agent._current_relay_listen_addr() == f"192.168.1.5:{tp_agent.RELAY_LISTEN_PORT}"
        with patch("tp_agent._local_lan_ip", return_value=None):
            assert tp_agent._current_relay_listen_addr() is None
    finally:
        tp_agent._hub_relay_server_started.clear()


# ── Elevated actions (2026-10-04 audit: no elevated code from user-writable paths) ──


def test_ps_quote_escapes_embedded_apostrophes():
    assert tp_agent._ps_quote("C:/Users/O'Brien") == "'C:/Users/O''Brien'"


def test_read_elevated_result_ignores_stale_and_mismatched_results(tmp_path):
    with patch("tp_agent.ELEVATED_RESULTS_DIR", tmp_path):
        assert tp_agent._read_elevated_result("install_sysmon", 100) is None  # no file yet

        # Written with a BOM, the way PowerShell 5.1's Set-Content -Encoding UTF8 does.
        (tmp_path / "install_sysmon.json").write_text(
            '{"action": "install_sysmon", "success": true, "message": "ok", "finished_at": 50}', encoding="utf-8-sig"
        )
        assert tp_agent._read_elevated_result("install_sysmon", 100) is None  # from an earlier attempt
        assert tp_agent._read_elevated_result("install_sysmon", 40) == (True, "ok")
        assert tp_agent._read_elevated_result("grant_log_access", 40) is None  # different action's file


def test_elevated_fallback_command_inlines_bundled_script_and_quoted_args():
    with patch("tp_agent._cached_windows_identity", return_value="PC\\O'Brien"):
        command = tp_agent._elevated_fallback_command("grant_log_access")
    assert command is not None
    assert "net.exe localgroup 'Event Log Readers'" in command
    assert command.endswith(" -UserName 'PC\\O''Brien'")

    sysmon = tp_agent._elevated_fallback_command("install_sysmon")
    assert sysmon is not None
    assert "Get-AuthenticodeSignature" in sysmon
    assert " -ConfigB64 '" in sysmon


def test_run_elevated_fallback_reports_declined_prompt_without_writing_files(tmp_path):
    completed = type("R", (), {"returncode": 1223, "stderr": "", "stdout": ""})()
    with (
        patch("tp_agent.platform.system", return_value="Windows"),
        patch("tp_agent.ELEVATED_RESULTS_DIR", tmp_path),
        patch("tp_agent.subprocess.run", return_value=completed) as mock_run,
    ):
        ok, message = tp_agent._run_elevated_fallback("grant_log_access")
    assert not ok
    assert "declined" in message
    argv = mock_run.call_args.args[0]
    assert "-File" not in argv and "-EncodedCommand" in argv[-1]
    assert list(tmp_path.iterdir()) == []


def test_elevated_fallback_command_line_fits_windows_limit():
    # CreateProcess rejects command lines over 32,767 characters; the Sysmon
    # action (script + base64 config) is the largest.
    completed = type("R", (), {"returncode": 0, "stderr": "", "stdout": ""})()
    with (
        patch("tp_agent.platform.system", return_value="Windows"),
        patch("tp_agent.subprocess.run", return_value=completed) as mock_run,
    ):
        tp_agent._run_elevated_fallback("install_sysmon")
    assert len(subprocess.list2cmdline(mock_run.call_args.args[0])) < 32_000
