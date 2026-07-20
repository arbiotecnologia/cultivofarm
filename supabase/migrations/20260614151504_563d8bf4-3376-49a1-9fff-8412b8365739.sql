
-- ============ FASE ENVASE 2 ============
-- 1) Garantir RPC desvincular (Fase 1.1.1) caso não exista
CREATE OR REPLACE FUNCTION public.rpc_desvincular_etiqueta_entrega(
  p_entrega_id uuid, p_etiqueta_id uuid, p_motivo text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'motivo obrigatório (>= 3 chars)';
  END IF;
  IF NOT (public.has_role(v_uid,'administrador'::app_role)
       OR public.has_role(v_uid,'gestor'::app_role)
       OR public.has_role(v_uid,'producao'::app_role)
       OR public.has_role(v_uid,'operador_onfarm'::app_role)) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  UPDATE public.entrega_etiquetas
     SET ativo=false, desvinculado_em=now(), desvinculado_por=v_uid, motivo_desvinculacao=p_motivo
   WHERE entrega_id=p_entrega_id AND etiqueta_id=p_etiqueta_id AND ativo=true;
  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, descricao, user_id, metadata)
    VALUES (p_etiqueta_id,'etiqueta_substituida','Desvinculada de entrega',v_uid,
            jsonb_build_object('entrega_id',p_entrega_id,'motivo',p_motivo));
  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, new_data, reason)
    VALUES ('produto_etiqueta', p_etiqueta_id, 'LABEL_DELIVERY_UNLINKED', v_uid,
            jsonb_build_object('entrega_id',p_entrega_id), p_motivo);
  RETURN jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.rpc_desvincular_etiqueta_entrega(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_desvincular_etiqueta_entrega(uuid,uuid,text) TO authenticated;

-- 2) Sequence
CREATE SEQUENCE IF NOT EXISTS public.estoque_embalagem_seq START 1;

-- 3) Tabela estoque_embalagens
CREATE TABLE IF NOT EXISTS public.estoque_embalagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_embalagem text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'em_estoque',
  lote_id uuid NOT NULL,
  produto_id uuid NULL,
  envase_id uuid NULL,
  envase_item_id uuid NULL,
  etiqueta_id uuid NULL REFERENCES public.produto_etiquetas(id) ON DELETE SET NULL,
  cliente_id uuid NULL,
  fazenda_id uuid NULL,
  entrega_id uuid NULL,
  entrega_item_id uuid NULL,
  volume numeric NOT NULL,
  unidade text NOT NULL DEFAULT 'L',
  quantidade integer NOT NULL DEFAULT 1,
  tipo_embalagem text NULL,
  identificacao_local text NULL,
  local_estoque text NULL,
  fabricado_em date NULL,
  validade_em date NULL,
  entrada_estoque_em timestamptz NULL,
  reservado_em timestamptz NULL,
  separado_em timestamptz NULL,
  entregue_em timestamptz NULL,
  cancelado_em timestamptz NULL,
  descartado_em timestamptz NULL,
  criado_por uuid NULL,
  reservado_por uuid NULL,
  separado_por uuid NULL,
  entregue_por uuid NULL,
  cancelado_por uuid NULL,
  descartado_por uuid NULL,
  motivo_cancelamento text NULL,
  motivo_descarte text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estoque_embalagens_status_chk CHECK (status IN
    ('em_estoque','reservado','separado','entregue','cancelado','descartado','vencido','bloqueado_cq','bloqueado_operacional'))
);
GRANT SELECT, INSERT, UPDATE ON public.estoque_embalagens TO authenticated;
GRANT ALL ON public.estoque_embalagens TO service_role;
ALTER TABLE public.estoque_embalagens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_estoque_embalagens_codigo ON public.estoque_embalagens(codigo_embalagem);
CREATE INDEX IF NOT EXISTS idx_estoque_embalagens_status ON public.estoque_embalagens(status);
CREATE INDEX IF NOT EXISTS idx_estoque_embalagens_lote_id ON public.estoque_embalagens(lote_id);
CREATE INDEX IF NOT EXISTS idx_estoque_embalagens_produto_id ON public.estoque_embalagens(produto_id);
CREATE INDEX IF NOT EXISTS idx_estoque_embalagens_envase_id ON public.estoque_embalagens(envase_id);
CREATE INDEX IF NOT EXISTS idx_estoque_embalagens_etiqueta_id ON public.estoque_embalagens(etiqueta_id);
CREATE INDEX IF NOT EXISTS idx_estoque_embalagens_cliente_id ON public.estoque_embalagens(cliente_id);
CREATE INDEX IF NOT EXISTS idx_estoque_embalagens_fazenda_id ON public.estoque_embalagens(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_estoque_embalagens_entrega_id ON public.estoque_embalagens(entrega_id);
CREATE INDEX IF NOT EXISTS idx_estoque_embalagens_validade_em ON public.estoque_embalagens(validade_em);

-- 4) Movimentações
CREATE TABLE IF NOT EXISTS public.estoque_embalagem_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embalagem_id uuid NOT NULL REFERENCES public.estoque_embalagens(id) ON DELETE CASCADE,
  tipo_movimentacao text NOT NULL,
  status_anterior text NULL,
  status_novo text NULL,
  origem text NULL,
  destino text NULL,
  entrega_id uuid NULL,
  entrega_item_id uuid NULL,
  user_id uuid NULL,
  observacao text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.estoque_embalagem_movimentacoes TO authenticated;
