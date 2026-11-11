#!/usr/bin/env bash
# Espelho descartável /tmp/felig (porta 55901), banco c2, a partir do dump r12 (/tmp/r12/fullstack.dump + globals.sql).
# Costura declarada S-AUTH: usuários fictícios referenciados por profiles/user_roles inseridos em auth.users ENTRE data e post-data,
# para que as FKs profiles_user_id_fkey/user_roles_user_id_fkey sejam criadas e validadas. Sem rede/hospedado.
set -euo pipefail
PG=$(ls -d /nix/store/*-postgresql-17.11 | head -1)/bin; S="setpriv --reuid=1000 --regid=1000 --clear-groups"
P="$S $PG/psql -X -h /tmp/felig -p 55901 -U postgres -qAt -v ON_ERROR_STOP=1"
R="$S $PG/pg_restore -h /tmp/felig -p 55901 -U postgres -d c2 --no-comments --exit-on-error"
OUT=${1:?evidence dir}
$P -d postgres -c "DROP DATABASE IF EXISTS c2 WITH (FORCE)" -c "CREATE DATABASE c2"
$R --section=pre-data /tmp/r12/fullstack.dump
$R --section=data /tmp/r12/fullstack.dump
$P -d c2 -c "INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) SELECT x,'authenticated','authenticated','fixture-'||x||'@local.invalid',now(),now() FROM (SELECT user_id x FROM public.profiles UNION SELECT user_id FROM public.user_roles) s WHERE x NOT IN (SELECT id FROM auth.users) RETURNING id" > "$OUT/seeded-auth-users.txt"
$R --section=post-data /tmp/r12/fullstack.dump
echo "restore_exit=0 (pre/data/post com --exit-on-error)" > "$OUT/restore.txt"
$P -d c2 -c "SELECT conname||'|'||convalidated FROM pg_constraint WHERE conname IN ('profiles_user_id_fkey','user_roles_user_id_fkey') ORDER BY 1" >> "$OUT/restore.txt"
$P -d c2 -c "SELECT 'felig2arg|'||md5(pg_get_functiondef('public.fn_fiscal_invoice_eligibility(text,uuid)'::regprocedure))" >> "$OUT/restore.txt"
sha256sum /tmp/r12/fullstack.dump >> "$OUT/restore.txt"
