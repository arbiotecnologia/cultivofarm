-- ============================================================================
-- PREPARADO — NÃO APLICADO
--
-- Visita Técnica: registro atômico da recomendação no desfecho da visita e
-- guarda de faixa da % da área afetada.
--
-- Defeito estrutural observado na auditoria (frontend, src/pages/VisitaTecnica.tsx):
-- ao finalizar com "emitir recomendação", a tela executa em sequência e SEM
-- transação:
--   1) INSERT em registros_consultor_recomendacoes
--   2) UPDATE de status para 'enviado_aprovacao' OU 'aprovado'
--   3) INSERT em registros_consultor_status_log
--   4) notificações (RPCs)
-- Uma falha em (2)/(3) deixa recomendação gravada sem status coerente —
-- registro parcial. As RPCs abaixo colocam tudo numa transação única e
-- idempotente por `p_client_uuid`.
--
-- Também não há hoje restrição de servidor para `percentual_area_afetada`:
-- o limite 0–100 está apenas na interface.
--
-- Aplicar somente de forma coordenada (migration forward-only). Não trocar o
-- frontend antes da aplicação e da regeneração dos tipos.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Faixa 0–100 da área afetada validada no servidor.
--    NOT VALID evita varredura de histórico; validar depois em janela própria.
-- --------------------------------------------------------------------------
ALTER TABLE public.registros_consultor
  ADD CONSTRAINT registros_consultor_percentual_area_afetada_faixa
  CHECK (
    percentual_area_afetada IS NULL
    OR (percentual_area_afetada >= 0 AND percentual_area_afetada <= 100)
  ) NOT VALID;

-- --------------------------------------------------------------------------
-- 2. Registro atômico da recomendação + desfecho.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_registrar_recomendacao_visita_v1(
  p_registro_id uuid,
  p_itens jsonb,
  p_exigir_aprovacao boolean,
  p_liberar_ao_produtor boolean,
  p_observacoes_finais text DEFAULT NULL,
  p_client_uuid uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor%ROWTYPE;
  v_status_anterior text;
  v_status_novo text;
  v_qtd int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;

  IF p_exigir_aprovacao AND p_liberar_ao_produtor THEN
    RAISE EXCEPTION 'DESFECHO_AMBIGUO' USING ERRCODE = '22023';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'RECOMENDACAO_SEM_ITENS' USING ERRCODE = '22023';
  END IF;

  -- Gate de escopo já existente para visitas (mesma autoridade das demais RPCs).
  IF NOT public._visita_scope_ok(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_VISITA' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reg
  FROM public.registros_consultor
  WHERE id = p_registro_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISITA_NAO_ENCONTRADA' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotência: a mesma tentativa não grava a recomendação duas vezes.
  IF p_client_uuid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.registros_consultor_recomendacoes
    WHERE registro_consultor_id = p_registro_id AND client_uuid = p_client_uuid
  ) THEN
    RETURN jsonb_build_object('registro_id', p_registro_id, 'status', v_reg.status, 'idempotente', true);
  END IF;

  INSERT INTO public.registros_consultor_recomendacoes (
    registro_consultor_id,
    produto_biologico_sugerido_id,
    microrganismo_id,
    dose_recomendada_valor,
    dose_recomendada_unidade,
    modo_aplicacao,
    recomendacao_tecnica,
    observacoes_finais,
    client_uuid
  )
  SELECT
    p_registro_id,
    NULLIF(item->>'produto_id', '')::uuid,
    NULLIF(item->>'microrganismo_id', '')::uuid,
    NULLIF(item->>'dose_valor', '')::numeric,
    COALESCE(NULLIF(item->>'dose_unidade', ''), 'mL/ha'),
    NULLIF(item->>'modo_aplicacao', ''),
    COALESCE(item->>'recomendacao_tecnica', ''),
    p_observacoes_finais,
    p_client_uuid
  FROM jsonb_array_elements(p_itens) AS item;

  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  v_status_anterior := v_reg.status;
  v_status_novo := CASE
    WHEN p_exigir_aprovacao THEN 'enviado_aprovacao'
    WHEN p_liberar_ao_produtor THEN 'aprovado'
    ELSE v_reg.status
  END;

  IF v_status_novo IS DISTINCT FROM v_status_anterior THEN
    UPDATE public.registros_consultor
       SET status = v_status_novo::text,
           updated_at = now()
     WHERE id = p_registro_id;

    INSERT INTO public.registros_consultor_status_log (
      registro_consultor_id, status_anterior, status_novo, changed_by, motivo
    ) VALUES (
      p_registro_id,
      v_status_anterior,
      v_status_novo,
      v_uid,
      CASE WHEN p_exigir_aprovacao
           THEN 'Recomendação enviada para aprovação técnica'
           ELSE 'Liberação direta ao produtor (sem aprovação técnica)' END
    );
  END IF;

  RETURN jsonb_build_object(
    'registro_id', p_registro_id,
    'itens', v_qtd,
    'status', v_status_novo,
    'idempotente', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_registrar_recomendacao_visita_v1(uuid, jsonb, boolean, boolean, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_recomendacao_visita_v1(uuid, jsonb, boolean, boolean, text, uuid) TO authenticated, service_role;

COMMIT;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.rpc_registrar_recomendacao_visita_v1(uuid, jsonb, boolean, boolean, text, uuid);
-- ALTER TABLE public.registros_consultor DROP CONSTRAINT IF EXISTS registros_consultor_percentual_area_afetada_faixa;

-- Pré-requisitos a confirmar antes de aplicar (não verificados: banco não foi acessado):
--   * coluna `client_uuid` em registros_consultor_recomendacoes (criar se ausente);
--   * assinatura e semântica atuais de public._visita_scope_ok(uuid, uuid);
--   * enum/tipo do campo status em registros_consultor;
--   * valores existentes de percentual_area_afetada fora de 0–100 antes de VALIDATE.