GRANT ALL ON public.estoque_embalagem_movimentacoes TO service_role;
ALTER TABLE public.estoque_embalagem_movimentacoes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_eemb_mov_embalagem_id ON public.estoque_embalagem_movimentacoes(embalagem_id);
CREATE INDEX IF NOT EXISTS idx_eemb_mov_tipo ON public.estoque_embalagem_movimentacoes(tipo_movimentacao);
CREATE INDEX IF NOT EXISTS idx_eemb_mov_created_at ON public.estoque_embalagem_movimentacoes(created_at);

-- 5) Alterações
ALTER TABLE public.produto_etiquetas
  ADD COLUMN IF NOT EXISTS embalagem_id uuid NULL REFERENCES public.estoque_embalagens(id) ON DELETE SET NULL;

ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS separacao_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS separacao_confirmada_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS separacao_confirmada_por uuid NULL;

-- 6) Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_estoque_embalagens_updated ON public.estoque_embalagens;
CREATE TRIGGER trg_estoque_embalagens_updated BEFORE UPDATE ON public.estoque_embalagens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) Funções de acesso
CREATE OR REPLACE FUNCTION public.can_user_access_estoque_embalagem(p_embalagem_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_cli uuid; v_status text; v_entrega uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT cliente_id, status, entrega_id INTO v_cli, v_status, v_entrega
    FROM public.estoque_embalagens WHERE id = p_embalagem_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF public.has_role(v_uid,'administrador'::app_role)
     OR public.has_role(v_uid,'gestor'::app_role)
     OR public.has_role(v_uid,'producao'::app_role)
     OR public.has_role(v_uid,'operador_onfarm'::app_role)
     OR public.has_role(v_uid,'administrativo'::app_role) THEN
    RETURN true;
  END IF;
  IF public.has_role(v_uid,'financeiro'::app_role) THEN
    RETURN v_entrega IS NOT NULL;
  END IF;
  IF public.has_role(v_uid,'consultor_tecnico'::app_role)
     OR public.has_role(v_uid,'tecnico_agronomo'::app_role) THEN
    RETURN v_cli IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.user_clientes WHERE user_id=v_uid AND cliente_id=v_cli);
  END IF;
  IF public.has_role(v_uid,'cliente_produtor'::app_role) THEN
    RETURN v_status='entregue' AND v_cli IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.user_clientes WHERE user_id=v_uid AND cliente_id=v_cli);
  END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.can_user_manage_estoque_embalagem(p_embalagem_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  RETURN public.has_role(v_uid,'administrador'::app_role)
      OR public.has_role(v_uid,'gestor'::app_role)
      OR public.has_role(v_uid,'producao'::app_role)
      OR public.has_role(v_uid,'operador_onfarm'::app_role);
END $$;

-- 8) RLS Policies
CREATE POLICY "emb_select" ON public.estoque_embalagens
  FOR SELECT TO authenticated USING (public.can_user_access_estoque_embalagem(id));
CREATE POLICY "emb_insert" ON public.estoque_embalagens
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role));
CREATE POLICY "emb_update" ON public.estoque_embalagens
  FOR UPDATE TO authenticated
  USING (public.can_user_manage_estoque_embalagem(id))
  WITH CHECK (public.can_user_manage_estoque_embalagem(id));

