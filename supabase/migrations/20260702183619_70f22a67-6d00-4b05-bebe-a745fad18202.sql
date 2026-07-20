
CREATE OR REPLACE FUNCTION public.get_portal_cliente_b2b_order_detail_secure(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.partner_orders%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF v_order.cliente_id IS NULL
     OR NOT public._portal_cliente_user_has_link(auth.uid(), v_order.cliente_id) THEN
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
        'quantidade', it.quantidade,
        'unidade_medida', it.unidade_medida,
        'preco_unitario', it.preco_unitario,
        'subtotal', it.subtotal
      ) ORDER BY it.created_at)
      FROM public.partner_order_items it
      LEFT JOIN public.produtos p ON p.id = it.produto_id
      LEFT JOIN public.microrganismos m ON m.id = it.microrganismo_id
      WHERE it.order_id = v_order.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.partner_accounts pa
  WHERE pa.id = v_order.partner_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_portal_cliente_b2b_simulation_detail_secure(p_simulation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sim public.partner_simulations%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_sim FROM public.partner_simulations WHERE id = p_simulation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF v_sim.cliente_id IS NULL
     OR NOT public._portal_cliente_user_has_link(auth.uid(), v_sim.cliente_id) THEN
    RAISE EXCEPTION 'forbidden_cliente_vinculo';
  END IF;

  IF v_sim.status::text NOT IN ('enviada_gestor', 'convertida_pedido') THEN
    RAISE EXCEPTION 'simulation_not_visible';
  END IF;

  SELECT jsonb_build_object(
    'header', jsonb_build_object(
      'id', v_sim.id,
      'titulo', v_sim.titulo,
      'status', v_sim.status,
      'total_cheio', v_sim.total_cheio,
      'created_at', v_sim.created_at,
      'updated_at', v_sim.updated_at,
      'converted_order_id', v_sim.converted_order_id,
      'partner_id', v_sim.partner_id,
      'partner_nome', COALESCE(pa.nome_fantasia, pa.razao_social),
      'cultura', v_sim.cultura,
      'area_total_ha', v_sim.area_total_ha,
      'objetivo_tecnico', v_sim.objetivo_tecnico
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', si.id,
        'nome', si.nome,
        'item_tipo', si.item_tipo,
        'quantidade', si.quantidade,
        'valor_unitario_cheio', si.valor_unitario_cheio,
        'subtotal', si.subtotal
      ) ORDER BY si.created_at)
      FROM public.partner_simulation_items si
      WHERE si.simulation_id = v_sim.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.partner_accounts pa
  WHERE pa.id = v_sim.partner_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_cliente_b2b_order_detail_secure(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_cliente_b2b_simulation_detail_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_cliente_b2b_order_detail_secure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_cliente_b2b_simulation_detail_secure(uuid) TO authenticated;
