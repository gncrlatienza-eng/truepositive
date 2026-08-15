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
