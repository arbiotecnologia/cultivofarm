#!/usr/bin/env bash
# H7O — Postcheck idempotente e SOMENTE LEITURA (staging ikaauvsflpmamgxmkhoq).
#  1) 4 versões H7O no ledger e SQL aplicado == arquivo do repositório (MD5);
#  2) 5 versões H7N preservadas (ledger == repositório), sem reaplicação;
#  3) P1: 8 funções com guarda 42501, 2 RPCs B2B em plpgsql, contratos preservados;
#  4) P2: 19 assinaturas sem EXECUTE para anon/authenticated/PUBLIC; communication_provider_settings sem grants a anon/authenticated;
#  5) P3: 3 tabelas private com RLS e sem grants; 2 funções private sem EXECUTE; pepper/política presentes; job pg_cron; RPC pública com rate-limit;
#  6) P4: 5/5 views security_invoker;
#  7) allowlist H7O = allowlist H7N − exatamente as 19 assinaturas revogadas (drift zero);
#  8) invariantes fiscais (HOMOLOGATION/tpAmb=2/produção off; nenhuma invoice/evento).
# Uso: bash restoration/homologacao-h7/h7o-postcheck.sh
#      H7O_ALLOWLIST_UPDATE=1 bash restoration/homologacao-h7/h7o-postcheck.sh  (regrava h7o-inventario/rpc_allowlist.tsv — revisar no diff)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
RUN="$ROOT/restoration/os-e2e/staging-psql.sh"
MIG="$ROOT/supabase/migrations"
ALLOW_H7N="$HERE/h7n-inventario/rpc_allowlist.tsv"
ALLOW_H7O="$HERE/h7o-inventario/rpc_allowlist.tsv"
"$HERE/guard-staging.sh"

fail=0
ok()  { echo "PASS  $1"; }
bad() { echo "FAIL  $1"; fail=1; }

# 1) ledger x repositório (H7O)
for v in 20260930000000 20260930010000 20260930020000 20260930030000; do
  f=$(ls "$MIG/${v}"_*.sql)
  repo_md5=$(md5sum "$f" | cut -d' ' -f1)
  db_md5=$("$RUN" -tAc "select md5(array_to_string(statements, E'\n')) from supabase_migrations.schema_migrations where version='$v'")
  if [ -z "$db_md5" ]; then bad "ledger: versão H7O $v ausente"; continue; fi
  [ "$repo_md5" = "$db_md5" ] && ok "ledger $v == $(basename "$f") (md5 $repo_md5)" || bad "ledger $v difere de $(basename "$f") (repo=$repo_md5 db=$db_md5)"
done

# 2) H7N preservada
for v in 20260904130615 20260904130758 20260904130941 20260904131239 20260904131341; do
  f=$(ls "$MIG/${v}"_*.sql)
  repo_md5=$(md5sum "$f" | cut -d' ' -f1)
  db_md5=$("$RUN" -tAc "select md5(array_to_string(statements, E'\n')) from supabase_migrations.schema_migrations where version='$v'")
  [ "$repo_md5" = "$db_md5" ] && ok "H7N preservada: $v" || bad "H7N alterada/ausente: $v"
done
n_h7n=$("$RUN" -tAc "select count(*) from supabase_migrations.schema_migrations where version like '20260904130%' or version like '20260904131%'")
[ "$n_h7n" = "5" ] && ok "H7N: exatamente 5 linhas no ledger (sem reaplicação)" || bad "H7N: $n_h7n linhas no ledger"

