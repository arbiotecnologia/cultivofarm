-- =====================================================================
-- Fase Fiscal 3.19 (+3.19.2/.3) — RTC 2026 (IBS/CBS) e CNPJ Alfanumérico
--
-- CANÔNICA. NÃO APLICADA nesta rodada. Deploy segue política humana.
--
-- Regras:
--   * ÚNICA transação BEGIN...COMMIT. Fail-fast total.
--   * Estritamente ADITIVA:
--       - 3 colunas jsonb novas + CHECK (object + ausência de segredos);
--       - 6 RPCs `rpc_fiscal_*_rtc_*` / `rpc_fiscal_*_ibs_cbs_*`;
--       - NOVA RPC `rpc_fiscal_homologation_readiness_v2` (não altera
--         `rpc_fiscal_homologation_readiness()` da 20260725000000).
--   * Não altera `production_enabled`, providers, GRANTs, RLS, emissão,
--     credenciais, seeds ou dados. Não toca `cnpj`/`document_number`.
--   * Concorrência otimista: get/save carregam `revision` derivada de
--     `updated_at::text`; save exige `expected_revision` quando informado
--     e devolve FISCAL_CONFLICT se a linha mudou.
-- =====================================================================

BEGIN;

DO $$
DECLARE missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='company_fiscal_settings')
    THEN missing := missing || 'company_fiscal_settings'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='product_fiscal_profiles')
    THEN missing := missing || 'product_fiscal_profiles'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='service_fiscal_profiles')
    THEN missing := missing || 'service_fiscal_profiles'; END IF;
  IF array_length(missing,1) IS NOT NULL THEN
    RAISE EXCEPTION 'Fase 3.19 abortada: tabelas ausentes: %',
      array_to_string(missing, ', ');
  END IF;
END $$;

