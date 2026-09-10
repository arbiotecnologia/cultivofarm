-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260812000000_fase_f1_hardening_fiscal_quarentena.sql
-- SHA-256 orig: efa24a4bdab41d1fd652c968a19a5c4e7cca0129d10b23f88cf08a49d8844410
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-sql.py
-- Transformação: 1 bloco(s) DO de guarda removido(s); guarda canônica de promoção prefixada
--
-- A guarda de homologação foi REMOVIDA e substituída pela guarda canônica de
-- promoção. O runner valida o ref do alvo por canal externo (API/DSN) e só
-- então executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela
-- marcadora de homologação é consultada em produção.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- =====================================================================
-- FASE F1 — HARDENING FISCAL E QUARENTENA DE CLASSIFICAÇÕES SINTÉTICAS
-- Base auditada: f97d73553377c0fb6cdc7cdda81637de29afc895
--                docs/auditoria-fiscal-nfe-inventario-microrganismos.md
-- Ambientes autorizados: STAGING/ikaauvsflpmamgxmkhoq
--                        PRODUCTION/navfzbwgwzruipouyfnk (promoção futura)
-- Forward-only. Idempotente. Não preenche NCM/CEST/CFOP/CST/CSOSN/alíquotas.
-- Não altera pedidos, snapshots, recebíveis ou documentos históricos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- GUARD FAIL-CLOSED DE AMBIENTE (PROMOVIVEL)
-- ---------------------------------------------------------------------
-- [guarda de homologação removida pelo gerador de promoção]


-- =====================================================================
-- BLOCO A — MENOR PRIVILÉGIO EM TABELAS/VIEWS FISCAIS E DE MICRORGANISMOS
-- Todas as policies existentes nestas relações são TO authenticated;
-- nenhuma policy é TO anon/public, portanto a revogação abaixo não
-- reabre nem fecha caminho legítimo por OR.
-- =====================================================================

DO $priv$
DECLARE
  v_rel text;
  v_tables text[] := ARRAY[
    'microrganismos',
    'microorganism_fiscal_profiles',
    'microorganism_targets',
    'microorganism_technical_profiles',
    'microorganism_crop_recommendations',
    'fiscal_invoice_references',
    'fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  ];
  -- Tabelas com policy de escrita para authenticated (CRUD gated por has_role)
  v_write_tables text[] := ARRAY[
    'microrganismos',
    'microorganism_fiscal_profiles',
    'microorganism_targets',
    'microorganism_technical_profiles',
    'microorganism_crop_recommendations'
  ];
  -- Tabelas cujas policies só preveem SELECT + INSERT
  v_append_tables text[] := ARRAY[
    'fiscal_invoice_references',
    'fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  ];
BEGIN
  FOREACH v_rel IN ARRAY v_tables LOOP
    IF to_regclass('public.' || quote_ident(v_rel)) IS NULL THEN
      RAISE EXCEPTION 'F1_ABORT: relação public.% ausente', v_rel;
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v_rel);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_rel);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', v_rel);
    EXECUTE format('REVOKE ALL ON public.%I FROM service_role', v_rel);
  END LOOP;

  FOREACH v_rel IN ARRAY v_write_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', v_rel);
  END LOOP;

  FOREACH v_rel IN ARRAY v_append_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', v_rel);
  END LOOP;

  FOREACH v_rel IN ARRAY v_tables LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_rel);
  END LOOP;
END
$priv$;

-- Views de readiness que NÃO são redefinidas nesta migration
DO $vpriv$
DECLARE
  v_rel text;
  v_views text[] := ARRAY[
    'v_fiscal_company_readiness',
    'v_fiscal_certificate_readiness',
    'v_service_fiscal_readiness',
    'v_customer_fiscal_readiness'
  ];
BEGIN
  FOREACH v_rel IN ARRAY v_views LOOP
    IF to_regclass('public.' || quote_ident(v_rel)) IS NULL THEN
      RAISE EXCEPTION 'F1_ABORT: view public.% ausente', v_rel;
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v_rel);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_rel);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', v_rel);
    EXECUTE format('REVOKE ALL ON public.%I FROM service_role', v_rel);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_rel);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', v_rel);
  END LOOP;
