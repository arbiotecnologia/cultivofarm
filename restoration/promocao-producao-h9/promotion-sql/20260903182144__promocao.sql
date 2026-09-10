-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É UMA MIGRATION HISTÓRICA
-- Origem: supabase/migrations/20260903182144_h7l_security_advisor_hardening.sql
-- SHA-256 da origem: fe00346c3c352ef3182cf5b816d955837fcd8955f230e8e9dbd90bfc415b9395
-- Gerado por: restoration/promocao-producao-h9/gerar-promotion-sql.py (determinístico)
-- Transformação aplicada: literal de ref homologacao -> producao
-- O arquivo de origem NÃO foi alterado.
--
-- Guarda canônica: o runner valida o ref do alvo por canal externo e só então
-- executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela marcadora
-- de homologação é consultada.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- H7L: hardening final do Security Advisor, somente staging.
-- Preserva nomes, colunas, regras de negócio e SECURITY mode das funções.

do $$
declare
  v_missing text;
begin
  if not exists (
    select 1 from public.fiscal_environment_marker
    where project_ref = 'navfzbwgwzruipouyfnk'
      and environment_label = 'STAGING'
      and production_emission_allowed = false
  ) then
    raise exception 'H7L_STAGING_GUARD_FAILED';
  end if;

  select string_agg(x.relname, ', ')
    into v_missing
  from (values
    ('company_fiscal_settings'),
    ('customer_fiscal_profiles'),
    ('fiscal_tax_rules')
  ) x(relname)
  where not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = x.relname
      and c.relrowsecurity
  );

  if v_missing is not null then
    raise exception 'H7L_BASE_RLS_REQUIRED:%', v_missing;
  end if;
end $$;

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


