-- ============================================================================
-- ROLLBACK DO B3 (migration 20260825000000_b3_conditional_block_ledger_acl)
-- Uso: psql "$STAGING_DSN" -v ON_ERROR_STOP=1 --single-transaction -f 91-rollback-b3.sql
--
-- Reverte EXCLUSIVAMENTE o que o B3 introduziu:
--   1. a guarda CONDITIONAL na RPC de decisao (volta a versao anterior);
--   2. a constraint defensiva;
--   3. os revokes de ACL do ledger (restaura o estado anterior).
-- Nao toca em nenhum dado de candidatos, dossies, perfis ou checklists.
--
-- Escopo: staging ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk PROIBIDA.
-- ============================================================================

DO $guard$
DECLARE
  v_ref    text := nullif(btrim(coalesce(current_setting('app.settings.project_ref', true), '')), '');
  v_marked boolean := false;
BEGIN
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT: producao navfzbwgwzruipouyfnk PROIBIDA' USING ERRCODE = '42501';
  END IF;
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ABORT (fail-closed): marcador de staging ausente' USING ERRCODE = '42501';
  END IF;
  EXECUTE $q$
    SELECT EXISTS (SELECT 1 FROM public._fiscal_staging_marker
                    WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq')
  $q$ INTO v_marked;
  IF NOT v_marked THEN
    RAISE EXCEPTION 'ABORT (fail-closed): staging ikaauvsflpmamgxmkhoq nao comprovado' USING ERRCODE = '42501';
  END IF;
END
$guard$;

-- 1. Constraint defensiva.
ALTER TABLE public.microorganism_ncm_candidates
  DROP CONSTRAINT IF EXISTS microorganism_ncm_candidates_conditional_not_approved;

-- 2. RPC sem a guarda CONDITIONAL (estado anterior ao B3).
CREATE OR REPLACE FUNCTION public.rpc_regulatory_ncm_candidate_decide(
  p_candidate_id uuid,
  p_approve boolean,
  p_reason text,
  p_official_description text DEFAULT NULL::text,
  p_table_version text DEFAULT NULL::text,
  p_table_reference_date date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_cand public.microorganism_ncm_candidates; v_status text; v_row public.microorganism_ncm_candidates;
BEGIN
  IF NOT public.fn_regulatory_can_approve('FISCAL') THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_JUSTIFICATION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cand FROM public.microorganism_ncm_candidates
   WHERE id = p_candidate_id FOR UPDATE;
  IF v_cand.id IS NULL THEN RAISE EXCEPTION 'REGULATORY_CANDIDATE_NOT_FOUND' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('regulatory_dossier_ncm:' || v_cand.dossier_id::text, 0));

  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = v_cand.dossier_id FOR UPDATE;
  IF v_status NOT IN ('DRAFT', 'PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE = '55006';
  END IF;

  IF p_approve THEN
    IF v_cand.source_id IS NULL THEN
      RAISE EXCEPTION 'REGULATORY_NCM_OFFICIAL_SOURCE_REQUIRED'
        USING ERRCODE = '22023',
              HINT = 'URL avulsa nao basta: cadastre a fonte oficial em fiscal_official_sources.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fiscal_official_sources
                    WHERE id = v_cand.source_id AND is_active) THEN
      RAISE EXCEPTION 'REGULATORY_NCM_SOURCE_INACTIVE' USING ERRCODE = '22023';
    END IF;
    IF length(btrim(coalesce(p_official_description, ''))) < 10
       OR nullif(btrim(coalesce(p_table_version, '')), '') IS NULL
       OR p_table_reference_date IS NULL THEN
      RAISE EXCEPTION 'REGULATORY_NCM_OFFICIAL_DESCRIPTION_REQUIRED'
        USING ERRCODE = '22023',
              HINT = 'Informe a descricao oficial do NCM e a versao/data da tabela consultada.';
    END IF;
  END IF;

  UPDATE public.microorganism_ncm_candidates
     SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
         decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason,
         official_description = CASE WHEN p_approve THEN p_official_description ELSE official_description END,
         table_version = CASE WHEN p_approve THEN p_table_version ELSE table_version END,
         table_reference_date = CASE WHEN p_approve THEN p_table_reference_date ELSE table_reference_date END
   WHERE id = p_candidate_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END
$function$;

REVOKE ALL ON FUNCTION public.rpc_regulatory_ncm_candidate_decide(uuid, boolean, text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_regulatory_ncm_candidate_decide(uuid, boolean, text, text, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_regulatory_ncm_candidate_decide(uuid, boolean, text, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_regulatory_ncm_candidate_decide(uuid, boolean, text, text, text, date) TO service_role;

-- 3. ACL do ledger no estado anterior ao B3.
GRANT ALL ON TABLE public.fiscal_matrix_load_ledger TO anon;
GRANT ALL ON TABLE public.fiscal_matrix_load_ledger TO authenticated;
GRANT ALL ON TABLE public.fiscal_matrix_load_ledger TO service_role;
