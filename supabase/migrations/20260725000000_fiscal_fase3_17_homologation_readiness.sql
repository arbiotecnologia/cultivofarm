-- ============================================================================
-- Fase Fiscal 3.17 — RPC read-only de prontidão para homologação
-- ----------------------------------------------------------------------------
-- Migration CANÔNICA aditiva. Nenhum objeto anterior é alterado. Não escreve
-- em nenhuma tabela, não chama serviços externos, não habilita emissão.
--
-- Correção 3.17.1 aplicada:
--   - nomes canônicos: municipality_ibge_code, document_origin, status='DRAFT'.
--   - fontes rastreadas por flag `_available`; zero válido segue INCOMPLETE,
--     erro de dependência vira UNAVAILABLE (nunca 0 mascarado).
--   - status geral: BLOCKED > UNAVAILABLE > READY (só se env HOMOLOGATION e
--     nenhum item UNAVAILABLE/INCOMPLETE/BLOCKED) > INCOMPLETE.
--
-- Segurança: SECURITY DEFINER com search_path fixo, STABLE, gate has_role
-- por administrador/gestor/financeiro. Nunca escreve, nunca chama HTTP,
-- nunca projeta fingerprint_sha256, serial completo, subject, issuer,
-- object_path ou material do certificado.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_homologation_readiness()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $FN$
DECLARE
  v_uid              uuid := auth.uid();
  v_authorized       boolean := false;
  v_company          public.company_fiscal_settings%ROWTYPE;
  v_env_ok           boolean := false;
  v_prod_off         boolean := false;
  v_company_ok       boolean := false;
  v_nfe_ok           boolean := false;
  v_nfse_ok          boolean := false;

  v_products_available  boolean := false;
  v_services_available  boolean := false;
  v_customers_available boolean := false;
  v_drafts_available    boolean := false;

  v_products_ready   integer := 0;
  v_services_ready   integer := 0;
  v_customers_ready  integer := 0;
  v_cert_ok          boolean := false;
  v_vault_available  boolean := false;
  v_upload_fn_ok     boolean := false;
  v_revoke_fn_ok     boolean := false;
  v_rpc_save_ok      boolean := false;
  v_rpc_validate_ok  boolean := false;

  v_drafts_total     integer := 0;
  v_drafts_ready     integer := 0;
  v_drafts_incomp    integer := 0;
  v_drafts_blocked   integer := 0;

  v_checklist        jsonb := '[]'::jsonb;
  v_status           text := 'INCOMPLETE';
  v_has_blocker      boolean := false;
  v_has_unavailable  boolean := false;
  v_all_items_ready  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'gestor'::app_role)
    OR public.has_role(v_uid, 'financeiro'::app_role)
  INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_company
    FROM public.company_fiscal_settings
   WHERE is_active = true
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  IF FOUND THEN
    v_env_ok     := (v_company.fiscal_environment = 'HOMOLOGATION');
    v_prod_off   := (COALESCE(v_company.production_enabled, false) = false);
    v_company_ok := (
      v_company.cnpj IS NOT NULL AND length(v_company.cnpj) >= 14
      AND v_company.legal_name IS NOT NULL AND length(btrim(v_company.legal_name)) > 0
      AND v_company.fiscal_email IS NOT NULL
      AND v_company.municipality_ibge_code IS NOT NULL
    );
    v_nfe_ok  := (COALESCE(v_company.nfe_enabled, false)
                  AND COALESCE(jsonb_typeof(v_company.nfe_configuration), 'null') = 'object'
                  AND v_company.nfe_configuration <> '{}'::jsonb);
    v_nfse_ok := (COALESCE(v_company.nfse_enabled, false)
                  AND COALESCE(jsonb_typeof(v_company.nfse_configuration), 'null') = 'object'
                  AND v_company.nfse_configuration <> '{}'::jsonb);
  END IF;

  BEGIN
    SELECT count(*)::int INTO v_products_ready
      FROM public.v_product_fiscal_readiness
     WHERE minimally_classified = true AND accounting_validated = true;
    v_products_available := true;
  EXCEPTION WHEN OTHERS THEN
    v_products_available := false;
    v_products_ready := 0;
  END;

  BEGIN
    SELECT count(*)::int INTO v_services_ready
      FROM public.v_service_fiscal_readiness
     WHERE minimally_classified = true AND accounting_validated = true;
    v_services_available := true;
  EXCEPTION WHEN OTHERS THEN
    v_services_available := false;
    v_services_ready := 0;
  END;

  BEGIN
    SELECT count(*)::int INTO v_customers_ready
      FROM public.v_customer_fiscal_readiness
     WHERE has_ibge = true;
    v_customers_available := true;
  EXCEPTION WHEN OTHERS THEN
    v_customers_available := false;
    v_customers_ready := 0;
  END;

  IF v_company.id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.fiscal_certificates c
       WHERE c.company_settings_id = v_company.id
         AND c.is_active = true
         AND c.status = 'AVAILABLE'
         AND c.environment = 'HOMOLOGATION'
         AND c.valid_from IS NOT NULL AND c.valid_from <= now()
         AND c.valid_until IS NOT NULL AND c.valid_until > now()
    ) INTO v_cert_ok;
  END IF;

  v_vault_available := EXISTS (
    SELECT 1 FROM pg_class cls
      JOIN pg_namespace n ON n.oid = cls.relnamespace
     WHERE n.nspname = 'public' AND cls.relname = 'fiscal_certificate_material'
  );

  v_rpc_save_ok := EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_fiscal_draft_save'
  );
  v_rpc_validate_ok := EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_fiscal_draft_validate_homologation'
  );
  v_upload_fn_ok := EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_fiscal_certificate_register_a1'
  );
  v_revoke_fn_ok := EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_fiscal_certificate_revoke'
  );

  BEGIN
    SELECT
      count(*)::int,
      count(*) FILTER (WHERE homologation_validation_status = 'READY')::int,
      count(*) FILTER (WHERE homologation_validation_status IN ('INCOMPLETE','NOT_VALIDATED'))::int,
      count(*) FILTER (WHERE homologation_validation_status = 'BLOCKED')::int
    INTO v_drafts_total, v_drafts_ready, v_drafts_incomp, v_drafts_blocked
    FROM public.fiscal_invoices
    WHERE document_origin = 'MANUAL_RECORD'
      AND status = 'DRAFT';
    v_drafts_available := true;
  EXCEPTION WHEN OTHERS THEN
    v_drafts_available := false;
    v_drafts_total := 0; v_drafts_ready := 0; v_drafts_incomp := 0; v_drafts_blocked := 0;
  END;

  IF v_company.id IS NOT NULL AND COALESCE(v_company.production_enabled, false) = true THEN
    v_has_blocker := true;
  END IF;

  v_checklist := jsonb_build_array(
    jsonb_build_object('key','env_homologation','label','Ambiente fiscal em homologação',
      'status', CASE
        WHEN v_company.id IS NULL THEN 'NOT_CONFIGURED'
        WHEN v_env_ok THEN 'READY'
        ELSE 'INCOMPLETE' END),
    jsonb_build_object('key','production_disabled','label','Produção desabilitada',
      'status', CASE WHEN v_prod_off THEN 'READY' ELSE 'BLOCKED' END),
    jsonb_build_object('key','company_profile','label','Dados da empresa completos',
      'status', CASE
        WHEN v_company.id IS NULL THEN 'NOT_CONFIGURED'
        WHEN v_company_ok THEN 'READY'
        ELSE 'INCOMPLETE' END),
    jsonb_build_object('key','nfe_configured','label','NF-e habilitada e configurada',
      'status', CASE WHEN v_nfe_ok THEN 'READY' ELSE 'INCOMPLETE' END),
    jsonb_build_object('key','nfse_configured','label','NFS-e habilitada e configurada',
      'status', CASE WHEN v_nfse_ok THEN 'READY' ELSE 'INCOMPLETE' END),
    jsonb_build_object('key','product_ready','label','Ao menos um produto fiscal pronto',
      'status', CASE
        WHEN NOT v_products_available THEN 'UNAVAILABLE'
        WHEN v_products_ready > 0 THEN 'READY'
        ELSE 'INCOMPLETE' END,
      'count', v_products_ready),
    jsonb_build_object('key','service_ready','label','Ao menos um serviço fiscal pronto',
      'status', CASE
        WHEN NOT v_services_available THEN 'UNAVAILABLE'
        WHEN v_services_ready > 0 THEN 'READY'
        ELSE 'INCOMPLETE' END,
      'count', v_services_ready),
    jsonb_build_object('key','customer_ready','label','Ao menos um cliente fiscal pronto',
      'status', CASE
        WHEN NOT v_customers_available THEN 'UNAVAILABLE'
        WHEN v_customers_ready > 0 THEN 'READY'
        ELSE 'INCOMPLETE' END,
      'count', v_customers_ready),
    jsonb_build_object('key','drafts_source','label','Fonte de rascunhos disponível',
      'status', CASE WHEN v_drafts_available THEN 'READY' ELSE 'UNAVAILABLE' END,
      'count', v_drafts_total),
    jsonb_build_object('key','certificate_active','label','Certificado de homologação ativo e vigente',
      'status', CASE
        WHEN v_company.id IS NULL THEN 'NOT_CONFIGURED'
        WHEN v_cert_ok THEN 'READY'
        ELSE 'INCOMPLETE' END),
    jsonb_build_object('key','vault_available','label','Cofre de certificados disponível',
      'status', CASE WHEN v_vault_available THEN 'READY' ELSE 'UNAVAILABLE' END),
    jsonb_build_object('key','upload_function','label','Função de registro de certificado disponível',
      'status', CASE WHEN v_upload_fn_ok THEN 'READY' ELSE 'UNAVAILABLE' END),
    jsonb_build_object('key','revoke_function','label','Função de revogação de certificado disponível',
      'status', CASE WHEN v_revoke_fn_ok THEN 'READY' ELSE 'UNAVAILABLE' END),
    jsonb_build_object('key','rpc_draft_save','label','RPC de salvamento de rascunho disponível',
      'status', CASE WHEN v_rpc_save_ok THEN 'READY' ELSE 'UNAVAILABLE' END),
    jsonb_build_object('key','rpc_draft_validate','label','RPC de validação de homologação disponível',
      'status', CASE WHEN v_rpc_validate_ok THEN 'READY' ELSE 'UNAVAILABLE' END)
  );

  SELECT
    bool_and((elem->>'status') = 'READY'),
    bool_or((elem->>'status') = 'UNAVAILABLE')
  INTO v_all_items_ready, v_has_unavailable
    FROM jsonb_array_elements(v_checklist) elem;

  IF v_has_blocker THEN
    v_status := 'BLOCKED';
  ELSIF v_has_unavailable THEN
    v_status := 'UNAVAILABLE';
  ELSIF COALESCE(v_all_items_ready, false) AND v_env_ok THEN
    v_status := 'READY';
  ELSE
    v_status := 'INCOMPLETE';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'generated_at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'environment_label', CASE
      WHEN v_company.id IS NULL THEN 'Não configurado'
      WHEN v_env_ok THEN 'Homologação'
      ELSE 'Indisponível'
    END,
    'production_enabled', COALESCE(v_company.production_enabled, false),
    'checklist', v_checklist,
    'counts', jsonb_build_object(
      'drafts_total', v_drafts_total,
      'drafts_ready', v_drafts_ready,
      'drafts_incomplete', v_drafts_incomp,
      'drafts_blocked', v_drafts_blocked,
      'products_ready', v_products_ready,
      'services_ready', v_services_ready,
      'customers_ready', v_customers_ready
    )
  );
END;
$FN$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_homologation_readiness() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_homologation_readiness() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_homologation_readiness() TO authenticated;

COMMENT ON FUNCTION public.rpc_fiscal_homologation_readiness() IS
  'Fase Fiscal 3.17 — Prontidao de homologacao (read-only). Sem escrita, HTTP ou exposicao sensivel.';

COMMIT;
