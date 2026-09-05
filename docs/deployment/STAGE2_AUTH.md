# Stage 2 authentication operations

Stage 2 uses opaque PostgreSQL-backed sessions and global hierarchical roles:
`user < editor < admin`.

## Initial administrator bootstrap

Public registration always creates a `user`. To establish the first admin:

1. Register the intended account through the normal GraphNotes UI.
2. On the deployment host, run the versioned command inside the backend
   container:

   ```bash
   docker compose \
     -f compose.yaml \
     -f deploy/compose.rhizome-test.yaml \
     exec backend python -m app.cli.bootstrap_admin <username>
   ```

The command promotes only an existing active account, records an audit event,
and refuses escalation when any active admin already exists. It does not accept
or expose a password or session token.

After bootstrap, role and active-state changes are performed through the
protected admin interface. The backend prevents demotion or blocking of the
last active admin. An admin may set a new password for any account
(`POST /api/admin/users/{id}/password`); that account's sessions end.
The Administration tab has three screens: users (search, create, role,
block, set password, revoke sessions), a filterable journal
(`GET /api/admin/audit`), and operator health / SMTP status
(`GET /api/admin/operator`). Passwords, mail codes and tokens are never
written into audit details or JSON responses.

## SMTP (optional)

Mail is sent only when both `GRAPHNOTES_SMTP_HOST` and
`GRAPHNOTES_SMTP_FROM` are set in the host `.env`. Do not commit the
password. Compose passes these through to the backend:

```text
GRAPHNOTES_SMTP_HOST
GRAPHNOTES_SMTP_PORT=587
GRAPHNOTES_SMTP_USERNAME
GRAPHNOTES_SMTP_PASSWORD
GRAPHNOTES_SMTP_FROM
GRAPHNOTES_SMTP_USE_TLS=true
GRAPHNOTES_PUBLIC_BASE_URL
```

`GRAPHNOTES_PUBLIC_BASE_URL` is the public origin used in confirmation,
login and password-reset links (for example `http://172.16.13.14:8080` on
rhizome-test). The confirmation letter always includes
`#/auth/confirm?token=` (absolute when this origin is set) plus the
one-time 6-digit code.

The working send path is **SMTP port 587 with STARTTLS**
(`GRAPHNOTES_SMTP_USE_TLS=true`). Do not set 993 (IMAP). Do not write the
mailbox password into git, docs, or `compose.yaml`.

Optional queue Telegram (notify channel, not login):

```text
GRAPHNOTES_TELEGRAM_BOT_TOKEN
```

Leave empty when there is no bot. Preferences still persist.

When SMTP is configured, registration does not open a session. The
letter must contain `#/auth/confirm?token=` (and still the 6-digit code).
Password login then accepts username or email after the address is
confirmed. A user may reset a forgotten password with the same code/link
(`POST /api/auth/password/reset`). An admin may send a test message with
`POST /api/admin/mail/test`. When SMTP is not configured, those mail
endpoints return 503 and the existing password session-on-register path
remains.

## Recovery

The same command is the recovery path if no active admin remains because of an
out-of-band database restore or operator action. Register or choose an active
recovery account and run the command above. If an active admin still exists,
the command refuses the request and the protected interface must be used.

Production bootstrap is deferred until production deployment is separately
approved. Do not run the integration command against `rhizome` as part of
Stage 2 testing.
