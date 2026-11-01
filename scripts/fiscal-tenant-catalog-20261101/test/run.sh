#!/usr/bin/env bash
# PostgreSQL descartável local. Remove todas as variáveis PG* para nunca tocar banco hosted.
set -u
for v in $(compgen -e | grep '^PG'); do unset "$v"; done
cd "$(dirname "$0")/.."
D=$(mktemp -d /tmp/pgfiscal.XXXX); PORT=55437
AS=""; if [ "$(id -u)" = 0 ]; then chown nobody "$D"; AS="runuser -u nobody --"; fi
$AS initdb -D "$D/data" -U postgres -A trust >/dev/null
$AS pg_ctl -D "$D/data" -o "-p $PORT -k $D -c listen_addresses=''" -l "$D/log" -w start >/dev/null
P="psql -X -h $D -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1"
echo "== PRE sem fundação de propriedade (deve abortar)"
$P -q -c "CREATE TABLE public.produtos(id uuid);" && $P -f install.sql.review 2>&1 | grep -E "PRE:|ERROR" | head -2
$P -q -c "DROP TABLE public.produtos;"
echo "== stub + install"
$P -q -f test/stub-schema.sql && $P -q -f install.sql.review && echo "install OK"
echo "== reinstalação (deve recusar)"
$P -f install.sql.review 2>&1 | grep -E "PRE:" | head -1
echo "== testes"
$P -v ON_ERROR_STOP=0 -f test/tests.sql
$AS pg_ctl -D "$D/data" -m fast stop >/dev/null; rm -rf "$D"
