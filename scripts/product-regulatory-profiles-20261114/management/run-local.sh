#!/usr/bin/env bash
set -euo pipefail
H=$(dirname "$(realpath "$0")"); D=$(mktemp -d /tmp/pg-regulatory-management-XXXXXX)
PG=$(printf '%s\n' /nix/store/*-postgresql-17.11/bin | head -1); export PATH="$PG:$PATH"
chown lovable "$D"; RUN=(setpriv --reuid="$(id -u lovable)" --regid="$(id -g lovable)" --init-groups --)
"${RUN[@]}" initdb -D "$D/data" -U postgres -A trust >/dev/null
"${RUN[@]}" pg_ctl -D "$D/data" -o "-k $D -p 55441 -c listen_addresses=''" -l "$D/log" start >/dev/null
trap '"${RUN[@]}" pg_ctl -D "$D/data" stop -m fast >/dev/null; rm -rf "$D"' EXIT
psql -h "$D" -p 55441 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$H/fixture.sql" >/tmp/regulatory-management-pg.log
psql -h "$D" -p 55441 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$H/install.sql" >>/tmp/regulatory-management-pg.log
psql -h "$D" -p 55441 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$H/tests.sql" >>/tmp/regulatory-management-pg.log
cat /tmp/regulatory-management-pg.log | tail -25