# 3..6) estado do catálogo
read -r g1 g2 g3 g4 g5 p2 p2b cs_anon cs_auth cs_srv p3t p3f p3pep p3pol p3job p3rpc p3anon p3idx views < <("$RUN" -tAc "
with p1 as (select unnest(array['public.fn_generate_recurring_title(uuid,date,boolean)','public.recalc_partner_risk_score(uuid)','public.check_cliente_dependencies(uuid)',
  'public.check_fazenda_dependencies(uuid)','public.check_talhao_dependencies(uuid)','public.rpc_validar_integridade_esteira(text,uuid)',
  'public.rpc_b2b_aging(uuid)','public.rpc_b2b_partner_profitability(date,date,uuid)'])::regprocedure as oid),
 p2 as (select unnest(array['public._assert_visita_editavel(uuid)','public._comunicacao_require_admin()','public._rpc_avancar_esteira_laboratorio_internal(uuid,text,text,uuid)',
  'public.can_checkin_technical_visit(uuid,uuid)','public.can_user_access_cliente(uuid,uuid)','public.can_view_bi_operacional(uuid)','public.fn_cockpit_assert_operador()',
  'public.fn_entrega_assert_confirmador(text)','public.fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)','public.fn_estoque_pode_operar(uuid,text)',
  'public.generate_production_orders_from_partner(uuid)','public.get_b2b_user_role_for_partner(uuid,uuid)','public.is_operational_staff(uuid)',
  'public.is_valid_b2b_partner_user(uuid,uuid)','public.is_visit_org_manager(uuid,uuid)','public.log_report_view(text,jsonb)','public.rpc_gerar_alertas_operacionais()',
  'public.rpc_recalcular_prioridade_alerta(uuid)','public.rpc_substituir_etiqueta_produto(uuid,text)'])::regprocedure as oid)
select
 (select count(*) from pg_proc p join p1 on p1.oid=p.oid where p.prosrc like '%42501%' and p.prosrc like '%H7O%'),
 (select count(*) from pg_proc p join p1 on p1.oid=p.oid where p.prosecdef),
 (select count(*) from pg_proc p join p1 on p1.oid=p.oid where has_function_privilege('anon',p.oid,'EXECUTE')),
 (select count(*) from pg_proc p join p1 on p1.oid=p.oid where p.proconfig::text like '%search_path=%'),
 (select count(*) from pg_proc p join pg_language l on l.oid=p.prolang where p.oid in ('public.rpc_b2b_aging(uuid)'::regprocedure,'public.rpc_b2b_partner_profitability(date,date,uuid)'::regprocedure) and l.lanname='plpgsql'),
 (select count(*) from p2 where has_function_privilege('anon',p2.oid,'EXECUTE') or has_function_privilege('authenticated',p2.oid,'EXECUTE') or has_function_privilege('public',p2.oid,'EXECUTE')),
 (select count(*) from p2),
 has_table_privilege('anon','public.communication_provider_settings','SELECT')::int,
 has_table_privilege('authenticated','public.communication_provider_settings','SELECT')::int,
 has_table_privilege('service_role','public.communication_provider_settings','SELECT')::int,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r' and c.relname like 'public_validation_rate_%'
    and c.relrowsecurity and not has_table_privilege('anon',c.oid,'SELECT') and not has_table_privilege('authenticated',c.oid,'SELECT') and not has_table_privilege('public',c.oid,'SELECT')),
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('fn_public_validation_rate_check','fn_public_validation_rate_prune')
    and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('public',p.oid,'EXECUTE')),
 (select count(*) from private.public_validation_rate_pepper where length(pepper) >= 32),
 (select count(*) from private.public_validation_rate_policy where scope in ('token','origin','global') and max_hits > 0 and window_seconds > 0),
 (select count(*) from cron.job where jobname='h7o-prune-public-validation-rate-limit' and active),
 (select count(*) from pg_proc p where p.oid='public.rpc_validar_comprovante_entrega(uuid)'::regprocedure and p.prosrc like '%fn_public_validation_rate_check%' and p.prosecdef),
 has_function_privilege('anon','public.rpc_validar_comprovante_entrega(uuid)','EXECUTE')::int,
 (select count(*) from pg_indexes where schemaname='private' and indexname='public_validation_rate_counters_window_idx'),
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica','vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos') and lower(coalesce(c.reloptions::text,'{}'))::text[] && array['security_invoker=1','security_invoker=true','security_invoker=yes','security_invoker=on'])
" | tr '|' ' ')
[ "$g1" = "8" ]  && ok "P1 guardas 42501 (marcador H7O): 8/8" || bad "P1 guardas 42501: $g1/8"
[ "$g2" = "8" ]  && ok "P1 SECURITY DEFINER preservado: 8/8" || bad "P1 SECURITY DEFINER: $g2/8"
[ "$g3" = "0" ]  && ok "P1 nenhuma das 8 executável por anon" || bad "P1 executáveis por anon: $g3"
[ "$g4" = "8" ]  && ok "P1 search_path fixo: 8/8" || bad "P1 search_path fixo: $g4/8"
[ "$g5" = "2" ]  && ok "P1 rpc_b2b_aging/partner_profitability em plpgsql (RAISE 42501): 2/2" || bad "P1 B2B plpgsql: $g5/2"
[ "$p2b" = "19" ] && ok "P2 as 19 assinaturas existem no catálogo" || bad "P2 assinaturas encontradas: $p2b/19"
[ "$p2" = "0" ]  && ok "P2 EXECUTE anon/authenticated/PUBLIC nas 19 assinaturas: 0" || bad "P2 assinaturas ainda expostas: $p2"
[ "$cs_anon$cs_auth$cs_srv" = "001" ] && ok "P2 communication_provider_settings: anon=0 authenticated=0 service_role=1" || bad "P2 communication_provider_settings grants: anon=$cs_anon auth=$cs_auth service_role=$cs_srv"
[ "$p3t" = "3" ]  && ok "P3 tabelas private com RLS e sem grants app: 3/3" || bad "P3 tabelas private: $p3t/3"
[ "$p3f" = "2" ]  && ok "P3 funções private sem EXECUTE app: 2/2" || bad "P3 funções private: $p3f/2"
[ "$p3pep" = "1" ] && ok "P3 pepper HMAC presente (>=32 bytes)" || bad "P3 pepper: $p3pep"
[ "$p3pol" = "3" ] && ok "P3 política token/origin/global: 3/3" || bad "P3 política: $p3pol/3"
[ "$p3job" = "1" ] && ok "P3 job pg_cron de poda ativo" || bad "P3 job pg_cron: $p3job"
[ "$p3rpc" = "1" ] && ok "P3 rpc_validar_comprovante_entrega com rate-limit (SECURITY DEFINER)" || bad "P3 RPC pública sem rate-limit: $p3rpc"
[ "$p3anon" = "1" ] && ok "P3 ACL pública preservada (anon EXECUTE) — contrato ValidarEntrega" || bad "P3 anon perdeu EXECUTE na RPC pública"
[ "$p3idx" = "1" ] && ok "P3 índice de poda presente" || bad "P3 índice de poda ausente"
[ "$views" = "5" ] && ok "P4 views security_invoker: 5/5" || bad "P4 views security_invoker: $views/5"

