CREATE OR REPLACE FUNCTION public.rpc_b2b_executive_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; kpis jsonb; fc jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'administrador'::public.app_role)
      or public.has_role(auth.uid(), 'gestor'::public.app_role)
      or public.has_role(auth.uid(), 'financeiro'::public.app_role)
      or public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
      or public.has_role(auth.uid(), 'administrativo'::public.app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  kpis := rpc_b2b_carteira_kpis(NULL,NULL);
  fc := rpc_b2b_revenue_forecast(NULL);

  WITH topp AS (
    SELECT pa.id, COALESCE(pa.nome_fantasia,pa.razao_social) AS nome, COALESCE(SUM(po.total),0) AS total
    FROM partner_orders po
    JOIN partner_accounts pa ON pa.id = po.partner_id
    WHERE po.status NOT IN ('cancelado','reprovado','rascunho')
      AND po.created_at >= date_trunc('year',now())
    GROUP BY pa.id, pa.nome_fantasia, pa.razao_social
    ORDER BY total DESC LIMIT 10
  ),
  topprod AS (
    SELECT pr.id, pr.nome, COALESCE(SUM(poi.subtotal),0) AS total, COALESCE(SUM(poi.quantidade),0) AS qtd
    FROM partner_order_items poi
    JOIN partner_orders po ON po.id = poi.order_id
    JOIN produtos pr ON pr.id = poi.product_id
    WHERE po.status NOT IN ('cancelado','reprovado','rascunho')
      AND po.created_at >= date_trunc('year',now())
    GROUP BY pr.id, pr.nome
    ORDER BY total DESC LIMIT 10
  )
  SELECT jsonb_build_object(
    'kpis', kpis,
    'forecast', fc,
    'parceiros_ativos', (SELECT COUNT(*) FROM partner_accounts WHERE ativo=true AND deleted_at IS NULL),
    'parceiros_bloqueados', (SELECT COUNT(DISTINCT partner_id) FROM partner_orders WHERE status='aguardando_aprovacao_credito'),
    'score_medio', (SELECT COALESCE(ROUND(AVG(score),2),0) FROM partner_risk_scores),
    'top_parceiros', (SELECT COALESCE(jsonb_agg(jsonb_build_object('partner_id',id,'nome',nome,'total',total)),'[]'::jsonb) FROM topp),
    'top_produtos', (SELECT COALESCE(jsonb_agg(jsonb_build_object('produto_id',id,'nome',nome,'total',total,'quantidade',qtd)),'[]'::jsonb) FROM topprod)
  ) INTO v;
  RETURN v;
END;$function$
