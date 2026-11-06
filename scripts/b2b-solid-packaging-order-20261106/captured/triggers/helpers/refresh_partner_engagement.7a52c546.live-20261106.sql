CREATE OR REPLACE FUNCTION public.refresh_partner_engagement(p_partner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_last timestamptz; v_30 int; v_90 int;
BEGIN
  SELECT MAX(created_at), COUNT(*) FILTER (WHERE created_at > now() - interval '30 days'),
         COUNT(*) FILTER (WHERE created_at > now() - interval '90 days')
  INTO v_last, v_30, v_90
  FROM public.partner_orders WHERE partner_id = p_partner_id;

  INSERT INTO public.partner_engagement_metrics(partner_id, ultima_compra, dias_sem_compra, pedidos_30d, pedidos_90d, updated_at)
  VALUES (p_partner_id, v_last,
          CASE WHEN v_last IS NULL THEN NULL ELSE EXTRACT(DAY FROM now() - v_last)::int END,
          COALESCE(v_30,0), COALESCE(v_90,0), now())
  ON CONFLICT (partner_id) DO UPDATE SET
    ultima_compra = EXCLUDED.ultima_compra,
    dias_sem_compra = EXCLUDED.dias_sem_compra,
    pedidos_30d = EXCLUDED.pedidos_30d,
    pedidos_90d = EXCLUDED.pedidos_90d,
    updated_at = now();
END $function$
