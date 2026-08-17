# Stage 1 deployment

The same working tree can be delivered to `rhizome` by Git or by copying it over
SSH. Neither method changes the runtime layout.

## Runtime contract

- Compose reads secrets from an untracked `.env` file.
- PostgreSQL is reachable only on the internal Compose network.
- Backend binds to `127.0.0.1:8000` on the host.
- Frontend binds to `127.0.0.1:8080` on the host.
- Existing host Nginx should proxy its chosen public route to
  `http://127.0.0.1:8080` after its current configuration is inspected.

## Git delivery

On the target, clone the approved repository into a reviewed empty directory or
pull an existing checkout. Do not overwrite `/opt/graphnotes` until its current
contents and Git state have been inventoried.

```bash
git clone <repository-url> /opt/graphnotes
cd /opt/graphnotes
cp .env.example .env
# replace every placeholder in .env
docker compose up -d --build
```

For later updates, review the incoming changes before running `git pull`, then
rebuild the stack.

## SSH copy delivery

Prefer `rsync` so ignored development artifacts and secrets are excluded:

```bash
rsync -av --dry-run \
  --exclude .git \
  --exclude .env \
  --exclude .venv \
  --exclude node_modules \
  ./ rhizome:/opt/graphnotes/
```

Review the dry-run output, then repeat without `--dry-run`. Do not add `--delete`
until `/opt/graphnotes` has been inventoried and every unmanaged Stage 0 file has
an explicit home outside the deployment tree.

Create `.env` directly on `rhizome`; never copy a developer secret file into Git.

## First target verification

Run these only after inspecting the target:

```bash
docker compose config
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:8000/health/db
curl --fail http://127.0.0.1:8080/api/health
nginx -t
```

Reload Nginx only after `nginx -t` succeeds. The example in
`deploy/nginx-location.example.conf` is a fragment, not a replacement for the
existing Stage 0 configuration.
