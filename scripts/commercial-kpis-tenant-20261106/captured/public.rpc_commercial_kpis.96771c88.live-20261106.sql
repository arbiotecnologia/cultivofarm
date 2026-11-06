CREATE OR REPLACE FUNCTION public.rpc_commercial_kpis(p_from date DEFAULT ((now())::date - 30), p_to date DEFAULT (now())::date, p_partner_id uuid DEFAULT NULL::uuid, p_consultor uuid DEFAULT NULL::uuid, p_region text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'pedidos_total', COUNT(*),
    'pedidos_aprovados', COUNT(*) FILTER (WHERE po.status='aprovado'),
    'pedidos_em_negociacao', COUNT(*) FILTER (WHERE po.status='em_analise_comercial'),
    'pedidos_aguardando_ajuste', COUNT(*) FILTER (WHERE po.status::text='aguardando_ajuste_comercial'),
    'receita_prevista', COALESCE(SUM(po.total) FILTER (WHERE po.status IN ('solicitado','em_analise_comercial','aprovado')),0),
    'receita_aprovada', COALESCE(SUM(po.total) FILTER (WHERE po.status='aprovado'),0),
    'parceiros_ativos', COUNT(DISTINCT po.partner_id),
    'parceiros_novos', (
      SELECT COUNT(*) FROM public.partner_accounts pa2
      WHERE pa2.created_at::date BETWEEN p_from AND p_to
        AND (p_consultor IS NULL OR pa2.consultor_responsavel = p_consultor)
        AND (p_region IS NULL OR pa2.commercial_region = p_region)
    )
  ) INTO r
  FROM public.partner_orders po
  JOIN public.partner_accounts pa ON pa.id = po.partner_id
  WHERE po.created_at::date BETWEEN p_from AND p_to
    AND (p_partner_id IS NULL OR po.partner_id = p_partner_id)
    AND (p_consultor IS NULL OR pa.consultor_responsavel = p_consultor)
    AND (p_region IS NULL OR pa.commercial_region = p_region);
  RETURN r;
END $function$
