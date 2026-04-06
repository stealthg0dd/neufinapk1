"""
services/email_service.py — Transactional email via Resend
===========================================================
Sends confirmation emails to leads and other transactional messages.

Resend: resend.com — free tier: 100 emails/day, 3,000/month.
Docs:   https://resend.com/docs/send-with-python
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger("neufin.email")


def _get_resend_client():
    """Lazily import and configure resend. Returns None if not configured."""
    try:
        import resend

        from core.config import settings

        if not settings.RESEND_API_KEY:
            return None
        resend.api_key = settings.RESEND_API_KEY
        return resend
    except ImportError:
        logger.warning("email_service.resend_not_installed")
        return None


_NEUFIN_FROM = "NeuFin <hello@neufin.io>"


async def send_lead_confirmation(email: str, name: str) -> bool:
    """
    Send a transactional confirmation email to a new lead.
    Returns True on success, False on failure (never raises).
    """
    client = _get_resend_client()
    if client is None:
        logger.info("email_service.skipped_no_key", email=email)
        return False

    subject = "Thanks for your interest in NeuFin 👋"
    html_body = f"""
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 24px;">
  <div style="margin-bottom: 24px;">
    <img src="https://neufin.io/logo.png" alt="NeuFin" height="32"
         onerror="this.style.display='none'" />
  </div>

  <h2 style="font-size: 22px; margin-bottom: 8px;">Hi {name},</h2>

  <p style="line-height: 1.6;">
    Thanks for reaching out to NeuFin. We've received your enquiry and
    a member of our team will be in touch within <strong>24 hours</strong>.
  </p>

  <p style="line-height: 1.6;">
    In the meantime, you can explore our platform at
    <a href="https://app.neufin.io" style="color: #6c63ff;">app.neufin.io</a>
    — the first 3 DNA analyses are completely free, no credit card required.
  </p>

  <div style="background: #f4f4ff; border-radius: 8px; padding: 16px; margin: 24px 0;">
    <strong>What to expect:</strong>
    <ul style="margin: 8px 0; padding-left: 20px; line-height: 1.8;">
      <li>A personalised demo of NeuFin's advisor dashboard</li>
      <li>A walkthrough of white-label PDF reports</li>
      <li>Answers to your MAS compliance questions</li>
    </ul>
  </div>

  <p style="line-height: 1.6;">
    If you have urgent questions, reply to this email directly.
  </p>

  <p style="margin-top: 32px; color: #666; font-size: 13px;">
    — The NeuFin Team<br/>
    <a href="https://neufin.io" style="color: #6c63ff;">neufin.io</a>
  </p>
</body>
</html>
"""

    try:
        client.Emails.send(
            {
                "from": _NEUFIN_FROM,
                "to": [email],
                "subject": subject,
                "html": html_body,
            }
        )
        logger.info("email_service.sent", email=email, subject=subject)
        return True
    except Exception as exc:
        logger.warning("email_service.send_failed", email=email, error=str(exc))
        return False


async def send_demo_confirmation(email: str, name: str) -> bool:
    """Send a 'demo booked' confirmation email."""
    client = _get_resend_client()
    if client is None:
        return False

    subject = "Your NeuFin demo is confirmed ✅"
    html_body = f"""
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             color: #1a1a2e; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="font-size: 22px; margin-bottom: 8px;">Hi {name},</h2>

  <p style="line-height: 1.6;">
    Your demo request has been received! Our team will reach out shortly
    to confirm a time that works for you.
  </p>

  <p style="line-height: 1.6;">
    We'll show you:
  </p>
  <ul style="line-height: 1.8; padding-left: 20px;">
    <li>60-second portfolio DNA analysis</li>
    <li>Multi-client advisor dashboard</li>
    <li>White-label PDF report generation</li>
    <li>MAS-compliant audit trail</li>
  </ul>

  <p style="margin-top: 32px; color: #666; font-size: 13px;">
    — The NeuFin Team<br/>
    <a href="https://neufin.io" style="color: #6c63ff;">neufin.io</a>
  </p>
</body>
</html>
"""

    try:
        client.Emails.send(
            {
                "from": _NEUFIN_FROM,
                "to": [email],
                "subject": subject,
                "html": html_body,
            }
        )
        logger.info("email_service.demo_sent", email=email)
        return True
    except Exception as exc:
        logger.warning("email_service.demo_send_failed", email=email, error=str(exc))
        return False
