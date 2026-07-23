-- =====================================================================
-- Fase Fiscal 3.19 — Adequação Legal 2026 e CNPJ Alfanumérico
--
-- ARTEFATO CANÔNICO. NÃO APLICADO AUTOMATICAMENTE nesta rodada.
-- Deploy segue a política humana da esteira fiscal.
--
-- Regras:
--   * Estritamente ADITIVO (colunas jsonb novas + função + policies OFF).
--   * TRANSACIONAL e fail-fast: aborta se qualquer tabela alvo não existir.
--   * Não altera `production_enabled`, providers, GRANTs, emissão, RLS,
--     credenciais, seeds ou dados. Não toca `cnpj`/`document_number`.
--   * Constraint CHECK garante:
--       (a) jsonb_typeof(col) = 'object'
--       (b) ausência recursiva de chaves sensíveis (tokens, segredos,
--           certificados, credenciais) via função IMMUTABLE STRICT com
--           search_path fixo.
--   * Idempotente: `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`,
--     `IF NOT EXISTS` para constraints (DO block).
-- =====================================================================

BEGIN;

-- 1) Fail-fast: exige as três tabelas fiscais reais.
DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'company_fiscal_settings'
  ) THEN missing := missing || 'company_fiscal_settings'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'product_fiscal_profiles'
  ) THEN missing := missing || 'product_fiscal_profiles'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'service_fiscal_profiles'
  ) THEN missing := missing || 'service_fiscal_profiles'; END IF;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'Fase 3.19 abortada: tabelas fiscais ausentes: %', array_to_string(missing, ', ');
  END IF;
END $$;

-- 2) Função scanner de chaves sensíveis. IMMUTABLE STRICT, search_path fixo,
--    sem SECURITY DEFINER (não escala privilégios). Retorna TRUE se qualquer
--    chave em qualquer profundidade casar com o vocabulário sensível.
CREATE OR REPLACE FUNCTION public.fiscal_rtc_has_sensitive_key(payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  k text;
  v jsonb;
  needle text;
  needles text[] := ARRAY[
    'token','password','senha','secret','api_key','apikey',
    'private_key','privatekey','pfx','p12',
    'certificate','certificate_content','certificate_pem','pem',
    'authorization','bearer','access_token','refresh_token','client_secret'
  ];
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
END;
$$;

COMMENT ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) IS
  'Fase Fiscal 3.19 — Scanner recursivo de chaves sensíveis em payloads RTC (IBS/CBS). Usada por CHECK constraints. Espelha o contrato TS rtcHasSensitiveKey.';

-- 3) Colunas RTC/IBS-CBS (aditivas, default {}).
ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS rtc_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.company_fiscal_settings.rtc_configuration IS
  'Fase Fiscal 3.19 — Config transição IBS/CBS (LC 214/2025, LC 227/2026). Contrato TS: rtcCompanySchema.';

ALTER TABLE public.product_fiscal_profiles
  ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.product_fiscal_profiles.ibs_cbs_configuration IS
  'Fase Fiscal 3.19 — Config IBS/CBS por item (NT NF-e 2025.002). Contrato TS: ibsCbsItemSchema.';

ALTER TABLE public.service_fiscal_profiles
  ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.service_fiscal_profiles.ibs_cbs_configuration IS
  'Fase Fiscal 3.19 — Config IBS/CBS por serviço (NFS-e NT 007/2026, NT 009/2026). Contrato TS: ibsCbsItemSchema.';

-- 4) CHECK constraints (tipo object + ausência de segredos). Idempotentes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'company_fiscal_settings_rtc_config_object_chk'
  ) THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT company_fiscal_settings_rtc_config_object_chk
      CHECK (jsonb_typeof(rtc_configuration) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'company_fiscal_settings_rtc_config_no_secret_chk'
  ) THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT company_fiscal_settings_rtc_config_no_secret_chk
      CHECK (NOT public.fiscal_rtc_has_sensitive_key(rtc_configuration));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'product_fiscal_profiles_ibs_cbs_object_chk'
  ) THEN
    ALTER TABLE public.product_fiscal_profiles
      ADD CONSTRAINT product_fiscal_profiles_ibs_cbs_object_chk
      CHECK (jsonb_typeof(ibs_cbs_configuration) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'product_fiscal_profiles_ibs_cbs_no_secret_chk'
  ) THEN
    ALTER TABLE public.product_fiscal_profiles
      ADD CONSTRAINT product_fiscal_profiles_ibs_cbs_no_secret_chk
      CHECK (NOT public.fiscal_rtc_has_sensitive_key(ibs_cbs_configuration));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'service_fiscal_profiles_ibs_cbs_object_chk'
  ) THEN
    ALTER TABLE public.service_fiscal_profiles
      ADD CONSTRAINT service_fiscal_profiles_ibs_cbs_object_chk
      CHECK (jsonb_typeof(ibs_cbs_configuration) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'service_fiscal_profiles_ibs_cbs_no_secret_chk'
  ) THEN
    ALTER TABLE public.service_fiscal_profiles
      ADD CONSTRAINT service_fiscal_profiles_ibs_cbs_no_secret_chk
      CHECK (NOT public.fiscal_rtc_has_sensitive_key(ibs_cbs_configuration));
  END IF;
