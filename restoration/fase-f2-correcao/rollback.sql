-- =====================================================================
-- FASE F2 — ROLLBACK LÓGICO DA CORREÇÃO PÓS-AUDITORIA
-- Staging ikaauvsflpmamgxmkhoq.
--
-- Princípio: rollback NÃO apaga histórico válido. Dossiês, checklists,
-- apresentações, documentos, snapshots, trilha de auditoria e a fila de
-- limpeza permanecem intactos. As colunas acrescentadas continuam
-- existindo (nullable, sem default destrutivo); apenas as REGRAS novas
-- (constraints, triggers, policies e assinaturas de RPC) são desfeitas,
-- voltando ao comportamento do commit 9d6c63d9.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

-- 1) GTIN: remove validação de dígito verificador e auditoria de ausência
ALTER TABLE public.microorganism_regulatory_presentations
  DROP CONSTRAINT IF EXISTS mrp_gtin_checkdigit_chk;
ALTER TABLE public.microorganism_regulatory_presentations
  DROP CONSTRAINT IF EXISTS mrp_gtin_absent_reason_chk;
ALTER TABLE public.microorganism_regulatory_presentations
  DROP CONSTRAINT IF EXISTS mrp_gtin_mutual_chk;

-- 2) NCM: remove exigência de fonte oficial
ALTER TABLE public.microorganism_ncm_candidates
  DROP CONSTRAINT IF EXISTS mnc_source_required_chk;
ALTER TABLE public.microorganism_ncm_candidates
  DROP CONSTRAINT IF EXISTS mnc_approved_evidence_chk;
DROP TRIGGER IF EXISTS trg_regulatory_ncm_source_guard ON public.microorganism_ncm_candidates;
DROP TRIGGER IF EXISTS trg_regulatory_candidate_publication_guard ON public.microorganism_ncm_candidates;
DROP TRIGGER IF EXISTS trg_regulatory_published_candidate_guard ON public.microorganism_regulatory_dossiers;

-- 3) Segregação de funções
ALTER TABLE public.microorganism_regulatory_dossiers
  DROP CONSTRAINT IF EXISTS mrd_sod_override_chk;
DROP FUNCTION IF EXISTS public.rpc_regulatory_sod_override(uuid, text);

-- 4) Storage: volta às policies por papel do commit auditado
DROP POLICY IF EXISTS fiscal_regulatorio_read ON storage.objects;
DROP POLICY IF EXISTS fiscal_regulatorio_insert ON storage.objects;
DROP POLICY IF EXISTS fiscal_regulatorio_update ON storage.objects;
DROP POLICY IF EXISTS fiscal_regulatorio_delete ON storage.objects;

CREATE POLICY fiscal_regulatorio_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_can_read());
CREATE POLICY fiscal_regulatorio_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_can_prepare());
CREATE POLICY fiscal_regulatorio_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_can_prepare())
  WITH CHECK (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_can_prepare());
CREATE POLICY fiscal_regulatorio_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'fiscal-regulatorio' AND public.fn_regulatory_can_prepare());

-- 5) RPCs novos deixam de existir; os antigos são reinstalados pelo
--    arquivo original 20260814000000 (fonte de verdade da versão anterior).
DROP FUNCTION IF EXISTS public.rpc_regulatory_document_soft_delete(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_regulatory_storage_cleanup_confirm(uuid, boolean);
DROP FUNCTION IF EXISTS public.rpc_regulatory_ncm_candidate_decide(uuid, boolean, text, text, text, date);

-- 6) Helpers de storage (sem dependentes após o passo 4)
DROP FUNCTION IF EXISTS public.fn_regulatory_storage_can_delete(text);
DROP FUNCTION IF EXISTS public.fn_regulatory_storage_can_write(text);
DROP FUNCTION IF EXISTS public.fn_regulatory_storage_can_read(text);
DROP FUNCTION IF EXISTS public.fn_regulatory_storage_dossier_id(text);
DROP FUNCTION IF EXISTS public.fn_regulatory_storage_path_ok(text);
DROP FUNCTION IF EXISTS public.fn_regulatory_published_candidate_guard();
DROP FUNCTION IF EXISTS public.fn_regulatory_candidate_publication_guard();
DROP FUNCTION IF EXISTS public.fn_regulatory_ncm_source_guard();

-- fn_gtin_is_valid e fn_fiscal_official_url_allowlisted permanecem:
-- são utilitários puros, sem efeito colateral, e podem ser referenciados
-- por outros módulos fiscais. Removê-los seria destrutivo sem ganho.

-- 7) A fila de limpeza NÃO é removida: é trilha de auditoria.
--    Marcar como legado é suficiente.
COMMENT ON TABLE public.regulatory_storage_cleanup_queue IS
  'LEGADO (rollback F2-correcao): mantida por conter historico de auditoria.';

-- 8) Desmarca overrides ativos (regra revogada), preservando o registro
--    do ato em fiscal_audit_log.
UPDATE public.microorganism_regulatory_dossiers
   SET sod_override_active = false
 WHERE sod_override_active;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260815000000';

COMMIT;

-- Após este rollback, reaplique 20260814000000_fase_f2_regulatorio_microrganismos.sql
-- para restaurar as assinaturas originais de rpc_regulatory_review_decide,
-- rpc_regulatory_dossier_publish, rpc_regulatory_presentation_upsert,
-- rpc_regulatory_ncm_candidate_add e rpc_regulatory_document_register.
