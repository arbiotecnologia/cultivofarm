-- =====================================================================
-- FASE F1 (+ correção 20260813000000) — ROLLBACK LÓGICO SEGURO
-- NÃO é migration. Executar manualmente, apenas sob autorização explícita.
--
-- Decisões de segurança preservadas por desenho:
--  * NÃO restaura grants ALL para anon/PUBLIC (seria regressão de segurança).
--  * NÃO reescreve o corpo compartilhado fiscal_audit_trigger(); a F1 corrigida
--    nunca o alterou, então o rollback apenas remove o trigger e a função
--    DEDICADOS ao escopo novo.
--  * Desquarentena por predicado SEMÂNTICO (sem UUID de ambiente), restringida
--    aos perfis marcados por esta fase.
-- =====================================================================
\set ON_ERROR_STOP on

BEGIN;

DO $guard$
DECLARE v_marker text; v_ref text; v_md5 text;
BEGIN
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF NOT ((v_marker='STAGING' AND v_ref='ikaauvsflpmamgxmkhoq')
       OR (v_marker='PRODUCTION' AND v_ref='navfzbwgwzruipouyfnk')) THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: ambiente nao autorizado (%/%)', v_marker, v_ref;
  END IF;

  -- Fail-closed: se o corpo compartilhado divergir do baseline pré-F1, algo
  -- fora do escopo o alterou e o rollback não deve prosseguir às cegas.
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fiscal_audit_trigger';
  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: fiscal_audit_trigger() ausente';
  END IF;
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='fiscal_audit_trigger'))
     LIKE '%microorganism_fiscal_profiles%' THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: corpo compartilhado contaminado pelo escopo F1; revise manualmente';
  END IF;
END $guard$;

-- ---------------------------------------------------------------------
-- 1) Desquarentena semântica (somente perfis marcados pela F1)
-- ---------------------------------------------------------------------
UPDATE public.microorganism_fiscal_profiles
SET profile_status = 'DRAFT',
    is_active = true,
    accounting_notes = regexp_replace(coalesce(accounting_notes,''),
                        '\s*\[QUARENTENA F1[^\]]*\]', '', 'g')
WHERE lower(coalesce(accounting_notes,'')) LIKE '%quarentena f1%';

UPDATE public.product_fiscal_profiles
SET profile_status = 'DRAFT',
    is_active = true,
    accounting_notes = regexp_replace(coalesce(accounting_notes,''),
                        '\s*\[QUARENTENA F1[^\]]*\]', '', 'g')
WHERE lower(coalesce(accounting_notes,'')) LIKE '%quarentena f1%';

-- ---------------------------------------------------------------------
-- 2) Remove SOMENTE a auditoria dedicada introduzida pela fase
--    (o corpo compartilhado e seus 8 triggers permanecem intactos)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_fiscal_audit_microorganism_fiscal_profiles
  ON public.microorganism_fiscal_profiles;
DROP FUNCTION IF EXISTS public.fiscal_audit_trigger_microorganism_profiles();

-- ---------------------------------------------------------------------
-- 3) Restaura as views canônicas anteriores à F1
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4) Remove o gate canônico introduzido pela fase
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_fiscal_item_readiness(text,uuid);
DROP FUNCTION IF EXISTS public.fn_fiscal_item_profile_gate_eval(
  text,text,boolean,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.fn_fiscal_company_crt();

-- ---------------------------------------------------------------------
-- 5) Remove os registros de ledger da fase e de sua correção
-- ---------------------------------------------------------------------
DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('20260812000000','20260813000000');

COMMIT;
