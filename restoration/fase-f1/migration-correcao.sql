-- =====================================================================
-- FASE F1 — CORREÇÃO CONSOLIDADA PÓS-AUDITORIA INDEPENDENTE
-- Base: commit 78bfa61d0487b24c8eda6d90b6b0a544c088124d
-- Corrige, de forma forward-only e idempotente, os achados da auditoria
-- sobre 20260812000000_fase_f1_hardening_fiscal_quarentena.sql:
--   1. Quarentena por UUID fixo    -> predicado semântico estrito e auditável
--   2. Quarentena invisível no RPC -> escolha determinística com diagnóstico
--   3. Pós-check com contagens absolutas -> tratado em restoration/fase-f1
--   4. Corpo compartilhado de fiscal_audit_trigger() reescrito
--        -> restaurado à definição pré-F1; auditoria de
--           microorganism_fiscal_profiles movida para função dedicada
--   5. Alegação de "evidência documental" inexistente
--        -> código renomeado + pendência REGULATORY_EVIDENCE_NOT_IMPLEMENTED
--
-- Ambientes autorizados: STAGING/ikaauvsflpmamgxmkhoq
--                        PRODUCTION/navfzbwgwzruipouyfnk (promoção futura)
-- Zero DELETE. Não preenche NCM/CEST/CFOP/CST/CSOSN/alíquotas.
-- Não altera pedidos, snapshots, recebíveis ou documentos históricos.
-- Não restaura privilégios de anon/PUBLIC revogados na F1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- GUARD FAIL-CLOSED DE AMBIENTE
-- ---------------------------------------------------------------------
DO $guard$
DECLARE
  v_count int;
  v_marker text;
  v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: public._fiscal_staging_marker ausente';
  END IF;

  EXECUTE 'SELECT count(*) FROM public._fiscal_staging_marker' INTO v_count;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador de ambiente com % linhas (esperado exatamente 1)', v_count;
  END IF;

  EXECUTE 'SELECT marker, project_ref FROM public._fiscal_staging_marker'
    INTO v_marker, v_ref;

  IF v_marker IS NULL OR v_ref IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marker/project_ref NULL nao e ambiente autorizado';
  END IF;

  IF NOT (
       (v_marker = 'STAGING'    AND v_ref = 'ikaauvsflpmamgxmkhoq')
    OR (v_marker = 'PRODUCTION' AND v_ref = 'navfzbwgwzruipouyfnk')
  ) THEN
    RAISE EXCEPTION 'GUARD_ABORT: par (marker, project_ref) nao autorizado';
  END IF;

  IF to_regclass('public.microorganism_fiscal_profiles') IS NULL
     OR to_regclass('public.product_fiscal_profiles') IS NULL
     OR to_regclass('public.fiscal_audit_log') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: estruturas fiscais base ausentes';
  END IF;
END
$guard$;

