-- 1. Limpeza de duplicatas antes de criar o índice
-- Remove o lote mais novo em caso de duplicatas para a mesma programação
DELETE FROM public.lotes 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY programacao_id ORDER BY created_at DESC) as row_num
    FROM public.lotes
    WHERE programacao_id IS NOT NULL
  ) t WHERE t.row_num > 1
);

-- 2. Unicidade de lote por programação (evita duplicatas em racing conditions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lotes_programacao_id_unique ON public.lotes (programacao_id) WHERE (programacao_id IS NOT NULL);

-- 3. Função atômica para avanço de etapa
CREATE OR REPLACE FUNCTION public.fn_avancar_etapa_esteira(
  p_origem text,
  p_os_id uuid,
  p_programacao_id uuid,
  p_etapa_destino text,
  p_usuario_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os_atual record;
  v_programacao record;
  v_lote_id uuid;
  v_cq_aprovado boolean;
  v_etapa_anterior text;
  v_tabela text;
BEGIN
  -- Determinar tabela de origem
  IF p_origem = 'onfarm' THEN
    v_tabela := 'ordens_servico_onfarm';
  ELSE
    v_tabela := 'ordens_servico';
  END IF;

  -- 1. Lock na OS para evitar processamento paralelo
  EXECUTE format('SELECT * FROM %I WHERE id = $1 FOR UPDATE', v_tabela)
  INTO v_os_atual
  USING p_os_id;

  IF v_os_atual.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço não encontrada');
  END IF;

  v_etapa_anterior := v_os_atual.status;

  -- 2. Lock na Programação (se fornecida)
  IF p_programacao_id IS NOT NULL THEN
    SELECT * INTO v_programacao FROM programacao_producao WHERE id = p_programacao_id FOR UPDATE;
  END IF;

  -- 3. Validações de Regra de Negócio por Etapa
  CASE p_etapa_destino
    WHEN 'assumir_producao' THEN
      IF v_programacao.status = 'em_producao' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Esta demanda já está sendo produzida');
      END IF;
      
      UPDATE programacao_producao 
      SET status = 'em_producao', responsavel_id = p_usuario_id 
      WHERE id = p_programacao_id;

    WHEN 'enviar_cq' THEN
      SELECT id INTO v_lote_id FROM lotes WHERE programacao_id = p_programacao_id;
      IF v_lote_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Gere o lote antes de enviar para CQ');
      END IF;

    WHEN 'aprovar_cq' THEN
      SELECT id INTO v_lote_id FROM lotes WHERE programacao_id = p_programacao_id;
      UPDATE controle_qualidade SET resultado = 'aprovado' WHERE lote_id = v_lote_id;

    WHEN 'reprovar_cq' THEN
      SELECT id INTO v_lote_id FROM lotes WHERE programacao_id = p_programacao_id;
      UPDATE controle_qualidade SET resultado = 'reprovado' WHERE lote_id = v_lote_id;

    WHEN 'enviar_envase' THEN
      SELECT id INTO v_lote_id FROM lotes WHERE programacao_id = p_programacao_id;
      SELECT (resultado = 'aprovado') INTO v_cq_aprovado FROM controle_qualidade WHERE lote_id = v_lote_id ORDER BY created_at DESC LIMIT 1;
      
      IF NOT COALESCE(v_cq_aprovado, false) THEN
        RETURN jsonb_build_object('success', false, 'message', 'CQ precisa estar aprovado para enviar ao envase');
      END IF;

    WHEN 'concluir_envase' THEN
      SELECT id INTO v_lote_id FROM lotes WHERE programacao_id = p_programacao_id;
      IF NOT EXISTS (SELECT 1 FROM envase WHERE lote_id = v_lote_id) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Registre o envase antes de concluir esta etapa');
      END IF;

    ELSE
      -- Outras etapas genéricas ou customizadas
  END CASE;

  -- 4. Atualizar status na OS
  EXECUTE format('UPDATE %I SET status = $1 WHERE id = $2', v_tabela)
  USING p_etapa_destino, p_os_id;

  -- 5. Registrar Auditoria
  INSERT INTO laboratorio_esteira_eventos (
    origem_os, os_id, programacao_id, lote_id, etapa_anterior, etapa_nova, acao, usuario_id
  ) VALUES (
    p_origem, p_os_id, p_programacao_id, v_lote_id, v_etapa_anterior, p_etapa_destino, 'avanco_esteira_v2', p_usuario_id
  );

  RETURN jsonb_build_object('success', true, 'message', 'Etapa avançada com sucesso');
END;
$$;

-- Grant permissões para a função
GRANT EXECUTE ON FUNCTION public.fn_avancar_etapa_esteira(text, uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_avancar_etapa_esteira(text, uuid, uuid, text, uuid) TO service_role;
