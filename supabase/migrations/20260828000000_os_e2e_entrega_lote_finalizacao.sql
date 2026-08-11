-- =====================================================================
-- FASE OS-E2E — correcao canonica do fluxo da OS (entrega/lote/finalizacao)
-- Somente STAGING ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk
-- e bloqueada por guarda fail-closed abaixo.
-- =====================================================================
DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT coalesce(current_setting('app.settings.project_ref', true), '') INTO v_ref;
  IF current_database() IS NULL THEN
    RAISE EXCEPTION 'OS_E2E_AMBIENTE_INDETERMINADO';
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'OS_E2E_PRODUCAO_BLOQUEADA';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.check_os_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  status_order text[] := ARRAY['aberta', 'aprovada', 'programada', 'em_producao', 'em_cq', 'envase', 'aguardando_reserva', 'pronto_entrega', 'entregue', 'finalizada'];
  old_idx int;
  new_idx int;
  cq_count int;
  v_lote_id uuid;
BEGIN
  -- Se o status não mudou, permite
  IF (OLD.status::text = NEW.status::text) THEN
    RETURN NEW;
  END IF;

  -- Se o novo status é 'cancelada', permite
  IF (NEW.status::text = 'cancelada') THEN
    RETURN NEW;
  END IF;

  -- Validação específica: Bloquear avanço para 'envase' se o CQ não estiver aprovado
  IF (NEW.status::text = 'envase') THEN
    -- Encontrar o lote associado a esta OS OnFarm
    -- A relação é OS -> Programação -> Lote
    SELECT l.id INTO v_lote_id
    FROM public.lotes l
    JOIN public.programacao_producao pp ON l.programacao_id = pp.id
    WHERE pp.ordem_servico_onfarm_id = NEW.id
    LIMIT 1;

    -- Se não encontrar por ordem_servico_onfarm_id, tenta pelo ordem_servico_id (caso seja OS padrão)
    IF v_lote_id IS NULL THEN
        SELECT l.id INTO v_lote_id
        FROM public.lotes l
        JOIN public.programacao_producao pp ON l.programacao_id = pp.id
        WHERE pp.ordem_servico_id = NEW.id
        LIMIT 1;
    END IF;

    IF v_lote_id IS NOT NULL THEN
        -- Verificar se existe controle de qualidade aprovado para este lote
        -- Assumindo que o enum de resultado do CQ possui 'aprovado'
        SELECT count(*) INTO cq_count
        FROM public.controle_qualidade
        WHERE lote_id = v_lote_id AND resultado::text = 'aprovado';

        IF cq_count = 0 THEN
            RAISE EXCEPTION 'Não é possível avançar para ENVASE: O lote vinculado a esta Ordem de Serviço ainda não possui um laudo de Controle de Qualidade APROVADO.'
            USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        -- Se não há lote/programação, mas tentou ir para envase, pode ser inconsistência de dados
        -- Mas se o fluxo operacional permite envase sem lote em casos raros, poderíamos ignorar.
        -- Para garantir segurança, vamos exigir o lote se estiver na fase de produção.
        RAISE EXCEPTION 'Não é possível avançar para ENVASE: Nenhum lote de produção foi localizado para esta Ordem de Serviço.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Encontra os índices na esteira
  SELECT i INTO old_idx FROM unnest(status_order) WITH ORDINALITY AS t(val, i) WHERE val = OLD.status::text;
  SELECT i INTO new_idx FROM unnest(status_order) WITH ORDINALITY AS t(val, i) WHERE val = NEW.status::text;

  -- Validações:
  -- 1. Se o status antigo ou novo não estão na lista (e não é cancelamento), lança erro
  IF old_idx IS NULL OR new_idx IS NULL THEN
    RAISE EXCEPTION 'Status inválido ou transição não permitida para o fluxo operacional.';
  END IF;

  -- 2. Permite apenas avançar 1 posição por vez
  IF new_idx <> old_idx + 1
     AND NOT (new_idx = old_idx + 2 AND status_order[old_idx + 1] = 'aguardando_reserva') THEN
    RAISE EXCEPTION 'Transição de status inválida na esteira de produção: % -> %. A próxima etapa obrigatória é %.', 
      OLD.status::text, NEW.status::text, status_order[old_idx + 1];
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public._avancar_os_status(p_origem text, p_os_id uuid, p_alvo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    status_order TEXT[] := ARRAY['aberta','aprovada','programada','em_producao','em_cq','envase','aguardando_reserva','pronto_entrega','entregue','finalizada'];
    v_atual TEXT;
    v_idx_atual INT;
    v_idx_alvo INT;
    v_proximo TEXT;
    v_use_manual BOOLEAN;
BEGIN
    v_use_manual := p_origem IN ('manual','b2b');

    IF v_use_manual THEN
        SELECT status::text INTO v_atual FROM public.ordens_servico WHERE id = p_os_id;
    ELSE
        SELECT status::text INTO v_atual FROM public.ordens_servico_onfarm WHERE id = p_os_id;
    END IF;

    SELECT i INTO v_idx_atual FROM unnest(status_order) WITH ORDINALITY AS t(val,i) WHERE val = v_atual;
    SELECT i INTO v_idx_alvo FROM unnest(status_order) WITH ORDINALITY AS t(val,i) WHERE val = p_alvo;

    IF v_idx_atual IS NULL OR v_idx_alvo IS NULL THEN
        RAISE EXCEPTION 'Status OS inválido (% -> %).', v_atual, p_alvo;
    END IF;

    WHILE v_idx_atual < v_idx_alvo LOOP
        v_proximo := status_order[v_idx_atual + 1];
        IF v_use_manual THEN
            UPDATE public.ordens_servico SET status = v_proximo::public.status_os WHERE id = p_os_id;
        ELSE
            UPDATE public.ordens_servico_onfarm SET status = v_proximo::public.status_os_onfarm WHERE id = p_os_id;
        END IF;
        v_idx_atual := v_idx_atual + 1;
    END LOOP;
END;
$function$;

DROP FUNCTION IF EXISTS public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.rpc_cockpit_confirmar_entrega_v1(p_entrega_id uuid, p_os_id uuid, p_origem text, p_recebedor jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_ent record;
  v_est public.estoque_produto%ROWTYPE;
  v_pendentes int; v_total_entregue numeric; v_total_reservado numeric;
  v_finalizada boolean := false; v_avanco jsonb;
  v_recebedor_nome text;
BEGIN
  PERFORM public.fn_estoque_ctx_open(jsonb_build_object('acao','entrega','origem','rpc_cockpit_confirmar_entrega_v1','usuario_id',auth.uid()::text));
  v_origem := public.fn_cockpit_assert_operador_origem(p_origem);
  IF p_entrega_id IS NULL OR p_os_id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_PARAMS_INVALIDOS'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cockpit_entrega:' || p_entrega_id::text));

  -- busca já restrita pela coluna correta da OS conforme a origem
  SELECT e.id, e.status::text AS status, e.estoque_produto_id,
         coalesce(e.quantidade_entregue, 0) AS qtd, e.partner_order_id
    INTO v_ent
    FROM public.entregas e
   WHERE e.id = p_entrega_id
     AND ( (v_origem = 'onfarm' AND e.ordem_servico_onfarm_id = p_os_id)
        OR (v_origem <> 'onfarm' AND e.ordem_servico_id = p_os_id) )
   FOR UPDATE;

  IF v_ent.id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.entregas WHERE id = p_entrega_id) THEN
      RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_OS';
    END IF;
    RAISE EXCEPTION 'COCKPIT_ENTREGA_NAO_ENCONTRADA';
  END IF;
  IF v_ent.status = 'cancelada' THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_CANCELADA'; END IF;
  IF v_ent.status = 'entregue' THEN
    RETURN jsonb_build_object('success', true, 'replay', true, 'finalizada', false,
      'message', 'Entrega já confirmada anteriormente.');
  END IF;

  IF v_origem = 'b2b' THEN
    PERFORM public.fn_cockpit_assert_b2b_liberado(v_ent.partner_order_id);
  END IF;

  IF v_ent.estoque_produto_id IS NOT NULL THEN
    SELECT * INTO v_est FROM public.estoque_produto WHERE id = v_ent.estoque_produto_id FOR UPDATE;
    IF v_est.id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_ESTOQUE_NAO_ENCONTRADO'; END IF;
    IF v_est.status::text <> 'expedido' THEN
      IF v_est.reservado_para_os_id IS DISTINCT FROM p_os_id THEN
        RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_ESTOQUE';
      END IF;
      IF coalesce(v_est.reservado_para_os_tipo, v_origem) IS DISTINCT FROM v_origem THEN
        RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_ORIGEM';
      END IF;
      IF v_ent.qtd > coalesce(v_est.quantidade, 0) THEN
        RAISE EXCEPTION 'COCKPIT_ENTREGA_QUANTIDADE_EXCEDE_RESERVA';
      END IF;
    END IF;
  END IF;

  -- Dados de recebimento exigidos pelo gatilho fn_validate_entrega_confirmacao.
  v_recebedor_nome := nullif(btrim(coalesce(p_recebedor->>'nome','')), '');
  IF v_recebedor_nome IS NULL THEN
    SELECT nullif(btrim(coalesce(pr.nome,'')), '') INTO v_recebedor_nome
      FROM public.profiles pr WHERE pr.id = v_uid;
  END IF;
  IF v_recebedor_nome IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_RECEBEDOR_OBRIGATORIO';
  END IF;

  UPDATE public.entregas
     SET status = 'entregue'::public.status_entrega,
         entregue_em = now(),
         recebido_por_nome = v_recebedor_nome,
         recebido_por_cargo = coalesce(nullif(btrim(coalesce(p_recebedor->>'cargo','')), ''), recebido_por_cargo),
         recebido_por_documento = coalesce(nullif(btrim(coalesce(p_recebedor->>'documento','')), ''), recebido_por_documento),
         observacoes_confirmacao = coalesce(nullif(btrim(coalesce(p_recebedor->>'observacoes','')), ''), observacoes_confirmacao),
         confirmado_por = v_uid
   WHERE id = p_entrega_id;

  IF v_est.id IS NOT NULL THEN
    UPDATE public.estoque_produto
       SET status = 'expedido'::public.status_estoque, expedido_por = v_uid,
           expedido_em = now(), updated_at = now()
     WHERE id = v_est.id AND status <> 'expedido'::public.status_estoque;

    IF FOUND THEN
      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
      VALUES (v_est.id, 'expedicao', v_ent.qtd, 'reservado', 'expedido',
              p_os_id, v_origem, v_uid, v_est.lote_id, 'Baixa por confirmação de entrega');
    END IF;
  END IF;

  v_avanco := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, v_origem, 'enviar_entrega', NULL);

  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, v_origem, 'em_entrega', 'entregue', 'confirmar_entrega_v1', v_uid,
          format('Confirmação transacional da entrega %s', p_entrega_id));

  IF v_origem = 'onfarm' THEN
    SELECT count(*) FILTER (WHERE status::text NOT IN ('entregue','cancelada')),
           coalesce(sum(quantidade_entregue) FILTER (WHERE status::text = 'entregue'), 0)
      INTO v_pendentes, v_total_entregue
      FROM public.entregas WHERE ordem_servico_onfarm_id = p_os_id;
  ELSE
    SELECT count(*) FILTER (WHERE status::text NOT IN ('entregue','cancelada')),
           coalesce(sum(quantidade_entregue) FILTER (WHERE status::text = 'entregue'), 0)
      INTO v_pendentes, v_total_entregue
      FROM public.entregas WHERE ordem_servico_id = p_os_id;
  END IF;

  SELECT coalesce(sum(quantidade_reservada), 0) INTO v_total_reservado
    FROM public.estoque_produto
   WHERE reservado_para_os_id = p_os_id
     AND coalesce(reservado_para_os_tipo, v_origem) = v_origem
     AND status <> 'estornado'::public.status_estoque;

  IF v_pendentes = 0 AND v_total_reservado > 0 AND v_total_entregue >= v_total_reservado THEN
    v_avanco := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, v_origem, 'finalizar_os', NULL);
    IF coalesce((v_avanco->>'success')::boolean, false) THEN
      v_finalizada := true;
      INSERT INTO public.laboratorio_esteira_eventos
        (os_id, origem_os, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
      VALUES (p_os_id, v_origem, 'entregue', 'finalizada', 'finalizacao_automatica_por_entrega', v_uid,
              'Cobertura completa: OS finalizada na mesma transação da confirmação de entrega.');
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'replay', false, 'finalizada', v_finalizada,
    'parcial', (v_pendentes > 0 OR v_total_entregue < v_total_reservado),
    'total_entregue', v_total_entregue, 'total_reservado', v_total_reservado,
    'message', CASE WHEN v_finalizada THEN 'Entrega confirmada — OS finalizada.'
                    ELSE 'Entrega confirmada.' END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_cockpit_cancelar_reserva_v1(p_item_id uuid, p_os_id uuid, p_origem text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_item public.estoque_produto%ROWTYPE;
  v_main public.estoque_produto%ROWTYPE;
  v_modo text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  PERFORM public.fn_estoque_ctx_open(jsonb_build_object('acao','cancelamento_reserva','origem','rpc_cockpit_cancelar_reserva_v1','usuario_id',auth.uid()::text));
  v_origem := public.fn_cockpit_assert_operador_origem(p_origem);

  IF p_item_id IS NULL OR p_os_id IS NULL THEN RAISE EXCEPTION 'COCKPIT_RESERVA_PARAMS_INVALIDOS'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'COCKPIT_RESERVA_MOTIVO_OBRIGATORIO'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cockpit_reserva:' || p_item_id::text));

  SELECT * INTO v_item FROM public.estoque_produto WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'COCKPIT_RESERVA_NAO_ENCONTRADA'; END IF;

  IF v_item.status::text = 'estornado' OR v_item.quantidade_reservada IS NULL THEN
    RETURN jsonb_build_object('success', true, 'replay', true,
      'message', 'Reserva já cancelada anteriormente.');
  END IF;
  IF v_item.status::text = 'expedido' THEN RAISE EXCEPTION 'COCKPIT_RESERVA_JA_EXPEDIDA'; END IF;

  -- coerência: a reserva precisa pertencer à MESMA OS/origem
  IF v_item.reservado_para_os_id IS DISTINCT FROM p_os_id THEN
    RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_RESERVA_OS';
  END IF;
  IF coalesce(v_item.reservado_para_os_tipo, v_origem) IS DISTINCT FROM v_origem THEN
    RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_RESERVA_ORIGEM';
  END IF;

  -- override (cancelar reserva feita por outro operador) exige gestor
  IF v_item.reservado_por IS DISTINCT FROM v_uid AND NOT public.fn_cockpit_is_gestor() THEN
    RAISE EXCEPTION 'COCKPIT_RESERVA_OVERRIDE_SEM_ALCADA';
  END IF;

  -- saldo principal compatível (mesmo lote, envase, item e validade)
  SELECT * INTO v_main
    FROM public.estoque_produto
   WHERE lote_id = v_item.lote_id
     AND envase_id IS NOT DISTINCT FROM v_item.envase_id
     AND produto_id IS NOT DISTINCT FROM v_item.produto_id
     AND microrganismo_id IS NOT DISTINCT FROM v_item.microrganismo_id
     AND validade IS NOT DISTINCT FROM v_item.validade
     AND quantidade_reservada IS NULL
     AND status = 'disponivel'::public.status_estoque
     AND id <> v_item.id
   ORDER BY id LIMIT 1 FOR UPDATE;

  IF v_main.id IS NOT NULL THEN
    v_modo := 'estorno_para_saldo_principal';
    UPDATE public.estoque_produto
       SET quantidade = coalesce(v_main.quantidade,0) + coalesce(v_item.quantidade,0),
           volume_total = coalesce(v_main.volume_total,0) + coalesce(v_item.volume_total,0),
           updated_at = now()
     WHERE id = v_main.id;

    UPDATE public.estoque_produto
       SET status = 'estornado'::public.status_estoque, quantidade = 0, volume_total = 0,
           quantidade_reservada = NULL, reservado_para_os_id = NULL, reservado_para_os_tipo = NULL,
           reservado_para_cliente_id = NULL, reservado_para_partner_id = NULL,
           reservado_para_partner_order_id = NULL,
           observacao_reserva = v_motivo || format(' — saldo devolvido ao registro %s', v_main.id),
           updated_at = now()
     WHERE id = v_item.id;

    INSERT INTO public.estoque_movimentacoes
      (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
    VALUES (v_main.id, 'cancelamento_reserva', coalesce(v_item.quantidade,0), 'reservado', 'disponivel',
            p_os_id, v_origem, v_uid, v_item.lote_id, v_motivo);
  ELSE
    v_modo := 'liberacao_no_proprio_registro';
    UPDATE public.estoque_produto
       SET status = 'disponivel'::public.status_estoque, quantidade_reservada = NULL,
           reservado_para_os_id = NULL, reservado_para_os_tipo = NULL,
           reservado_para_cliente_id = NULL, reservado_para_partner_id = NULL,
           reservado_para_partner_order_id = NULL,
           observacao_reserva = v_motivo, updated_at = now()
     WHERE id = v_item.id;

    INSERT INTO public.estoque_movimentacoes
      (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
    VALUES (v_item.id, 'cancelamento_reserva', coalesce(v_item.quantidade,0), 'reservado', 'disponivel',
            p_os_id, v_origem, v_uid, v_item.lote_id, v_motivo);
  END IF;

  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, lote_id, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, v_origem, v_item.lote_id, 'estoque_reservado', 'estoque_disponivel',
          'cancelar_reserva_v1', v_uid, format('Cancelamento transacional (%s). Motivo: %s', v_modo, v_motivo));

  RETURN jsonb_build_object('success', true, 'replay', false, 'modo', v_modo,
    'message', 'Reserva cancelada e saldo devolvido em transação única.');
END;
$function$;


-- ---------------------------------------------------------------------
-- Unicidade de lote por programacao
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_lotes_programacao_id
  ON public.lotes (programacao_id)
  WHERE programacao_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Motor transacional de geracao de lote
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_gerar_lote_v1(
  p_programacao_id uuid,
  p_os_id uuid,
  p_origem text,
  p_lote jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_existente record;
  v_id uuid;
  v_codigo text;
BEGIN
  v_origem := public.fn_cockpit_assert_operador_origem(p_origem);
  IF p_programacao_id IS NULL OR p_os_id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_PARAMS_INVALIDOS';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cockpit_lote:' || p_programacao_id::text));

  SELECT id, codigo_lote INTO v_existente
    FROM public.lotes WHERE programacao_id = p_programacao_id LIMIT 1;
  IF v_existente.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'replay', true,
      'lote_id', v_existente.id, 'codigo_lote', v_existente.codigo_lote,
      'message', format('Lote %s ja existe para esta programacao.', v_existente.codigo_lote));
  END IF;

  v_codigo := nullif(p_lote->>'codigo_lote', '');
  IF v_codigo IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_CODIGO_OBRIGATORIO';
  END IF;

  INSERT INTO public.lotes (
    programacao_id, codigo_lote, produto_id, microrganismo_id,
    volume_produzido, data_producao, responsavel_producao, tanque, observacoes_tecnicas
  ) VALUES (
    p_programacao_id, v_codigo,
    nullif(p_lote->>'produto_id','')::uuid,
    nullif(p_lote->>'microrganismo_id','')::uuid,
    nullif(p_lote->>'volume_produzido','')::numeric,
    coalesce(nullif(p_lote->>'data_producao','')::date, CURRENT_DATE),
    nullif(p_lote->>'responsavel_producao',''),
    nullif(p_lote->>'tanque',''),
    nullif(p_lote->>'observacoes_tecnicas','')
  ) RETURNING id INTO v_id;

  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, programacao_id, lote_id, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, v_origem, p_programacao_id, v_id, 'lote_gerado', 'gerar_lote', v_uid,
          format('Lote %s gerado (motor transacional).', v_codigo));

  RETURN jsonb_build_object('success', true, 'replay', false,
    'lote_id', v_id, 'codigo_lote', v_codigo,
    'message', format('Lote %s gerado com sucesso.', v_codigo));
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- Motor transacional de criacao de entrega (idempotente, sem pular etapas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_criar_entrega_v1(
  p_os_id uuid,
  p_origem text,
  p_estoque_produto_id uuid,
  p_quantidade numeric,
  p_dados jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_est public.estoque_produto%ROWTYPE;
  v_existente record;
  v_id uuid;
BEGIN
  v_origem := public.fn_cockpit_assert_operador_origem(p_origem);
  IF p_os_id IS NULL OR p_estoque_produto_id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_PARAMS_INVALIDOS';
  END IF;
  IF coalesce(p_quantidade, 0) <= 0 THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_QUANTIDADE_INVALIDA';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cockpit_criar_entrega:' || p_os_id::text || ':' || p_estoque_produto_id::text));

  SELECT * INTO v_est FROM public.estoque_produto WHERE id = p_estoque_produto_id FOR UPDATE;
  IF v_est.id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_ESTOQUE_NAO_ENCONTRADO';
  END IF;
  IF v_est.status::text <> 'expedido' THEN
    IF v_est.reservado_para_os_id IS DISTINCT FROM p_os_id THEN
      RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_ESTOQUE';
    END IF;
    IF coalesce(v_est.reservado_para_os_tipo, v_origem) IS DISTINCT FROM v_origem THEN
      RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_ORIGEM';
    END IF;
    IF p_quantidade > coalesce(v_est.quantidade, 0) THEN
      RAISE EXCEPTION 'COCKPIT_ENTREGA_QUANTIDADE_EXCEDE_RESERVA';
    END IF;
  END IF;

  SELECT e.id, e.status::text AS status INTO v_existente
    FROM public.entregas e
   WHERE e.estoque_produto_id = p_estoque_produto_id
     AND e.status::text <> 'cancelada'
     AND ( (v_origem = 'onfarm' AND e.ordem_servico_onfarm_id = p_os_id)
        OR (v_origem <> 'onfarm' AND e.ordem_servico_id = p_os_id) )
   ORDER BY e.created_at DESC LIMIT 1;

  IF v_existente.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'replay', true,
      'entrega_id', v_existente.id, 'status', v_existente.status,
      'message', 'Entrega ja registrada para este item da OS.');
  END IF;

  INSERT INTO public.entregas (
    ordem_servico_id, ordem_servico_onfarm_id, estoque_produto_id,
    lote_id, produto_id, quantidade_entregue, status,
    cliente_id, data_saida, motorista, veiculo
  ) VALUES (
    CASE WHEN v_origem = 'onfarm' THEN NULL ELSE p_os_id END,
    CASE WHEN v_origem = 'onfarm' THEN p_os_id ELSE NULL END,
    p_estoque_produto_id, v_est.lote_id, v_est.produto_id,
    p_quantidade, 'separado'::public.status_entrega,
    nullif(p_dados->>'cliente_id','')::uuid,
    nullif(p_dados->>'data_saida','')::date,
    nullif(p_dados->>'motorista',''),
    nullif(p_dados->>'veiculo','')
  ) RETURNING id INTO v_id;

  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, v_origem, 'entrega_criada', 'criar_entrega_v1', v_uid,
          format('Entrega %s criada (motor transacional).', v_id));

  RETURN jsonb_build_object('success', true, 'replay', false,
    'entrega_id', v_id, 'status', 'separado',
    'message', 'Entrega registrada. Confirme a entrega para concluir a OS.');
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid, text, uuid, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid, text, uuid, numeric, jsonb) TO authenticated;

