-- =====================================================================
-- FASE F2 — ROLLBACK ATÔMICO
-- Remove exclusivamente as estruturas criadas pela Fase F2 e restaura o
-- gate canônico ao estado da Fase F1 (assinatura de 17 argumentos, com
-- REGULATORY_EVIDENCE_NOT_IMPLEMENTED), sem tocar em nada fora do escopo.
--
-- Uso:
--   psql "$STAGING_DSN" -v ON_ERROR_STOP=1 --single-transaction \
--        -f restoration/fase-f2/rollback.sql
-- =====================================================================
\set ON_ERROR_STOP on

BEGIN;

-- 1) View dependente do motor F2 volta ao formato F1
DROP VIEW IF EXISTS public.v_microorganism_fiscal_readiness;

-- 2) Funções de leitura/escrita da fase
DROP FUNCTION IF EXISTS public.rpc_regulatory_dossier_detail(uuid);
DROP FUNCTION IF EXISTS public.rpc_microorganism_regulatory_overview();
DROP FUNCTION IF EXISTS public.rpc_regulatory_dossier_block(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_regulatory_dossier_publish(uuid, date);
DROP FUNCTION IF EXISTS public.rpc_regulatory_review_decide(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_regulatory_dossier_submit(uuid);
DROP FUNCTION IF EXISTS public.rpc_regulatory_document_register(uuid, text, text, text, text, text, date, date, text, text, date, text);
DROP FUNCTION IF EXISTS public.rpc_regulatory_checklist_set(uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.rpc_regulatory_ncm_candidate_decide(uuid, text, text);
DROP FUNCTION IF EXISTS public.rpc_regulatory_ncm_candidate_add(uuid, text, text, text, text, text, date);
DROP FUNCTION IF EXISTS public.rpc_regulatory_presentation_upsert(uuid, jsonb);
DROP FUNCTION IF EXISTS public.rpc_regulatory_dossier_update_draft(uuid, jsonb);
DROP FUNCTION IF EXISTS public.rpc_regulatory_dossier_ensure_draft(uuid);
DROP FUNCTION IF EXISTS public.fn_microorganism_regulatory_facts(uuid);

-- 3) Gate canônico volta à assinatura da F1
DROP FUNCTION IF EXISTS public.fn_fiscal_item_profile_gate_eval(
  text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text,jsonb);

CREATE OR REPLACE FUNCTION public.fn_fiscal_item_profile_gate_eval(
  p_scope text, p_crt text, p_is_active boolean, p_profile_status text,
  p_accounting_validated_at timestamptz, p_accounting_notes text,
  p_fiscal_description text, p_commercial_unit text, p_taxable_unit text,
  p_ncm text, p_origin_code text, p_cfop_in_state text, p_cfop_interstate text,
  p_icms_cst text, p_icms_csosn text, p_pis_cst text, p_cofins_cst text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog','pg_temp'
AS $function$
DECLARE
  v_p jsonb := '[]'::jsonb;
  v_notes text := lower(coalesce(p_accounting_notes, ''));
  v_synthetic boolean;
  v_has_cst boolean := nullif(btrim(coalesce(p_icms_cst,'')),'') IS NOT NULL;
  v_has_csosn boolean := nullif(btrim(coalesce(p_icms_csosn,'')),'') IS NOT NULL;
BEGIN
  IF p_profile_status IS NULL THEN
    RETURN jsonb_build_object(
      'scope', p_scope, 'ready', false, 'status', 'NOT_READY',
      'quarantined', false, 'profile_present', false,
      'pendencies', jsonb_build_array(jsonb_build_object(
        'code','PROFILE_MISSING','field','profile_status','message','Item sem perfil fiscal cadastrado.')));
  END IF;

  v_synthetic := v_notes LIKE '%sintetic%' OR v_notes LIKE '%sintétic%'
              OR v_notes LIKE '%homologacao%' OR v_notes LIKE '%homologação%'
              OR v_notes LIKE '%hml-b2b%' OR v_notes LIKE '%test_only%'
              OR v_notes LIKE '%quarentena%';

  IF coalesce(p_is_active, false) IS NOT TRUE THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','PROFILE_INACTIVE','field','is_active','message','Perfil fiscal inativo.'));
  END IF;
  IF p_profile_status = 'BLOCKED' THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','PROFILE_QUARANTINED','field','profile_status','message','Perfil fiscal em quarentena (BLOCKED).'));
  ELSIF p_profile_status <> 'VALIDATED' THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','PROFILE_NOT_PUBLISHED','field','profile_status','message','Perfil fiscal nao publicado (exigido VALIDATED).'));
  END IF;
  IF p_accounting_validated_at IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','ACCOUNTING_NOT_VALIDATED','field','accounting_validated_at','message','Sem validacao contabil preliminar registrada.'));
  END IF;
  IF v_synthetic THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','PROFILE_SYNTHETIC','field','accounting_notes','message','Classificacao sintetica de homologacao; nao utilizavel em faturamento.'));
  END IF;
  IF nullif(btrim(coalesce(p_fiscal_description,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_FISCAL_DESCRIPTION','field','fiscal_description','message','Descricao fiscal ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_commercial_unit,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_COMMERCIAL_UNIT','field','commercial_unit','message','Unidade comercial ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_taxable_unit,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_TAXABLE_UNIT','field','taxable_unit','message','Unidade tributavel ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_ncm,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_NCM','field','ncm','message','NCM ausente.'));
  ELSIF p_accounting_validated_at IS NULL OR v_synthetic THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','NCM_NOT_ACCOUNTING_REVIEWED','field','ncm','message','NCM sem revisao contabil preliminar.'));
  END IF;
  IF nullif(btrim(coalesce(p_origin_code,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_ORIGIN_CODE','field','origin_code','message','Codigo de origem ausente.'));
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
  IF v_has_cst AND v_has_csosn THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','CST_AND_CSOSN_CONFLICT','field','icms_cst,icms_csosn','message','CST e CSOSN preenchidos simultaneamente.'));
  END IF;
  IF nullif(btrim(coalesce(p_crt,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','TAX_REGIME_UNKNOWN','field','company_fiscal_settings.crt','message','CRT do emitente nao configurado.'));
  ELSIF p_crt = '3' THEN
    IF v_has_csosn THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object('code','CSOSN_NOT_ALLOWED_FOR_CRT3','field','icms_csosn','message','CSOSN e exclusivo do Simples Nacional.'));
    END IF;
    IF NOT v_has_cst THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object('code','CST_REQUIRED_FOR_CRT3','field','icms_cst','message','CST de ICMS obrigatorio para CRT 3.'));
    END IF;
  ELSIF p_crt IN ('1','2') THEN
    IF v_has_cst THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object('code','CST_NOT_ALLOWED_FOR_SIMPLES','field','icms_cst','message','CST de ICMS nao se aplica ao Simples Nacional.'));
    END IF;
    IF NOT v_has_csosn THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object('code','CSOSN_REQUIRED_FOR_SIMPLES','field','icms_csosn','message','CSOSN obrigatorio para CRT 1/2.'));
    END IF;
  ELSE
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','TAX_REGIME_UNKNOWN','field','company_fiscal_settings.crt','message','CRT do emitente com valor nao reconhecido.'));
  END IF;

  IF p_scope = 'MICROORGANISM' THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','REGULATORY_EVIDENCE_NOT_IMPLEMENTED','field','regulatory',
      'message','Evidencia regulatoria do microrganismo ainda nao implementada.'));
  END IF;

  RETURN jsonb_build_object(
    'scope', p_scope,
    'ready', (jsonb_array_length(v_p) = 0),
    'status', CASE WHEN jsonb_array_length(v_p) = 0 THEN 'READY' ELSE 'NOT_READY' END,
    'quarantined', (p_profile_status = 'BLOCKED'),
    'profile_present', true,
    'pendencies', v_p);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_fiscal_item_profile_gate_eval(
  text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_item_profile_gate_eval(
  text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text)
  TO authenticated, service_role;

CREATE VIEW public.v_microorganism_fiscal_readiness
WITH (security_invoker = true) AS
SELECT
  m.id AS microorganism_id,
  m.codigo,
  m.nome,
  m.ativo,
  sel.id AS profile_id,
  sel.profile_status,
  sel.is_active AS profile_is_active,
  (g.gate ->> 'ready')::boolean AS fiscally_ready,
  (g.gate ->> 'ready')::boolean AS minimally_classified,
  sel.accounting_validated_at IS NOT NULL AS accounting_validated,
  (g.gate ->> 'quarantined')::boolean AS quarantined,
  g.gate -> 'pendencies' AS pendencies,
  g.gate
FROM public.microrganismos m
LEFT JOIN LATERAL (
  SELECT mfp.* FROM public.microorganism_fiscal_profiles mfp
  WHERE mfp.microorganism_id = m.id
  ORDER BY (mfp.is_active AND mfp.profile_status = 'VALIDATED') DESC,
           mfp.is_active DESC, mfp.updated_at DESC NULLS LAST,
           mfp.created_at DESC NULLS LAST, mfp.id DESC
  LIMIT 1) sel ON true
CROSS JOIN LATERAL (
  SELECT public.fn_fiscal_item_profile_gate_eval(
    'MICROORGANISM', public.fn_fiscal_company_crt(), sel.is_active, sel.profile_status,
    sel.accounting_validated_at, sel.accounting_notes, sel.fiscal_description,
    sel.commercial_unit, sel.taxable_unit, sel.ncm, sel.origin_code, sel.cfop_in_state,
    sel.cfop_interstate, sel.icms_cst, sel.icms_csosn, sel.pis_cst, sel.cofins_cst) AS gate) g;

REVOKE ALL ON public.v_microorganism_fiscal_readiness FROM PUBLIC, anon;
GRANT SELECT ON public.v_microorganism_fiscal_readiness TO authenticated, service_role;

-- 4) Triggers e tabelas da fase (ordem de dependência)
DROP TRIGGER IF EXISTS trg_regulatory_published_lock ON public.microorganism_regulatory_dossiers;
DROP FUNCTION IF EXISTS public.regulatory_block_published_edit();

DROP TABLE IF EXISTS public.microorganism_regulatory_publication_snapshots CASCADE;
DROP TABLE IF EXISTS public.microorganism_regulatory_checklist CASCADE;
DROP TABLE IF EXISTS public.microorganism_regulatory_documents CASCADE;
DROP TABLE IF EXISTS public.microorganism_ncm_candidates CASCADE;
DROP TABLE IF EXISTS public.microorganism_regulatory_presentations CASCADE;
DROP TABLE IF EXISTS public.microorganism_regulatory_dossiers CASCADE;
DROP TABLE IF EXISTS public.fiscal_official_sources CASCADE;

DROP FUNCTION IF EXISTS public.regulatory_audit_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.fn_regulatory_can_approve(text);
DROP FUNCTION IF EXISTS public.fn_regulatory_can_prepare();
DROP FUNCTION IF EXISTS public.fn_regulatory_can_read();

-- 5) Objetos de storage da fase (o bucket só é removido se estiver vazio)
DELETE FROM storage.objects WHERE bucket_id = 'fiscal-regulatorio';
DELETE FROM storage.buckets WHERE id = 'fiscal-regulatorio';

-- 6) Registro da migration no ledger
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260814000000';

COMMIT;