DO $$
DECLARE t text; missing text[] := ARRAY[]::text[];
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'company_fiscal_settings','product_fiscal_profiles','service_fiscal_profiles'
  ]) LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=t AND column_name='updated_at')
      THEN missing := missing || t; END IF;
  END LOOP;
  IF array_length(missing,1) IS NOT NULL THEN
    RAISE EXCEPTION 'Fase 3.19 abortada: coluna updated_at ausente em: %',
      array_to_string(missing, ', ');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fiscal_rtc_has_sensitive_key(payload jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog, public AS $F$
DECLARE
  k text; v jsonb; needle text;
  needles text[] := ARRAY[
    'token','password','senha','secret','api_key','apikey',
    'private_key','privatekey','pfx','p12',
    'certificate','certificate_content','certificate_pem','pem',
    'authorization','bearer','access_token','refresh_token','client_secret',
    'production_enabled'];
BEGIN
  IF payload IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(payload) = 'object' THEN
    FOR k, v IN SELECT * FROM jsonb_each(payload) LOOP
      FOREACH needle IN ARRAY needles LOOP
        IF position(needle IN lower(k)) > 0 THEN RETURN true; END IF;
      END LOOP;
      IF public.fiscal_rtc_has_sensitive_key(v) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(payload) = 'array' THEN
    FOR v IN SELECT jsonb_array_elements(payload) LOOP
      IF public.fiscal_rtc_has_sensitive_key(v) THEN RETURN true; END IF;
    END LOOP;
  END IF;
  RETURN false;
END; $F$;

ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS rtc_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.product_fiscal_profiles
  ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.service_fiscal_profiles
  ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='company_fiscal_settings_rtc_config_object_chk') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT company_fiscal_settings_rtc_config_object_chk
      CHECK (jsonb_typeof(rtc_configuration) = 'object'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='company_fiscal_settings_rtc_config_no_secret_chk') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT company_fiscal_settings_rtc_config_no_secret_chk
      CHECK (NOT public.fiscal_rtc_has_sensitive_key(rtc_configuration)); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_fiscal_profiles_ibs_cbs_object_chk') THEN
    ALTER TABLE public.product_fiscal_profiles
      ADD CONSTRAINT product_fiscal_profiles_ibs_cbs_object_chk
      CHECK (jsonb_typeof(ibs_cbs_configuration) = 'object'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_fiscal_profiles_ibs_cbs_no_secret_chk') THEN
    ALTER TABLE public.product_fiscal_profiles
      ADD CONSTRAINT product_fiscal_profiles_ibs_cbs_no_secret_chk
      CHECK (NOT public.fiscal_rtc_has_sensitive_key(ibs_cbs_configuration)); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_fiscal_profiles_ibs_cbs_object_chk') THEN
    ALTER TABLE public.service_fiscal_profiles
      ADD CONSTRAINT service_fiscal_profiles_ibs_cbs_object_chk
      CHECK (jsonb_typeof(ibs_cbs_configuration) = 'object'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_fiscal_profiles_ibs_cbs_no_secret_chk') THEN
    ALTER TABLE public.service_fiscal_profiles
      ADD CONSTRAINT service_fiscal_profiles_ibs_cbs_no_secret_chk
      CHECK (NOT public.fiscal_rtc_has_sensitive_key(ibs_cbs_configuration)); END IF;
END $$;

REVOKE ALL ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public._fiscal_rtc_assert_payload(payload jsonb, kind text)
RETURNS void LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public AS $F$
DECLARE
  k text; sz int;
  company_keys text[] := ARRAY['schema_version','source_document','source_version',
    'effective_from','last_reviewed_at','rtc_environment','transition_year',
    'accounting_review_notes','accounting_review_status','additional_fields'];
  item_keys text[] := ARRAY['schema_version','source_document','source_version',
    'effective_from','last_reviewed_at','cst_ibs_cbs','c_class_trib',
    'c_credito_presumido','c_ind_op','aliquota_cbs','aliquota_ibs_uf',
    'aliquota_ibs_municipio','aliquota_cbs_reference','aliquota_ibs_reference',
    'reducao','diferimento','monofasia','accounting_notes',
    'accounting_review_status','additional_fields'];
  allowed text[];
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'FISCAL_RTC_INVALID_PAYLOAD' USING ERRCODE='22023'; END IF;
  IF public.fiscal_rtc_has_sensitive_key(payload) THEN
    RAISE EXCEPTION 'FISCAL_RTC_SENSITIVE_KEY' USING ERRCODE='22023'; END IF;
  sz := length(payload::text);
  IF sz > 65536 THEN
    RAISE EXCEPTION 'FISCAL_RTC_PAYLOAD_TOO_LARGE' USING ERRCODE='22023'; END IF;
  IF NOT (payload ? 'schema_version') OR (payload->>'schema_version') NOT IN ('1') THEN
    RAISE EXCEPTION 'FISCAL_RTC_SCHEMA_VERSION_UNSUPPORTED' USING ERRCODE='22023'; END IF;
  allowed := CASE WHEN kind='company' THEN company_keys ELSE item_keys END;
  FOR k IN SELECT jsonb_object_keys(payload) LOOP
    IF NOT (k = ANY(allowed)) THEN
      RAISE EXCEPTION 'FISCAL_RTC_UNKNOWN_FIELD' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF payload ? 'additional_fields'
     AND jsonb_typeof(payload->'additional_fields') <> 'object' THEN
    RAISE EXCEPTION 'FISCAL_RTC_INVALID_ADDITIONAL_FIELDS' USING ERRCODE='22023'; END IF;
  IF kind='company' AND payload ? 'rtc_environment'
     AND (payload->>'rtc_environment') NOT IN ('NOT_CONFIGURED','HOMOLOGATION') THEN
    RAISE EXCEPTION 'FISCAL_RTC_INVALID_ENVIRONMENT' USING ERRCODE='22023'; END IF;
  IF payload ? 'accounting_review_status'
     AND (payload->>'accounting_review_status') NOT IN ('PENDING','REVIEWED') THEN
    RAISE EXCEPTION 'FISCAL_RTC_INVALID_REVIEW_STATUS' USING ERRCODE='22023'; END IF;
  FOR k IN SELECT unnest(ARRAY['aliquota_cbs','aliquota_ibs_uf',
    'aliquota_ibs_municipio','aliquota_cbs_reference','aliquota_ibs_reference']) LOOP
    IF payload ? k THEN
      IF jsonb_typeof(payload->k) <> 'number'
         OR (payload->>k)::numeric < 0 OR (payload->>k)::numeric > 100 THEN
        RAISE EXCEPTION 'FISCAL_RTC_INVALID_PERCENT' USING ERRCODE='22023'; END IF;
    END IF;
  END LOOP;
  FOR k IN SELECT unnest(ARRAY['cst_ibs_cbs','c_class_trib',
    'c_credito_presumido','c_ind_op']) LOOP
    IF payload ? k THEN
      IF jsonb_typeof(payload->k) <> 'string'
         OR length(payload->>k) < 1 OR length(payload->>k) > 12
         OR (payload->>k) !~ '^[A-Za-z0-9._-]+$' THEN
        RAISE EXCEPTION 'FISCAL_RTC_INVALID_CODE' USING ERRCODE='22023'; END IF;
    END IF;
  END LOOP;
  FOR k IN SELECT unnest(ARRAY['effective_from','last_reviewed_at']) LOOP
    IF payload ? k THEN
      IF jsonb_typeof(payload->k) <> 'string'
         OR (payload->>k) !~ '^\d{4}-\d{2}-\d{2}(T.*)?$' THEN
        RAISE EXCEPTION 'FISCAL_RTC_INVALID_DATE' USING ERRCODE='22023'; END IF;
    END IF;
  END LOOP;
  IF payload ? 'source_document' AND length(payload->>'source_document') > 120 THEN
    RAISE EXCEPTION 'FISCAL_RTC_STRING_TOO_LONG' USING ERRCODE='22023'; END IF;
  IF payload ? 'source_version' AND length(payload->>'source_version') > 60 THEN
    RAISE EXCEPTION 'FISCAL_RTC_STRING_TOO_LONG' USING ERRCODE='22023'; END IF;
  IF payload ? 'accounting_review_notes'
     AND length(payload->>'accounting_review_notes') > 4000 THEN
    RAISE EXCEPTION 'FISCAL_RTC_STRING_TOO_LONG' USING ERRCODE='22023'; END IF;
  IF payload ? 'accounting_notes'
     AND length(payload->>'accounting_notes') > 2000 THEN
    RAISE EXCEPTION 'FISCAL_RTC_STRING_TOO_LONG' USING ERRCODE='22023'; END IF;
  -- ------------------------------------------------------------------
  -- Fase 3.19.5 - validacao NFS-e Nacional dentro de additional_fields.
  -- Codigos estaveis; fail-fast; sem catch silenciador.
  -- ------------------------------------------------------------------
  IF payload ? 'additional_fields' THEN
    DECLARE af jsonb := payload->'additional_fields';
    BEGIN
      IF af ? 'finNFSe' AND (jsonb_typeof(af->'finNFSe') <> 'string'
         OR length(af->>'finNFSe') < 1 OR length(af->>'finNFSe') > 20) THEN
        RAISE EXCEPTION 'FISCAL_RTC_NFSE_INVALID_CODE:finNFSe' USING ERRCODE='22023'; END IF;
      IF af ? 'tpNFSeDebito' AND (jsonb_typeof(af->'tpNFSeDebito') <> 'string'
         OR length(af->>'tpNFSeDebito') < 1 OR length(af->>'tpNFSeDebito') > 20) THEN
        RAISE EXCEPTION 'FISCAL_RTC_NFSE_INVALID_CODE:tpNFSeDebito' USING ERRCODE='22023'; END IF;
      IF af ? 'tpNFSeCredito' AND (jsonb_typeof(af->'tpNFSeCredito') <> 'string'
         OR length(af->>'tpNFSeCredito') < 1 OR length(af->>'tpNFSeCredito') > 20) THEN
        RAISE EXCEPTION 'FISCAL_RTC_NFSE_INVALID_CODE:tpNFSeCredito' USING ERRCODE='22023'; END IF;
      IF af ? 'gIBSCBSAjuste' AND jsonb_typeof(af->'gIBSCBSAjuste') <> 'boolean' THEN
        RAISE EXCEPTION 'FISCAL_RTC_NFSE_INVALID_TOGGLE:gIBSCBSAjuste' USING ERRCODE='22023'; END IF;
      IF af ? 'vAjusteBC' THEN
        IF jsonb_typeof(af->'vAjusteBC') <> 'number'
           OR (af->>'vAjusteBC')::numeric < 0 THEN
          RAISE EXCEPTION 'FISCAL_RTC_NFSE_INVALID_VALUE:vAjusteBC' USING ERRCODE='22023'; END IF;
        IF NOT (af ? 'gIBSCBSAjuste')
           OR jsonb_typeof(af->'gIBSCBSAjuste') <> 'boolean'
           OR (af->>'gIBSCBSAjuste')::boolean IS DISTINCT FROM true THEN
          RAISE EXCEPTION 'FISCAL_RTC_NFSE_VALUE_WITHOUT_TOGGLE:vAjusteBC' USING ERRCODE='22023'; END IF;
      END IF;
    END;
  END IF;
END; $F$;

REVOKE ALL ON FUNCTION public._fiscal_rtc_assert_payload(jsonb,text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public._fiscal_rtc_can_read(uid uuid)
RETURNS boolean LANGUAGE sql STABLE
SET search_path = pg_catalog, public AS $F$
  SELECT uid IS NOT NULL AND (
    public.has_role(uid,'administrador'::app_role)
    OR public.has_role(uid,'gestor'::app_role)
    OR public.has_role(uid,'financeiro'::app_role));
$F$;
REVOKE ALL ON FUNCTION public._fiscal_rtc_can_read(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_rtc_get()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $F$
DECLARE v_uid uuid := auth.uid(); v_row public.company_fiscal_settings%ROWTYPE;
BEGIN
  IF NOT public._fiscal_rtc_can_read(v_uid) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.company_fiscal_settings
   ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  RETURN jsonb_build_object(
    'configuration', COALESCE(v_row.rtc_configuration,'{}'::jsonb),
    'revision', COALESCE(v_row.updated_at::text,''),
    'exists', v_row.id IS NOT NULL);
END; $F$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_rtc_save(
  payload jsonb, expected_revision text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public AS $F$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_current text; v_new text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FISCAL_UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(v_uid,'administrador'::app_role) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  PERFORM public._fiscal_rtc_assert_payload(payload,'company');
  SELECT id, updated_at::text INTO v_id, v_current
    FROM public.company_fiscal_settings
   ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'FISCAL_COMPANY_NOT_INITIALIZED' USING ERRCODE='P0002'; END IF;
  IF expected_revision IS NOT NULL AND expected_revision <> v_current THEN
    RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='40001'; END IF;
  UPDATE public.company_fiscal_settings
     SET rtc_configuration = payload, updated_at = now()
   WHERE id = v_id
   RETURNING updated_at::text INTO v_new;
  RETURN jsonb_build_object('configuration', payload, 'revision', v_new);
END; $F$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_product_ibs_cbs_get(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $F$
DECLARE v_uid uuid := auth.uid(); v_cfg jsonb; v_rev text;
BEGIN
  IF NOT public._fiscal_rtc_can_read(v_uid) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(ibs_cbs_configuration,'{}'::jsonb), updated_at::text
    INTO v_cfg, v_rev
    FROM public.product_fiscal_profiles WHERE product_id = p_product_id LIMIT 1;
  RETURN jsonb_build_object(
    'configuration', COALESCE(v_cfg,'{}'::jsonb),
    'revision', COALESCE(v_rev,''),
    'exists', v_rev IS NOT NULL);
END; $F$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_product_ibs_cbs_save(
  p_product_id uuid, payload jsonb, expected_revision text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public AS $F$
DECLARE v_uid uuid := auth.uid(); v_current text; v_new text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FISCAL_UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT (public.has_role(v_uid,'administrador'::app_role)
       OR public.has_role(v_uid,'financeiro'::app_role)) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  PERFORM public._fiscal_rtc_assert_payload(payload,'item');
  SELECT updated_at::text INTO v_current
    FROM public.product_fiscal_profiles WHERE product_id = p_product_id LIMIT 1;
  IF v_current IS NULL THEN RAISE EXCEPTION 'FISCAL_ITEM_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF expected_revision IS NOT NULL AND expected_revision <> v_current THEN
    RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='40001'; END IF;
  UPDATE public.product_fiscal_profiles
     SET ibs_cbs_configuration = payload, updated_at = now()
   WHERE product_id = p_product_id
   RETURNING updated_at::text INTO v_new;
  RETURN jsonb_build_object('configuration', payload, 'revision', v_new);
END; $F$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_service_ibs_cbs_get(p_service_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $F$
DECLARE v_uid uuid := auth.uid(); v_cfg jsonb; v_rev text;
BEGIN
  IF NOT public._fiscal_rtc_can_read(v_uid) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(ibs_cbs_configuration,'{}'::jsonb), updated_at::text
    INTO v_cfg, v_rev
    FROM public.service_fiscal_profiles WHERE service_id = p_service_id LIMIT 1;
  RETURN jsonb_build_object(
    'configuration', COALESCE(v_cfg,'{}'::jsonb),
    'revision', COALESCE(v_rev,''),
    'exists', v_rev IS NOT NULL);
END; $F$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_service_ibs_cbs_save(
  p_service_id uuid, payload jsonb, expected_revision text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public AS $F$
DECLARE v_uid uuid := auth.uid(); v_current text; v_new text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FISCAL_UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT (public.has_role(v_uid,'administrador'::app_role)
       OR public.has_role(v_uid,'financeiro'::app_role)) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  PERFORM public._fiscal_rtc_assert_payload(payload,'item');
  SELECT updated_at::text INTO v_current
    FROM public.service_fiscal_profiles WHERE service_id = p_service_id LIMIT 1;
  IF v_current IS NULL THEN RAISE EXCEPTION 'FISCAL_ITEM_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF expected_revision IS NOT NULL AND expected_revision <> v_current THEN
    RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='40001'; END IF;
  UPDATE public.service_fiscal_profiles
     SET ibs_cbs_configuration = payload, updated_at = now()
   WHERE service_id = p_service_id
   RETURNING updated_at::text INTO v_new;
  RETURN jsonb_build_object('configuration', payload, 'revision', v_new);
END; $F$;

DO $$ DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'rpc_fiscal_company_rtc_get()',
    'rpc_fiscal_company_rtc_save(jsonb,text)',
    'rpc_fiscal_product_ibs_cbs_get(uuid)',
    'rpc_fiscal_product_ibs_cbs_save(uuid,jsonb,text)',
    'rpc_fiscal_service_ibs_cbs_get(uuid)',
    'rpc_fiscal_service_ibs_cbs_save(uuid,jsonb,text)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon',   fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_homologation_readiness_rtc_check()
RETURNS boolean LANGUAGE sql STABLE
SET search_path = pg_catalog, public AS $F$
  SELECT COALESCE((
    SELECT jsonb_typeof(rtc_configuration) = 'object'
       AND rtc_configuration ? 'schema_version'
       AND rtc_configuration ? 'rtc_environment'
       AND (rtc_configuration->>'rtc_environment')
             IN ('NOT_CONFIGURED','HOMOLOGATION')
      FROM public.company_fiscal_settings
     ORDER BY updated_at DESC NULLS LAST LIMIT 1), false);
$F$;
REVOKE ALL ON FUNCTION public.rpc_fiscal_homologation_readiness_rtc_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_homologation_readiness_rtc_check() TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_homologation_readiness_v2()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $F$
DECLARE
  v_uid uuid := auth.uid();
  v_base jsonb; v_checklist jsonb; v_rtc_ok boolean;
  v_all_ready boolean; v_any_unavail boolean; v_any_blocked boolean;
  v_prod_on boolean; v_status text;
BEGIN
  IF NOT public._fiscal_rtc_can_read(v_uid) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_base := public.rpc_fiscal_homologation_readiness();
  v_rtc_ok := public.rpc_fiscal_homologation_readiness_rtc_check();
  v_checklist := COALESCE(v_base->'checklist','[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
         'key','rtc_configured',
         'label','Configuração RTC 2026 (IBS/CBS) preenchida',
         'status', CASE WHEN v_rtc_ok THEN 'READY' ELSE 'INCOMPLETE' END));
  SELECT bool_and((elem->>'status') = 'READY'),
         bool_or((elem->>'status') = 'UNAVAILABLE'),
         bool_or((elem->>'status') = 'BLOCKED')
   INTO v_all_ready, v_any_unavail, v_any_blocked
   FROM jsonb_array_elements(v_checklist) elem;
  v_prod_on := COALESCE((v_base->>'production_enabled')::boolean, false);
  v_status := CASE
    WHEN v_any_blocked OR v_prod_on THEN 'BLOCKED'
    WHEN v_any_unavail             THEN 'UNAVAILABLE'
    WHEN COALESCE(v_all_ready,false) AND v_rtc_ok THEN 'READY'
    ELSE 'INCOMPLETE' END;
  RETURN v_base || jsonb_build_object('status', v_status, 'checklist', v_checklist);
END; $F$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_homologation_readiness_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_homologation_readiness_v2() TO authenticated;

COMMIT;

-- =====================================================================
-- Notas:
-- * ÚNICA transação (um BEGIN, um COMMIT).
-- * NÃO altera `rpc_fiscal_homologation_readiness()` (v2 aditiva).
-- * NÃO referencia `homologation_readiness_snapshot`.
-- * NÃO altera production_enabled/providers/RLS.
-- =====================================================================
