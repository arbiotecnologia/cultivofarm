
CREATE OR REPLACE FUNCTION public._portal_cliente_user_has_link(p_user uuid, p_cliente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_clientes WHERE user_id = p_user AND cliente_id = p_cliente
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_user AND cliente_id = p_cliente
  );
$$;

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
  IF NOT public._portal_cliente_user_has_link(auth.uid(), p_cliente_id) THEN
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
    AND po.status::text <> 'cancelado'
  ORDER BY po.created_at DESC;
END;
$$;

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
  IF NOT public._portal_cliente_user_has_link(auth.uid(), p_cliente_id) THEN
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
    AND ps.status::text IN ('enviada_gestor', 'convertida_pedido')
  ORDER BY ps.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_cliente_b2b_orders_secure(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_cliente_b2b_simulations_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_cliente_b2b_orders_secure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_cliente_b2b_simulations_secure(uuid) TO authenticated;