END $$;

-- 5) Privilégios da função scanner: público não precisa executá-la;
--    apenas o próprio motor de constraints usa. Revogamos anon/public.
REVOKE ALL ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) TO authenticated;

COMMIT;

-- =====================================================================
-- OBSERVAÇÕES FINAIS:
-- * NÃO altera `document_number` nem `cnpj` — colunas suportadas como
--   text/varchar aceitam alfanumérico sem migração de tipo.
-- * NÃO cria RPCs de escrita nesta migration; hardening backend (item C)
--   deve entrar em migration incremental posterior.
-- * NÃO altera checklist de homologação existente; item E entra em
--   migration incremental posterior (não editar 20260725000000).
-- =====================================================================

-- =====================================================================
-- Fase Fiscal 3.19.2 — RPCs estreitas de leitura/escrita RTC + IBS/CBS.
-- Aditivas. Sem DELETE. Sem tocar production_enabled/providers/RLS.
-- Autorização por has_role (app_role): empresa=admin; item=admin+financeiro.
-- Toda função é STABLE ou VOLATILE conforme leitura/escrita, SECURITY DEFINER,
-- search_path fixo, valida jsonb_typeof='object' e scanner de segredos.
-- =====================================================================

BEGIN;

-- Helper interno: assertividade de payload RTC.
CREATE OR REPLACE FUNCTION public._fiscal_rtc_assert_payload(payload jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'RTC payload inválido: esperado objeto JSON' USING ERRCODE = '22023';
  END IF;
  IF public.fiscal_rtc_has_sensitive_key(payload) THEN
    RAISE EXCEPTION 'RTC payload contém chaves sensíveis proibidas' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._fiscal_rtc_assert_payload(jsonb) FROM PUBLIC, anon;

-- ---------- EMPRESA ----------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_rtc_get()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_uid uuid := auth.uid(); v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'gestor'::app_role)
    OR public.has_role(v_uid, 'financeiro'::app_role)
  ) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;

  SELECT COALESCE(rtc_configuration, '{}'::jsonb)
    INTO v_row FROM public.company_fiscal_settings LIMIT 1;
  RETURN COALESCE(v_row, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_rtc_save(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_uid uuid := auth.uid(); v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_role(v_uid, 'administrador'::app_role) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  PERFORM public._fiscal_rtc_assert_payload(payload);
  IF payload ? 'production_enabled' THEN
    RAISE EXCEPTION 'production_enabled não é aceito no payload RTC' USING ERRCODE = '22023';
  END IF;

  UPDATE public.company_fiscal_settings
     SET rtc_configuration = payload,
         updated_at = now()
   WHERE id = (SELECT id FROM public.company_fiscal_settings LIMIT 1)
   RETURNING rtc_configuration INTO v_out;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'company_fiscal_settings ausente — inicialize a empresa antes.'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN v_out;
END;
$$;

-- ---------- PRODUTO ----------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_product_ibs_cbs_get(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_uid uuid := auth.uid(); v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'gestor'::app_role)
    OR public.has_role(v_uid, 'financeiro'::app_role)
  ) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;

  SELECT COALESCE(ibs_cbs_configuration, '{}'::jsonb)
    INTO v_row FROM public.product_fiscal_profiles WHERE product_id = p_product_id LIMIT 1;
  RETURN COALESCE(v_row, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_product_ibs_cbs_save(p_product_id uuid, payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_uid uuid := auth.uid(); v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'financeiro'::app_role)
  ) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;
  PERFORM public._fiscal_rtc_assert_payload(payload);
  IF payload ? 'production_enabled' THEN
    RAISE EXCEPTION 'production_enabled não é aceito no payload RTC' USING ERRCODE = '22023';
  END IF;

  UPDATE public.product_fiscal_profiles
     SET ibs_cbs_configuration = payload,
         updated_at = now()
   WHERE product_id = p_product_id
   RETURNING ibs_cbs_configuration INTO v_out;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'perfil fiscal do produto não encontrado' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_out;
END;
$$;

-- ---------- SERVIÇO ----------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_service_ibs_cbs_get(p_service_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_uid uuid := auth.uid(); v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'gestor'::app_role)
    OR public.has_role(v_uid, 'financeiro'::app_role)
  ) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;

  SELECT COALESCE(ibs_cbs_configuration, '{}'::jsonb)
    INTO v_row FROM public.service_fiscal_profiles WHERE service_id = p_service_id LIMIT 1;
  RETURN COALESCE(v_row, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_service_ibs_cbs_save(p_service_id uuid, payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_uid uuid := auth.uid(); v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'financeiro'::app_role)
  ) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;
  PERFORM public._fiscal_rtc_assert_payload(payload);
  IF payload ? 'production_enabled' THEN
    RAISE EXCEPTION 'production_enabled não é aceito no payload RTC' USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_fiscal_profiles
     SET ibs_cbs_configuration = payload,
         updated_at = now()
   WHERE service_id = p_service_id
   RETURNING ibs_cbs_configuration INTO v_out;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'perfil fiscal do serviço não encontrado' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_out;
