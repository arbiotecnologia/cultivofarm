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
        'dose_ml_ha', pr.dose_ml_ha,
        'modo_aplicacao', pr.modo_aplicacao,
        -- Lista completa de microrganismos (suporta consórcios)
        'microrganismos', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', m.id,
            'nome', m.nome,
            'codigo', m.codigo,
            'tipo', m.tipo,
            'concentracao', f.concentracao,
            'concentracao_unidade', f.unidade
          ) ORDER BY m.nome)
          FROM public.formulacoes f
          JOIN public.microrganismos m ON m.id = f.microrganismo_id
          WHERE f.produto_id = poi.product_id
        ), CASE WHEN poi.microrganismo_id IS NOT NULL THEN
            (SELECT jsonb_build_array(jsonb_build_object(
                'id', m2.id, 'nome', m2.nome, 'codigo', m2.codigo, 'tipo', m2.tipo,
                'concentracao', NULL, 'concentracao_unidade', NULL))
             FROM public.microrganismos m2 WHERE m2.id = poi.microrganismo_id)
           ELSE '[]'::jsonb END),
        'vasilhame_volume_ml', cv.volume_ml,
        'vasilhame_rotulo', cv.rotulo,
        'volume_unitario_l', CASE
                               WHEN cv.volume_ml IS NOT NULL THEN cv.volume_ml / 1000.0
                               WHEN COALESCE(poi.unidade_medida,'unidade') = 'litro' THEN 1
                               WHEN COALESCE(poi.unidade_medida,'unidade') = 'ml' THEN 1/1000.0
                               ELSE NULL END,
        'volume_total_l', CASE
                            WHEN cv.volume_ml IS NOT NULL THEN (cv.volume_ml * poi.quantidade) / 1000.0
                            WHEN COALESCE(poi.unidade_medida,'unidade') = 'litro' THEN poi.quantidade
                            WHEN COALESCE(poi.unidade_medida,'unidade') = 'ml' THEN poi.quantidade / 1000.0
                            ELSE NULL END,
        'qtd_vasilhames', poi.quantidade,
        'os_id', (SELECT l.ordem_servico_id FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id),
        'os_numero', (SELECT os.numero_os FROM public.production_order_link l JOIN public.ordens_servico os ON os.id = l.ordem_servico_id WHERE l.partner_order_item_id = poi.id),
        'os_status', (SELECT os.status FROM public.production_order_link l JOIN public.ordens_servico os ON os.id = l.ordem_servico_id WHERE l.partner_order_item_id = poi.id)
      )) FROM public.partner_order_items poi
        LEFT JOIN public.produtos pr ON pr.id = poi.product_id
        LEFT JOIN LATERAL (
          SELECT cv2.volume_ml, cv2.rotulo
            FROM public.catalogo_volumes cv2
           WHERE cv2.item_tipo = 'produto'
             AND cv2.produto_id = poi.product_id
             AND cv2.ativo = true
           ORDER BY
             (cv2.preco_brl = COALESCE(poi.preco_tabela_snapshot, poi.preco_unitario)) DESC,
             ABS(cv2.preco_brl - COALESCE(poi.preco_tabela_snapshot, poi.preco_unitario)) ASC
           LIMIT 1
        ) cv ON true
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
END;
$function$
