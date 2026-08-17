#!/bin/sh

set -eu

bind_ip=${GRAPHNOTES_TEST_BIND_IP:-172.16.13.14}
wait_seconds=${GRAPHNOTES_TEST_BIND_WAIT_SECONDS:-180}

case "$wait_seconds" in
  ''|*[!0-9]*)
    echo "GRAPHNOTES_TEST_BIND_WAIT_SECONDS must be a non-negative integer" >&2
    exit 2
    ;;
esac

has_bind_ip() {
  ip -4 -o address show scope global | awk -v expected="$bind_ip" '
    {
      split($4, address, "/")
      if (address[1] == expected) {
        found = 1
      }
    }
    END { exit(found ? 0 : 1) }
  '
}

elapsed=0
until has_bind_ip; do
  if [ "$elapsed" -ge "$wait_seconds" ]; then
    echo "Timed out waiting for test bind IP $bind_ip after ${wait_seconds}s" >&2
    exit 1
  fi

  sleep 1
  elapsed=$((elapsed + 1))
done

echo "Test bind IP $bind_ip is present; recreating the frontend container"

exec docker compose \
  -f compose.yaml \
  -f deploy/compose.rhizome-test.yaml \
  up -d --no-build --force-recreate frontend
