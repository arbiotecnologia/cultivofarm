-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260903182144_h7l_security_advisor_hardening.sql
-- SHA-256 orig: fe00346c3c352ef3182cf5b816d955837fcd8955f230e8e9dbd90bfc415b9395
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-manuais.py
-- Transformação: guarda de homologação por marcador substituída pela guarda canônica de promoção + precheck de existência e RLS; pós-check de security_invoker e ACL; trabalho real preservado byte a byte
--
-- O runner valida o ref do alvo por canal externo (API/DSN) e só então executa
-- `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela marcadora de
-- homologação é consultada, nenhum OID e nenhuma contagem de ledger é fixada.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- Precheck fail-closed: as 3 views alvo e as 3 tabelas base precisam existir,
-- e as tabelas base precisam estar com RLS habilitada. Sem isso, security_invoker
-- nas views trocaria proteção por exposição.
DO $h7l_pre$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(x.relname, ', ') INTO v_missing
  FROM (values
    ('v_fiscal_nfe_emitter_readiness'),
    ('v_fiscal_nfe_recipient_readiness'),
    ('v_fiscal_nfe_rule_coverage')
  ) x(relname)
  WHERE to_regclass('public.' || x.relname) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'H7L_PROMO: views ausentes: %', v_missing;
  END IF;

  SELECT string_agg(x.relname, ', ') INTO v_missing
  FROM (values
    ('company_fiscal_settings'),
    ('customer_fiscal_profiles'),
    ('fiscal_tax_rules')
  ) x(relname)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = x.relname AND c.relrowsecurity
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'H7L_PROMO: tabela base sem RLS habilitada: %', v_missing;
  END IF;
END
$h7l_pre$;

alter view public.v_fiscal_nfe_emitter_readiness
  set (security_invoker = true);
alter view public.v_fiscal_nfe_recipient_readiness
  set (security_invoker = true);
alter view public.v_fiscal_nfe_rule_coverage
  set (security_invoker = true);

revoke all on public.v_fiscal_nfe_emitter_readiness from public, anon, authenticated;
revoke all on public.v_fiscal_nfe_recipient_readiness from public, anon, authenticated;
revoke all on public.v_fiscal_nfe_rule_coverage from public, anon, authenticated;

grant select on public.v_fiscal_nfe_emitter_readiness to authenticated;
grant select on public.v_fiscal_nfe_recipient_readiness to authenticated;
grant select on public.v_fiscal_nfe_rule_coverage to authenticated;

grant all on public.v_fiscal_nfe_emitter_readiness to service_role;
grant all on public.v_fiscal_nfe_recipient_readiness to service_role;
grant all on public.v_fiscal_nfe_rule_coverage to service_role;

alter function public.fiscal_sinief20_snapshot_immutable() set search_path = public, pg_temp;
alter function public.fiscal_validate_key_usage(jsonb) set search_path = public, pg_temp;
alter function public.fiscal_validate_snapshot_keys(jsonb,text[],text) set search_path = public, pg_temp;
alter function public.fn_fiscal_access_key_dv(text) set search_path = public, pg_temp;
alter function public.fn_fiscal_apply_tax(public.fiscal_tax_rules,numeric) set search_path = public, pg_temp;
alter function public.fn_fiscal_apply_tax_v2(public.fiscal_tax_rules,jsonb) set search_path = public, pg_temp;
alter function public.fn_fiscal_base_components_valid(jsonb) set search_path = public, pg_temp;
alter function public.fn_fiscal_billing_allowed_delivery_status() set search_path = public, pg_temp;
alter function public.fn_fiscal_billing_allowed_order_status() set search_path = public, pg_temp;
alter function public.fn_fiscal_cep_is_valid(text) set search_path = public, pg_temp;
alter function public.fn_fiscal_cnpj_is_valid(text) set search_path = public, pg_temp;
alter function public.fn_fiscal_cpf_is_valid(text) set search_path = public, pg_temp;
alter function public.fn_fiscal_digits(text) set search_path = public, pg_temp;
alter function public.fn_fiscal_ibge_municipio_coerente(text,text) set search_path = public, pg_temp;
alter function public.fn_fiscal_ie_check(text,text) set search_path = public, pg_temp;
alter function public.fn_fiscal_item_base(jsonb,jsonb) set search_path = public, pg_temp;
alter function public.fn_fiscal_official_url_allowlisted(text) set search_path = public, pg_temp;
alter function public.fn_fiscal_round(numeric) set search_path = public, pg_temp;
alter function public.fn_fiscal_rule_validate_synthetic(text,public.fiscal_tax_rules,jsonb) set search_path = public, pg_temp;
alter function public.fn_fiscal_status_is_terminal(text) set search_path = public, pg_temp;
alter function public.fn_fiscal_uf_ibge_code(text) set search_path = public, pg_temp;
alter function public.tg_fiscal_operation_policy_immutable() set search_path = public, pg_temp;

revoke all on function public.fiscal_sinief20_snapshot_immutable() from public, anon, authenticated;
revoke all on function public.tg_fiscal_operation_policy_immutable() from public, anon, authenticated;




-- Pós-check fail-closed: security_invoker efetivo nas 3 views, sem grant a
-- PUBLIC/anon, e search_path fixo nas 22 funções tocadas.
DO $h7l_pos$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('v_fiscal_nfe_emitter_readiness',
                      'v_fiscal_nfe_recipient_readiness',
                      'v_fiscal_nfe_rule_coverage')
    AND NOT COALESCE(c.reloptions::text LIKE '%security_invoker=true%', false);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'H7L_PROMO: security_invoker ausente em: %', v_bad;
  END IF;

  SELECT string_agg(c.relname, ', ') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('v_fiscal_nfe_emitter_readiness',
                      'v_fiscal_nfe_recipient_readiness',
                      'v_fiscal_nfe_rule_coverage')
    AND (array_to_string(c.relacl, ',') ~ '(^|,)=' OR array_to_string(c.relacl, ',') LIKE '%anon=%');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'H7L_PROMO: view exposta a PUBLIC/anon: %', v_bad;
  END IF;
END
$h7l_pos$;
