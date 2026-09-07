# ADR-017 - Installation SMTP for email confirmation and login

Status: Accepted
Accepted: 2026-09-05
Updated: 2026-09-05 (TZ 2.40: password reset + queue notify channels)
Refines: ADR-002 (password authentication remains; email is an additional
login identifier and mail path, not a replacement IdP)

## Context

PRODUCT_SPEC §6.1.2 required registration confirmation and login by email
using the installation's own mail server, not Google / GitHub / Telegram
OAuth. The owner authorized shipping that leftover. Vsepsy identity
(§6.1.3, same password as vsepsy.ru) is a different boundary and stays a
separate ADR.

## Decision

GraphNotes sends mail only when `GRAPHNOTES_SMTP_HOST` and
`GRAPHNOTES_SMTP_FROM` are set. Mail uses the installation SMTP (STARTTLS
by default). Secrets stay in host `.env` and are never returned by the API
or written to `audit_events`.

When SMTP is configured:

- public registration does not open a session until the address is confirmed
  with a one-time code or link;
- password login accepts username **or** email and requires a confirmed
  address;
- a confirmed user may request a login code/link;
- a forgotten password is reset by the same one-time code/link
  (`POST /auth/password/reset`); admin set-password remains.

Outbound mail uses the installation SMTP. The operator canon for send is
port **587 with STARTTLS** (`GRAPHNOTES_SMTP_USE_TLS=true`). Port 993 is
IMAP (incoming) and is not used for send. Port 465 SMTPS is a fallback
implementation path only if 587 cannot be used.

When SMTP is not configured, the existing username/password session on
register remains. Email login by password still works as an identifier.
Code/link and password-reset endpoints return 503.

A new proposal in the editor queue may notify opted-in editors/admins
(email if SMTP is on; Telegram if `GRAPHNOTES_TELEGRAM_BOT_TOKEN` is set).
Telegram here is an outbound notify channel, not login/IdP. Preferences
default off.

Telegram login, third-party OAuth, shared `.vsepsy.ru` cookies, and copying
vsepsy `/ops` are out of this decision.

## Consequences

- Alembic `0012_smtp_admin` adds `email_verified_at`, `last_login_at`, and
  `email_tokens` (hashes only). `0013_notify_prefs` adds
  `notify_queue_email` and `notify_queue_telegram` (default false).
- Admin can send a test message (`POST /admin/mail/test`) and see SMTP
  status without credentials (`GET /admin/operator`, `GET /auth/mail-status`).
- Existing accounts are backfilled as verified so enabling SMTP later does
  not lock them out.
