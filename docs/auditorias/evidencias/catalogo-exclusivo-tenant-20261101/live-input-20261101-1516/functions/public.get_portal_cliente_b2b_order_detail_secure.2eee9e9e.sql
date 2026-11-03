CREATE OR REPLACE FUNCTION public.get_portal_cliente_b2b_order_detail_secure(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.partner_orders%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT x.* INTO v_order FROM public.partner_orders x
  JOIN public.partner_accounts pa ON pa.id=x.partner_id
  JOIN public.clientes c ON c.id=x.cliente_id AND c.organization_id=pa.commercial_owner_organization_id
  WHERE x.id=p_order_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
  AND platform_private.producer_commercial_client_scope(x.cliente_id);

  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden_cliente_vinculo' USING ERRCODE='42501'; END IF;

  IF v_order.cliente_id IS NULL
     OR NOT platform_private.producer_commercial_client_scope(v_order.cliente_id) THEN
    RAISE EXCEPTION 'forbidden_cliente_vinculo';
  END IF;

  SELECT jsonb_build_object(
    'header', jsonb_build_object(
      'id', v_order.id,
      'numero', v_order.numero,
      'status', v_order.status,
      'created_at', v_order.created_at,
      'requested_delivery_date', v_order.requested_delivery_date,
      'estimated_delivery_date', v_order.estimated_delivery_date,
      'approved_at', v_order.approved_at,
      'partner_id', v_order.partner_id,
      'partner_nome', COALESCE(pa.nome_fantasia, pa.razao_social),
      'total', v_order.total,
      'origin_simulation_id', v_order.origin_simulation_id,
      'cultura', v_order.cultura,
      'area_total_ha', v_order.area_total_ha
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', it.id,
        'nome', COALESCE(it.produto_nome_snapshot, p.nome, m.nome),
        'codigo', COALESCE(it.produto_codigo_snapshot, p.codigo, m.codigo),
        'item_tipo', CASE WHEN it.microrganismo_id IS NOT NULL AND it.product_id IS NULL THEN 'microrganismo' ELSE 'produto' END,
        'quantidade', it.quantidade,
        'unidade_medida', it.unidade_medida,
        'volume_ml', it.volume_ml,
        'preco_unitario', it.preco_unitario,
        'subtotal', it.subtotal,
        'produtos', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
          'nome', p.nome,
          'codigo', p.codigo,
          'funcao_completa', p.funcao_completa,
          'modo_acao', p.modo_acao,
          'modo_aplicacao', p.modo_aplicacao,
          'formulacoes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'microrganismos', jsonb_build_object(
                'nome', mf.nome,
                'concentracao_label', mf.concentracao_label
              )
            ) ORDER BY f.created_at)
            FROM public.formulacoes f
            LEFT JOIN public.microrganismos mf ON mf.id = f.microrganismo_id
            WHERE f.produto_id = p.id AND mf.id IS NOT NULL
          ), '[]'::jsonb)
        ) END,
        'microrganismos', CASE WHEN m.id IS NOT NULL THEN jsonb_build_object(
          'nome', m.nome,
          'codigo', m.codigo,
          'concentracao_label', m.concentracao_label,
          'funcao_agronomica', m.funcao_agronomica
        ) END
      ) ORDER BY it.created_at)
      FROM public.partner_order_items it
      LEFT JOIN public.produtos p ON p.id = it.product_id
      LEFT JOIN public.microrganismos m ON m.id = it.microrganismo_id
      WHERE it.order_id = v_order.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.partner_accounts pa
  WHERE pa.id = v_order.partner_id;

  RETURN v_result;
END;
$function$
