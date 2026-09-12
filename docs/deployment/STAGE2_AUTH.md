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
last active admin.

## Recovery

The same command is the recovery path if no active admin remains because of an
out-of-band database restore or operator action. Register or choose an active
recovery account and run the command above. If an active admin still exists,
the command refuses the request and the protected interface must be used.

Production bootstrap is deferred until production deployment is separately
approved. Do not run the integration command against `rhizome` as part of
Stage 2 testing.
