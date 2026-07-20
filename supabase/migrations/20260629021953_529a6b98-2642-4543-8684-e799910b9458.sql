CREATE OR REPLACE FUNCTION public.get_production_planning_detail(p_planning_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor_comercial')
       OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'gestor')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'planning', to_jsonb(pp.*),
    'partner', to_jsonb(pa.*),
    'order', to_jsonb(po.*),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', poi.id,
        'product_id', poi.product_id,
        'produto_nome', COALESCE(poi.produto_nome_snapshot, pr.nome),
        'codigo', COALESCE(poi.produto_codigo_snapshot, pr.codigo),
        'produto_tipo', pr.tipo,
        'quantidade', poi.quantidade,
        'unidade_medida', COALESCE(poi.unidade_medida,'unidade'),
        'volume_total_ml', CASE COALESCE(poi.unidade_medida,'unidade')
                             WHEN 'ml' THEN poi.quantidade
                             WHEN 'litro' THEN poi.quantidade * 1000
                             ELSE NULL END,
        'volume_total_l', CASE COALESCE(poi.unidade_medida,'unidade')
                             WHEN 'ml' THEN poi.quantidade / 1000.0
                             WHEN 'litro' THEN poi.quantidade
                             ELSE NULL END,
        'microrganismo_id', poi.microrganismo_id,
        'microrganismo_nome', m.nome,
        'microrganismo_codigo', m.codigo,
        'microrganismo_tipo', m.tipo,
        'os_id', (SELECT l.ordem_servico_id FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id),
        'os_numero', (SELECT os.numero_os FROM public.production_order_link l JOIN public.ordens_servico os ON os.id = l.ordem_servico_id WHERE l.partner_order_item_id = poi.id),
        'os_status', (SELECT os.status FROM public.production_order_link l JOIN public.ordens_servico os ON os.id = l.ordem_servico_id WHERE l.partner_order_item_id = poi.id)
      )) FROM public.partner_order_items poi
        LEFT JOIN public.produtos pr ON pr.id = poi.product_id
        LEFT JOIN public.microrganismos m ON m.id = poi.microrganismo_id
        WHERE poi.order_id = po.id
    ), '[]'::jsonb),
    'timeline', COALESCE((
      SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.event_at)
        FROM public.production_timeline_events t WHERE t.partner_order_id = po.id
    ), '[]'::jsonb),
    'has_orders', EXISTS (SELECT 1 FROM public.production_order_link WHERE planning_id = pp.id)
  ) INTO v_result
  FROM public.production_planning pp
  JOIN public.partner_accounts pa ON pa.id = pp.partner_id
  JOIN public.partner_orders po ON po.id = pp.partner_order_id
  WHERE pp.id = p_planning_id;

  RETURN v_result;
END
$function$;