-- =====================================================================
-- Fase corretiva H2 — soft delete auditável de financial_documents via RPC
-- SECURITY DEFINER. Aditiva, incremental sobre 20260729000000.
--
-- Motivação runtime (staging ikaauvsflpmamgxmkhoq, produção intocada):
-- após a divisão das policies (INSERT/UPDATE separados, DELETE=false,
-- REVOKE DELETE), o UPDATE direto de deleted_at/deleted_by/delete_reason
-- feito pelo cliente autenticado retorna SQLSTATE 42501 porque a policy
-- SELECT vigente oculta a linha após o soft delete (deleted_at IS NULL)
-- e o RETURNING/verificação de visibilidade falha. Reabrir SELECT sobre
-- documentos apagados exporia registros excluídos nas listagens normais
-- e reabrir DELETE reintroduziria o hard delete que acabamos de bloquear.
--
-- Solução: RPC SECURITY DEFINER auditável executada com privilégios do
-- owner, preservando RLS/GRANTs atuais. Cliente não pode informar
-- deleted_by/deleted_at; tudo é preenchido server-side.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_financial_document_soft_delete(
  p_document_id uuid,
  p_reason      text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_reason text;
  v_active boolean;
  v_rows   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'Documento inválido' USING ERRCODE = '22023';
  END IF;

  v_reason := btrim(coalesce(p_reason, ''));
  IF length(v_reason) = 0 THEN
    RAISE EXCEPTION 'Motivo da exclusão é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Motivo excede 500 caracteres' USING ERRCODE = '22023';
  END IF;

  -- Trava a linha para tornar a verificação/atualização atômica e evitar
  -- corrida entre duas chamadas simultâneas: sem FOR UPDATE ambas passariam
  -- no SELECT e a segunda faria UPDATE de 0 linhas retornando sucesso.
  SELECT (deleted_at IS NULL)
    INTO v_active
    FROM public.financial_documents
   WHERE id = p_document_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_active THEN
    RAISE EXCEPTION 'Documento já removido' USING ERRCODE = '40001';
  END IF;

  UPDATE public.financial_documents
     SET deleted_at   = now(),
         deleted_by   = v_uid,
         delete_reason = v_reason
   WHERE id = p_document_id
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    -- Salvaguarda dupla: se por qualquer motivo o UPDATE não afetou a linha
    -- travada, sinaliza conflito serializável em vez de sucesso silencioso.
    RAISE EXCEPTION 'Conflito concorrente ao remover documento' USING ERRCODE = '40001';
  END IF;

  RETURN p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_financial_document_soft_delete(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_financial_document_soft_delete(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_financial_document_soft_delete(uuid, text) TO authenticated;
