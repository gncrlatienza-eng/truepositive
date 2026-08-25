"""Unit tests for email_service -- the SMTP-backed real delivery mechanism
behind scheduled report emails. Every send path is exercised without a real
network call, via a mocked smtplib.SMTP.
"""

import smtplib
from datetime import UTC, date, datetime
from unittest.mock import MagicMock

from app.config import settings
from app.services import email_service


def _configure_smtp(monkeypatch, *, username=None, password=None):
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_from_email", "reports@example.com")
    monkeypatch.setattr(settings, "smtp_use_tls", True)
    monkeypatch.setattr(settings, "smtp_username", username)
    monkeypatch.setattr(settings, "smtp_password", password)


def _mock_smtp(monkeypatch):
    instance = MagicMock()
    instance.__enter__.return_value = instance
    cls = MagicMock(return_value=instance)
    monkeypatch.setattr(email_service.smtplib, "SMTP", cls)
    return cls, instance


def test_send_email_skips_when_smtp_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", None)
    monkeypatch.setattr(settings, "smtp_from_email", None)
    cls, _ = _mock_smtp(monkeypatch)

    result = email_service.send_email("soc@example.com", "Subject", "Body")

    assert result is False
    cls.assert_not_called()


def test_send_email_success(monkeypatch):
    _configure_smtp(monkeypatch, username="user", password="pass")
    cls, instance = _mock_smtp(monkeypatch)

    result = email_service.send_email("soc@example.com", "Subject", "Body")

    assert result is True
    cls.assert_called_once_with("smtp.example.com", 587, timeout=10)
    instance.starttls.assert_called_once()
    instance.login.assert_called_once_with("user", "pass")
    instance.send_message.assert_called_once()
    sent = instance.send_message.call_args[0][0]
    assert sent["To"] == "soc@example.com"
    assert sent["Subject"] == "Subject"
    assert sent["From"] == "reports@example.com"


def test_send_email_no_auth_when_username_unset(monkeypatch):
    _configure_smtp(monkeypatch, username=None, password=None)
    _, instance = _mock_smtp(monkeypatch)

    email_service.send_email("soc@example.com", "Subject", "Body")

    instance.login.assert_not_called()


def test_send_email_returns_false_on_smtp_exception(monkeypatch):
    _configure_smtp(monkeypatch, username="user", password="pass")
    _, instance = _mock_smtp(monkeypatch)
    instance.send_message.side_effect = smtplib.SMTPException("boom")

    result = email_service.send_email("soc@example.com", "Subject", "Body")

    assert result is False


def test_send_email_returns_false_on_connection_error(monkeypatch):
    _configure_smtp(monkeypatch)
    monkeypatch.setattr(email_service.smtplib, "SMTP", MagicMock(side_effect=OSError("connection refused")))

    result = email_service.send_email("soc@example.com", "Subject", "Body")

    assert result is False


def test_send_report_email_builds_pdf_attachment(monkeypatch):
    _configure_smtp(monkeypatch)
    _, instance = _mock_smtp(monkeypatch)

    report = MagicMock()
    report.type.value = "daily"
    report.period_start = date(2026, 8, 1)
    report.period_end = date(2026, 8, 1)
    report.generated_at = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
    report.id = "abc123"

    result = email_service.send_report_email("soc@example.com", report, b"%PDF-fake-bytes")

    assert result is True
    sent = instance.send_message.call_args[0][0]
    attachments = list(sent.iter_attachments())
    assert len(attachments) == 1
    assert attachments[0].get_filename() == "daily_report_abc123.pdf"
    assert attachments[0].get_content_type() == "application/pdf"
