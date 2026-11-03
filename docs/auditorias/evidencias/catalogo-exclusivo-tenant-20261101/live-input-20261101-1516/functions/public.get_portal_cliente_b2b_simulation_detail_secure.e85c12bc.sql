CREATE OR REPLACE FUNCTION public.get_portal_cliente_b2b_simulation_detail_secure(p_simulation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sim public.partner_simulations%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT x.* INTO v_sim FROM public.partner_simulations x
  JOIN public.partner_accounts pa ON pa.id=x.partner_id
  JOIN public.clientes c ON c.id=x.cliente_id AND c.organization_id=pa.commercial_owner_organization_id
  WHERE x.id=p_simulation_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
  AND platform_private.producer_commercial_client_scope(x.cliente_id);

  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden_cliente_vinculo' USING ERRCODE='42501'; END IF;

  IF v_sim.cliente_id IS NULL
     OR NOT platform_private.producer_commercial_client_scope(v_sim.cliente_id) THEN
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
        'nome', COALESCE(si.produto_nome_snapshot, si.nome, p.nome, m.nome),
        'codigo', COALESCE(si.produto_codigo_snapshot, p.codigo, m.codigo),
        'item_tipo', si.item_tipo,
        'quantidade', si.quantidade,
        'unidade_medida', si.unidade_medida,
        'volume_ml', si.volume_ml,
        'valor_unitario_cheio', si.valor_unitario_cheio,
        'subtotal', si.subtotal,
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
      ) ORDER BY si.created_at)
      FROM public.partner_simulation_items si
      LEFT JOIN public.produtos p ON p.id = si.product_id
      LEFT JOIN public.microrganismos m ON m.id = si.microrganismo_id
      WHERE si.simulation_id = v_sim.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.partner_accounts pa
  WHERE pa.id = v_sim.partner_id;

  RETURN v_result;
END;
$function$