CREATE POLICY "emb_mov_select" ON public.estoque_embalagem_movimentacoes
  FOR SELECT TO authenticated USING (public.can_user_access_estoque_embalagem(embalagem_id));
CREATE POLICY "emb_mov_insert" ON public.estoque_embalagem_movimentacoes
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
    OR public.has_role(auth.uid(),'administrativo'::app_role));

-- 9) RPCs
CREATE OR REPLACE FUNCTION public.rpc_recalcular_separacao_entrega(p_entrega_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_total int; v_res int; v_sep int; v_ent int; v_status text;
BEGIN
  SELECT count(*) FILTER (WHERE status NOT IN ('cancelado','descartado')),
         count(*) FILTER (WHERE status='reservado'),
         count(*) FILTER (WHERE status='separado'),
         count(*) FILTER (WHERE status='entregue')
    INTO v_total, v_res, v_sep, v_ent
    FROM public.estoque_embalagens WHERE entrega_id = p_entrega_id;
  IF v_total = 0 THEN v_status := 'pendente';
  ELSIF (v_sep + v_ent) = v_total THEN v_status := 'separada';
  ELSIF (v_sep + v_ent) > 0 THEN v_status := 'parcialmente_separada';
  ELSE v_status := 'pendente';
  END IF;
  UPDATE public.entregas SET separacao_status = v_status WHERE id = p_entrega_id;
  RETURN v_status;
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_recalcular_separacao_entrega(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_criar_embalagens_pos_envase(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_qtd int := COALESCE((p_payload->>'quantidade_embalagens')::int, 0);
  v_lote uuid := (p_payload->>'lote_id')::uuid;
  v_volume numeric := (p_payload->>'volume')::numeric;
  v_unidade text := COALESCE(p_payload->>'unidade','L');
  v_gerar_et bool := COALESCE((p_payload->>'gerar_etiqueta_automaticamente')::bool, false);
  v_envase uuid := NULLIF(p_payload->>'envase_id','')::uuid;
  v_fab date; v_val date;
  v_codigo text; v_emb_id uuid; v_etq_id uuid;
  v_arr jsonb := '[]'::jsonb;
  i int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.can_user_manage_estoque_embalagem(gen_random_uuid()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  IF v_lote IS NULL THEN RAISE EXCEPTION 'lote_id obrigatório'; END IF;
  IF v_volume IS NULL OR v_volume <= 0 THEN RAISE EXCEPTION 'volume inválido'; END IF;
  IF v_qtd < 1 OR v_qtd > 500 THEN RAISE EXCEPTION 'quantidade entre 1 e 500'; END IF;

  SELECT data_envase INTO v_fab FROM public.envase WHERE id = v_envase;
  IF v_fab IS NULL THEN v_fab := CURRENT_DATE; END IF;
  v_val := v_fab + INTERVAL '6 months';

  FOR i IN 1..v_qtd LOOP
    v_codigo := 'AR-EMB-' || lpad(nextval('public.estoque_embalagem_seq')::text, 6, '0');
    INSERT INTO public.estoque_embalagens(
      codigo_embalagem, lote_id, produto_id, envase_id, envase_item_id, volume, unidade, quantidade,
      tipo_embalagem, local_estoque, cliente_id, fazenda_id, fabricado_em, validade_em,
      entrada_estoque_em, criado_por
    ) VALUES (
      v_codigo, v_lote,
      NULLIF(p_payload->>'produto_id','')::uuid,
      v_envase,
      NULLIF(p_payload->>'envase_item_id','')::uuid,
      v_volume, v_unidade, 1,
      p_payload->>'tipo_embalagem',
      p_payload->>'local_estoque',
      NULLIF(p_payload->>'cliente_id','')::uuid,
      NULLIF(p_payload->>'fazenda_id','')::uuid,
      v_fab, v_val,
      now(), v_uid
    ) RETURNING id INTO v_emb_id;

    INSERT INTO public.estoque_embalagem_movimentacoes(embalagem_id, tipo_movimentacao, status_novo, user_id, metadata)
      VALUES (v_emb_id, 'entrada_estoque', 'em_estoque', v_uid, jsonb_build_object('codigo', v_codigo));

    v_etq_id := NULL;
    IF v_gerar_et THEN
      BEGIN
        SELECT (public.rpc_gerar_etiqueta_produto(jsonb_build_object(
          'lote_id', v_lote, 'envase_id', v_envase,
          'produto_id', NULLIF(p_payload->>'produto_id','')::uuid,
          'cliente_id', NULLIF(p_payload->>'cliente_id','')::uuid,
          'fazenda_id', NULLIF(p_payload->>'fazenda_id','')::uuid,
          'volume', v_volume, 'unidade', v_unidade,
          'quantidade_embalagens', 1
        )) ->> 'etiqueta_id')::uuid INTO v_etq_id;
        IF v_etq_id IS NOT NULL THEN
          UPDATE public.estoque_embalagens SET etiqueta_id = v_etq_id WHERE id = v_emb_id;
          UPDATE public.produto_etiquetas SET embalagem_id = v_emb_id WHERE id = v_etq_id;
          INSERT INTO public.estoque_embalagem_movimentacoes(embalagem_id, tipo_movimentacao, user_id, metadata)
            VALUES (v_emb_id, 'etiqueta_vinculada', v_uid, jsonb_build_object('etiqueta_id', v_etq_id));
          INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, user_id, metadata)
            VALUES (v_etq_id, 'etiqueta_gerada', v_uid, jsonb_build_object('embalagem_id', v_emb_id));
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- não bloquear criação se etiqueta automática falhar
        NULL;
      END;
    END IF;

    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, new_data)
      VALUES ('estoque_embalagem', v_emb_id, 'EMB_CREATED', v_uid,
              jsonb_build_object('codigo', v_codigo, 'etiqueta_id', v_etq_id));

    v_arr := v_arr || jsonb_build_object('embalagem_id', v_emb_id, 'codigo_embalagem', v_codigo, 'etiqueta_id', v_etq_id);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'total_embalagens', v_qtd, 'embalagens', v_arr);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_criar_embalagens_pos_envase(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_vincular_etiqueta_embalagem(p_embalagem_id uuid, p_etiqueta_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_st text; v_et_st text; v_dup uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.can_user_manage_estoque_embalagem(p_embalagem_id) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT status INTO v_st FROM public.estoque_embalagens WHERE id = p_embalagem_id;
  IF v_st IS NULL THEN RAISE EXCEPTION 'embalagem inexistente'; END IF;
  IF v_st IN ('cancelado','descartado','entregue') THEN RAISE EXCEPTION 'embalagem em status %', v_st; END IF;
  SELECT status INTO v_et_st FROM public.produto_etiquetas WHERE id = p_etiqueta_id;
  IF v_et_st IS NULL THEN RAISE EXCEPTION 'etiqueta inexistente'; END IF;
  IF v_et_st = 'cancelada' THEN RAISE EXCEPTION 'etiqueta cancelada'; END IF;
  SELECT id INTO v_dup FROM public.estoque_embalagens
    WHERE etiqueta_id = p_etiqueta_id AND id <> p_embalagem_id AND status NOT IN ('cancelado','descartado') LIMIT 1;
  IF v_dup IS NOT NULL THEN RAISE EXCEPTION 'etiqueta já vinculada a outra embalagem ativa'; END IF;
  UPDATE public.estoque_embalagens SET etiqueta_id = p_etiqueta_id WHERE id = p_embalagem_id;
  UPDATE public.produto_etiquetas SET embalagem_id = p_embalagem_id WHERE id = p_etiqueta_id;
  INSERT INTO public.estoque_embalagem_movimentacoes(embalagem_id, tipo_movimentacao, user_id, metadata)
    VALUES (p_embalagem_id, 'etiqueta_vinculada', v_uid, jsonb_build_object('etiqueta_id', p_etiqueta_id));
  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, user_id, metadata)
    VALUES (p_etiqueta_id, 'etiqueta_substituida', v_uid, jsonb_build_object('embalagem_id', p_embalagem_id));
  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, new_data)
    VALUES ('estoque_embalagem', p_embalagem_id, 'EMB_LABEL_LINKED', v_uid, jsonb_build_object('etiqueta_id', p_etiqueta_id));
  RETURN jsonb_build_object('success', true);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_vincular_etiqueta_embalagem(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_reservar_embalagem_entrega(p_embalagem_id uuid, p_entrega_id uuid, p_entrega_item_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_st text; v_val date; v_ent_st text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.can_user_manage_estoque_embalagem(p_embalagem_id) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT status, validade_em INTO v_st, v_val FROM public.estoque_embalagens WHERE id = p_embalagem_id;
  IF v_st IS NULL THEN RAISE EXCEPTION 'embalagem inexistente'; END IF;
  IF v_st <> 'em_estoque' THEN RAISE EXCEPTION 'embalagem não está em estoque (status=%)', v_st; END IF;
  IF v_val IS NOT NULL AND v_val < CURRENT_DATE THEN RAISE EXCEPTION 'embalagem vencida'; END IF;
  SELECT status::text INTO v_ent_st FROM public.entregas WHERE id = p_entrega_id;
  IF v_ent_st IS NULL THEN RAISE EXCEPTION 'entrega inexistente'; END IF;
  IF v_ent_st = 'cancelada' THEN RAISE EXCEPTION 'entrega cancelada'; END IF;
  UPDATE public.estoque_embalagens
     SET status='reservado', entrega_id=p_entrega_id, entrega_item_id=p_entrega_item_id,
         reservado_em=now(), reservado_por=v_uid
   WHERE id = p_embalagem_id;
  INSERT INTO public.estoque_embalagem_movimentacoes(embalagem_id, tipo_movimentacao, status_anterior, status_novo, entrega_id, entrega_item_id, user_id)
    VALUES (p_embalagem_id, 'reserva_entrega', v_st, 'reservado', p_entrega_id, p_entrega_item_id, v_uid);
  PERFORM public.rpc_recalcular_separacao_entrega(p_entrega_id);
  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, new_data)
    VALUES ('estoque_embalagem', p_embalagem_id, 'EMB_RESERVED', v_uid, jsonb_build_object('entrega_id', p_entrega_id));
  RETURN jsonb_build_object('success', true);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_reservar_embalagem_entrega(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_confirmar_separacao_embalagem(p_embalagem_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_st text; v_ent uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT (public.can_user_manage_estoque_embalagem(p_embalagem_id)
       OR public.has_role(v_uid,'administrativo'::app_role)) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT status, entrega_id INTO v_st, v_ent FROM public.estoque_embalagens WHERE id = p_embalagem_id;
  IF v_st <> 'reservado' THEN RAISE EXCEPTION 'embalagem não está reservada'; END IF;
  UPDATE public.estoque_embalagens SET status='separado', separado_em=now(), separado_por=v_uid WHERE id = p_embalagem_id;
  INSERT INTO public.estoque_embalagem_movimentacoes(embalagem_id, tipo_movimentacao, status_anterior, status_novo, entrega_id, user_id)
    VALUES (p_embalagem_id, 'separacao_entrega', 'reservado', 'separado', v_ent, v_uid);
  IF v_ent IS NOT NULL THEN PERFORM public.rpc_recalcular_separacao_entrega(v_ent); END IF;
  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by)
    VALUES ('estoque_embalagem', p_embalagem_id, 'EMB_PICKED', v_uid);
  RETURN jsonb_build_object('success', true);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_confirmar_separacao_embalagem(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_confirmar_entrega_embalagens(p_entrega_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT (public.has_role(v_uid,'administrador'::app_role)
       OR public.has_role(v_uid,'gestor'::app_role)
       OR public.has_role(v_uid,'producao'::app_role)
       OR public.has_role(v_uid,'operador_onfarm'::app_role)) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT count(*) INTO v_count FROM public.estoque_embalagens
   WHERE entrega_id = p_entrega_id AND status IN ('reservado','separado');
  IF v_count = 0 THEN RAISE EXCEPTION 'nenhuma embalagem reservada/separada para esta entrega'; END IF;
  UPDATE public.estoque_embalagens
     SET status='entregue', entregue_em=now(), entregue_por=v_uid
   WHERE entrega_id = p_entrega_id AND status IN ('reservado','separado');
  INSERT INTO public.estoque_embalagem_movimentacoes(embalagem_id, tipo_movimentacao, status_novo, entrega_id, user_id)
    SELECT id, 'entrega_confirmada', 'entregue', p_entrega_id, v_uid
      FROM public.estoque_embalagens WHERE entrega_id = p_entrega_id AND status = 'entregue';
  PERFORM public.rpc_recalcular_separacao_entrega(p_entrega_id);
  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, new_data)
    VALUES ('estoque_embalagem', p_entrega_id, 'EMB_DELIVERED', v_uid, jsonb_build_object('entrega_id', p_entrega_id, 'qtd', v_count));
  RETURN jsonb_build_object('success', true, 'total', v_count);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_confirmar_entrega_embalagens(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_cancelar_embalagem(p_embalagem_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_st text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.can_user_manage_estoque_embalagem(p_embalagem_id) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN RAISE EXCEPTION 'motivo obrigatório'; END IF;
  SELECT status INTO v_st FROM public.estoque_embalagens WHERE id = p_embalagem_id;
  IF v_st = 'entregue' THEN RAISE EXCEPTION 'embalagem já entregue'; END IF;
  UPDATE public.estoque_embalagens SET status='cancelado', cancelado_em=now(), cancelado_por=v_uid, motivo_cancelamento=p_motivo WHERE id = p_embalagem_id;
  INSERT INTO public.estoque_embalagem_movimentacoes(embalagem_id, tipo_movimentacao, status_anterior, status_novo, user_id, observacao)
    VALUES (p_embalagem_id, 'cancelamento', v_st, 'cancelado', v_uid, p_motivo);
  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, reason)
    VALUES ('estoque_embalagem', p_embalagem_id, 'EMB_CANCELLED', v_uid, p_motivo);
  RETURN jsonb_build_object('success', true);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_cancelar_embalagem(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_descartar_embalagem(p_embalagem_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_st text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.can_user_manage_estoque_embalagem(p_embalagem_id) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN RAISE EXCEPTION 'motivo obrigatório'; END IF;
  SELECT status INTO v_st FROM public.estoque_embalagens WHERE id = p_embalagem_id;
  IF v_st = 'entregue' THEN RAISE EXCEPTION 'embalagem já entregue'; END IF;
  UPDATE public.estoque_embalagens SET status='descartado', descartado_em=now(), descartado_por=v_uid, motivo_descarte=p_motivo WHERE id = p_embalagem_id;
  INSERT INTO public.estoque_embalagem_movimentacoes(embalagem_id, tipo_movimentacao, status_anterior, status_novo, user_id, observacao)
    VALUES (p_embalagem_id, 'descarte', v_st, 'descartado', v_uid, p_motivo);
  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, reason)
    VALUES ('estoque_embalagem', p_embalagem_id, 'EMB_DISCARDED', v_uid, p_motivo);
  RETURN jsonb_build_object('success', true);
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_descartar_embalagem(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_ler_embalagem_por_qr(p_codigo_ou_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_emb record; v_etq_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  -- Tenta codigo_embalagem direto
  SELECT * INTO v_emb FROM public.estoque_embalagens WHERE codigo_embalagem = p_codigo_ou_token LIMIT 1;
  IF NOT FOUND THEN
    -- Tenta via etiqueta (codigo ou trace_token)
    SELECT id INTO v_etq_id FROM public.produto_etiquetas
     WHERE codigo_etiqueta = p_codigo_ou_token
        OR trace_token::text = p_codigo_ou_token
     LIMIT 1;
    IF v_etq_id IS NOT NULL THEN
      SELECT * INTO v_emb FROM public.estoque_embalagens WHERE etiqueta_id = v_etq_id LIMIT 1;
    END IF;
  END IF;
  IF v_emb.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  IF NOT public.can_user_access_estoque_embalagem(v_emb.id) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  INSERT INTO public.estoque_embalagem_movimentacoes(embalagem_id, tipo_movimentacao, user_id)
    VALUES (v_emb.id, 'leitura_qr', v_uid);
  RETURN jsonb_build_object(
    'found', true,
    'embalagem_id', v_emb.id,
    'codigo_embalagem', v_emb.codigo_embalagem,
    'status', v_emb.status,
    'lote_id', v_emb.lote_id,
    'produto_id', v_emb.produto_id,
    'etiqueta_id', v_emb.etiqueta_id,
    'entrega_id', v_emb.entrega_id,
    'validade_em', v_emb.validade_em,
    'volume', v_emb.volume,
    'unidade', v_emb.unidade
  );
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_ler_embalagem_por_qr(text) TO authenticated;
