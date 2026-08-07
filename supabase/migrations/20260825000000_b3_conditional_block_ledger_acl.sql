-- ============================================================================
-- B3 — BLOQUEIO SERVER-SIDE DE APROVACAO DE CANDIDATO NCM CONDICIONAL
--      + HARDENING DE ACL/RLS DO fiscal_matrix_load_ledger
--
-- Correcao do bloqueio B3 da auditoria final independente da Matriz Fiscal
-- Mestre v1 (commit 4d696bd8).
--
-- Escopo: staging ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk PROIBIDA.
-- Propriedades: fail-closed, transacional, idempotente, reversivel
--               (restoration/matriz-fiscal-microrganismos/91-rollback-b3.sql).
--
-- NAO altera dados: nenhum candidato, dossie, perfil ou checklist e promovido,
-- rebaixado ou tocado por esta migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 0 - TRAVA DE AMBIENTE FAIL-CLOSED (staging ikaauvsflpmamgxmkhoq)
-- Identica a de 20260824000000: recusa producao e recusa qualquer ambiente que
-- nao comprove ser o staging autorizado. Ausencia de prova = ABORTA.
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE
  v_ref    text := nullif(btrim(coalesce(current_setting('app.settings.project_ref', true), '')), '');
  v_marked boolean := false;
BEGIN
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT: producao navfzbwgwzruipouyfnk PROIBIDA para esta migration'
      USING ERRCODE = '42501';
  END IF;

  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ABORT (fail-closed): public._fiscal_staging_marker ausente — ambiente nao comprovado como staging ikaauvsflpmamgxmkhoq'
      USING ERRCODE = '42501';
  END IF;

  EXECUTE $q$
    SELECT EXISTS (
      SELECT 1 FROM public._fiscal_staging_marker
      WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq'
    )
  $q$ INTO v_marked;

  IF NOT v_marked THEN
    RAISE EXCEPTION 'ABORT (fail-closed): marcador STAGING/ikaauvsflpmamgxmkhoq ausente — migration recusada'
      USING ERRCODE = '42501';
  END IF;

  EXECUTE $q$
    SELECT EXISTS (
      SELECT 1 FROM public._fiscal_staging_marker
      WHERE project_ref = 'navfzbwgwzruipouyfnk'
    )
  $q$ INTO v_marked;

  IF v_marked THEN
    RAISE EXCEPTION 'ABORT (fail-closed): marcador de producao presente — migration recusada'
      USING ERRCODE = '42501';
  END IF;
END
$guard$;

-- ----------------------------------------------------------------------------
-- PARTE 1 - rpc_regulatory_ncm_candidate_decide
-- Assinatura, SECURITY DEFINER, search_path, locks, checks e comportamento
-- preservados. Unica mudanca: no ramo de APROVACAO, confianca CONDITIONAL e
-- recusada com codigo estavel REGULATORY_NCM_CONDITIONAL_BLOCKED.
-- Rejeicao (p_approve = false) segue funcionando normalmente.
-- ----------------------------------------------------------------------------
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
    -- B3: confianca condicional NAO pode ser aprovada. Exige reclassificacao
    -- explicita (HIGH/MEDIUM/LOW) por rpc_regulatory_ncm_candidate_add ou
    -- decisao tecnica registrada antes da aprovacao fiscal.
    IF upper(btrim(coalesce(v_cand.confidence, ''))) = 'CONDITIONAL' THEN
      RAISE EXCEPTION 'REGULATORY_NCM_CONDITIONAL_BLOCKED'
        USING ERRCODE = '55006',
              HINT = 'Candidato com confianca CONDITIONAL: reclassifique com fundamentacao oficial antes de aprovar.';
    END IF;

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

-- Grants preservados exatamente como antes (nenhum acesso a PUBLIC/anon).
REVOKE ALL ON FUNCTION public.rpc_regulatory_ncm_candidate_decide(uuid, boolean, text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_regulatory_ncm_candidate_decide(uuid, boolean, text, text, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_regulatory_ncm_candidate_decide(uuid, boolean, text, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_regulatory_ncm_candidate_decide(uuid, boolean, text, text, text, date) TO service_role;

-- ----------------------------------------------------------------------------
-- PARTE 2 - CONSTRAINT DEFENSIVA
-- Mesmo por UPDATE direto (service_role / migration futura), um candidato
-- CONDITIONAL nao pode ficar em estado APPROVED.
-- ----------------------------------------------------------------------------
DO $constraint$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.microorganism_ncm_candidates
     WHERE status = 'APPROVED'
       AND upper(btrim(coalesce(confidence, ''))) = 'CONDITIONAL'
  ) THEN
    RAISE EXCEPTION 'ABORT: existem candidatos APPROVED com confianca CONDITIONAL — corrija os dados antes de aplicar a constraint'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.microorganism_ncm_candidates'::regclass
       AND conname = 'microorganism_ncm_candidates_conditional_not_approved'
  ) THEN
    ALTER TABLE public.microorganism_ncm_candidates
      ADD CONSTRAINT microorganism_ncm_candidates_conditional_not_approved
      CHECK (
        status <> 'APPROVED'
        OR upper(btrim(coalesce(confidence, ''))) <> 'CONDITIONAL'
      );
  END IF;
END
$constraint$;

-- ----------------------------------------------------------------------------
-- PARTE 3 - ACL/RLS DO fiscal_matrix_load_ledger
-- O ledger e trilha de proveniencia da carga: leitura restrita a administrador
-- (RLS ja existente) e escrita apenas por service_role / SECURITY DEFINER.
-- Remove privilegios diretos de anon e PUBLIC (defesa em profundidade).
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.fiscal_matrix_load_ledger FROM PUBLIC;
REVOKE ALL ON TABLE public.fiscal_matrix_load_ledger FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.fiscal_matrix_load_ledger FROM authenticated;
GRANT SELECT ON TABLE public.fiscal_matrix_load_ledger TO authenticated;
GRANT ALL ON TABLE public.fiscal_matrix_load_ledger TO service_role;

ALTER TABLE public.fiscal_matrix_load_ledger ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- PARTE 4 - INVARIANTES (qualquer violacao aborta tudo)
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE v_n int; v_txt text;
BEGIN
  SELECT count(*) INTO v_n FROM public.microorganism_ncm_candidates WHERE status <> 'PROPOSED';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ABORT: % candidato(s) fora de PROPOSED apos a migration', v_n USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_n FROM public.microorganism_fiscal_profiles WHERE accounting_validated_at IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ABORT: % perfil(is) com validacao contabil apos a migration', v_n USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_dossiers
   WHERE status <> 'DRAFT' AND deleted_at IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ABORT: % dossie(s) fora de DRAFT apos a migration', v_n USING ERRCODE = '23514';
  END IF;

  SELECT prosrc INTO v_txt FROM pg_proc WHERE proname = 'rpc_regulatory_ncm_candidate_decide';
  IF v_txt IS NULL OR position('REGULATORY_NCM_CONDITIONAL_BLOCKED' in v_txt) = 0 THEN
    RAISE EXCEPTION 'ABORT: guarda CONDITIONAL ausente na RPC' USING ERRCODE = '23514';
  END IF;

  IF has_table_privilege('anon', 'public.fiscal_matrix_load_ledger', 'SELECT') THEN
    RAISE EXCEPTION 'ABORT: anon ainda possui SELECT direto no ledger' USING ERRCODE = '42501';
  END IF;
END
$assert$;
