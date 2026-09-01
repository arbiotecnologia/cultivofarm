#!/usr/bin/env bash
# =====================================================================
# P0/P1 — INVENTÁRIO SOMENTE-LEITURA DE UM AMBIENTE (staging OU produção)
#
# Nunca executa DDL/DML: a sessão é aberta com default_transaction_read_only=on
# e todas as consultas são de catálogo. Nunca imprime DSN, senhas ou tokens.
#
# Uso:
#   TARGET_DSN='postgresql://...' TARGET_REF=<project_ref> \
#     restoration/promocao-producao/10-inventario-readonly.sh <dir-saida>
#
# Saída: <dir-saida>/{tables,functions,triggers,indexes,enums,buckets,
#                     ledger,counts}.tsv  (mesmo formato de expected/)
# =====================================================================
set -euo pipefail

PROD_REF="navfzbwgwzruipouyfnk"
STG_REF="ikaauvsflpmamgxmkhoq"

: "${TARGET_DSN:?TARGET_DSN obrigatório}"
: "${TARGET_REF:?TARGET_REF obrigatório (navfzbwgwzruipouyfnk ou ikaauvsflpmamgxmkhoq)}"
OUT="${1:?diretório de saída obrigatório}"

case "$TARGET_REF" in
  "$PROD_REF"|"$STG_REF") : ;;
  *) echo "ABORT: TARGET_REF desconhecido." >&2; exit 2;;
esac
[[ "$TARGET_DSN" == *"$TARGET_REF"* ]] || { echo "ABORT: DSN não corresponde ao TARGET_REF." >&2; exit 2; }

mkdir -p "$OUT"
q() { psql "$TARGET_DSN" -X -v ON_ERROR_STOP=1 -tAF'|' \
        -c "SET default_transaction_read_only = on" -c "$1"; }

q "select tablename,
      (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=t.tablename)::int,
      (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=t.tablename)
    from pg_tables t where schemaname='public' order by 1" > "$OUT/tables.tsv"

q "select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', p.prosecdef::int,
      coalesce(array_to_string(p.proconfig,','),'')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' order by 1" > "$OUT/functions.tsv"

q "select c.relname||'.'||t.tgname from pg_trigger t
     join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname='public' order by 1" > "$OUT/triggers.tsv"

q "select tablename||'.'||indexname from pg_indexes where schemaname='public' order by 1" \
  > "$OUT/indexes.tsv"

q "select typname||'='||labels from (
     select t.typname, string_agg(e.enumlabel,',' order by e.enumsortorder) labels
       from pg_type t join pg_enum e on e.enumtypid=t.oid
       join pg_namespace n on n.oid=t.typnamespace
      where n.nspname='public' group by t.typname) x order by 1" > "$OUT/enums.tsv"

q "select id, public::int, coalesce(file_size_limit,0) from storage.buckets order by 1" \
  > "$OUT/buckets.tsv"

q "select version from supabase_migrations.schema_migrations order by 1" > "$OUT/ledger.tsv"

q "select relname||'|'||n_live_tup from pg_stat_user_tables
    where schemaname='public' order by relname" > "$OUT/counts.tsv"

q "select 'extensions='||count(*) from pg_extension
   union all select 'auth_users='||count(*) from auth.users
   union all select 'storage_objects='||count(*) from storage.objects" > "$OUT/resumo.tsv"

echo "INVENTARIO_OK ref=$TARGET_REF dir=$OUT"
wc -l "$OUT"/*.tsv
