CREATE OR REPLACE FUNCTION public.rpc_criar_embalagens_pos_envase(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_qtd int := COALESCE((p_payload->>'quantidade_embalagens')::int, 0);
  v_lote uuid := (p_payload->>'lote_id')::uuid;
  v_volume numeric := (p_payload->>'volume')::numeric;
  v_unidade text := COALESCE(p_payload->>'unidade','L');
  v_gerar_et bool := COALESCE((p_payload->>'gerar_etiqueta_automaticamente')::bool, false);
  v_envase uuid := NULLIF(p_payload->>'envase_id','')::uuid;
  v_produto uuid := NULLIF(p_payload->>'produto_id','')::uuid;
  v_cliente uuid := NULLIF(p_payload->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_payload->>'fazenda_id','')::uuid;
  v_fab date; v_val date;
  v_codigo text; v_emb_id uuid; v_etq_id uuid;
  v_arr jsonb := '[]'::jsonb;
  v_meta jsonb;
  v_produto_warning bool := false;
  v_warnings jsonb := '[]'::jsonb;
  i int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.can_user_manage_estoque_embalagem(gen_random_uuid()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  IF v_lote IS NULL THEN RAISE EXCEPTION 'lote_id obrigatório'; END IF;
  IF v_volume IS NULL OR v_volume <= 0 THEN RAISE EXCEPTION 'volume inválido'; END IF;
  IF v_qtd < 1 OR v_qtd > 500 THEN RAISE EXCEPTION 'quantidade entre 1 e 500'; END IF;

  -- Valida referências reais (Fase 2.2)
  IF NOT EXISTS (SELECT 1 FROM public.lotes WHERE id = v_lote) THEN
    RAISE EXCEPTION 'Lote informado não existe (%).', v_lote;
  END IF;
  IF v_envase IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.envase WHERE id = v_envase) THEN
    RAISE EXCEPTION 'Envase informado não existe (%).', v_envase;
  END IF;
  IF v_cliente IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = v_cliente) THEN
    RAISE EXCEPTION 'Cliente informado não existe (%).', v_cliente;
  END IF;
  IF v_fazenda IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fazendas WHERE id = v_fazenda) THEN
    RAISE EXCEPTION 'Fazenda informada não existe (%).', v_fazenda;
  END IF;

  -- Fallback de produto_id a partir do lote
  IF v_produto IS NULL THEN
    SELECT produto_id INTO v_produto FROM public.lotes WHERE id = v_lote;
  END IF;
  IF v_produto IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = v_produto) THEN
    RAISE EXCEPTION 'Produto informado não existe (%).', v_produto;
  END IF;
  IF v_produto IS NULL THEN
    v_produto_warning := true;
    v_warnings := v_warnings || to_jsonb('produto_id_nao_identificado'::text);
  END IF;

  SELECT data_envase INTO v_fab FROM public.envase WHERE id = v_envase;
  IF v_fab IS NULL THEN v_fab := CURRENT_DATE; END IF;
  v_val := v_fab + INTERVAL '6 months';

  FOR i IN 1..v_qtd LOOP
    v_codigo := 'AR-EMB-' || lpad(nextval('public.estoque_embalagem_seq')::text, 6, '0');
    v_meta := jsonb_build_object();
    IF v_produto_warning THEN
      v_meta := v_meta || jsonb_build_object('produto_id_nao_identificado', true);
    END IF;

    INSERT INTO public.estoque_embalagens(
      codigo_embalagem, lote_id, produto_id, envase_id, envase_item_id, volume, unidade, quantidade,
      tipo_embalagem, local_estoque, cliente_id, fazenda_id, fabricado_em, validade_em,
      entrada_estoque_em, criado_por, metadata
    ) VALUES (
      v_codigo, v_lote, v_produto, v_envase,
      NULLIF(p_payload->>'envase_item_id','')::uuid,
      v_volume, v_unidade, 1,
      p_payload->>'tipo_embalagem',
      p_payload->>'local_estoque',
      v_cliente, v_fazenda,
      v_fab, v_val,
      now(), v_uid, v_meta
    ) RETURNING id INTO v_emb_id;

    INSERT INTO public.estoque_embalagem_movimentacoes(embalagem_id, tipo_movimentacao, status_novo, user_id, metadata)
      VALUES (v_emb_id, 'entrada_estoque', 'em_estoque', v_uid, jsonb_build_object('codigo', v_codigo));

    v_etq_id := NULL;
    IF v_gerar_et THEN
      SELECT (public.rpc_gerar_etiqueta_produto(jsonb_build_object(
        'lote_id', v_lote, 'envase_id', v_envase,
        'produto_id', v_produto,
        'cliente_id', v_cliente,
        'fazenda_id', v_fazenda,
        'volume', v_volume, 'unidade', v_unidade,
        'quantidade_embalagens', 1
      )) ->> 'etiqueta_id')::uuid INTO v_etq_id;

      IF v_etq_id IS NULL THEN
        RAISE EXCEPTION 'Falha ao gerar etiqueta automática para a embalagem. Nenhuma embalagem foi criada. Tente novamente ou gere as embalagens sem etiqueta automática.';
      END IF;

      UPDATE public.estoque_embalagens SET etiqueta_id = v_etq_id WHERE id = v_emb_id;
      UPDATE public.produto_etiquetas SET embalagem_id = v_emb_id WHERE id = v_etq_id;
      INSERT INTO public.estoque_embalagem_movimentacoes(embalagem_id, tipo_movimentacao, user_id, metadata)
        VALUES (v_emb_id, 'etiqueta_vinculada', v_uid, jsonb_build_object('etiqueta_id', v_etq_id));
      INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, user_id, metadata)
        VALUES (v_etq_id, 'etiqueta_gerada', v_uid, jsonb_build_object('embalagem_id', v_emb_id));
    END IF;

    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, new_data)
      VALUES ('estoque_embalagem', v_emb_id, 'EMB_CREATED', v_uid,
              jsonb_build_object('codigo', v_codigo, 'etiqueta_id', v_etq_id, 'produto_id', v_produto));

    v_arr := v_arr || jsonb_build_object('embalagem_id', v_emb_id, 'codigo_embalagem', v_codigo, 'etiqueta_id', v_etq_id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total_embalagens', v_qtd,
    'embalagens', v_arr,
    'warnings', v_warnings
  );
END $function$
