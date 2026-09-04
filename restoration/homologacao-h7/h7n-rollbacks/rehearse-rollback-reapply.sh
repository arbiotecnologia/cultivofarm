#!/usr/bin/env bash
# H7N — Ensaio rollback→reapply em TRANSAÇÃO DESCARTÁVEL (termina sempre em ROLLBACK).
# Executa, no staging ikaauvsflpmamgxmkhoq: rollbacks 5..1, checa estado pré-H7N,
# forwards 1..5, checa estado pós-H7N e descarta tudo. Nada é persistido.
# Nunca imprime o DSN. Recusa produção (guard-staging.sh + staging-psql.sh).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
MIG="$ROOT/supabase/migrations"
RUN="$ROOT/restoration/os-e2e/staging-psql.sh"

"$ROOT/restoration/homologacao-h7/guard-staging.sh"

VERSIONS=(20260904130615 20260904130758 20260904130941 20260904131239 20260904131341)
TMP="$(mktemp /tmp/h7n-rehearsal.XXXXXX.sql)"
trap 'rm -f "$TMP"' EXIT

# Remove begin;/commit; próprios dos arquivos de rollback: o ensaio usa UMA transação externa.
strip_tx() { sed -E '/^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$/Id' "$1"; }

CHECKS_PRE=$(cat <<'SQL'
select 'PRE views_invoker_true' as check, count(*)::text as valor, case when count(*)=0 then 'PASS' else 'FAIL' end as r
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica','vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos')
   and coalesce(array_to_string(c.reloptions,','),'') ilike '%security_invoker=true%'
union all
select 'PRE schema_private_exists', count(*)::text, case when count(*)=0 then 'PASS' else 'FAIL' end from pg_namespace where nspname='private'
union all
select 'PRE trigger_fns_auth_exec', count(*)::text, case when count(*)=27 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prorettype='trigger'::regtype and p.prosecdef
   and has_function_privilege('authenticated', p.oid, 'EXECUTE')
   and p.proname in (select unnest(:'trg'::text[]))
union all
select 'PRE trigger_fns_anon_exec', count(*)::text, case when count(*)=4 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prorettype='trigger'::regtype and has_function_privilege('anon', p.oid, 'EXECUTE')
   and p.proname in (select unnest(:'trg'::text[]))
union all
select 'PRE helpers_auth_exec', count(*)::text, case when count(*)=42 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
   and (p.proname, pg_get_function_identity_arguments(p.oid)) in (select unnest(:'hlp_names'::text[]), unnest(:'hlp_args'::text[]))
union all
select 'PRE rpcs_with_guard', count(*)::text, case when count(*)=0 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (select unnest(:'rpc'::text[])) and (p.prosrc like '%permission_denied%' or p.prosrc like '%h7n_guarded%')
union all
select 'PRE p2_search_path_set', count(*)::text, case when count(*)=0 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('fn_h6b_num','fn_gtin_is_valid','fn_regulatory_storage_path_ok','fn_regulatory_storage_dossier_id') and p.proconfig is not null
union all
select 'PRE views_selectable', (select count(*) from (select 1 from public.vw_esteira_laboratorio limit 1) a)::text
     || '/' || (select count(*) from (select 1 from public.vw_fluxo_visita_tecnica limit 1) a)::text
     || '/' || (select count(*) from (select 1 from public.vw_catalogo_ficha_produtos limit 1) a)::text
     || '/' || (select count(*) from (select 1 from public.vw_catalogo_ficha_microrganismos limit 1) a)::text
     || '/' || (select count(*) from (select 1 from public.vw_os_integridade_esteira limit 1) a)::text, 'INFO';
SQL
)

CHECKS_POST=$(cat <<'SQL'
select 'POST views_invoker_true' as check, count(*)::text as valor, case when count(*)=5 then 'PASS' else 'FAIL' end as r
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica','vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos')
   and coalesce(array_to_string(c.reloptions,','),'') ilike '%security_invoker=true%'
union all
select 'POST private_fns', count(*)::text, case when count(*)=4 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
union all
select 'POST trigger_fns_auth_or_anon_exec', count(*)::text, case when count(*)=0 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (select unnest(:'trg'::text[]))
   and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
union all
select 'POST helpers_auth_exec', count(*)::text, case when count(*)=0 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
   and (p.proname, pg_get_function_identity_arguments(p.oid)) in (select unnest(:'hlp_names'::text[]), unnest(:'hlp_args'::text[]))
union all
select 'POST rpcs_with_guard', count(*)::text, case when count(*)=13 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (select unnest(:'rpc'::text[])) and (p.prosrc like '%permission_denied%' or p.prosrc like '%h7n_guarded%')
union all
select 'POST p2_search_path_pg_catalog', count(*)::text, case when count(*)=4 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('fn_h6b_num','fn_gtin_is_valid','fn_regulatory_storage_path_ok','fn_regulatory_storage_dossier_id') and p.proconfig::text = '{search_path=pg_catalog}'
union all
select 'POST views_selectable', (select count(*) from (select 1 from public.vw_esteira_laboratorio limit 1) a)::text
     || '/' || (select count(*) from (select 1 from public.vw_fluxo_visita_tecnica limit 1) a)::text
     || '/' || (select count(*) from (select 1 from public.vw_catalogo_ficha_produtos limit 1) a)::text
     || '/' || (select count(*) from (select 1 from public.vw_catalogo_ficha_microrganismos limit 1) a)::text
     || '/' || (select count(*) from (select 1 from public.vw_os_integridade_esteira limit 1) a)::text, 'INFO';
SQL
)

