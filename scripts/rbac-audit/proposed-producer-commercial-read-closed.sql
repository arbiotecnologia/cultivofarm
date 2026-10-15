-- REVIEW CANDIDATE ONLY. Canonical project swzpzcwiasxmjutrmvkm.
-- Dependency of A+B: four legacy portal readers bypass RLS using raw links.
-- Does NOT change shared notification helper or Storage. NO GRANT/remote execution.
-- Run read-only preflight + candidate in one transaction; never activate this closed package alone.
DO $baseline$
DECLARE e record;
BEGIN
 FOR e IN SELECT * FROM (VALUES
 ('public.get_portal_cliente_b2b_order_detail_secure(uuid)','1de99ff32844e8c30a6de840af9d03ff'),
 ('public.get_portal_cliente_b2b_orders_secure(uuid)','d0e324854da714698a56fa0a225a96e0'),
 ('public.get_portal_cliente_b2b_simulation_detail_secure(uuid)','eedda29f646341e6396c3685caf2e2e0'),
 ('public.get_portal_cliente_b2b_simulations_secure(uuid)','5da67a351d34d6f1711de7c905d2c43a')) AS x(signature,hash)
 LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature)
 AND md5(pg_get_functiondef(p.oid))=e.hash AND p.prosecdef AND p.proowner='postgres'::regrole
 AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')) THEN
 RAISE EXCEPTION 'producer_read_baseline_mismatch' USING ERRCODE='55000'; END IF;
 END LOOP;
 IF to_regprocedure('platform_private.producer_commercial_client_scope(uuid)') IS NOT NULL THEN
 RAISE EXCEPTION 'producer_read_baseline_mismatch' USING ERRCODE='55000'; END IF;
END $baseline$;
CREATE FUNCTION platform_private.producer_commercial_client_scope(p_client uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $scope$
 SELECT auth.uid() IS NOT NULL AND p_client IS NOT NULL
 AND platform_private.platform_actor_access_ready(auth.uid()) IS TRUE
 AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id
 JOIN public.clientes c ON c.id=p_client AND c.organization_id=p.organization_id
 WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE
 AND o.ativo IS TRUE AND c.status_cliente='ativo'
 AND (public.has_role(auth.uid(),'administrador'::public.app_role)
 OR public.has_role(auth.uid(),'gestor'::public.app_role)
 OR public.has_role(auth.uid(),'cliente_produtor'::public.app_role))
 AND p_client=ANY(public.get_cliente_ids_for_user(auth.uid())));
$scope$;
REVOKE ALL ON FUNCTION platform_private.producer_commercial_client_scope(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_portal_cliente_b2b_orders_secure(p_cliente_id uuid)
RETURNS TABLE(
  id uuid,
  numero text,
  status text,
  created_at timestamptz,
  requested_delivery_date date,
  estimated_delivery_date date,
  approved_at timestamptz,
  partner_id uuid,
  partner_nome text,
  total numeric,
  origin_simulation_id uuid,
  cultura text,
  area_total_ha numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT platform_private.producer_commercial_client_scope(p_cliente_id) THEN
    RAISE EXCEPTION 'forbidden_cliente_vinculo';
  END IF;

  RETURN QUERY
  SELECT
    po.id,
    po.numero,
    po.status::text,
    po.created_at,
    po.requested_delivery_date,
    po.estimated_delivery_date,
    po.approved_at,
    po.partner_id,
    COALESCE(pa.nome_fantasia, pa.razao_social)::text AS partner_nome,
    po.total,
    po.origin_simulation_id,
    po.cultura,
    po.area_total_ha
  FROM public.partner_orders po
  LEFT JOIN public.partner_accounts pa ON pa.id = po.partner_id
  WHERE po.cliente_id = p_cliente_id
    AND EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=po.cliente_id AND c.organization_id=pa.commercial_owner_organization_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL)
    AND po.status::text <> 'cancelado'
  ORDER BY po.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_portal_cliente_b2b_orders_secure(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_portal_cliente_b2b_simulations_secure(p_cliente_id uuid)
RETURNS TABLE(
  id uuid,
  titulo text,
  status text,
  total_cheio numeric,
  created_at timestamptz,
  updated_at timestamptz,
  converted_order_id uuid,
  partner_id uuid,
  partner_nome text,
  cultura text,
  area_total_ha numeric,
  objetivo_tecnico text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT platform_private.producer_commercial_client_scope(p_cliente_id) THEN
    RAISE EXCEPTION 'forbidden_cliente_vinculo';
  END IF;

  RETURN QUERY
  SELECT
    ps.id,
    ps.titulo,
    ps.status::text,
    ps.total_cheio,
    ps.created_at,
    ps.updated_at,
    ps.converted_order_id,
    ps.partner_id,
    COALESCE(pa.nome_fantasia, pa.razao_social)::text AS partner_nome,
    ps.cultura,
    ps.area_total_ha,
    ps.objetivo_tecnico
  FROM public.partner_simulations ps
  LEFT JOIN public.partner_accounts pa ON pa.id = ps.partner_id
  WHERE ps.cliente_id = p_cliente_id
    AND EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=ps.cliente_id AND c.organization_id=pa.commercial_owner_organization_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL)
    AND ps.status::text IN ('enviada_gestor', 'convertida_pedido')
  ORDER BY ps.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_portal_cliente_b2b_simulations_secure(uuid) FROM PUBLIC,anon,authenticated,service_role;

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
$function$;
REVOKE ALL ON FUNCTION public.get_portal_cliente_b2b_order_detail_secure(uuid) FROM PUBLIC,anon,authenticated,service_role;

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
$function$;
REVOKE ALL ON FUNCTION public.get_portal_cliente_b2b_simulation_detail_secure(uuid) FROM PUBLIC,anon,authenticated,service_role;
