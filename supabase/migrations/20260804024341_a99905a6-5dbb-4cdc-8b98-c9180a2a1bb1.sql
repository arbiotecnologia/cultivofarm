-- ============================================================
-- POLÍTICAS DE ESTOQUE (limite de ajuste sem aprovação)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estoque_politicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  limite_ajuste_sem_aprovacao numeric NOT NULL DEFAULT 10,
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.estoque_politicas TO authenticated;
GRANT ALL ON public.estoque_politicas TO service_role;
ALTER TABLE public.estoque_politicas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS estoque_politicas_select ON public.estoque_politicas;
CREATE POLICY estoque_politicas_select ON public.estoque_politicas
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'administrador'::app_role) OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role) OR public.has_role(auth.uid(),'administrativo'::app_role)
  );
DROP POLICY IF EXISTS estoque_politicas_admin ON public.estoque_politicas;
CREATE POLICY estoque_politicas_admin ON public.estoque_politicas
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'administrador'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'administrador'::app_role));
INSERT INTO public.estoque_politicas (limite_ajuste_sem_aprovacao)
SELECT 10 WHERE NOT EXISTS (SELECT 1 FROM public.estoque_politicas);
DROP TRIGGER IF EXISTS trg_estoque_politicas_updated ON public.estoque_politicas;
CREATE TRIGGER trg_estoque_politicas_updated BEFORE UPDATE ON public.estoque_politicas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- AUTORIZAÇÃO E FINGERPRINT
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_estoque_pode_operar(_uid uuid, _acao text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN false
    WHEN _acao IN ('ajuste','perda','descarte')
      THEN public.has_role(_uid,'administrador'::app_role) OR public.has_role(_uid,'gestor'::app_role)
        OR public.has_role(_uid,'producao'::app_role)
    ELSE public.has_role(_uid,'administrador'::app_role) OR public.has_role(_uid,'gestor'::app_role)
      OR public.has_role(_uid,'producao'::app_role) OR public.has_role(_uid,'administrativo'::app_role)
  END;
$$;
REVOKE ALL ON FUNCTION public.fn_estoque_pode_operar(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_estoque_pode_operar(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_estoque_fingerprint(p_acao text, p_item uuid, p_qtd numeric, p_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'extensions' AS $$
  SELECT encode(extensions.digest(
    'estmovv1|'||coalesce(p_acao,'')||'|'||coalesce(p_item::text,'')||'|'||
    coalesce(trim_scale(p_qtd)::text,'')||'|'||
    coalesce((SELECT jsonb_object_agg(k, v ORDER BY k) FROM jsonb_each(coalesce(p_payload,'{}'::jsonb)) e(k,v))::text,'{}'),
    'sha256'),'hex');
$$;
REVOKE ALL ON FUNCTION public.fn_estoque_fingerprint(text,uuid,numeric,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_estoque_fingerprint(text,uuid,numeric,jsonb) TO authenticated, service_role;

-- ============================================================
-- MOTOR TRANSACIONAL CANÔNICO
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_estoque_operar_v1(
  p_acao text,
  p_item_id uuid,
  p_quantidade numeric DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_fp text;
  v_prev public.estoque_movimentacoes%ROWTYPE;
  v_item public.estoque_produto%ROWTYPE;
  v_after public.estoque_produto%ROWTYPE;
  v_mov public.estoque_movimentacoes%ROWTYPE;
  v_ctx jsonb;
  v_qtd numeric := p_quantidade;
  v_motivo text := NULLIF(p_payload->>'motivo','');
  v_origem_mov uuid := NULLIF(p_payload->>'movimentacao_origem_id','')::uuid;
  v_limite numeric;
  v_classif text;
  v_target_id uuid;
  v_lote public.lotes%ROWTYPE;
BEGIN
  IF p_acao IS NULL OR p_acao NOT IN
     ('reserva','cancelamento_reserva','expedicao','entrega','estorno_expedicao','ajuste','perda','descarte','devolucao') THEN
    RAISE EXCEPTION 'ESTQ_ACAO_INVALIDA: ação % não é suportada pelo motor canônico.', p_acao
      USING ERRCODE='check_violation';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ESTQ_NAO_AUTENTICADO' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.fn_estoque_pode_operar(v_uid, p_acao) THEN
    RAISE EXCEPTION 'ESTQ_SEM_PERMISSAO: perfil não autorizado para %.', p_acao
      USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'ESTQ_IDEMPOTENCY_OBRIGATORIA: informe uma chave com ao menos 8 caracteres.'
      USING ERRCODE='check_violation';
  END IF;

  v_fp := public.fn_estoque_fingerprint(p_acao, p_item_id, p_quantidade, p_payload);
  PERFORM pg_advisory_xact_lock(hashtext('estoque_mov:'||p_idempotency_key));

  SELECT * INTO v_prev FROM public.estoque_movimentacoes
   WHERE idempotency_key = p_idempotency_key LIMIT 1;
  IF FOUND THEN
    IF v_prev.request_fingerprint IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION 'ESTQ_IDEMPOTENCY_CONFLITO: chave já usada com payload divergente.'
        USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'replay', true, 'acao', v_prev.acao,
      'movimentacao_id', v_prev.id, 'estoque_produto_id', v_prev.estoque_produto_id,
      'saldo_anterior', v_prev.saldo_anterior, 'saldo_posterior', v_prev.saldo_posterior,
      'reservado_anterior', v_prev.reservado_anterior, 'reservado_posterior', v_prev.reservado_posterior,
      'status_anterior', v_prev.status_anterior, 'status_novo', v_prev.status_novo);
  END IF;

  SELECT * INTO v_item FROM public.estoque_produto WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ESTQ_ITEM_INEXISTENTE: item % não encontrado.', p_item_id USING ERRCODE='no_data_found';
  END IF;

  IF p_acao <> 'estorno_expedicao' AND (v_qtd IS NULL OR v_qtd <= 0) THEN
    RAISE EXCEPTION 'ESTQ_QUANTIDADE_INVALIDA: quantidade deve ser maior que zero.' USING ERRCODE='check_violation';
  END IF;

  v_ctx := jsonb_strip_nulls(jsonb_build_object(
    'acao', p_acao, 'origem', COALESCE(p_payload->>'origem','rpc_estoque_operar_v1'),
    'referencia_tipo', p_payload->>'referencia_tipo', 'referencia_id', p_payload->>'referencia_id',
    'motivo', v_motivo, 'idempotency_key', p_idempotency_key, 'request_fingerprint', v_fp,
    'usuario_id', v_uid::text, 'unidade', COALESCE(p_payload->>'unidade','un'),
    'observacao', p_payload->>'observacao',
    'metadata', COALESCE(p_payload->'metadata','{}'::jsonb) || jsonb_build_object('motor','v1')
  ));

  -- ---------- validações por ação ----------
  IF p_acao = 'reserva' THEN
    IF v_item.status::text <> 'disponivel' THEN
      RAISE EXCEPTION 'ESTQ_STATUS_INVALIDO: item não está disponível (%).', v_item.status USING ERRCODE='check_violation';
    END IF;
    IF v_qtd > COALESCE(v_item.quantidade,0) THEN
      RAISE EXCEPTION 'ESTQ_SALDO_INSUFICIENTE: solicitado % > disponível %.', v_qtd, COALESCE(v_item.quantidade,0)
        USING ERRCODE='check_violation';
    END IF;
    PERFORM public.fn_estoque_ctx_open(v_ctx);
    v_target_id := public.reservar_estoque_item(
      p_item_id, v_qtd, (p_payload->>'os_id')::uuid, COALESCE(p_payload->>'os_tipo','interna'),
      NULLIF(p_payload->>'cliente_id','')::uuid, NULLIF(p_payload->>'partner_id','')::uuid,
      NULLIF(p_payload->>'partner_order_id','')::uuid, p_payload->>'observacao');

  ELSIF p_acao = 'cancelamento_reserva' THEN
    IF v_item.status::text <> 'reservado' THEN
      RAISE EXCEPTION 'ESTQ_STATUS_INVALIDO: item não está reservado.' USING ERRCODE='check_violation';
    END IF;
    IF v_qtd > COALESCE(v_item.quantidade_reservada,0) THEN
      RAISE EXCEPTION 'ESTQ_LIBERACAO_EXCEDE: % > reservado %.', v_qtd, COALESCE(v_item.quantidade_reservada,0)
        USING ERRCODE='check_violation';
    END IF;
    PERFORM public.fn_estoque_ctx_open(v_ctx);
    IF v_qtd = COALESCE(v_item.quantidade_reservada,0) THEN
      UPDATE public.estoque_produto SET status='disponivel' WHERE id=p_item_id;
    ELSE
      UPDATE public.estoque_produto SET quantidade_reservada = quantidade_reservada - v_qtd WHERE id=p_item_id;
    END IF;
    v_target_id := p_item_id;

  ELSIF p_acao = 'expedicao' THEN
    IF v_item.status::text <> 'reservado' THEN
      RAISE EXCEPTION 'ESTQ_STATUS_INVALIDO: só é possível expedir item reservado.' USING ERRCODE='check_violation';
    END IF;
    IF v_qtd > COALESCE(v_item.quantidade_reservada,0) THEN
      RAISE EXCEPTION 'ESTQ_EXPEDICAO_EXCEDE: % > reservado %.', v_qtd, COALESCE(v_item.quantidade_reservada,0)
        USING ERRCODE='check_violation';
    END IF;
    IF (p_payload->>'cliente_id') IS NOT NULL
       AND v_item.reservado_para_cliente_id IS NOT NULL
       AND v_item.reservado_para_cliente_id <> (p_payload->>'cliente_id')::uuid THEN
      RAISE EXCEPTION 'ESTQ_ESCOPO_INVALIDO: item reservado para outro cliente.' USING ERRCODE='insufficient_privilege';
    END IF;
    IF (p_payload->>'os_id') IS NOT NULL
       AND v_item.reservado_para_os_id IS NOT NULL
       AND v_item.reservado_para_os_id <> (p_payload->>'os_id')::uuid THEN
      RAISE EXCEPTION 'ESTQ_ESCOPO_INVALIDO: item reservado para outra OS/pedido.' USING ERRCODE='insufficient_privilege';
    END IF;
    PERFORM public.fn_estoque_ctx_open(v_ctx);
    IF v_qtd = COALESCE(v_item.quantidade_reservada,0) THEN
      UPDATE public.estoque_produto SET status='expedido', expedido_em=now(), expedido_por=v_uid WHERE id=p_item_id;
    ELSE
      -- expedição parcial: baixa somente a quantidade autorizada
      UPDATE public.estoque_produto
         SET quantidade = GREATEST(COALESCE(quantidade,0) - v_qtd, 0),
             quantidade_reservada = COALESCE(quantidade_reservada,0) - v_qtd
       WHERE id = p_item_id;
    END IF;
    v_target_id := p_item_id;

  ELSIF p_acao = 'entrega' THEN
    IF v_item.status::text NOT IN ('reservado','expedido') THEN
      RAISE EXCEPTION 'ESTQ_STATUS_INVALIDO: entrega exige item reservado ou expedido.' USING ERRCODE='check_violation';
    END IF;
    IF v_qtd > COALESCE(v_item.quantidade,0) THEN
      RAISE EXCEPTION 'ESTQ_SALDO_INSUFICIENTE: entrega % > saldo %.', v_qtd, COALESCE(v_item.quantidade,0)
        USING ERRCODE='check_violation';
    END IF;
    PERFORM public.fn_estoque_ctx_open(v_ctx);
    UPDATE public.estoque_produto
       SET quantidade = COALESCE(quantidade,0) - v_qtd,
           quantidade_reservada = GREATEST(COALESCE(quantidade_reservada,0) - v_qtd, 0),
           status = 'expedido', expedido_em = COALESCE(expedido_em, now()), expedido_por = COALESCE(expedido_por, v_uid)
     WHERE id = p_item_id;
    v_target_id := p_item_id;

  ELSIF p_acao = 'estorno_expedicao' THEN
    IF v_origem_mov IS NULL THEN
      RAISE EXCEPTION 'ESTQ_ESTORNO_SEM_ORIGEM: informe movimentacao_origem_id.' USING ERRCODE='check_violation';
    END IF;
    SELECT * INTO v_mov FROM public.estoque_movimentacoes WHERE id = v_origem_mov;
    IF NOT FOUND OR v_mov.estoque_produto_id <> p_item_id THEN
      RAISE EXCEPTION 'ESTQ_ESTORNO_ORIGEM_INVALIDA' USING ERRCODE='check_violation';
    END IF;
    IF v_mov.acao IN ('estorno_expedicao','devolucao') THEN
      RAISE EXCEPTION 'ESTQ_ESTORNO_DE_ESTORNO: operação não permitida.' USING ERRCODE='check_violation';
    END IF;
    IF v_mov.acao NOT IN ('expedicao','entrega') THEN
      RAISE EXCEPTION 'ESTQ_ESTORNO_ACAO_INVALIDA: só expedição/entrega pode ser estornada.' USING ERRCODE='check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.estoque_movimentacoes WHERE movimentacao_origem_id = v_origem_mov) THEN
      RAISE EXCEPTION 'ESTQ_ESTORNO_DUPLICADO: movimentação já estornada.' USING ERRCODE='23505';
    END IF;
    v_qtd := COALESCE(v_qtd, v_mov.quantidade);
    v_ctx := v_ctx || jsonb_build_object('movimentacao_origem_id', v_origem_mov::text);
    PERFORM public.fn_estoque_ctx_open(v_ctx);
    UPDATE public.estoque_produto
       SET quantidade = COALESCE(quantidade,0) + COALESCE(v_mov.saldo_anterior,0) - COALESCE(v_mov.saldo_posterior,0),
           quantidade_reservada = COALESCE(v_mov.reservado_anterior, quantidade_reservada),
           status = COALESCE(v_mov.status_anterior, status::text)::status_estoque,
           expedido_em = NULL, expedido_por = NULL
     WHERE id = p_item_id;
    v_target_id := p_item_id;

  ELSIF p_acao IN ('ajuste','perda','descarte') THEN
    IF v_motivo IS NULL THEN
      RAISE EXCEPTION 'ESTQ_MOTIVO_OBRIGATORIO: informe o motivo para %.', p_acao USING ERRCODE='check_violation';
    END IF;
    SELECT limite_ajuste_sem_aprovacao INTO v_limite FROM public.estoque_politicas LIMIT 1;
    IF p_acao <> 'ajuste' OR COALESCE(p_payload->>'sentido','saida') = 'saida' THEN
      IF v_qtd > COALESCE(v_limite,10)
         AND NOT (public.has_role(v_uid,'administrador'::app_role) OR public.has_role(v_uid,'gestor'::app_role)) THEN
        RAISE EXCEPTION 'ESTQ_APROVACAO_REQUERIDA: redução de % excede o limite % sem aprovação.', v_qtd, v_limite
          USING ERRCODE='insufficient_privilege';
      END IF;
      IF v_qtd > COALESCE(v_item.quantidade,0) THEN
        RAISE EXCEPTION 'ESTQ_SALDO_INSUFICIENTE: redução % > saldo %.', v_qtd, COALESCE(v_item.quantidade,0)
          USING ERRCODE='check_violation';
      END IF;
      PERFORM public.fn_estoque_ctx_open(v_ctx);
      UPDATE public.estoque_produto
         SET quantidade = COALESCE(quantidade,0) - v_qtd,
             quantidade_reservada = LEAST(COALESCE(quantidade_reservada,0), COALESCE(quantidade,0) - v_qtd)
       WHERE id = p_item_id;
    ELSE
      PERFORM public.fn_estoque_ctx_open(v_ctx);
      UPDATE public.estoque_produto SET quantidade = COALESCE(quantidade,0) + v_qtd WHERE id = p_item_id;
    END IF;
    v_target_id := p_item_id;

  ELSIF p_acao = 'devolucao' THEN
    v_classif := NULLIF(p_payload->>'classificacao','');
    IF v_classif IS NULL OR v_classif NOT IN ('reintegravel','quarentena','descarte','reprocesso') THEN
      RAISE EXCEPTION 'ESTQ_DEVOLUCAO_CLASSIFICACAO: informe reintegravel|quarentena|descarte|reprocesso.'
        USING ERRCODE='check_violation';
    END IF;
    IF v_motivo IS NULL THEN
      RAISE EXCEPTION 'ESTQ_MOTIVO_OBRIGATORIO: informe o motivo da devolução.' USING ERRCODE='check_violation';
    END IF;
    IF v_classif = 'reintegravel' THEN
      SELECT * INTO v_lote FROM public.lotes WHERE id = v_item.lote_id;
      IF NOT EXISTS (SELECT 1 FROM public.controle_qualidade cq
                      WHERE cq.lote_id = v_item.lote_id AND cq.resultado = 'aprovado'::resultado_cq) THEN
        RAISE EXCEPTION 'ESTQ_DEVOLUCAO_CQ: lote sem CQ aprovado não pode ser reintegrado ao estoque comercial.'
          USING ERRCODE='check_violation';
      END IF;
      IF v_item.validade IS NOT NULL AND v_item.validade < current_date THEN
        RAISE EXCEPTION 'ESTQ_DEVOLUCAO_VALIDADE: item vencido não pode ser reintegrado.' USING ERRCODE='check_violation';
      END IF;
      v_ctx := v_ctx || jsonb_build_object('metadata',
        COALESCE(v_ctx->'metadata','{}'::jsonb) || jsonb_build_object('classificacao', v_classif));
      PERFORM public.fn_estoque_ctx_open(v_ctx);
      UPDATE public.estoque_produto SET quantidade = COALESCE(quantidade,0) + v_qtd WHERE id = p_item_id;
    ELSE
      v_ctx := v_ctx || jsonb_build_object('metadata',
        COALESCE(v_ctx->'metadata','{}'::jsonb) || jsonb_build_object('classificacao', v_classif, 'reintegrado', false));
      PERFORM public.fn_estoque_ctx_open(v_ctx);
      -- não reintegra saldo comercial: registra apenas a trilha da devolução
      UPDATE public.estoque_produto SET observacao_reserva = COALESCE(observacao_reserva, v_motivo) WHERE id = p_item_id;
      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, lote_id, usuario_id,
         saldo_anterior, saldo_posterior, reservado_anterior, reservado_posterior,
         unidade, direcao, origem, referencia_tipo, referencia_id, motivo,
         idempotency_key, request_fingerprint, metadata)
      VALUES (p_item_id, 'devolucao', v_qtd, v_item.status::text, v_item.status::text, v_item.lote_id, v_uid,
         COALESCE(v_item.quantidade,0), COALESCE(v_item.quantidade,0),
         COALESCE(v_item.quantidade_reservada,0), COALESCE(v_item.quantidade_reservada,0),
         COALESCE(p_payload->>'unidade','un'), 'neutro',
         COALESCE(p_payload->>'origem','rpc_estoque_operar_v1'),
         p_payload->>'referencia_tipo', NULLIF(p_payload->>'referencia_id','')::uuid, v_motivo,
         p_idempotency_key, v_fp,
         jsonb_build_object('classificacao', v_classif, 'reintegrado', false, 'motor','v1'));
    END IF;
    v_target_id := p_item_id;
  END IF;

  PERFORM public.fn_estoque_ctx_close();

  SELECT * INTO v_after FROM public.estoque_produto WHERE id = COALESCE(v_target_id, p_item_id);
  SELECT * INTO v_mov FROM public.estoque_movimentacoes
   WHERE idempotency_key = p_idempotency_key ORDER BY created_at DESC LIMIT 1;

  IF v_mov.id IS NULL THEN
    RAISE EXCEPTION 'ESTQ_SEM_TRILHA: operação não gerou lançamento no livro.' USING ERRCODE='internal_error';
  END IF;
  IF COALESCE(v_after.quantidade,0) < 0 OR COALESCE(v_after.quantidade_reservada,0) < 0 THEN
    RAISE EXCEPTION 'ESTQ_SALDO_NEGATIVO: operação resultaria em saldo negativo.' USING ERRCODE='check_violation';
  END IF;
  IF COALESCE(v_after.quantidade_reservada,0) > COALESCE(v_after.quantidade,0) THEN
    RAISE EXCEPTION 'ESTQ_RESERVA_MAIOR_QUE_SALDO' USING ERRCODE='check_violation';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'replay', false, 'acao', p_acao,
    'movimentacao_id', v_mov.id, 'estoque_produto_id', COALESCE(v_target_id, p_item_id),
    'saldo_anterior', v_mov.saldo_anterior, 'saldo_posterior', v_mov.saldo_posterior,
    'reservado_anterior', v_mov.reservado_anterior, 'reservado_posterior', v_mov.reservado_posterior,
    'status_anterior', v_mov.status_anterior, 'status_novo', v_mov.status_novo,
    'quantidade', v_mov.quantidade, 'unidade', v_mov.unidade);
END; $$;
REVOKE ALL ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb) TO authenticated, service_role;

-- ============================================================
-- FASE 4 — GUARDA CONTRA ALTERAÇÃO CRÍTICA FORA DO MOTOR
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_estoque_produto_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ctx jsonb := public.fn_estoque_ctx_read();
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ESTQ_DELETE_BLOQUEADO: itens de estoque não podem ser excluídos; use descarte/perda.'
      USING ERRCODE='insufficient_privilege';
  END IF;
  IF v_ctx IS NOT NULL THEN RETURN NEW; END IF;
  IF (OLD.status IS DISTINCT FROM NEW.status)
     OR (COALESCE(OLD.quantidade,0) IS DISTINCT FROM COALESCE(NEW.quantidade,0))
     OR (COALESCE(OLD.quantidade_reservada,0) IS DISTINCT FROM COALESCE(NEW.quantidade_reservada,0))
     OR (COALESCE(OLD.volume_total,0) IS DISTINCT FROM COALESCE(NEW.volume_total,0)) THEN
    RAISE EXCEPTION 'ESTQ_UPDATE_DIRETO_BLOQUEADO: saldo/reserva/situação só podem ser alterados pelas RPCs canônicas de estoque.'
      USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_estoque_produto_guard ON public.estoque_produto;
CREATE TRIGGER trg_estoque_produto_guard
  BEFORE UPDATE OR DELETE ON public.estoque_produto
  FOR EACH ROW EXECUTE FUNCTION public.fn_estoque_produto_guard();

REVOKE DELETE ON public.estoque_produto FROM authenticated;
REVOKE ALL ON public.estoque_produto FROM anon, PUBLIC;
REVOKE ALL ON public.estoque_embalagens FROM anon, PUBLIC;
REVOKE DELETE ON public.estoque_embalagens FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.estoque_produto TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.estoque_embalagens TO authenticated;
GRANT ALL ON public.estoque_produto TO service_role;
GRANT ALL ON public.estoque_embalagens TO service_role;