# 7) allowlist H7O e diff exato contra H7N
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
"$RUN" -tAF $'\t' -c "
select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
       case when p.prosecdef then 'DEFINER' else 'INVOKER' end,
       case when has_function_privilege('anon',p.oid,'EXECUTE') then 'anon' else '-' end,
       case when has_function_privilege('authenticated',p.oid,'EXECUTE') then 'authenticated' else '-' end,
       case when p.prorettype='trigger'::regtype then 'trigger' else p.prokind::text end
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
left join pg_depend d on d.objid=p.oid and d.deptype='e'
where n.nspname='public' and d.objid is null
  and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
order by 1" > "$tmp"
mkdir -p "$(dirname "$ALLOW_H7O")"
if [ "${H7O_ALLOWLIST_UPDATE:-0}" = "1" ] || [ ! -f "$ALLOW_H7O" ]; then
  { echo -e "# H7O allowlist — funções em public executáveis por anon/authenticated (staging) — gerada $(date -u +%Y-%m-%dT%H:%M:%SZ)\n# assinatura\tsecurity\tanon\tauthenticated\ttipo"; cat "$tmp"; } > "$ALLOW_H7O"
  ok "allowlist H7O regravada: $(grep -vc '^#' "$ALLOW_H7O") funções ($ALLOW_H7O)"
else
  if diff -q <(grep -v '^#' "$ALLOW_H7O") "$tmp" >/dev/null; then
    ok "allowlist H7O sem drift: $(grep -vc '^#' "$ALLOW_H7O") funções expostas"
  else
    bad "allowlist H7O com DRIFT ('<' allowlist, '>' banco)"; diff <(grep -v '^#' "$ALLOW_H7O") "$tmp" || true
  fi
