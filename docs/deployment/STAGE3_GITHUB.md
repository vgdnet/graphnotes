# Stage 3 GitHub App operations

The GitHub App private key never enters git. On `nord` it lives at
`.secrets/github-app.pem` (`chmod 600`).

Compose mounts that file into the backend as
`/run/secrets/github-app.pem`. Copy the same file to
`/opt/graphnotes/.secrets/github-app.pem` on `rhizome-test` before starting
the stack there. Do not scp the key into the public repository.

Required untracked `.env` names, without secret values:

- `GRAPHNOTES_GITHUB_APP_ID`
- `GRAPHNOTES_GITHUB_APP_INSTALLATION_ID`
- `GRAPHNOTES_GITHUB_APP_PRIVATE_KEY_PATH`
- `GRAPHNOTES_GITHUB_APP_PRIVATE_KEY_HOST_PATH`
- `GRAPHNOTES_GITHUB_SHARED_OWNER`
- `GRAPHNOTES_GITHUB_SHARED_NAME`
- `GRAPHNOTES_GITHUB_WEBHOOK_SECRET` (empty until a public HTTPS URL exists)