END
$vpriv$;

-- =====================================================================
-- BLOCO C.1 — AVALIADOR CANÔNICO ÚNICO DE PRONTIDÃO FISCAL DE ITEM
-- Motor único: as views de readiness e o wrapper por id chamam ESTA função.
-- Não inventa defaults; ausência vira pendência estruturada.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_fiscal_item_profile_gate_eval(
  p_scope                   text,
  p_crt                     text,
  p_is_active               boolean,
  p_profile_status          text,
  p_accounting_validated_at timestamptz,
  p_accounting_notes        text,
  p_fiscal_description      text,
  p_commercial_unit         text,
  p_taxable_unit            text,
  p_ncm                     text,
  p_origin_code             text,
  p_cfop_in_state           text,
  p_cfop_interstate         text,
  p_icms_cst                text,
  p_icms_csosn              text,
  p_pis_cst                 text,
  p_cofins_cst              text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v_p jsonb := '[]'::jsonb;
  v_notes text := lower(coalesce(p_accounting_notes, ''));
  v_synthetic boolean;
  v_has_cst boolean := nullif(btrim(coalesce(p_icms_cst,'')),'') IS NOT NULL;
  v_has_csosn boolean := nullif(btrim(coalesce(p_icms_csosn,'')),'') IS NOT NULL;
BEGIN
  IF p_profile_status IS NULL THEN
    RETURN jsonb_build_object(
      'scope', p_scope, 'ready', false, 'status', 'NOT_READY', 'quarantined', false,
      'pendencies', jsonb_build_array(jsonb_build_object(
        'code','PROFILE_MISSING','field','profile_status',
        'message','Item sem perfil fiscal ativo cadastrado.')));
  END IF;

  v_synthetic := v_notes LIKE '%sintetic%'
              OR v_notes LIKE '%sintétic%'
              OR v_notes LIKE '%homologacao%'
              OR v_notes LIKE '%homologação%'
              OR v_notes LIKE '%hml%'
              OR v_notes LIKE '%test_only%'
              OR v_notes LIKE '%quarentena%';

  -- Publicação / vigência
  IF coalesce(p_is_active, false) IS NOT TRUE THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_INACTIVE','field','is_active',
      'message','Perfil fiscal inativo.'));
  END IF;

  IF p_profile_status = 'BLOCKED' THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_QUARANTINED','field','profile_status',
      'message','Perfil fiscal em quarentena (BLOCKED).'));
  ELSIF p_profile_status <> 'VALIDATED' THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_NOT_PUBLISHED','field','profile_status',
      'message','Perfil fiscal não publicado (exigido VALIDATED).'));
  END IF;

  IF p_accounting_validated_at IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','ACCOUNTING_NOT_VALIDATED','field','accounting_validated_at',
      'message','Sem validação contábil registrada.'));
  END IF;

  IF v_synthetic THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_SYNTHETIC','field','accounting_notes',
      'message','Classificação sintética de homologação; não utilizável em faturamento.'));
  END IF;

  -- Campos obrigatórios (sem defaults inventados)
  IF nullif(btrim(coalesce(p_fiscal_description,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_FISCAL_DESCRIPTION','field','fiscal_description','message','Descrição fiscal ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_commercial_unit,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_COMMERCIAL_UNIT','field','commercial_unit','message','Unidade comercial ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_taxable_unit,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_TAXABLE_UNIT','field','taxable_unit','message','Unidade tributável ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_ncm,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_NCM','field','ncm','message','NCM ausente.'));
  ELSIF p_accounting_validated_at IS NULL OR v_synthetic THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','NCM_WITHOUT_EVIDENCE','field','ncm','message','NCM sem evidência documental/revisão contábil.'));
  END IF;
  IF nullif(btrim(coalesce(p_origin_code,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_ORIGIN_CODE','field','origin_code','message','Código de origem ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cfop_in_state,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_CFOP_IN_STATE','field','cfop_in_state','message','CFOP interno ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cfop_interstate,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_CFOP_INTERSTATE','field','cfop_interstate','message','CFOP interestadual ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_pis_cst,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_PIS_CST','field','pis_cst','message','CST de PIS ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cofins_cst,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_COFINS_CST','field','cofins_cst','message','CST de COFINS ausente.'));
  END IF;

  -- Coerência tributária com o CRT do emitente
  IF v_has_cst AND v_has_csosn THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','CST_AND_CSOSN_CONFLICT','field','icms_cst,icms_csosn',
      'message','CST e CSOSN preenchidos simultaneamente; mutuamente exclusivos.'));
  END IF;

  IF nullif(btrim(coalesce(p_crt,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','TAX_REGIME_UNKNOWN','field','company_fiscal_settings.crt',
      'message','CRT do emitente não configurado.'));
  ELSIF p_crt = '3' THEN
    IF v_has_csosn THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CSOSN_NOT_ALLOWED_FOR_CRT3','field','icms_csosn',
        'message','CSOSN é exclusivo do Simples Nacional; emitente em CRT 3 (Regime Normal).'));
    END IF;
    IF NOT v_has_cst THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CST_REQUIRED_FOR_CRT3','field','icms_cst',
        'message','CST de ICMS obrigatório para CRT 3.'));
    END IF;
  ELSIF p_crt IN ('1','2') THEN
    IF v_has_cst THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CST_NOT_ALLOWED_FOR_SIMPLES','field','icms_cst',
        'message','CST de ICMS não se aplica a emitente do Simples Nacional.'));
    END IF;
    IF NOT v_has_csosn THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CSOSN_REQUIRED_FOR_SIMPLES','field','icms_csosn',
        'message','CSOSN obrigatório para CRT 1/2.'));
    END IF;
  ELSE
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','TAX_REGIME_UNKNOWN','field','company_fiscal_settings.crt',
      'message','CRT do emitente com valor não reconhecido.'));
  END IF;

  RETURN jsonb_build_object(
    'scope', p_scope,
    'ready', (jsonb_array_length(v_p) = 0),
    'status', CASE WHEN jsonb_array_length(v_p) = 0 THEN 'READY' ELSE 'NOT_READY' END,
    'quarantined', (p_profile_status = 'BLOCKED') OR v_synthetic,
    'pendencies', v_p);
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_fiscal_item_profile_gate_eval(text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_fiscal_item_profile_gate_eval(text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_item_profile_gate_eval(text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_item_profile_gate_eval(text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text) TO service_role;

-- CRT ativo do emitente (fonte única)
CREATE OR REPLACE FUNCTION public.fn_fiscal_company_crt()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT nullif(btrim(coalesce(crt,'')),'')
  FROM public.company_fiscal_settings
  WHERE is_active = true
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
$fn$;

REVOKE ALL ON FUNCTION public.fn_fiscal_company_crt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_fiscal_company_crt() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_company_crt() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_company_crt() TO service_role;

-- =====================================================================
-- BLOCO C.2 — VIEWS CANÔNICAS DE PRONTIDÃO PASSAM A USAR O AVALIADOR ÚNICO
-- =====================================================================

DROP VIEW IF EXISTS public.v_product_fiscal_readiness;
CREATE VIEW public.v_product_fiscal_readiness
WITH (security_invoker = true) AS
SELECT
  p.product_id,
  p.profile_status,
  (g.gate->>'ready')::boolean             AS minimally_classified,
  (p.accounting_validated_at IS NOT NULL) AS accounting_validated,
  (g.gate->>'quarantined')::boolean       AS quarantined,
  g.gate->'pendencies'                    AS pendencies,
  g.gate                                  AS gate
FROM public.product_fiscal_profiles p
CROSS JOIN LATERAL (
  SELECT public.fn_fiscal_item_profile_gate_eval(
    'PRODUCT', public.fn_fiscal_company_crt(), p.is_active, p.profile_status,
    p.accounting_validated_at, p.accounting_notes, p.fiscal_description,
    p.commercial_unit, p.taxable_unit, p.ncm, p.origin_code,
    p.cfop_in_state, p.cfop_interstate, p.icms_cst, p.icms_csosn,
    p.pis_cst, p.cofins_cst) AS gate
) g
WHERE p.is_active = true;

DROP VIEW IF EXISTS public.v_microorganism_fiscal_readiness;
CREATE VIEW public.v_microorganism_fiscal_readiness
WITH (security_invoker = true) AS
SELECT
  m.id        AS microorganism_id,
  m.codigo,
  m.nome,
  m.ativo,
  mfp.id      AS profile_id,
  mfp.profile_status,
  (g.gate->>'ready')::boolean               AS fiscally_ready,
  (g.gate->>'ready')::boolean               AS minimally_classified,
  (mfp.accounting_validated_at IS NOT NULL) AS accounting_validated,
  (g.gate->>'quarantined')::boolean         AS quarantined,
  g.gate->'pendencies'                      AS pendencies,
  g.gate                                    AS gate
FROM public.microrganismos m
LEFT JOIN public.microorganism_fiscal_profiles mfp
  ON mfp.microorganism_id = m.id AND mfp.is_active = true
CROSS JOIN LATERAL (
  SELECT public.fn_fiscal_item_profile_gate_eval(
    'MICROORGANISM', public.fn_fiscal_company_crt(), mfp.is_active, mfp.profile_status,
    mfp.accounting_validated_at, mfp.accounting_notes, mfp.fiscal_description,
    mfp.commercial_unit, mfp.taxable_unit, mfp.ncm, mfp.origin_code,
    mfp.cfop_in_state, mfp.cfop_interstate, mfp.icms_cst, mfp.icms_csosn,
    mfp.pis_cst, mfp.cofins_cst) AS gate
) g;

REVOKE ALL ON public.v_product_fiscal_readiness FROM PUBLIC;
REVOKE ALL ON public.v_product_fiscal_readiness FROM anon;
REVOKE ALL ON public.v_microorganism_fiscal_readiness FROM PUBLIC;
REVOKE ALL ON public.v_microorganism_fiscal_readiness FROM anon;
GRANT SELECT ON public.v_product_fiscal_readiness TO authenticated, service_role;
GRANT SELECT ON public.v_microorganism_fiscal_readiness TO authenticated, service_role;

-- =====================================================================
-- BLOCO C.3 — WRAPPER RPC POR ITEM (bloqueio estruturado, fail-closed)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_fiscal_item_readiness(
  p_scope text,
  p_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_res jsonb;
BEGIN
  IF v_uid IS NULL
     OR NOT (public.has_role(v_uid,'administrador'::app_role)
          OR public.has_role(v_uid,'gestor'::app_role)
          OR public.has_role(v_uid,'financeiro'::app_role)) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF p_scope = 'PRODUCT' THEN
    SELECT gate INTO v_res FROM public.v_product_fiscal_readiness
    WHERE product_id = p_item_id LIMIT 1;
  ELSIF p_scope = 'MICROORGANISM' THEN
    SELECT gate INTO v_res FROM public.v_microorganism_fiscal_readiness
    WHERE microorganism_id = p_item_id LIMIT 1;
  ELSE
    RAISE EXCEPTION 'FISCAL_INVALID_SCOPE' USING ERRCODE='22023';
  END IF;

  RETURN COALESCE(v_res, jsonb_build_object(
    'scope', p_scope, 'ready', false, 'status', 'NOT_READY', 'quarantined', false,
    'pendencies', jsonb_build_array(jsonb_build_object(
      'code','PROFILE_MISSING','field','profile_status',
      'message','Item sem perfil fiscal ativo cadastrado.'))));
END
$fn$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_item_readiness(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_item_readiness(text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_item_readiness(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_item_readiness(text,uuid) TO service_role;

-- =====================================================================
-- BLOCO B — AUDITORIA E QUARENTENA DOS PERFIS SINTÉTICOS
-- Sem DELETE. Valores fiscais originais permanecem na linha.
-- =====================================================================

-- B.1 Estende o mecanismo de auditoria EXISTENTE a microorganism_fiscal_profiles
CREATE OR REPLACE FUNCTION public.fiscal_audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_allowed text[] := ARRAY[
    'company_fiscal_settings','product_fiscal_profiles','service_fiscal_profiles',
    'customer_fiscal_profiles','fiscal_invoices','fiscal_invoice_items',
    'fiscal_events','fiscal_idempotency_keys','microorganism_fiscal_profiles'
  ];
BEGIN
  IF NOT (TG_TABLE_NAME = ANY(v_allowed)) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_actor,
            public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_actor,
            public.mask_sensitive_jsonb(to_jsonb(OLD)),
            public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_actor,
            public.mask_sensitive_jsonb(to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $function$;

DROP TRIGGER IF EXISTS trg_fiscal_audit_microorganism_fiscal_profiles
  ON public.microorganism_fiscal_profiles;
CREATE TRIGGER trg_fiscal_audit_microorganism_fiscal_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.microorganism_fiscal_profiles
FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();

-- B.2 Quarentena determinística dos perfis sintéticos identificados na auditoria.
-- Idempotente: só age em linhas ainda não quarentenadas.
UPDATE public.microorganism_fiscal_profiles
SET profile_status = 'BLOCKED',
    is_active = false,
    accounting_notes = left(
      'QUARENTENA F1 (' || to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') || '): '
      || 'classificacao sintetica de homologacao, sem laudo/rotulo/registro MAPA '
      || 'e sem validacao contabil. Nao publicada, nao apta e nao utilizavel em '
      || 'faturamento. Valores fiscais originais preservados na linha; old/new em '
      || 'public.fiscal_audit_log. | NOTA ORIGINAL: '
      || coalesce(accounting_notes,'(vazia)'), 4000)
WHERE id = '5b3817dd-9894-408f-b4f2-06bb57f6fb56'::uuid
  AND profile_status <> 'BLOCKED';

UPDATE public.product_fiscal_profiles
SET profile_status = 'BLOCKED',
    is_active = false,
    accounting_notes = left(
      'QUARENTENA F1 (' || to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') || '): '
      || 'classificacao sintetica de homologacao, sem laudo/rotulo/registro MAPA '
      || 'e sem validacao contabil. Nao publicada, nao apta e nao utilizavel em '
      || 'faturamento. Valores fiscais originais preservados na linha; old/new em '
      || 'public.fiscal_audit_log. | NOTA ORIGINAL: '
      || coalesce(accounting_notes,'(vazia)'), 4000)
WHERE id IN (
    'e848af9d-1a10-4066-9d98-b03a49c284b8'::uuid,
    '4120a677-0d7f-46a6-aa6a-48b748b879ba'::uuid)
  AND profile_status <> 'BLOCKED';

-- B.3 Pós-check fail-closed embutido
DO $post$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee IN ('anon','PUBLIC')
    AND table_name IN (
      'microrganismos','microorganism_fiscal_profiles','microorganism_targets',
      'microorganism_technical_profiles','microorganism_crop_recommendations',
      'fiscal_invoice_references','fiscal_invoice_item_references',
      'fiscal_stock_loss_contexts','v_fiscal_company_readiness',
      'v_fiscal_certificate_readiness','v_product_fiscal_readiness',
      'v_service_fiscal_readiness','v_customer_fiscal_readiness',
      'v_microorganism_fiscal_readiness');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'F1_ABORT: % grants residuais para anon/PUBLIC', v_bad;
  END IF;

  SELECT count(*) INTO v_bad FROM public.microorganism_fiscal_profiles
  WHERE id='5b3817dd-9894-408f-b4f2-06bb57f6fb56'::uuid
    AND (profile_status <> 'BLOCKED' OR is_active <> false);
  IF v_bad > 0 THEN RAISE EXCEPTION 'F1_ABORT: perfil sintetico de microrganismo nao quarentenado'; END IF;

  SELECT count(*) INTO v_bad FROM public.product_fiscal_profiles
  WHERE id IN ('e848af9d-1a10-4066-9d98-b03a49c284b8'::uuid,'4120a677-0d7f-46a6-aa6a-48b748b879ba'::uuid)
    AND (profile_status <> 'BLOCKED' OR is_active <> false);
  IF v_bad > 0 THEN RAISE EXCEPTION 'F1_ABORT: perfil sintetico de produto nao quarentenado'; END IF;

  RAISE NOTICE 'F1_HARDENING_FISCAL_OK';
END
$post$;
