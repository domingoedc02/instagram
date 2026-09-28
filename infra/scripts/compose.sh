#!/bin/sh
# docker compose for the local stack, reading the root .env (if any) for INS_*_PORT overrides.
set -eu
root="$(cd "$(dirname "$0")/../.." && pwd)"
if [ -f "$root/.env" ]; then
  exec docker compose --env-file "$root/.env" -f "$root/infra/docker-compose.dev.yml" "$@"
fi
exec docker compose -f "$root/infra/docker-compose.dev.yml" "$@"
