#!/usr/bin/env bash
set -euo pipefail
H=$(dirname "$(realpath "$0")"); ROOT=$(realpath "$H/../../..")
export PATH=/nix/store/z2f083ivabcgibvnmlva7da7dgn5q619-postgresql-17.11/bin:$PATH
D=$(mktemp -d /tmp/pg-service-bridge-XXXXXX); chown lovable "$D"
RUN=(setpriv --reuid="$(id -u lovable)" --regid="$(id -g lovable)" --init-groups --)
"${RUN[@]}" initdb -D "$D/data" -U postgres -A trust >/dev/null
"${RUN[@]}" pg_ctl -D "$D/data" -o "-k $D -c listen_addresses=''" -l "$D/log" start >/dev/null
trap '"${RUN[@]}" pg_ctl -D "$D/data" stop -m fast >/dev/null; rm -rf "$D"' EXIT
P=(psql -h "$D" -U postgres -d postgres -v ON_ERROR_STOP=1)
"${P[@]}" -f "$H/service-bridge-acl-tests.sql"
"${P[@]}" -f "$ROOT/supabase/migrations/20261114024720_4946b45d-4c5f-4f1d-9fa7-79ab75270eb0.sql"
"${P[@]}" -f "$H/service-bridge-assertions.sql"