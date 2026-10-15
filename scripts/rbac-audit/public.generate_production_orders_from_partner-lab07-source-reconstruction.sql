-- SOURCE RECONSTRUCTION, NOT exact pg_get_functiondef live snapshot; never a before-hash oracle.
CREATE OR REPLACE FUNCTION public.generate_production_orders_from_partner(p_partner_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_planning_id uuid;
  v_partner_id uuid;
  v_order_numero text;
  v_order_status text;
  v_ready boolean;
  v_partner_nome text;
  v_grp RECORD;
  v_item RECORD;
  v_os_id uuid;
  v_numero text;
  v_count int := 0;
  v_uid uuid := auth.uid();
  v_ids uuid[] := ARRAY[]::uuid[];
  v_anchor_item_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_partner_order_id AND internal_origin_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'gestor')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- H5-B01: serializa geração concorrente por pedido (idempotência de resultado)
  PERFORM pg_advisory_xact_lock(hashtext('generate_production_orders_from_partner:' || p_partner_order_id::text));

  SELECT po.partner_id, po.numero, po.status::text, po.ready_for_production
    INTO v_partner_id, v_order_numero, v_order_status, v_ready
  FROM public.partner_orders po
  WHERE po.id = p_partner_order_id;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Pedido B2B não encontrado';
  END IF;

  IF v_order_status IN ('cancelado','reprovado','faturado','entregue') THEN
    RAISE EXCEPTION 'Pedido B2B não pode gerar produção (status: %)', v_order_status;
  END IF;

  -- Fase 7: bloqueia produção enquanto aprovação financeira exigida está pendente/rejeitada
   IF EXISTS (
     SELECT 1 FROM public.partner_orders po2
     WHERE po2.id = p_partner_order_id
       AND po2.requires_financial_approval = true
       AND po2.financial_approval_status IN ('pending','rejected')
   ) THEN
     RAISE EXCEPTION 'financial_approval_required_before_production';
   END IF;

   IF v_order_status <> 'aprovado' OR v_ready IS NOT TRUE THEN
    RAISE EXCEPTION 'Pedido B2B ainda não está aprovado para produção.';
  END IF;

  SELECT id INTO v_planning_id FROM public.production_planning WHERE partner_order_id = p_partner_order_id;
  IF v_planning_id IS NULL THEN
    RAISE EXCEPTION 'Planejamento não encontrado para o pedido %', p_partner_order_id;
  END IF;

  SELECT COALESCE(nome_fantasia, razao_social) INTO v_partner_nome FROM public.partner_accounts WHERE id = v_partner_id;

  FOR v_grp IN
    WITH itens AS (
      SELECT poi.id,
             poi.product_id,
             poi.quantidade,
             COALESCE(poi.unidade_medida,'unidade') AS unidade_medida,
             poi.preco_tabela_snapshot,
             poi.preco_unitario,
             poi.produto_nome_snapshot,
             poi.produto_codigo_snapshot,
             poi.created_at,
             cv.volume_ml AS vasilhame_volume_ml
      FROM public.partner_order_items poi
      LEFT JOIN LATERAL (
        SELECT cv2.volume_ml
          FROM public.catalogo_volumes cv2
         WHERE cv2.item_tipo = 'produto'
           AND cv2.produto_id = poi.product_id
           AND cv2.ativo = true
         ORDER BY (cv2.preco_brl = COALESCE(poi.preco_tabela_snapshot, poi.preco_unitario)) DESC,
                  ABS(cv2.preco_brl - COALESCE(poi.preco_tabela_snapshot, poi.preco_unitario)) ASC
         LIMIT 1
      ) cv ON true
      WHERE poi.order_id = p_partner_order_id
        AND poi.product_id IS NOT NULL
        AND COALESCE(poi.unidade_medida,'unidade') <> 'hectare'
        AND NOT EXISTS (
          SELECT 1 FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id
        )
    )
    SELECT product_id,
           MIN(produto_nome_snapshot) AS produto_nome,
           MIN(produto_codigo_snapshot) AS produto_codigo,
           SUM(
             CASE unidade_medida
               WHEN 'ml'    THEN quantidade
               WHEN 'litro' THEN quantidade * 1000
               WHEN 'unidade' THEN quantidade * vasilhame_volume_ml
               WHEN 'dose'    THEN quantidade * vasilhame_volume_ml
               ELSE NULL
             END
           ) AS volume_total_ml,
           bool_or(
             unidade_medida IN ('unidade','dose') AND vasilhame_volume_ml IS NULL
           ) AS faltou_vasilhame,
           array_agg(id ORDER BY created_at, id) AS item_ids,
           (array_agg(id ORDER BY created_at, id))[1] AS anchor_id
    FROM itens
    GROUP BY product_id
  LOOP
    IF v_grp.faltou_vasilhame THEN
      RAISE EXCEPTION 'Produto % (%) está em unidade/dose mas não tem vasilhame ativo no catálogo. Configure o vasilhame antes de gerar produção.',
        COALESCE(v_grp.produto_nome,'?'), COALESCE(v_grp.produto_codigo,'?');
    END IF;

    IF v_grp.volume_total_ml IS NULL OR v_grp.volume_total_ml <= 0 THEN
      RAISE EXCEPTION 'Não foi possível calcular o volume do produto % (%).',
        COALESCE(v_grp.produto_nome,'?'), COALESCE(v_grp.produto_codigo,'?');
    END IF;

    v_anchor_item_id := v_grp.anchor_id;
    v_numero := 'OS-B2B-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.ordens_servico (
      cliente_id, fazenda_id, talhao_id, produto_id, volume_total_ml, area_hectares,
      prioridade, status, tipo_item, numero_os,
      partner_order_id, partner_order_item_id, origem
    ) VALUES (
      NULL, NULL, NULL, v_grp.product_id, v_grp.volume_total_ml, NULL,
      'media','aprovada','produto', v_numero,
      p_partner_order_id, v_anchor_item_id, 'b2b'
    ) RETURNING id INTO v_os_id;

    INSERT INTO public.production_order_link (
      partner_order_id, partner_order_item_id, planning_id, ordem_servico_id, created_by
    )
    SELECT p_partner_order_id, unnest(v_grp.item_ids), v_planning_id, v_os_id, v_uid;

    v_ids := array_append(v_ids, v_os_id);
    v_count := v_count + 1;
  END LOOP;

  FOR v_item IN
    SELECT poi.* FROM public.partner_order_items poi
    WHERE poi.order_id = p_partner_order_id
      AND NOT EXISTS (SELECT 1 FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id)
      AND (
        poi.product_id IS NULL
        OR COALESCE(poi.unidade_medida,'unidade') = 'hectare'
      )
  LOOP
    v_numero := 'OS-B2B-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.ordens_servico (
      cliente_id, fazenda_id, talhao_id, produto_id, microrganismo_id, volume_total_ml, area_hectares,
      prioridade, status, tipo_item, numero_os,
      partner_order_id, partner_order_item_id, origem
    ) VALUES (
      NULL, NULL, NULL, v_item.product_id, v_item.microrganismo_id, NULL,
      CASE WHEN COALESCE(v_item.unidade_medida,'unidade') = 'hectare' THEN v_item.quantidade ELSE NULL END,
      'media','aprovada',
      CASE WHEN v_item.product_id IS NULL THEN 'microrganismo' ELSE 'produto' END,
      v_numero,
      p_partner_order_id, v_item.id, 'b2b'
    ) RETURNING id INTO v_os_id;

    INSERT INTO public.production_order_link (
      partner_order_id, partner_order_item_id, planning_id, ordem_servico_id, created_by
    ) VALUES (p_partner_order_id, v_item.id, v_planning_id, v_os_id, v_uid);

    v_ids := array_append(v_ids, v_os_id);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'os_created', 0, 'planning_id', v_planning_id,
                              'message', 'Nenhuma nova OS gerada. Pedido já possui ordens vinculadas.');
  END IF;

  UPDATE public.production_planning
     SET status = 'planejado', updated_at = now()
   WHERE id = v_planning_id AND status = 'aguardando_planejamento';

  INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
  VALUES (p_partner_order_id, 'op_gerada', v_uid, jsonb_build_object('os_count', v_count, 'planning_id', v_planning_id));

  INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (
    p_partner_order_id, v_partner_id, v_uid, 'op_gerada',
    jsonb_build_object(
      'planning_id', v_planning_id,
      'os_count', v_count,
      'ordens_servico_ids', to_jsonb(v_ids),
      'created_at', now()
    )
  );

  RETURN jsonb_build_object('ok', true, 'os_created', v_count, 'planning_id', v_planning_id, 'ordens_servico_ids', to_jsonb(v_ids));
END
$function$;
