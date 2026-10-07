import logging
import smtplib
from email.message import EmailMessage
from typing import TYPE_CHECKING

from app.config import settings

if TYPE_CHECKING:
    from app.models.report import Report

logger = logging.getLogger(__name__)


def send_email(
    to_email: str,
    subject: str,
    body: str,
    *,
    attachment: bytes | None = None,
    attachment_filename: str | None = None,
) -> bool:
    """Send one email over SMTP using whatever generic provider is
    configured via SMTP_* env vars. Returns False (never raises) if SMTP
    isn't configured or the send fails -- report generation is the primary
    operation at every call site and must never break because a delivery
    email couldn't go out.
    """
    if not settings.smtp_configured or not settings.smtp_host or not settings.smtp_from_email:
        logger.info("[EMAIL] SMTP not configured — skipping send to %s: %s", to_email, subject)
        return False

    try:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.smtp_from_email
        message["To"] = to_email
        message.set_content(body)
        if attachment is not None and attachment_filename is not None:
            message.add_attachment(attachment, maintype="application", subtype="pdf", filename=attachment_filename)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username and settings.smtp_password:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
        return True
    except (smtplib.SMTPException, OSError, ValueError):
        logger.exception("[EMAIL] Failed to send to %s: %s", to_email, subject)
        return False


def send_report_email(to_email: str, report: "Report", pdf_bytes: bytes) -> bool:
    subject = f"{report.type.value.capitalize()} report — {report.period_start} to {report.period_end}"
    body = (
        f"Your scheduled {report.type.value} report for {report.period_start} to {report.period_end} "
        f"is attached as a PDF.\n\nGenerated {report.generated_at:%Y-%m-%d %H:%M} UTC by TruePositive."
    )
    filename = f"{report.type.value}_report_{report.id}.pdf"
    return send_email(to_email, subject, body, attachment=pdf_bytes, attachment_filename=filename)
