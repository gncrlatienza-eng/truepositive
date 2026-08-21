import io
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
    with patch("tp_agent.shutil.which", return_value="wevtutil.exe"), patch(
        "tp_agent.subprocess.run", return_value=_fake_result(0, stdout="")
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
    with patch("tp_agent.shutil.which", return_value="wevtutil.exe"), patch(
        "tp_agent.subprocess.run", return_value=_fake_result(1, stderr="Access is denied.")
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


def test_validate_connect_fields_rejects_missing_or_blank():
    assert tp_agent._validate_connect_fields("", "agent-1", "key-1") is None
    assert tp_agent._validate_connect_fields("http://localhost:8000", "   ", "key-1") is None
    assert tp_agent._validate_connect_fields("http://localhost:8000", "agent-1", "") is None


def test_validate_connect_fields_trims_and_normalizes():
    result = tp_agent._validate_connect_fields(
        "  http://localhost:8000/  ", "  agent-1  ", "  key-1  "
    )
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
            "http://x",
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
                "http://x", "agent-1", "key-1", "host", on_retry=lambda *a: retries.append(a)
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
        result = tp_agent._register_with_retry("http://x", "agent-1", "key-1", "host")

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
            "http://x", "agent-1", "key-1", "host", stop_event=_ImmediateStop()
        )

    assert result is None


def test_run_silent_gives_up_after_bounded_window():
    # A Docker cold-start after a reboot can take well over a minute --
    # this should retry with backoff for a real window (not a fixed small
    # count), then return so the process exits quietly and the next login
    # tries again, rather than raising or looping forever.
    calls = []

    def fake_post(_url, _key, _body):
        calls.append(1)
        raise tp_agent.AgentRequestError("connection refused")

    with (
        patch("tp_agent._post", side_effect=fake_post),
        patch("tp_agent._write_status"),
        patch("tp_agent.time.sleep"),
        patch("tp_agent.time.monotonic", side_effect=[0, 100, 200, 301]),
    ):
        tp_agent.run_silent("http://x", "agent-1", "key-1")

    assert len(calls) == 3


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
        tp_agent.run_silent("http://x", "agent-1", "key-1")

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
            tp_agent.run_silent("http://x", "agent-1", "key-1")
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
            tp_agent.run_silent("http://x", "agent-1", "key-1")
        except _StopLoop:
            pass

    assert written[0] == ("Connection failed", "connection refused", "agent-1")
    assert written[1][0] == "Connected"
    assert written[1][2] == "agent-1"


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
