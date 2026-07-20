-- 1. Dropar função existente para evitar erro de tipo de retorno
DROP FUNCTION IF EXISTS public.rpc_liberar_recomendacao_produtor(uuid);

-- 2. Recriar rpc_liberar_recomendacao_produtor
CREATE OR REPLACE FUNCTION public.rpc_liberar_recomendacao_produtor(p_registro_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 AS $$
DECLARE
  v_solicitacao_id uuid;
  v_user_id uuid;
BEGIN
  -- Obter usuário atual
  v_user_id := auth.uid();

  -- 1. Obter solicitacao_id vinculada
  SELECT solicitacao_id INTO v_solicitacao_id
  FROM public.registros_consultor
  WHERE id = p_registro_id;

  -- 2. Atualizar status da visita
  UPDATE public.registros_consultor
  SET status = 'aprovado',
      updated_at = now()
  WHERE id = p_registro_id;

  -- 3. Se houver solicitação, atualizar status
  IF v_solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
    SET status = 'aguardando_decisao_produtor',
        updated_at = now()
    WHERE id = v_solicitacao_id;

    -- Registrar em solicitacoes_timeline
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES (v_solicitacao_id, 'recomendacao_liberada', 'Recomendação técnica liberada para decisão do produtor', v_user_id);
  END IF;

  -- 4. Registrar em registros_consultor_status_log
  INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_anterior, status_novo, usuario_id)
  VALUES (p_registro_id, 'finalizado', 'aprovado', v_user_id);

  -- 5. Registrar em visitas_logs (Corrigido colunas)
  INSERT INTO public.visitas_logs (registro_consultor_id, acao, descricao, usuario_id)
  VALUES (p_registro_id, 'recomendacao_liberada', 'Aprovação e liberação da recomendação técnica para o cliente', v_user_id);

  RETURN json_build_object('success', true, 'message', 'Recomendação liberada com sucesso e status sincronizados.');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', 'Erro ao liberar recomendação: ' || SQLERRM);
END;
$$;

-- 3. Corrigir vw_fluxo_visita_tecnica para evitar duplicidade
DROP VIEW IF EXISTS public.vw_fluxo_visita_tecnica;
CREATE OR REPLACE VIEW public.vw_fluxo_visita_tecnica AS
WITH latest_checkin AS (
    SELECT DISTINCT ON (COALESCE(registro_consultor_id, solicitacao_id))
        id, registro_consultor_id, solicitacao_id, data_hora_checkin, latitude, longitude
    FROM public.visitas_checkin
    ORDER BY COALESCE(registro_consultor_id, solicitacao_id), data_hora_checkin DESC
),
latest_aprovacao AS (
    SELECT DISTINCT ON (registro_consultor_id)
        id, registro_consultor_id, status_aprovacao, data_aprovacao, comentario_gestor
    FROM public.aprovacoes_tecnicas
    ORDER BY registro_consultor_id, data_aprovacao DESC
)
SELECT 
    rc.id AS visita_id,
    rc.codigo_visita,
    rc.status AS visita_status,
    rc.data_vistoria,
    rc.cliente_id,
    rc.fazenda_id,
    rc.talhao_id,
    rc.consultor_responsavel,
    rc.problema_principal,
    rc.urgencia,
    ps.id AS solicitacao_id,
    ps.numero_solicitacao,
    ps.status AS solicitacao_status,
    ps.tipo_demanda,
    lc.id AS checkin_id,
    lc.data_hora_checkin,
    la.status_aprovacao,
    la.data_aprovacao
FROM public.registros_consultor rc
LEFT JOIN public.portal_solicitacoes ps ON rc.solicitacao_id = ps.id
LEFT JOIN latest_checkin lc ON rc.id = lc.registro_consultor_id
LEFT JOIN latest_aprovacao la ON rc.id = la.registro_consultor_id;

GRANT SELECT ON public.vw_fluxo_visita_tecnica TO authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO service_role;

-- 4. Garantir índices de idempotência
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitas_checkin_client_uuid ON public.visitas_checkin (client_uuid) WHERE client_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_registros_consultor_arquivos_client_uuid ON public.registros_consultor_arquivos (client_uuid) WHERE client_uuid IS NOT NULL;