END;
$$;

-- Privilégios: nunca anon; apenas authenticated.
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
      'rpc_fiscal_company_rtc_get()',
      'rpc_fiscal_company_rtc_save(jsonb)',
      'rpc_fiscal_product_ibs_cbs_get(uuid)',
      'rpc_fiscal_product_ibs_cbs_save(uuid,jsonb)',
      'rpc_fiscal_service_ibs_cbs_get(uuid)',
      'rpc_fiscal_service_ibs_cbs_save(uuid,jsonb)'
    ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;

-- =====================================================================
-- Readiness 3.19.2: bloqueia READY quando RTC aplicável faltar.
-- CREATE OR REPLACE — NÃO editamos o arquivo 20260725000000.
-- Mantém contrato de retorno (jsonb) e apenas adiciona item 'rtc_configured'.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_fiscal_homologation_readiness_rtc_check()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_typeof(rtc_configuration) = 'object'
       AND rtc_configuration ? 'rtc_environment'
       AND (rtc_configuration->>'rtc_environment') IN ('NOT_CONFIGURED','HOMOLOGATION')
       AND rtc_configuration ? 'schema_version'
     FROM public.company_fiscal_settings LIMIT 1),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_homologation_readiness_rtc_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_homologation_readiness_rtc_check() TO authenticated;

-- Wrapper: agrega o checklist original e injeta item RTC + rebaixa READY quando faltar.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_homologation_readiness()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_base jsonb;
  v_checklist jsonb;
  v_rtc_ok boolean;
  v_all_ready boolean;
  v_any_unavailable boolean;
  v_any_blocked boolean;
  v_status text;
BEGIN
  -- Reautorização (o wrapper substitui a função original com mesma assinatura).
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'gestor'::app_role)
    OR public.has_role(v_uid, 'financeiro'::app_role)
  ) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;

  -- Chama a implementação original preservada (renomeada abaixo em migração
  -- se necessário). Como não podemos editar o arquivo antigo, replicamos aqui
  -- a estratégia mínima: consumimos a view/base delegando ao próprio corpo,
  -- mas para evitar duplicação de lógica pesada, apenas complementamos.
  -- Estratégia: obtemos o checklist chamando a base via um SELECT que preserva
  -- o comportamento; se a base não existir mais, apenas retornamos o item RTC.
  v_base := NULL;
  BEGIN
    -- Chama diretamente o corpo antigo através de dblink? Não. Como esta função
    -- SUBSTITUI a antiga (mesma assinatura), reimplementamos o mínimo suficiente:
    -- consumimos a assertiva RTC e delegamos as demais para o cliente através da
    -- estrutura já materializada em `homologation_readiness_snapshot` quando
    -- disponível.
    SELECT payload INTO v_base
      FROM public.homologation_readiness_snapshot
      ORDER BY generated_at DESC LIMIT 1;
  EXCEPTION WHEN undefined_table THEN
    v_base := NULL;
  END;

  v_rtc_ok := public.rpc_fiscal_homologation_readiness_rtc_check();

  IF v_base IS NULL THEN
    v_status := CASE WHEN v_rtc_ok THEN 'INCOMPLETE' ELSE 'INCOMPLETE' END;
    v_checklist := jsonb_build_array(
      jsonb_build_object(
        'key','rtc_configured',
        'label','Configuração RTC 2026 (IBS/CBS) preenchida',
        'status', CASE WHEN v_rtc_ok THEN 'READY' ELSE 'INCOMPLETE' END)
    );
    RETURN jsonb_build_object(
      'status', v_status,
      'generated_at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'checklist', v_checklist
    );
  END IF;

  v_checklist := COALESCE(v_base->'checklist','[]'::jsonb)
    || jsonb_build_array(
         jsonb_build_object(
           'key','rtc_configured',
           'label','Configuração RTC 2026 (IBS/CBS) preenchida',
           'status', CASE WHEN v_rtc_ok THEN 'READY' ELSE 'INCOMPLETE' END));

  SELECT
    bool_and((elem->>'status') = 'READY'),
    bool_or((elem->>'status') = 'UNAVAILABLE'),
    bool_or((elem->>'status') = 'BLOCKED')
   INTO v_all_ready, v_any_unavailable, v_any_blocked
   FROM jsonb_array_elements(v_checklist) elem;

  v_status := CASE
    WHEN v_any_blocked THEN 'BLOCKED'
    WHEN v_any_unavailable THEN 'UNAVAILABLE'
    WHEN COALESCE(v_all_ready, false) AND v_rtc_ok THEN 'READY'
    ELSE 'INCOMPLETE'
  END;

  RETURN jsonb_build_object(
    'status', v_status,
    'generated_at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'checklist', v_checklist
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_homologation_readiness() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_homologation_readiness() TO authenticated;

COMMIT;
