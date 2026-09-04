#!/usr/bin/env bash
# H7N — Postcheck idempotente e SOMENTE LEITURA (staging ikaauvsflpmamgxmkhoq).
# 1) as 5 versões H7N estão no ledger e o SQL aplicado == arquivo do repositório (MD5);
# 2) 5/5 views security_invoker; 3) 0 trigger functions expostas; 4) 0 helpers internos expostos;
# 5) 13 RPCs com guard; 6) 4 funções com search_path=pg_catalog; 7) allowlist de RPCs sem drift;
# 8) invariantes fiscais (HOMOLOGATION/tpAmb=2/produção off; nenhuma invoice/evento).
# Uso: bash restoration/homologacao-h7/h7n-postcheck.sh            (compara com a allowlist versionada)
#      H7N_ALLOWLIST_UPDATE=1 bash restoration/homologacao-h7/h7n-postcheck.sh   (regrava a allowlist — revisar no diff)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
RUN="$ROOT/restoration/os-e2e/staging-psql.sh"
MIG="$ROOT/supabase/migrations"
ALLOW="$HERE/h7n-inventario/rpc_allowlist.tsv"
"$HERE/guard-staging.sh"

fail=0
ok()   { echo "PASS  $1"; }
bad()  { echo "FAIL  $1"; fail=1; }

# 1) ledger x repositório
for v in 20260904130615 20260904130758 20260904130941 20260904131239 20260904131341; do
  f=$(ls "$MIG/${v}"_*.sql)
  repo_md5=$(md5sum "$f" | cut -d' ' -f1)
  db_md5=$("$RUN" -tAc "select md5(array_to_string(statements, E'\n')) from supabase_migrations.schema_migrations where version='$v'")
  if [ -z "$db_md5" ]; then bad "ledger: versão $v ausente"; continue; fi
  if [ "$repo_md5" = "$db_md5" ]; then ok "ledger $v == $(basename "$f") (md5 $repo_md5)"; else bad "ledger $v difere do arquivo $(basename "$f") (repo=$repo_md5 db=$db_md5)"; fi
done

# 2..6) estado do catálogo
read -r views priv trg hlp rpc sp < <("$RUN" -tAc "
with trg as (select unnest(string_to_array('$(sed -nE 's/^revoke execute on function public\.([a-zA-Z0-9_]+)\(\).*/\1/p' "$MIG/20260904130758_h7n_p1_trigger_execute.sql" | paste -sd, -)', ',')) n),
     hlp as (select unnest(string_to_array('$(sed -nE 's/^revoke execute on function public\.([a-zA-Z0-9_]+)\(.*/\1/p' "$MIG/20260904131239_h7n_p1_internal_helpers.sql" | paste -sd, -)', ',')) n),
     rpc as (select unnest(string_to_array('$(sed -nE 's/^CREATE OR REPLACE FUNCTION public\.([a-zA-Z0-9_]+)\(.*/\1/p' "$MIG/20260904130941_h7n_p1_rpc_guards.sql" | paste -sd, -)', ',')) n)
select
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica','vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos') and lower(coalesce(c.reloptions::text,'{}'))::text[] && array['security_invoker=1','security_invoker=true','security_invoker=yes','security_invoker=on']),
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'),
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (select n from trg) and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('public',p.oid,'EXECUTE'))),
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (select n from hlp) and pg_get_function_identity_arguments(p.oid) <> 'p_tipo text, p_item_id uuid, p_partner_id uuid' and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE'))),
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (select n from rpc) and (p.prosrc like '%permission_denied%' or p.prosrc like '%h7n_guarded%')),
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fn_h6b_num','fn_gtin_is_valid','fn_regulatory_storage_path_ok','fn_regulatory_storage_dossier_id') and p.proconfig::text='{search_path=pg_catalog}')
" | tr '|' ' ')
[ "$views" = "5" ] && ok "views security_invoker: 5/5" || bad "views security_invoker: $views/5"
[ "$priv"  = "4" ] && ok "private wrappers: 4/4"       || bad "private wrappers: $priv/4"
[ "$trg"   = "0" ] && ok "trigger functions expostas (public/anon/authenticated): 0" || bad "trigger functions expostas: $trg"
[ "$hlp"   = "0" ] && ok "helpers internos expostos: 0" || bad "helpers internos expostos: $hlp"
[ "$rpc"   = "13" ] && ok "RPCs sensíveis com guard: 13/13" || bad "RPCs sensíveis com guard: $rpc/13"
[ "$sp"    = "4" ] && ok "search_path=pg_catalog: 4/4" || bad "search_path=pg_catalog: $sp/4"

# 7) allowlist de funções public executáveis por anon/authenticated
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
if [ "${H7N_ALLOWLIST_UPDATE:-0}" = "1" ] || [ ! -f "$ALLOW" ]; then
  { echo -e "# H7N allowlist — funções em public executáveis por anon/authenticated (staging) — gerada $(date -u +%Y-%m-%dT%H:%M:%SZ)\n# assinatura\tsecurity\tanon\tauthenticated\ttipo"; cat "$tmp"; } > "$ALLOW"
  ok "allowlist regravada: $(grep -vc '^#' "$ALLOW") funções ($ALLOW)"
else
  if diff -q <(grep -v '^#' "$ALLOW") "$tmp" >/dev/null; then
    ok "allowlist sem drift: $(grep -vc '^#' "$ALLOW") funções expostas"
  else
    bad "allowlist com DRIFT (diff abaixo: '<' allowlist, '>' banco)"; diff <(grep -v '^#' "$ALLOW") "$tmp" || true
  fi
fi
anon_secdef=$(awk -F'\t' '$2=="DEFINER" && $3=="anon"' "$tmp" | wc -l)
trg_exposed=$(awk -F'\t' '$5=="trigger" && $2=="DEFINER"' "$tmp" | wc -l)
trg_invoker=$(awk -F'\t' '$5=="trigger" && $2=="INVOKER"' "$tmp" | wc -l)
[ "$anon_secdef" = "2" ] && ok "SECURITY DEFINER com anon: 2 (QR/token, por design)" || bad "SECURITY DEFINER com anon: $anon_secdef (esperado 2)"
[ "$trg_exposed" = "0" ] && ok "funções de trigger SECURITY DEFINER na allowlist: 0 (INFO: $trg_invoker trigger functions SECURITY INVOKER permanecem com EXECUTE padrão; chamada direta é impedida pelo PostgreSQL — 0A000)" || bad "funções de trigger SECURITY DEFINER na allowlist: $trg_exposed"

# 8) invariantes fiscais
fis=$("$RUN" -tAc "select fiscal_environment||'|'||nfe_environment_code||'|'||production_enabled||'|'||nfe_enabled||'|'||nfse_enabled||'|'||configuration_status||'|'||nfe_readiness_status from public.company_fiscal_settings where is_active limit 1")
[ "$fis" = "HOMOLOGATION|2|false|false|false|DRAFT|NOT_READY" ] && ok "fiscal: $fis" || bad "fiscal: $fis"
cnt=$("$RUN" -tAc "select (select count(*) from public.fiscal_invoices)||'|'||(select count(*) from public.fiscal_events)||'|'||(select count(*) from public.fiscal_sefaz_transmissions)")
[ "$cnt" = "0|0|1" ] && ok "fiscal_invoices|fiscal_events|fiscal_sefaz_transmissions = $cnt" || bad "contagens fiscais = $cnt (esperado 0|0|1)"

[ "$fail" = "0" ] && echo "H7N POSTCHECK: PASS" || { echo "H7N POSTCHECK: FAIL"; exit 1; }
