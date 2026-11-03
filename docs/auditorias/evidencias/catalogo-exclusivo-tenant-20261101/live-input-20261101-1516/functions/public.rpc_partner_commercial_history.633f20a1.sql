CREATE OR REPLACE FUNCTION public.rpc_partner_commercial_history(p_partner_id uuid, p_from date DEFAULT ((now())::date - 365), p_to date DEFAULT (now())::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; top jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'gestor_comercial')
    OR (public.has_role(auth.uid(),'parceiro_b2b') AND public.get_user_partner_id() = p_partner_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO top FROM (
    SELECT poi.produto_nome_snapshot AS produto,
           SUM(poi.quantidade) AS quantidade,
           SUM(poi.subtotal) AS valor
    FROM public.partner_order_items poi
    JOIN public.partner_orders po ON po.id = poi.order_id
    WHERE po.partner_id = p_partner_id
      AND po.created_at::date BETWEEN p_from AND p_to
    GROUP BY poi.produto_nome_snapshot
    ORDER BY SUM(poi.subtotal) DESC
    LIMIT 10
  ) t;

  SELECT jsonb_build_object(
    'qtd_pedidos', COUNT(*),
    'valor_acumulado', COALESCE(SUM(total),0),
    'ticket_medio', COALESCE(AVG(total),0),
    'ultima_compra', MAX(created_at),
    'top_produtos', top
  ) INTO r
  FROM public.partner_orders
  WHERE partner_id = p_partner_id
    AND created_at::date BETWEEN p_from AND p_to;
  RETURN r;
END $function$
