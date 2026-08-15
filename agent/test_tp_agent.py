from unittest.mock import patch

import tp_agent


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


def test_run_silent_gives_up_cleanly_after_retries_exhausted():
    # A fresh-login network race (Wi-Fi not up yet) shouldn't hang or crash
    # the silent auto-start relaunch — it should retry a few times, then
    # just return so the process exits quietly and the next login tries
    # again, rather than raising or looping forever.
    calls = []

    def fake_post(_url, _key, _body):
        calls.append(1)
        raise tp_agent.AgentRequestError("connection refused")

    with (
        patch("tp_agent._post", side_effect=fake_post),
        patch("tp_agent._write_status"),
        patch("tp_agent.time.sleep") as mock_sleep,
    ):
        tp_agent.run_silent("http://x", "agent-1", "key-1")

    assert len(calls) == tp_agent.REGISTER_RETRY_ATTEMPTS
    assert mock_sleep.call_count == tp_agent.REGISTER_RETRY_ATTEMPTS - 1


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