-- =====================================================================
-- SEÇÃO 1 — AUDITORIA: RESTAURAR O CORPO COMPARTILHADO PRÉ-F1
-- A F1 reescreveu public.fiscal_audit_trigger() só para acrescentar
-- 'microorganism_fiscal_profiles' à allowlist, acoplando 8 triggers
-- fiscais preexistentes a uma mudança de escopo desta fase.
-- Correção: restaurar a definição exata anterior (migration
-- 20260721010000_fiscal_fase2_1_hardening.sql) e implementar a extensão
-- como função dedicada, sem reescrever o corpo compartilhado.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fiscal_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_allowed text[] := ARRAY[
    'company_fiscal_settings','product_fiscal_profiles','service_fiscal_profiles',
    'customer_fiscal_profiles','fiscal_invoices','fiscal_invoice_items',
    'fiscal_events','fiscal_idempotency_keys'
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
END; $$;

-- Extensão dedicada (não compartilhada) para perfis fiscais de microrganismos
CREATE OR REPLACE FUNCTION public.fiscal_audit_trigger_microorganism_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF TG_TABLE_NAME <> 'microorganism_fiscal_profiles' THEN
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
END; $$;

REVOKE ALL ON FUNCTION public.fiscal_audit_trigger_microorganism_profiles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_audit_trigger_microorganism_profiles() FROM anon;

DROP TRIGGER IF EXISTS trg_fiscal_audit_microorganism_fiscal_profiles
  ON public.microorganism_fiscal_profiles;
CREATE TRIGGER trg_fiscal_audit_microorganism_fiscal_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.microorganism_fiscal_profiles
FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger_microorganism_profiles();

-- =====================================================================
-- SEÇÃO 2 — AVALIADOR CANÔNICO: SEPARAÇÃO TÉCNICA × REGULATÓRIA
-- Mesma assinatura (17 args) da F1: grants e dependências preservados.
--   * technical_ready = ausência de pendências TÉCNICAS (classificação)
--   * ready           = prontidão OPERACIONAL; permanece false enquanto
--                       a evidência regulatória (F2) não existir
--   * NCM_WITHOUT_EVIDENCE -> NCM_NOT_ACCOUNTING_REVIEWED
--     (accounting_validated_at é pré-requisito contábil preliminar, NÃO
--      evidência documental MAPA/rótulo/laudo — inexistente nesta fase)
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
  v_p jsonb := '[]'::jsonb;   -- pendências técnicas
  v_reg jsonb;                -- pendências regulatórias (F2)
  v_notes text := lower(coalesce(p_accounting_notes, ''));
  v_synthetic boolean;
  v_technical_ready boolean;
  v_has_cst boolean := nullif(btrim(coalesce(p_icms_cst,'')),'') IS NOT NULL;
  v_has_csosn boolean := nullif(btrim(coalesce(p_icms_csosn,'')),'') IS NOT NULL;
BEGIN
  -- Pendência regulatória estrutural: registro MAPA/SIPEAGRO, rótulo e laudo
  -- ainda não são modelados no schema. Sempre emitida; mantém ready = false.
  v_reg := jsonb_build_array(jsonb_build_object(
    'code','REGULATORY_EVIDENCE_NOT_IMPLEMENTED','field','(schema)','layer','REGULATORY',
    'message','Evidencia regulatoria (MAPA/SIPEAGRO, rotulo, laudo) ainda nao modelada; prevista para a Fase F2.'));

  IF p_profile_status IS NULL THEN
    RETURN jsonb_build_object(
      'scope', p_scope, 'ready', false, 'technical_ready', false,
      'status', 'NOT_READY', 'quarantined', false, 'profile_present', false,
      'pendencies', jsonb_build_array(jsonb_build_object(
        'code','PROFILE_MISSING','field','profile_status','layer','TECHNICAL',
        'message','Item sem perfil fiscal cadastrado.')) || v_reg);
  END IF;

  v_synthetic := v_notes LIKE '%sintetic%'
              OR v_notes LIKE '%sintétic%'
              OR v_notes LIKE '%homologacao%'
              OR v_notes LIKE '%homologação%'
              OR v_notes LIKE '%hml-b2b%'
              OR v_notes LIKE '%test_only%'
              OR v_notes LIKE '%quarentena%';

  IF coalesce(p_is_active, false) IS NOT TRUE THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_INACTIVE','field','is_active','layer','TECHNICAL',
      'message','Perfil fiscal inativo.'));
  END IF;

  IF p_profile_status = 'BLOCKED' THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_QUARANTINED','field','profile_status','layer','TECHNICAL',
      'message','Perfil fiscal em quarentena (BLOCKED).'));
  ELSIF p_profile_status <> 'VALIDATED' THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_NOT_PUBLISHED','field','profile_status','layer','TECHNICAL',
      'message','Perfil fiscal nao publicado (exigido VALIDATED).'));
  END IF;

  IF p_accounting_validated_at IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','ACCOUNTING_NOT_VALIDATED','field','accounting_validated_at','layer','TECHNICAL',
      'message','Sem validacao contabil preliminar registrada.'));
  END IF;

  IF v_synthetic THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_SYNTHETIC','field','accounting_notes','layer','TECHNICAL',
      'message','Classificacao sintetica de homologacao; nao utilizavel em faturamento.'));
  END IF;

  IF nullif(btrim(coalesce(p_fiscal_description,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_FISCAL_DESCRIPTION','field','fiscal_description','layer','TECHNICAL','message','Descricao fiscal ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_commercial_unit,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_COMMERCIAL_UNIT','field','commercial_unit','layer','TECHNICAL','message','Unidade comercial ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_taxable_unit,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_TAXABLE_UNIT','field','taxable_unit','layer','TECHNICAL','message','Unidade tributavel ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_ncm,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_NCM','field','ncm','layer','TECHNICAL','message','NCM ausente.'));
  ELSIF p_accounting_validated_at IS NULL OR v_synthetic THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','NCM_NOT_ACCOUNTING_REVIEWED','field','ncm','layer','TECHNICAL',
      'message','NCM sem revisao contabil preliminar (validacao contabil ausente ou perfil sintetico). Nao afirma nem substitui evidencia regulatoria.'));
  END IF;
  IF nullif(btrim(coalesce(p_origin_code,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_ORIGIN_CODE','field','origin_code','layer','TECHNICAL','message','Codigo de origem ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cfop_in_state,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_CFOP_IN_STATE','field','cfop_in_state','layer','TECHNICAL','message','CFOP interno ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cfop_interstate,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_CFOP_INTERSTATE','field','cfop_interstate','layer','TECHNICAL','message','CFOP interestadual ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_pis_cst,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_PIS_CST','field','pis_cst','layer','TECHNICAL','message','CST de PIS ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cofins_cst,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_COFINS_CST','field','cofins_cst','layer','TECHNICAL','message','CST de COFINS ausente.'));
  END IF;

  IF v_has_cst AND v_has_csosn THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','CST_AND_CSOSN_CONFLICT','field','icms_cst,icms_csosn','layer','TECHNICAL',
      'message','CST e CSOSN preenchidos simultaneamente; mutuamente exclusivos.'));
  END IF;

  IF nullif(btrim(coalesce(p_crt,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','TAX_REGIME_UNKNOWN','field','company_fiscal_settings.crt','layer','TECHNICAL',
      'message','CRT do emitente nao configurado.'));
  ELSIF p_crt = '3' THEN
    IF v_has_csosn THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CSOSN_NOT_ALLOWED_FOR_CRT3','field','icms_csosn','layer','TECHNICAL',
        'message','CSOSN e exclusivo do Simples Nacional; emitente em CRT 3 (Regime Normal).'));
    END IF;
    IF NOT v_has_cst THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CST_REQUIRED_FOR_CRT3','field','icms_cst','layer','TECHNICAL',
        'message','CST de ICMS obrigatorio para CRT 3.'));
    END IF;
  ELSIF p_crt IN ('1','2') THEN
    IF v_has_cst THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CST_NOT_ALLOWED_FOR_SIMPLES','field','icms_cst','layer','TECHNICAL',
        'message','CST de ICMS nao se aplica a emitente do Simples Nacional.'));
    END IF;
    IF NOT v_has_csosn THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CSOSN_REQUIRED_FOR_SIMPLES','field','icms_csosn','layer','TECHNICAL',
        'message','CSOSN obrigatorio para CRT 1/2.'));
    END IF;
  ELSE
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','TAX_REGIME_UNKNOWN','field','company_fiscal_settings.crt','layer','TECHNICAL',
      'message','CRT do emitente com valor nao reconhecido.'));
  END IF;

  v_technical_ready := (jsonb_array_length(v_p) = 0);

  RETURN jsonb_build_object(
    'scope', p_scope,
    'ready', false,                  -- prontidao operacional bloqueada ate a F2
    'technical_ready', v_technical_ready,
    'status', 'NOT_READY',
    'quarantined', (p_profile_status = 'BLOCKED') OR v_synthetic,
    'profile_present', true,
    'pendencies', v_p || v_reg);
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_fiscal_item_profile_gate_eval(text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_fiscal_item_profile_gate_eval(text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_item_profile_gate_eval(text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_item_profile_gate_eval(text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text) TO service_role;

-- =====================================================================
-- SEÇÃO 3 — VIEWS CANÔNICAS COM ESCOLHA DETERMINÍSTICA DE PERFIL
-- Regra documentada (1 linha por item, sem duplicidade):
--   1º perfil ATIVO e VALIDATED (vigente)
--   2º perfil ATIVO (não publicado)
--   3º perfil BLOCKED/sintético mais recente — SOMENTE DIAGNÓSTICO
--   4º qualquer outro mais recente
--   desempate: updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
-- Perfil escolhido nos níveis 3/4 nunca é tratado como pronto: o avaliador
-- emite PROFILE_INACTIVE + PROFILE_QUARANTINED/PROFILE_SYNTHETIC.
-- security_invoker preservado: a RLS das tabelas-base continua vigente.
-- =====================================================================

DROP VIEW IF EXISTS public.v_product_fiscal_readiness;
CREATE VIEW public.v_product_fiscal_readiness
WITH (security_invoker = true) AS
SELECT
  sel.product_id,
  sel.id                                    AS profile_id,
  sel.profile_status,
  sel.is_active                             AS profile_is_active,
  (g.gate->>'technical_ready')::boolean     AS minimally_classified,
  (sel.accounting_validated_at IS NOT NULL) AS accounting_validated,
  (g.gate->>'quarantined')::boolean         AS quarantined,
  (g.gate->>'ready')::boolean               AS fiscally_ready,
  g.gate->'pendencies'                      AS pendencies,
  g.gate                                    AS gate
FROM (
  SELECT DISTINCT ON (p.product_id) p.*
  FROM public.product_fiscal_profiles p
  ORDER BY p.product_id,
           (p.is_active AND p.profile_status::text = 'VALIDATED') DESC,
           p.is_active DESC,
           p.updated_at DESC NULLS LAST,
           p.created_at DESC NULLS LAST,
           p.id DESC
) sel
CROSS JOIN LATERAL (
  SELECT public.fn_fiscal_item_profile_gate_eval(
    'PRODUCT', public.fn_fiscal_company_crt(), sel.is_active, sel.profile_status::text,
    sel.accounting_validated_at, sel.accounting_notes, sel.fiscal_description,
    sel.commercial_unit, sel.taxable_unit, sel.ncm, sel.origin_code,
    sel.cfop_in_state, sel.cfop_interstate, sel.icms_cst, sel.icms_csosn,
    sel.pis_cst, sel.cofins_cst) AS gate
) g;

DROP VIEW IF EXISTS public.v_microorganism_fiscal_readiness;
CREATE VIEW public.v_microorganism_fiscal_readiness
WITH (security_invoker = true) AS
SELECT
  m.id        AS microorganism_id,
  m.codigo,
  m.nome,
  m.ativo,
  sel.id      AS profile_id,
  sel.profile_status,
  sel.is_active                             AS profile_is_active,
  (g.gate->>'ready')::boolean               AS fiscally_ready,
  (g.gate->>'technical_ready')::boolean     AS minimally_classified,
  (sel.accounting_validated_at IS NOT NULL) AS accounting_validated,
  (g.gate->>'quarantined')::boolean         AS quarantined,
  g.gate->'pendencies'                      AS pendencies,
  g.gate                                    AS gate
FROM public.microrganismos m
LEFT JOIN LATERAL (
  SELECT mfp.*
  FROM public.microorganism_fiscal_profiles mfp
  WHERE mfp.microorganism_id = m.id
  ORDER BY (mfp.is_active AND mfp.profile_status::text = 'VALIDATED') DESC,
           mfp.is_active DESC,
           mfp.updated_at DESC NULLS LAST,
           mfp.created_at DESC NULLS LAST,
           mfp.id DESC
  LIMIT 1
) sel ON true
CROSS JOIN LATERAL (
  SELECT public.fn_fiscal_item_profile_gate_eval(
    'MICROORGANISM', public.fn_fiscal_company_crt(), sel.is_active, sel.profile_status::text,
    sel.accounting_validated_at, sel.accounting_notes, sel.fiscal_description,
    sel.commercial_unit, sel.taxable_unit, sel.ncm, sel.origin_code,
    sel.cfop_in_state, sel.cfop_interstate, sel.icms_cst, sel.icms_csosn,
    sel.pis_cst, sel.cofins_cst) AS gate
) g;

REVOKE ALL ON public.v_product_fiscal_readiness FROM PUBLIC;
REVOKE ALL ON public.v_product_fiscal_readiness FROM anon;
REVOKE ALL ON public.v_microorganism_fiscal_readiness FROM PUBLIC;
REVOKE ALL ON public.v_microorganism_fiscal_readiness FROM anon;
GRANT SELECT ON public.v_product_fiscal_readiness TO authenticated, service_role;
GRANT SELECT ON public.v_microorganism_fiscal_readiness TO authenticated, service_role;

-- =====================================================================
-- SEÇÃO 4 — QUARENTENA POR PREDICADO SEMÂNTICO (SEM UUID FIXO)
-- Critério cumulativo e auditável; NUNCA por espécie, NCM ou identidade:
--   (a) perfil ainda ativo;
--   (b) não validado: profile_status <> 'VALIDATED' E accounting_validated_at IS NULL;
--   (c) marcador sintético inequívoco já existente em accounting_notes
--       ('hml-b2b', 'test_only', 'sintetic'/'sintétic', 'homologacao'/'homologação').
-- Perfis reais/validados são intocados. Zero DELETE.
-- =====================================================================

WITH alvo AS (
  SELECT id
  FROM public.microorganism_fiscal_profiles
  WHERE is_active = true
    AND profile_status::text <> 'VALIDATED'
    AND accounting_validated_at IS NULL
    AND (
         lower(coalesce(accounting_notes,'')) LIKE '%hml-b2b%'
      OR lower(coalesce(accounting_notes,'')) LIKE '%test_only%'
      OR lower(coalesce(accounting_notes,'')) LIKE '%sintetic%'
      OR lower(coalesce(accounting_notes,'')) LIKE '%sintétic%'
      OR lower(coalesce(accounting_notes,'')) LIKE '%homologacao%'
      OR lower(coalesce(accounting_notes,'')) LIKE '%homologação%'
    )
)
UPDATE public.microorganism_fiscal_profiles p
SET profile_status = 'BLOCKED',
    is_active = false,
    accounting_notes = CASE
      WHEN lower(coalesce(p.accounting_notes,'')) LIKE '%quarentena f1%' THEN p.accounting_notes
      ELSE coalesce(p.accounting_notes,'') ||
           ' | QUARENTENA F1: classificacao sintetica de homologacao detectada por predicado semantico; sem evidencia regulatoria e sem validacao contabil. Valores fiscais preservados para auditoria.'
    END,
    updated_at = now()
FROM alvo a
WHERE p.id = a.id;

WITH alvo AS (
  SELECT id
  FROM public.product_fiscal_profiles
  WHERE is_active = true
    AND profile_status::text <> 'VALIDATED'
    AND accounting_validated_at IS NULL
    AND (
         lower(coalesce(accounting_notes,'')) LIKE '%hml-b2b%'
      OR lower(coalesce(accounting_notes,'')) LIKE '%test_only%'
      OR lower(coalesce(accounting_notes,'')) LIKE '%sintetic%'
      OR lower(coalesce(accounting_notes,'')) LIKE '%sintétic%'
      OR lower(coalesce(accounting_notes,'')) LIKE '%homologacao%'
      OR lower(coalesce(accounting_notes,'')) LIKE '%homologação%'
    )
)
UPDATE public.product_fiscal_profiles p
SET profile_status = 'BLOCKED',
    is_active = false,
    accounting_notes = CASE
      WHEN lower(coalesce(p.accounting_notes,'')) LIKE '%quarentena f1%' THEN p.accounting_notes
      ELSE coalesce(p.accounting_notes,'') ||
           ' | QUARENTENA F1: classificacao sintetica de homologacao detectada por predicado semantico; sem evidencia regulatoria e sem validacao contabil. Valores fiscais preservados para auditoria.'
    END,
    updated_at = now()
FROM alvo a
WHERE p.id = a.id;

-- =====================================================================
-- SEÇÃO 5 — PÓS-CHECK EMBUTIDO FAIL-CLOSED (semântico, sem UUID)
-- =====================================================================
DO $post$
DECLARE
  v_n int;
  v_gate jsonb;
BEGIN
  -- 1) Nenhum perfil sintético permanece ativo
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM public.microorganism_fiscal_profiles
     WHERE is_active = true AND (lower(coalesce(accounting_notes,'')) LIKE '%hml-b2b%'
        OR lower(coalesce(accounting_notes,'')) LIKE '%test_only%'
        OR lower(coalesce(accounting_notes,'')) LIKE '%sintetic%'
        OR lower(coalesce(accounting_notes,'')) LIKE '%homologacao%')
    UNION ALL
    SELECT 1 FROM public.product_fiscal_profiles
     WHERE is_active = true AND (lower(coalesce(accounting_notes,'')) LIKE '%hml-b2b%'
        OR lower(coalesce(accounting_notes,'')) LIKE '%test_only%'
        OR lower(coalesce(accounting_notes,'')) LIKE '%sintetic%'
        OR lower(coalesce(accounting_notes,'')) LIKE '%homologacao%')
  ) s;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: % perfis sinteticos permanecem ativos', v_n;
  END IF;

  -- 2) Todo perfil marcado como quarentena está BLOCKED e inativo
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM public.microorganism_fiscal_profiles
     WHERE lower(coalesce(accounting_notes,'')) LIKE '%quarentena f1%'
       AND (profile_status::text <> 'BLOCKED' OR is_active IS TRUE)
    UNION ALL
    SELECT 1 FROM public.product_fiscal_profiles
     WHERE lower(coalesce(accounting_notes,'')) LIKE '%quarentena f1%'
       AND (profile_status::text <> 'BLOCKED' OR is_active IS TRUE)
  ) s;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: % perfis de quarentena sem estado BLOCKED/inativo', v_n;
  END IF;

  -- 3) O avaliador jamais declara prontidão operacional nesta fase
  v_gate := public.fn_fiscal_item_profile_gate_eval('PRODUCT','3',true,'VALIDATED',now(),
    'revisado','desc','L','L','38089299','0','5102','6102','00',NULL,'01','01');
  IF (v_gate->>'ready')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: gate declarou prontidao operacional sem evidencia regulatoria';
  END IF;
  IF (v_gate->>'technical_ready')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: gate tecnico rejeita perfil integralmente classificado: %', v_gate->'pendencies';
  END IF;
  IF NOT (v_gate->'pendencies' @> '[{"code":"REGULATORY_EVIDENCE_NOT_IMPLEMENTED"}]'::jsonb) THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: pendencia regulatoria ausente';
  END IF;

  -- 4) Quarentena visível no diagnóstico (não vira PROFILE_MISSING)
  SELECT count(*) INTO v_n
  FROM public.v_microorganism_fiscal_readiness
  WHERE quarantined IS TRUE
    AND pendencies @> '[{"code":"PROFILE_QUARANTINED"}]'::jsonb;
  IF v_n <> (SELECT count(DISTINCT microorganism_id) FROM public.microorganism_fiscal_profiles
              WHERE profile_status::text = 'BLOCKED') THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: quarentena de microrganismos nao exposta no diagnostico';
  END IF;

  SELECT count(*) INTO v_n
  FROM public.v_product_fiscal_readiness
  WHERE quarantined IS TRUE
    AND pendencies @> '[{"code":"PROFILE_QUARANTINED"}]'::jsonb;
  IF v_n <> (SELECT count(DISTINCT product_id) FROM public.product_fiscal_profiles
              WHERE profile_status::text = 'BLOCKED') THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: quarentena de produtos nao exposta no diagnostico';
  END IF;

  -- 5) Views sem duplicidade por item
  SELECT count(*) INTO v_n FROM (
    SELECT product_id FROM public.v_product_fiscal_readiness GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF v_n <> 0 THEN RAISE EXCEPTION 'POSTCHECK_FAIL: duplicidade em v_product_fiscal_readiness'; END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT microorganism_id FROM public.v_microorganism_fiscal_readiness GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF v_n <> 0 THEN RAISE EXCEPTION 'POSTCHECK_FAIL: duplicidade em v_microorganism_fiscal_readiness'; END IF;

  -- 6) Nenhum item fiscalmente pronto
  SELECT count(*) INTO v_n FROM public.v_microorganism_fiscal_readiness WHERE fiscally_ready IS TRUE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'POSTCHECK_FAIL: % microrganismos prontos', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.v_product_fiscal_readiness WHERE fiscally_ready IS TRUE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'POSTCHECK_FAIL: % produtos prontos', v_n; END IF;

  -- 7) Corpo compartilhado de auditoria restaurado
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='fiscal_audit_trigger')
     LIKE '%microorganism_fiscal_profiles%' THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: fiscal_audit_trigger() ainda contem escopo da F1';
  END IF;

  -- 8) Trigger dedicado ativo
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE c.relname = 'microorganism_fiscal_profiles'
      AND p.proname = 'fiscal_audit_trigger_microorganism_profiles'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: trigger dedicado de auditoria ausente';
  END IF;

  RAISE NOTICE 'F1_CORRECAO_PROMOVIVEL_OK';
END
$post$;
