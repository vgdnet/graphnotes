# Stage 1 deployment

Git is the canonical delivery mechanism from `nord` through `rhizome-test` to
`rhizome`. SSH/rsync is fallback/bootstrap only.

## Runtime contract

- Compose reads secrets from an untracked `.env` file.
- PostgreSQL is reachable only on the internal Compose network.
- Backend binds to `127.0.0.1:8000` on the host.
- Frontend binds to `127.0.0.1:8080` on the host.
- PostgreSQL publishes no host port.
- The production-safe `compose.yaml` keeps these bindings unchanged.
- Existing host Nginx should proxy its chosen public route to
  `http://127.0.0.1:8080` after its current configuration is inspected.

## Rhizome-test integration deployment

`nord` (`172.16.13.205/24`) and `rhizome-test` (`172.16.13.14/24`) are currently
reachable on the same `172.16.13.0/24` network. The canonical integration
overlay adds a frontend-only LAN binding while retaining the base loopback
binding:

```text
127.0.0.1:8080       -> frontend:80
172.16.13.14:8080    -> frontend:80
127.0.0.1:8000       -> backend:8000
no host port         -> PostgreSQL
```

Deploy the integration stack with:

```bash
docker compose \
  -f compose.yaml \
  -f deploy/compose.rhizome-test.yaml \
  up -d --build
```

The overlay uses `${GRAPHNOTES_TEST_BIND_IP:-172.16.13.14}`. Set
`GRAPHNOTES_TEST_BIND_IP` in the untracked `.env` only when the test VM address
changes.

Local `compose.override.yaml` files are not part of the canonical deployment,
must not be required, and must not replace the committed integration overlay.

### Boot-safe startup on rhizome-test

Docker can restore an existing container before Debian has assigned the
configured LAN address. If that happens, Docker cannot create the frontend's
`GRAPHNOTES_TEST_BIND_IP:8080` binding and does not retry it after the address
appears. The committed `graphnotes-rhizome-test.service` handles this boot race:
it waits for the exact configured address and then force-recreates only the
frontend container from the already-built image.

After the first successful build, install and enable the unit:

```bash
install -o root -g root -m 0644 \
  deploy/graphnotes-rhizome-test.service \
  /etc/systemd/system/graphnotes-rhizome-test.service
chmod 0755 deploy/start-rhizome-test.sh
systemctl daemon-reload
systemctl enable --now graphnotes-rhizome-test.service
```

The unit reads `GRAPHNOTES_TEST_BIND_IP` from `/opt/graphnotes/.env`, waits up to
180 seconds by default, and deliberately uses `--no-build` during boot. Build
images as part of deployment, not during host startup. Reinstall the unit and
run `systemctl daemon-reload` when its committed definition changes.

Verify the installed mechanism before rebooting:

```bash
systemctl status graphnotes-rhizome-test.service
systemctl is-enabled graphnotes-rhizome-test.service
journalctl -u graphnotes-rhizome-test.service -b --no-pager
```

Validate the merged configuration before startup:

```bash
docker compose \
  -f compose.yaml \
  -f deploy/compose.rhizome-test.yaml \
  config
```

From `nord`, verify frontend and proxy reachability with:

```bash
curl --fail http://172.16.13.14:8080/
curl --fail http://172.16.13.14:8080/api/health
```

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
rebuild the stack and reinstall the committed systemd unit if it changed.

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

## Stable target verification

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
