#!/usr/bin/env bash
# Cluster PostgreSQL local descartável em /tmp; nunca conecta a produção.
set -euo pipefail
H=$(cd "$(dirname "$0")" && pwd); D=/tmp/pg-rtc-$$; mkdir -p $D; chown lovable $D; RUN="setpriv --reuid=$(id -u lovable) --regid=$(id -g lovable) --init-groups --"
$RUN initdb -D $D/data -U postgres -A trust >/dev/null
$RUN pg_ctl -D $D/data -o "-k $D -p 55437 -c listen_addresses=''" -l $D/log start >/dev/null
trap '$RUN pg_ctl -D $D/data stop -m fast >/dev/null; rm -rf $D' EXIT
psql -h $D -p 55437 -U postgres -d postgres -v ON_ERROR_STOP=1 -f $H/pg_item_resolution.sql 2>&1 | grep -E "PASS|ERROR|FAIL"
