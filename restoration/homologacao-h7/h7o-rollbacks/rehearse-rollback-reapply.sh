#!/usr/bin/env bash
# H7O — Ensaio rollback→reapply em TRANSAÇÃO DESCARTÁVEL (termina sempre em ROLLBACK).
# Executa, no staging ikaauvsflpmamgxmkhoq: rollbacks P4..P1, checa estado pré-H7O (== pós-H7N),
# forwards P1..P4 (arquivos versionados em supabase/migrations), checa estado pós-H7O e descarta tudo.
# Compara fingerprint de catálogo (funções/ACL/config/corpo + views/reloptions/ACL/def + tabelas private)
# antes e depois: deve ser idêntico. Nada é persistido. Nunca imprime o DSN.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
MIG="$ROOT/supabase/migrations"
RUN="$ROOT/restoration/os-e2e/staging-psql.sh"

"$ROOT/restoration/homologacao-h7/guard-staging.sh"

VERSIONS=(20260930000000 20260930010000 20260930020000 20260930030000)
TMP="$(mktemp /tmp/h7o-rehearsal.XXXXXX.sql)"
trap 'rm -f "$TMP"' EXIT

strip_tx() { sed -E '/^[[:space:]]*(begin|commit)[[:space:]]*;[[:space:]]*$/Id' "$1"; }

SNAPSHOT=$(cat <<'SQL'
md5(string_agg(x, E'\n' order by x)) from (
  select p.oid::regprocedure::text||'|'||coalesce(p.proacl::text,'')||'|'||coalesce(p.proconfig::text,'')||'|'||p.prolang::text||'|'||md5(p.prosrc) as x
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
  union all
  select 'view:'||c.relname||'|'||coalesce(c.reloptions::text,'')||'|'||coalesce(c.relacl::text,'')||'|'||md5(pg_get_viewdef(c.oid))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'
  union all
  select 'rel:'||n.nspname||'.'||c.relname||'|'||c.relrowsecurity::text||'|'||coalesce(c.relacl::text,'')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('private') and c.relkind='r'
  union all
  select 'tbl:'||c.relname||'|'||coalesce(c.relacl::text,'') from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='communication_provider_settings'
) s
SQL
)

CHECKS_PRE=$(cat <<'SQL'
select 'PRE p1_guards_present' as check, count(*)::text as valor, case when count(*)=0 then 'PASS' else 'FAIL' end as r
  from pg_proc p where p.oid in ('public.fn_generate_recurring_title(uuid,date,boolean)'::regprocedure,'public.recalc_partner_risk_score(uuid)'::regprocedure,
    'public.check_cliente_dependencies(uuid)'::regprocedure,'public.check_fazenda_dependencies(uuid)'::regprocedure,'public.check_talhao_dependencies(uuid)'::regprocedure,
    'public.rpc_validar_integridade_esteira(text,uuid)'::regprocedure,'public.rpc_b2b_aging(uuid)'::regprocedure,'public.rpc_b2b_partner_profitability(date,date,uuid)'::regprocedure)
   and p.prosrc like '%H7O%'
union all
select 'PRE b2b_rpcs_language_sql', count(*)::text, case when count(*)=2 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_language l on l.oid=p.prolang
 where p.oid in ('public.rpc_b2b_aging(uuid)'::regprocedure,'public.rpc_b2b_partner_profitability(date,date,uuid)'::regprocedure) and l.lanname='sql'
union all
select 'PRE p2_helpers_auth_exec', count(*)::text, case when count(*)=19 then 'PASS' else 'FAIL' end
  from (values ('public._assert_visita_editavel(uuid)'),('public._comunicacao_require_admin()'),('public._rpc_avancar_esteira_laboratorio_internal(uuid,text,text,uuid)'),
    ('public.can_checkin_technical_visit(uuid,uuid)'),('public.can_user_access_cliente(uuid,uuid)'),('public.can_view_bi_operacional(uuid)'),('public.fn_cockpit_assert_operador()'),
    ('public.fn_entrega_assert_confirmador(text)'),('public.fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)'),('public.fn_estoque_pode_operar(uuid,text)'),
    ('public.generate_production_orders_from_partner(uuid)'),('public.get_b2b_user_role_for_partner(uuid,uuid)'),('public.is_operational_staff(uuid)'),
    ('public.is_valid_b2b_partner_user(uuid,uuid)'),('public.is_visit_org_manager(uuid,uuid)'),('public.log_report_view(text,jsonb)'),('public.rpc_gerar_alertas_operacionais()'),
    ('public.rpc_recalcular_prioridade_alerta(uuid)'),('public.rpc_substituir_etiqueta_produto(uuid,text)')) s(sig)
 where has_function_privilege('authenticated', s.sig, 'EXECUTE')
union all
select 'PRE comm_settings_auth_grant', has_table_privilege('authenticated','public.communication_provider_settings','SELECT')::text, case when has_table_privilege('authenticated','public.communication_provider_settings','SELECT') then 'PASS' else 'FAIL' end
union all
select 'PRE p3_private_tables', count(*)::text, case when count(*)=0 then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'public_validation_rate_%'
union all
select 'PRE p3_rpc_without_rate_limit', count(*)::text, case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p where p.oid='public.rpc_validar_comprovante_entrega(uuid)'::regprocedure and p.prosrc not like '%fn_public_validation_rate_check%'
union all
select 'PRE p4_views_invoker_false (ensaio)', count(*)::text, case when count(*)=5 then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica','vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos')
   and coalesce(array_to_string(c.reloptions,','),'') ilike '%security_invoker=false%';
SQL
)