-- View de integridade recalculada
CREATE OR REPLACE VIEW public.vw_os_integridade_esteira AS
 WITH base_os AS (
         SELECT o.id AS os_id,
            'manual'::text AS origem_os,
            o.numero_os,
            o.cliente_id,
            o.fazenda_id,
            o.talhao_id,
            o.status::text AS status_os,
            o.created_at,
            o.volume_total_ml,
            o.produto_id,
            o.microrganismo_id,
            o.prioridade::text AS prioridade,
            o.partner_order_id
           FROM ordens_servico o
        UNION ALL
         SELECT ofa.id AS os_id,
            'onfarm'::text AS origem_os,
            ofa.numero_os,
            ofa.cliente_id,
            ofa.fazenda_id,
            ofa.talhao_id,
            ofa.status::text AS status_os,
            ofa.created_at,
            ofa.volume_total_ml,
            ofa.produto_id,
            NULL::uuid AS microrganismo_id,
            ofa.prioridade::text AS prioridade,
            NULL::uuid AS partner_order_id
           FROM ordens_servico_onfarm ofa
        ), esteira_data AS (
         SELECT bos.os_id,
            bos.origem_os,
            bos.numero_os,
            bos.cliente_id,
            bos.fazenda_id,
            bos.talhao_id,
            bos.status_os,
            bos.created_at,
            bos.volume_total_ml,
            bos.produto_id,
            bos.microrganismo_id,
            bos.prioridade,
            bos.volume_total_ml::double precision / 1000.0::double precision AS volume_solicitado_l,
            c.nome AS cliente_nome,
            f.nome AS fazenda_nome,
            t.nome AS talhao_nome,
            p.nome AS produto_nome,
            m.nome AS microrganismo_nome,
            pa.id AS partner_id,
            po.numero AS partner_numero,
            COALESCE(pa.nome_fantasia, pa.razao_social) AS partner_nome,
                CASE
                    WHEN pa.id IS NOT NULL THEN 'parceiro'::text
                    WHEN c.id IS NOT NULL THEN 'cliente'::text
                    ELSE 'desconhecido'::text
                END AS titular_tipo,
                CASE
                    WHEN pa.id IS NOT NULL THEN 'B2B · '::text || COALESCE(pa.nome_fantasia, pa.razao_social)
                    WHEN c.id IS NOT NULL THEN c.nome
                    ELSE '—'::text
                END AS titular_nome,
            pp.id AS programacao_id,
            pp.status::text AS status_programacao,
            pp.data_programada,
            pp.created_at AS data_inicio_producao,
            l.id AS lote_id,
            l.codigo_lote,
            l.status::text AS status_lote,
            l.created_at AS data_lote,
            cq.id AS cq_id,
            cq.resultado::text AS cq_resultado,
            cq.created_at AS data_cq,
            ev.id AS envase_id,
            ev.created_at AS data_envase,
            ep.id AS estoque_id,
            ep.created_at AS data_estoque,
            epr.id AS estoque_reservado_id,
            epr.reservado_em AS data_estoque_reservado,
            ent_1.id AS entrega_id,
            ent_1.status::text AS entrega_status,
            ent_1.created_at AS data_entrega,
            app.id AS aplicacao_id,
            app.created_at AS data_aplicacao
           FROM base_os bos
             LEFT JOIN clientes c ON bos.cliente_id = c.id
             LEFT JOIN fazendas f ON bos.fazenda_id = f.id
             LEFT JOIN talhoes t ON bos.talhao_id = t.id
             LEFT JOIN produtos p ON bos.produto_id = p.id
             LEFT JOIN microrganismos m ON bos.microrganismo_id = m.id
             LEFT JOIN partner_orders po ON po.id = bos.partner_order_id
             LEFT JOIN partner_accounts pa ON pa.id = po.partner_id
             LEFT JOIN LATERAL ( SELECT pp_1.id,
                    pp_1.status,
                    pp_1.data_programada,
                    pp_1.created_at
                   FROM programacao_producao pp_1
                  WHERE bos.origem_os = 'manual'::text AND pp_1.ordem_servico_id = bos.os_id OR bos.origem_os = 'onfarm'::text AND pp_1.ordem_servico_onfarm_id = bos.os_id
                  ORDER BY pp_1.created_at DESC
                 LIMIT 1) pp ON true
             LEFT JOIN LATERAL ( SELECT l_1.id,
                    l_1.codigo_lote,
                    l_1.status,
                    l_1.created_at
                   FROM lotes l_1
                  WHERE l_1.programacao_id = pp.id
                  ORDER BY l_1.created_at DESC
                 LIMIT 1) l ON true
             LEFT JOIN LATERAL ( SELECT cq_1.id,
                    cq_1.resultado,
                    cq_1.created_at
                   FROM controle_qualidade cq_1
                  WHERE cq_1.lote_id = l.id
                  ORDER BY cq_1.created_at DESC
                 LIMIT 1) cq ON true
             LEFT JOIN LATERAL ( SELECT ev_1.id,
                    ev_1.created_at
                   FROM envase ev_1
                  WHERE ev_1.lote_id = l.id
                  ORDER BY ev_1.created_at DESC
                 LIMIT 1) ev ON true
             LEFT JOIN LATERAL ( SELECT ep_1.id,
                    ep_1.created_at
                   FROM estoque_produto ep_1
                  WHERE ep_1.lote_id = l.id
                  ORDER BY ep_1.created_at DESC
                 LIMIT 1) ep ON true
             LEFT JOIN LATERAL ( SELECT epr_1.id,
                    epr_1.reservado_em
                   FROM estoque_produto epr_1
                  WHERE epr_1.lote_id = l.id AND epr_1.status::text = 'reservado'::text AND epr_1.reservado_para_os_id = bos.os_id
                  ORDER BY epr_1.reservado_em DESC NULLS LAST, epr_1.created_at DESC
                 LIMIT 1) epr ON true
             LEFT JOIN LATERAL ( SELECT ent_2.id,
                    ent_2.status,
                    ent_2.created_at
                   FROM entregas ent_2
                  WHERE bos.origem_os = 'manual'::text AND ent_2.ordem_servico_id = bos.os_id OR bos.origem_os = 'onfarm'::text AND ent_2.ordem_servico_onfarm_id = bos.os_id
                  ORDER BY ent_2.created_at DESC
                 LIMIT 1) ent_1 ON true
             LEFT JOIN LATERAL ( SELECT app_1.id,
                    app_1.created_at
                   FROM aplicacoes app_1
                  WHERE bos.origem_os = 'manual'::text AND app_1.ordem_servico_id = bos.os_id OR bos.origem_os = 'onfarm'::text AND app_1.ordem_servico_onfarm_id = bos.os_id
                  ORDER BY app_1.created_at DESC
                 LIMIT 1) app ON true
        )
 SELECT ed.os_id,
    ed.origem_os,
    ed.numero_os,
    ed.cliente_id,
    ed.fazenda_id,
    ed.talhao_id,
    ed.status_os,
    ed.created_at,
    ed.volume_total_ml,
    ed.produto_id,
    ed.microrganismo_id,
    ed.prioridade,
    ed.volume_solicitado_l,
    ed.cliente_nome,
    ed.fazenda_nome,
    ed.talhao_nome,
    ed.produto_nome,
    ed.microrganismo_nome,
    ed.partner_id,
    ed.partner_numero,
    ed.partner_nome,
    ed.titular_tipo,
    ed.titular_nome,
    ed.programacao_id,
    ed.status_programacao,
    ed.data_programada,
    ed.data_inicio_producao,
    ed.lote_id,
    ed.codigo_lote,
    ed.status_lote,
    ed.data_lote,
    ed.cq_id,
    ed.cq_resultado,
    ed.data_cq,
    ed.envase_id,
    ed.data_envase,
    ed.estoque_id,
    ed.data_estoque,
    ed.estoque_reservado_id,
    ed.data_estoque_reservado,
    ed.entrega_id,
    ed.entrega_status,
    ed.data_entrega,
    ed.aplicacao_id,
    ed.data_aplicacao,
    ent.id IS NOT NULL AND (ent.status::text = ANY (ARRAY['entregue'::text, 'confirmada'::text])) AS entrega_confirmada,
    false AS aplicacao_bloqueante,
    (ARRAY[]::text[]
      || CASE WHEN ed.aplicacao_id IS NULL AND (ent.id IS NOT NULL AND ent.status::text = ANY (ARRAY['entregue'::text,'confirmada'::text])) THEN ARRAY['aplicacao_nao_registrada'::text] ELSE ARRAY[]::text[] END
      || CASE WHEN ed.data_programada IS NOT NULL AND ed.data_programada < CURRENT_DATE AND ed.status_os <> ALL (ARRAY['finalizada'::text,'cancelada'::text]) THEN ARRAY['programacao_atrasada'::text] ELSE ARRAY[]::text[] END
    ) AS pendencias_informativas,
    (ARRAY[]::text[]
      || CASE WHEN ed.programacao_id IS NULL THEN ARRAY['sem_programacao'::text] ELSE ARRAY[]::text[] END
      || CASE WHEN ed.lote_id IS NULL THEN ARRAY['sem_lote'::text] ELSE ARRAY[]::text[] END
      || CASE WHEN ed.lote_id IS NOT NULL AND ed.cq_resultado IS DISTINCT FROM 'aprovado'::text THEN ARRAY['cq_nao_aprovado'::text] ELSE ARRAY[]::text[] END
      || CASE WHEN ed.envase_id IS NULL THEN ARRAY['sem_envase'::text] ELSE ARRAY[]::text[] END
      || CASE WHEN ed.estoque_id IS NULL THEN ARRAY['sem_entrada_estoque'::text] ELSE ARRAY[]::text[] END
      || CASE WHEN ed.estoque_reservado_id IS NULL THEN ARRAY['sem_reserva_para_os'::text] ELSE ARRAY[]::text[] END
      || CASE WHEN ed.entrega_id IS NULL THEN ARRAY['sem_entrega'::text] ELSE ARRAY[]::text[] END
      || CASE WHEN ed.entrega_id IS NOT NULL AND NOT (ent.id IS NOT NULL AND ent.status::text = ANY (ARRAY['entregue'::text,'confirmada'::text])) THEN ARRAY['entrega_nao_confirmada'::text] ELSE ARRAY[]::text[] END
    ) AS bloqueios,
    (ed.estoque_id IS NOT NULL AND (ent.id IS NOT NULL AND ent.status::text = ANY (ARRAY['entregue'::text,'confirmada'::text]))) AS pode_finalizar,
        CASE
            WHEN ed.status_os = 'finalizada'::text THEN 'finalizada'::text
            WHEN ed.entrega_id IS NOT NULL AND (ed.entrega_status = ANY (ARRAY['entregue'::text, 'confirmada'::text])) THEN 'entregue'::text
            WHEN ed.entrega_id IS NOT NULL THEN 'em_entrega'::text
            WHEN ed.estoque_reservado_id IS NOT NULL THEN 'estoque_reservado'::text
            WHEN ed.estoque_id IS NOT NULL THEN 'pronto_entrega'::text
            WHEN ed.envase_id IS NOT NULL THEN 'envase'::text
            WHEN ed.status_os = ANY (ARRAY['envase'::text, 'em_envase'::text]) THEN 'envase'::text
            WHEN ed.status_os = 'pronto_entrega'::text THEN 'pronto_entrega'::text
            WHEN ed.cq_resultado = 'aprovado'::text THEN 'cq_aprovado'::text
            WHEN (ed.status_os = ANY (ARRAY['em_cq'::text, 'aguardando_cq'::text])) OR ed.status_programacao = 'aguardando_cq'::text OR ed.status_lote = 'aguardando_cq'::text THEN 'aguardando_cq'::text
            WHEN ed.cq_id IS NOT NULL THEN 'em_cq'::text
            WHEN ed.lote_id IS NOT NULL THEN 'em_producao'::text
            WHEN ed.programacao_id IS NOT NULL THEN 'programada'::text
            ELSE 'aberta'::text
        END AS status_esteira_oficial,
    EXTRACT(epoch FROM ed.data_inicio_producao - ed.created_at) AS tempo_os_ate_programacao,
    EXTRACT(epoch FROM ed.data_lote - ed.data_inicio_producao) AS tempo_programacao_ate_lote,
    EXTRACT(epoch FROM ed.data_cq - ed.data_lote) AS tempo_lote_ate_cq,
    EXTRACT(epoch FROM ed.data_envase - ed.data_cq) AS tempo_cq_ate_envase,
    EXTRACT(epoch FROM ed.data_entrega - ed.data_envase) AS tempo_envase_ate_entrega,
    EXTRACT(epoch FROM ed.data_entrega - ed.created_at) AS tempo_os_ate_entrega,
    ed.data_programada IS NOT NULL AND ed.data_programada < CURRENT_DATE AND (ed.status_os <> ALL (ARRAY['finalizada'::text, 'cancelada'::text])) AS atrasado
   FROM esteira_data ed
     LEFT JOIN entregas ent ON ent.id = ed.entrega_id;
