
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
  v_item RECORD;
  v_os_id uuid;
  v_numero text;
  v_count int := 0;
  v_uid uuid := auth.uid();
  v_volume_ml numeric;
  v_area numeric;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'gestor')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

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

  IF v_order_status <> 'aprovado' OR v_ready IS NOT TRUE THEN
    RAISE EXCEPTION 'Pedido B2B ainda não está aprovado para produção.';
  END IF;

  SELECT id INTO v_planning_id FROM public.production_planning WHERE partner_order_id = p_partner_order_id;
  IF v_planning_id IS NULL THEN
    RAISE EXCEPTION 'Planejamento não encontrado para o pedido %', p_partner_order_id;
  END IF;

  SELECT COALESCE(nome_fantasia, razao_social) INTO v_partner_nome FROM public.partner_accounts WHERE id = v_partner_id;

  -- Pré-validação: unidades incompatíveis (sem conversão configurada)
  IF EXISTS (
    SELECT 1 FROM public.partner_order_items poi
    WHERE poi.order_id = p_partner_order_id
      AND COALESCE(poi.unidade_medida,'unidade') IN ('dose','unidade')
      AND NOT EXISTS (SELECT 1 FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id)
  ) THEN
    RAISE EXCEPTION 'Produto informado em dose/unidade exige configuração de conversão antes de gerar produção.';
  END IF;

  FOR v_item IN
    SELECT poi.* FROM public.partner_order_items poi
    WHERE poi.order_id = p_partner_order_id
      AND NOT EXISTS (SELECT 1 FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id)
  LOOP
    v_volume_ml := NULL;
    v_area := NULL;
    CASE COALESCE(v_item.unidade_medida,'unidade')
      WHEN 'ml'      THEN v_volume_ml := v_item.quantidade;
      WHEN 'litro'   THEN v_volume_ml := v_item.quantidade * 1000;
      WHEN 'hectare' THEN v_area := v_item.quantidade;
      ELSE NULL;
    END CASE;

    v_numero := 'OS-B2B-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.ordens_servico (
      cliente_id, fazenda_id, talhao_id, produto_id, volume_total_ml, area_hectares,
      prioridade, status, tipo_item, numero_os,
      partner_order_id, partner_order_item_id, origem
    ) VALUES (
      NULL, NULL, NULL, v_item.product_id, v_volume_ml, v_area,
      'media','aprovada','produto', v_numero,
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