CHECKS_POST=$(cat <<'SQL'
select 'POST p1_guards_present' as check, count(*)::text as valor, case when count(*)=8 then 'PASS' else 'FAIL' end as r
  from pg_proc p where p.oid in ('public.fn_generate_recurring_title(uuid,date,boolean)'::regprocedure,'public.recalc_partner_risk_score(uuid)'::regprocedure,
    'public.check_cliente_dependencies(uuid)'::regprocedure,'public.check_fazenda_dependencies(uuid)'::regprocedure,'public.check_talhao_dependencies(uuid)'::regprocedure,
    'public.rpc_validar_integridade_esteira(text,uuid)'::regprocedure,'public.rpc_b2b_aging(uuid)'::regprocedure,'public.rpc_b2b_partner_profitability(date,date,uuid)'::regprocedure)
   and p.prosrc like '%42501%' and p.prosecdef and not has_function_privilege('anon', p.oid, 'EXECUTE')
union all
select 'POST b2b_rpcs_language_plpgsql', count(*)::text, case when count(*)=2 then 'PASS' else 'FAIL' end
  from pg_proc p join pg_language l on l.oid=p.prolang
 where p.oid in ('public.rpc_b2b_aging(uuid)'::regprocedure,'public.rpc_b2b_partner_profitability(date,date,uuid)'::regprocedure) and l.lanname='plpgsql'
union all
select 'POST p2_helpers_auth_exec', count(*)::text, case when count(*)=0 then 'PASS' else 'FAIL' end
  from (values ('public._assert_visita_editavel(uuid)'),('public._comunicacao_require_admin()'),('public._rpc_avancar_esteira_laboratorio_internal(uuid,text,text,uuid)'),
    ('public.can_checkin_technical_visit(uuid,uuid)'),('public.can_user_access_cliente(uuid,uuid)'),('public.can_view_bi_operacional(uuid)'),('public.fn_cockpit_assert_operador()'),
    ('public.fn_entrega_assert_confirmador(text)'),('public.fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)'),('public.fn_estoque_pode_operar(uuid,text)'),
    ('public.generate_production_orders_from_partner(uuid)'),('public.get_b2b_user_role_for_partner(uuid,uuid)'),('public.is_operational_staff(uuid)'),
    ('public.is_valid_b2b_partner_user(uuid,uuid)'),('public.is_visit_org_manager(uuid,uuid)'),('public.log_report_view(text,jsonb)'),('public.rpc_gerar_alertas_operacionais()'),
    ('public.rpc_recalcular_prioridade_alerta(uuid)'),('public.rpc_substituir_etiqueta_produto(uuid,text)')) s(sig)
 where has_function_privilege('authenticated', s.sig, 'EXECUTE') or has_function_privilege('anon', s.sig, 'EXECUTE')
union all
select 'POST comm_settings_auth_grant', has_table_privilege('authenticated','public.communication_provider_settings','SELECT')::text, case when has_table_privilege('authenticated','public.communication_provider_settings','SELECT') then 'FAIL' else 'PASS' end
union all
select 'POST p3_private_tables_rls_nogrant', count(*)::text, case when count(*)=3 then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'public_validation_rate_%'
   and c.relrowsecurity and not has_table_privilege('anon', c.oid, 'SELECT') and not has_table_privilege('authenticated', c.oid, 'SELECT')
union all
select 'POST p3_rpc_with_rate_limit', count(*)::text, case when count(*)=1 then 'PASS' else 'FAIL' end
  from pg_proc p where p.oid='public.rpc_validar_comprovante_entrega(uuid)'::regprocedure and p.prosrc like '%fn_public_validation_rate_check%'
   and has_function_privilege('anon', p.oid, 'EXECUTE')
union all
select 'POST p4_views_invoker_true', count(*)::text, case when count(*)=5 then 'PASS' else 'FAIL' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica','vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos')
   and coalesce(array_to_string(c.reloptions,','),'') ilike '%security_invoker=true%';
SQL
)

{
  echo "\\set ON_ERROR_STOP on"
  echo "begin;"
  echo "select 'H7O REHEARSAL START', now();"
  echo "select 'SNAPSHOT_BEFORE' as k, $SNAPSHOT;"
  echo "\\echo == ROLLBACK P4..P1"
  for ((i=${#VERSIONS[@]}-1; i>=0; i--)); do
    f="$HERE/rollback-${VERSIONS[$i]}.sql"
    echo "\\echo -- rollback $(basename "$f")"
    strip_tx "$f"
  done
  echo "\\echo == CHECKS PRE-H7O (após rollback)"
  echo "$CHECKS_PRE"
  echo "\\echo == REAPPLY P1..P4"
  for v in "${VERSIONS[@]}"; do
    f=$(ls "$MIG/${v}"_*.sql)
    echo "\\echo -- forward $(basename "$f")"
    cat "$f"; echo
  done
  echo "\\echo == CHECKS POS-H7O (após reapply)"
  echo "$CHECKS_POST"
  echo "select 'SNAPSHOT_AFTER' as k, $SNAPSHOT;"
  echo "\\echo == DESCARTANDO TRANSAÇÃO (ROLLBACK)"
  echo "rollback;"
  echo "select 'H7O REHEARSAL END (nothing persisted)', now();"
} > "$TMP"

"$RUN" -f "$TMP"