fi
# diff H7N → H7O deve ser EXATAMENTE as 19 assinaturas (somente remoções; nenhuma adição).
removed=$(diff <(grep -v '^#' "$ALLOW_H7N" | cut -f1) <(cut -f1 "$tmp") | grep -c '^<' || true)
added=$(diff <(grep -v '^#' "$ALLOW_H7N" | cut -f1) <(cut -f1 "$tmp") | grep -c '^>' || true)
expected_removed='_assert_visita_editavel(uuid)
_comunicacao_require_admin()
_rpc_avancar_esteira_laboratorio_internal(uuid,text,text,uuid)
can_checkin_technical_visit(uuid,uuid)
can_user_access_cliente(uuid,uuid)
can_view_bi_operacional(uuid)
fn_cockpit_assert_operador()
fn_entrega_assert_confirmador(text)
fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)
fn_estoque_pode_operar(uuid,text)
generate_production_orders_from_partner(uuid)
get_b2b_user_role_for_partner(uuid,uuid)
is_operational_staff(uuid)
is_valid_b2b_partner_user(uuid,uuid)
is_visit_org_manager(uuid,uuid)
log_report_view(text,jsonb)
rpc_gerar_alertas_operacionais()
rpc_recalcular_prioridade_alerta(uuid)
rpc_substituir_etiqueta_produto(uuid,text)'
actual_removed=$( { diff <(grep -v '^#' "$ALLOW_H7N" | cut -f1) <(cut -f1 "$tmp") || true; } | sed -n 's/^< //p' | python3 -c '
import sys,re
out=[]
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    m=re.match(r"^([^(]+)\((.*)\)$", line)
    if not m:
        out.append(line); continue
    name, args = m.group(1), m.group(2)
    parts=[]
    depth=0; cur=""
    for ch in args:
        if ch=="(": depth+=1
        if ch==")": depth-=1
        if ch=="," and depth==0:
            parts.append(cur); cur=""
        else:
            cur+=ch
    if cur.strip(): parts.append(cur)
    types=[]
    for p in parts:
        p=p.strip()
        if not p: continue
        toks=p.split()
        # remove modo (IN/OUT/INOUT/VARIADIC) e nome do parametro
        if toks and toks[0].upper() in ("IN","OUT","INOUT","VARIADIC"): toks=toks[1:]
        types.append(toks[-1] if len(toks)==1 else " ".join(toks[1:]))
    out.append(f"{name}({\",\".join(types)})")
print("\n".join(sorted(out)))
' )
if [ "$removed" = "19" ] && [ "$added" = "0" ] && [ "$(printf '%s\n' "$expected_removed" | sort)" = "$actual_removed" ]; then
  ok "allowlist H7N→H7O: exatamente as 19 assinaturas removidas, 0 adicionadas ($(grep -vc '^#' "$ALLOW_H7N") → $(wc -l < "$tmp"))"
else
  bad "allowlist H7N→H7O: removidas=$removed adicionadas=$added (esperado 19/0)"; diff <(grep -v '^#' "$ALLOW_H7N" | cut -f1) <(cut -f1 "$tmp") || true
fi
anon_secdef=$(awk -F'\t' '$2=="DEFINER" && $3=="anon"' "$tmp" | wc -l)
[ "$anon_secdef" = "2" ] && ok "SECURITY DEFINER com anon: 2 (rpc_validar_comprovante_entrega [rate-limit], rpc_validar_rastreio_produto) — por design" || bad "SECURITY DEFINER com anon: $anon_secdef (esperado 2)"

# 8) invariantes fiscais
fis=$("$RUN" -tAc "select fiscal_environment||'|'||nfe_environment_code||'|'||production_enabled||'|'||nfe_enabled||'|'||nfse_enabled||'|'||configuration_status||'|'||nfe_readiness_status from public.company_fiscal_settings where is_active limit 1")
[ "$fis" = "HOMOLOGATION|2|false|false|false|DRAFT|NOT_READY" ] && ok "fiscal: $fis" || bad "fiscal: $fis"
cnt=$("$RUN" -tAc "select (select count(*) from public.fiscal_invoices)||'|'||(select count(*) from public.fiscal_events)||'|'||(select count(*) from public.fiscal_sefaz_transmissions)")
[ "$cnt" = "0|0|1" ] && ok "fiscal_invoices|fiscal_events|fiscal_sefaz_transmissions = $cnt" || bad "contagens fiscais = $cnt (esperado 0|0|1)"
ext=$("$RUN" -tAc "select string_agg(extname||'@'||n.nspname, ',' order by extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where extname in ('btree_gist','pg_net')")
[ "$ext" = "btree_gist@public,pg_net@public" ] && ok "extensões intocadas: $ext (decisão H7O: não mover)" || bad "extensões: $ext"

[ "$fail" = "0" ] && echo "H7O POSTCHECK: PASS" || { echo "H7O POSTCHECK: FAIL"; exit 1; }