{
  echo "\\set ON_ERROR_STOP on"
  echo "begin;"
  echo "select 'H7N REHEARSAL START', now();"
  echo "select 'SNAPSHOT_BEFORE' as k, md5(string_agg(x, E'\\n' order by x)) as fp from ("
  echo "  select p.oid::regprocedure::text||'|'||coalesce(p.proacl::text,'')||'|'||coalesce(p.proconfig::text,'')||'|'||md5(p.prosrc) as x"
  echo "  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')"
  echo "  union all select c.relname||'|'||coalesce(c.reloptions::text,'')||'|'||coalesce(c.relacl::text,'')||'|'||md5(pg_get_viewdef(c.oid)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v') s;"
  echo "\\echo == ROLLBACK 5..1"
  for ((i=${#VERSIONS[@]}-1; i>=0; i--)); do
    f=$(ls "$HERE/${VERSIONS[$i]}"_*_rollback.sql)
    echo "\\echo -- rollback $(basename "$f")"
    strip_tx "$f"
  done
  echo "\\echo == CHECKS PRE-H7N (após rollback)"
  echo "$CHECKS_PRE"
  echo "\\echo == REAPPLY 1..5"
  for v in "${VERSIONS[@]}"; do
    f=$(ls "$MIG/${v}"_*.sql)
    echo "\\echo -- forward $(basename "$f")"
    cat "$f"; echo
  done
  echo "\\echo == CHECKS POS-H7N (após reapply)"
  echo "$CHECKS_POST"
  echo "select 'SNAPSHOT_AFTER' as k, md5(string_agg(x, E'\\n' order by x)) as fp from ("
  echo "  select p.oid::regprocedure::text||'|'||coalesce(p.proacl::text,'')||'|'||coalesce(p.proconfig::text,'')||'|'||md5(p.prosrc) as x"
  echo "  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')"
  echo "  union all select c.relname||'|'||coalesce(c.reloptions::text,'')||'|'||coalesce(c.relacl::text,'')||'|'||md5(pg_get_viewdef(c.oid)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v') s;"
  echo "\\echo == DESCARTANDO TRANSAÇÃO (ROLLBACK)"
  echo "rollback;"
  echo "select 'H7N REHEARSAL END (nothing persisted)', now();"
} > "$TMP"

# Listas para os checks (derivadas dos próprios arquivos forward — fonte única).
TRG=$(sed -nE 's/^revoke execute on function public\.([a-zA-Z0-9_]+)\(\).*/\1/p' "$MIG/20260904130758_h7n_p1_trigger_execute.sql" | paste -sd, - | sed 's/^/{/;s/$/}/')
HLP_NAMES=$(sed -nE 's/^revoke execute on function public\.([a-zA-Z0-9_]+)\(.*/\1/p' "$MIG/20260904131239_h7n_p1_internal_helpers.sql" | paste -sd, - | sed 's/^/{/;s/$/}/')
HLP_ARGS=$(sed -nE 's/^revoke execute on function public\.[a-zA-Z0-9_]+\((.*)\) from public, anon, authenticated;$/"\1"/p' "$MIG/20260904131239_h7n_p1_internal_helpers.sql" | paste -sd, - | sed 's/^/{/;s/$/}/')
RPC=$(sed -nE 's/^CREATE OR REPLACE FUNCTION public\.([a-zA-Z0-9_]+)\(.*/\1/p' "$MIG/20260904130941_h7n_p1_rpc_guards.sql" | paste -sd, - | sed 's/^/{/;s/$/}/')

"$RUN" -v trg="$TRG" -v hlp_names="$HLP_NAMES" -v hlp_args="$HLP_ARGS" -v rpc="$RPC" -f "$TMP"
