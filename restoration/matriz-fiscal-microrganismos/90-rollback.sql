-- ============================================================================
-- MATRIZ FISCAL MESTRE v1.0 - ROLLBACK COMPLETO DO LOTE
-- Uso: psql "$STAGING_DSN" -v ON_ERROR_STOP=1 --single-transaction -f 90-rollback.sql
--
-- Remove EXCLUSIVAMENTE o que a carga criou (marcador MATRIZ_FISCAL_MESTRE_V1).
-- Nao toca em dossies/apresentacoes/checklists preexistentes (5 L / 20 L da Fase F2),
-- nem em pedidos, produtos ou configuracoes fiscais.
--
-- CORRECAO DA AUDITORIA (ressalva 2): regulatory_category so e revertida quando
-- public.fiscal_matrix_load_ledger comprova que o valor ATUAL foi escrito por este
-- lote. Qualquer alteracao posterior feita por humano/outro processo e preservada.
-- ============================================================================

DO $rollback$
DECLARE
  c_mark constant text := 'MATRIZ_FISCAL_MESTRE_V1';
  v_n    int;
BEGIN

  -- 1. Perfis fiscais criados pela carga.
  DELETE FROM public.microorganism_fiscal_profiles
   WHERE accounting_notes LIKE '%[' || c_mark || ']%';

  -- 2. Candidatos de NCM propostos pela carga.
  DELETE FROM public.microorganism_ncm_candidates
   WHERE justification LIKE '[' || c_mark || ']%';

  -- 3. Apresentacoes 1 L criadas pela carga.
  DELETE FROM public.microorganism_regulatory_presentations
   WHERE origin_note = c_mark;

  -- 4. Dossies criados pela carga (apenas os dos 3 microrganismos novos, ainda vazios).
  DELETE FROM public.microorganism_regulatory_checklist c
   USING public.microorganism_regulatory_dossiers d, public.microrganismos x
   WHERE c.dossier_id = d.id
     AND d.microorganism_id = x.id
     AND x.observacoes LIKE '%[' || c_mark || ']%'
     AND x.codigo IN ('BAC-1','BAC-12','BAC-17');

  DELETE FROM public.microorganism_regulatory_dossiers d
   USING public.microrganismos x
   WHERE d.microorganism_id = x.id
     AND x.observacoes LIKE '%[' || c_mark || ']%'
     AND x.codigo IN ('BAC-1','BAC-12','BAC-17');

  -- 5. Finalidade regulatoria gravada pela carga em dossies preexistentes.
  --    Removida apenas onde o dossie segue DRAFT e sem revisao/publicacao.
  UPDATE public.microorganism_regulatory_dossiers
     SET regulatory_category = NULL
   WHERE status = 'DRAFT'
     AND deleted_at IS NULL
     AND published_ncm IS NULL
     AND technical_review_status = 'PENDING'
     AND regulatory_review_status = 'PENDING'
     AND fiscal_review_status = 'PENDING'
     AND regulatory_category IS NOT NULL
     AND microorganism_id IN (
       SELECT id FROM public.microrganismos
        WHERE codigo IN ('BAC-2','BAC-3','BAC-4','BAC-5','BAC-6','BAC-7','BAC-9','BAC-10','BAC-11',
                         'BAC-14','BAC-15','FUN-1','FUN-2','FUN-5','FUN-6','FUN-7','FUN-8','FUN-9')
     );

  -- 6. Microrganismos criados pela conciliacao (somente se sem dependencias).
  DELETE FROM public.microrganismos x
   WHERE x.codigo IN ('BAC-1','BAC-12','BAC-17')
     AND x.observacoes LIKE '%[' || c_mark || ']%'
     AND NOT EXISTS (SELECT 1 FROM public.partner_order_items i WHERE i.microrganismo_id = x.id)
     AND NOT EXISTS (SELECT 1 FROM public.microorganism_regulatory_dossiers d WHERE d.microorganism_id = x.id);

  -- 7. Reativacao do residuo BAC-27 NAO e feita: manter desativado e o estado seguro.
  --    Para reverter manualmente:
  --    UPDATE public.microrganismos SET ativo = true, b2b_enabled = true WHERE codigo = 'BAC-27';

  SELECT count(*) INTO v_n
  FROM public.microorganism_fiscal_profiles
  WHERE accounting_notes LIKE '%[' || c_mark || ']%';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETO: % perfil(is) remanescente(s).', v_n USING ERRCODE = '55006';
  END IF;

  RAISE NOTICE 'MATRIZ_FISCAL_MESTRE_V1: rollback concluido.';
END
$rollback$;
