-- =====================================================================
-- FASE F1 — ROLLBACK LÓGICO SEGURO
-- NÃO é migration. Executar manualmente apenas em staging, sob autorização.
-- ATENÇÃO: por decisão de segurança este rollback NÃO restaura os grants
-- ALL para anon/PUBLIC revogados no Bloco A (regressão de segurança).
-- Reverte: quarentena dos 3 perfis, views canônicas, gate e trigger.
-- =====================================================================

BEGIN;

DO $guard$
DECLARE v_marker text; v_ref text;
BEGIN
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: ambiente nao autorizado';
  END IF;
END $guard$;

-- 1) Desquarentena (restaura estado pré-F1 exato dos 3 perfis)
UPDATE public.microorganism_fiscal_profiles
SET profile_status = 'DRAFT',
    is_active = true,
    accounting_notes = 'Perfil sintetico de homologacao - sem validacao contabil'
WHERE id = '5b3817dd-9894-408f-b4f2-06bb57f6fb56'::uuid;

UPDATE public.product_fiscal_profiles
SET profile_status = 'DRAFT',
    is_active = true,
    accounting_notes = 'HML-B2B: parametrizacao sintetica de homologacao (test_only, sem validacao contabil).'
WHERE id IN ('e848af9d-1a10-4066-9d98-b03a49c284b8'::uuid,
             '4120a677-0d7f-46a6-aa6a-48b748b879ba'::uuid);

-- 2) Remove auditoria adicionada em microorganism_fiscal_profiles
DROP TRIGGER IF EXISTS trg_fiscal_audit_microorganism_fiscal_profiles
  ON public.microorganism_fiscal_profiles;

-- 3) Restaura as views canônicas anteriores
DROP VIEW IF EXISTS public.v_product_fiscal_readiness;
CREATE VIEW public.v_product_fiscal_readiness
WITH (security_invoker = true) AS
SELECT product_id,
       profile_status,
       ncm IS NOT NULL AND cfop_in_state IS NOT NULL AS minimally_classified,
       accounting_validated_at IS NOT NULL AS accounting_validated
FROM public.product_fiscal_profiles
WHERE is_active = true;

DROP VIEW IF EXISTS public.v_microorganism_fiscal_readiness;
CREATE VIEW public.v_microorganism_fiscal_readiness
WITH (security_invoker = true) AS
SELECT m.id AS microorganism_id,
       m.codigo,
       m.nome,
       m.ativo,
       mfp.id AS profile_id,
       mfp.profile_status,
       mfp.id IS NOT NULL AND mfp.is_active AND mfp.ncm IS NOT NULL
         AND mfp.origin_code IS NOT NULL AND mfp.cfop_in_state IS NOT NULL
         AND mfp.cfop_interstate IS NOT NULL
         AND (mfp.icms_cst IS NOT NULL OR mfp.icms_csosn IS NOT NULL) AS fiscally_ready
FROM public.microrganismos m
LEFT JOIN public.microorganism_fiscal_profiles mfp
  ON mfp.microorganism_id = m.id AND mfp.is_active = true;

GRANT SELECT ON public.v_product_fiscal_readiness TO authenticated, service_role;
GRANT SELECT ON public.v_microorganism_fiscal_readiness TO authenticated, service_role;

-- 4) Remove o gate canônico introduzido
DROP FUNCTION IF EXISTS public.rpc_fiscal_item_readiness(text,uuid);
DROP FUNCTION IF EXISTS public.fn_fiscal_item_profile_gate_eval(
  text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.fn_fiscal_company_crt();

-- 5) Remove o registro do ledger
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260812000000';

COMMIT;
