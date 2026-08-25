"""Tests for report_service._deliver_to_matching_schedules -- the real SMTP
delivery path wired up behind ReportSchedule rows. Follows test_reports.py's
pattern (HTTP client + auth_headers), with email_service.send_report_email
mocked out so no real network call happens.
"""

from unittest.mock import MagicMock

from app.config import settings
from app.services import email_service


def _create_schedule(client, auth_headers, report_type="daily"):
    r = client.post(
        "/reports/schedules",
        json={"report_type": report_type, "frequency": report_type, "email": "soc@example.com"},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_delivery_calls_email_service_when_smtp_configured(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from_email", "reports@example.com")
    mock_send = MagicMock(return_value=True)
    monkeypatch.setattr(email_service, "send_report_email", mock_send)

    _create_schedule(client, auth_headers, "daily")
    r = client.get("/reports/generate", params={"type": "daily"}, headers=auth_headers)

    assert r.status_code == 200, r.text
    mock_send.assert_called_once()
    assert mock_send.call_args[0][0] == "soc@example.com"


def test_delivery_stays_log_only_when_smtp_not_configured(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", None)
    monkeypatch.setattr(settings, "smtp_from_email", None)
    mock_send = MagicMock(return_value=True)
    monkeypatch.setattr(email_service, "send_report_email", mock_send)

    _create_schedule(client, auth_headers, "weekly")
    r = client.get("/reports/generate", params={"type": "weekly"}, headers=auth_headers)

    assert r.status_code == 200, r.text
    mock_send.assert_not_called()


def test_generate_report_survives_email_send_failure(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from_email", "reports@example.com")
    monkeypatch.setattr(email_service, "send_report_email", MagicMock(return_value=False))

    _create_schedule(client, auth_headers, "monthly")
    r = client.get("/reports/generate", params={"type": "monthly"}, headers=auth_headers)

    assert r.status_code == 200, r.text
    assert r.json()["type"] == "monthly"


def test_delivery_skipped_when_no_matching_schedule(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_from_email", "reports@example.com")
    mock_send = MagicMock(return_value=True)
    monkeypatch.setattr(email_service, "send_report_email", mock_send)

    r = client.get("/reports/generate", params={"type": "compliance"}, headers=auth_headers)

    assert r.status_code == 200, r.text
    mock_send.assert_not_called()
