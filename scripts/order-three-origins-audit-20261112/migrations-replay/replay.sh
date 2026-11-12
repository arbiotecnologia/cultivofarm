#!/bin/sh
# Reexecuta as migrações versionadas num PostgreSQL local descartável (socket /tmp/iso, porta 55432). Nunca aponta para host remoto.
set -u; P="psql -h /tmp/iso -p 55432 -U postgres -d mirror -q -v ON_ERROR_STOP=1 --single-transaction"
$P -f "$(dirname "$0")/auth_storage_stub.sql"; : > fails.txt
for f in supabase/migrations/*.sql; do $P -f "$f" >/tmp/iso/last.out 2>&1 || echo "$f :: $(grep -m1 ERROR /tmp/iso/last.out)" >> fails.txt; done
