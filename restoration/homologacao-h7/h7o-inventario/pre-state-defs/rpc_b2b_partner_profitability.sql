CREATE OR REPLACE FUNCTION public.rpc_b2b_partner_profitability(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_partner_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(partner_id uuid, partner_name text, total_comprado numeric, total_recebido numeric, total_aberto numeric, ticket_medio numeric, qtd_pedidos integer, prazo_medio_pgto numeric, inadimplencia_pct numeric, risk_score integer, risk_level text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select h7n_guarded.*
  from (
WITH pedidos AS (
    SELECT po.partner_id, COUNT(*) AS qtd, SUM(po.total) AS total
    FROM partner_orders po
    WHERE po.status NOT IN ('cancelado','reprovado','rascunho')
      AND (p_from IS NULL OR po.created_at >= p_from)
      AND (p_to   IS NULL OR po.created_at <= (p_to + 1))
      AND (p_partner_id IS NULL OR po.partner_id = p_partner_id)
    GROUP BY po.partner_id
  ),
  recebidos AS (
    SELECT ar.partner_id,
      SUM(ari.received_amount) AS rec,
      SUM(ari.original_amount - ari.received_amount) FILTER (WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE')) AS aberto,
      AVG(CASE WHEN ari.paid_at IS NOT NULL THEN EXTRACT(EPOCH FROM (ari.paid_at - ar.issue_date))/86400 END) AS prazo_med,
      SUM(ari.original_amount - ari.received_amount) FILTER (WHERE ari.due_date < CURRENT_DATE AND ari.status IN ('OPEN','PARTIAL','OVERDUE')) AS vencido
    FROM accounts_receivable ar
    JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
    WHERE ar.origin_type='B2B_ORDER'
      AND (p_partner_id IS NULL OR ar.partner_id = p_partner_id)
    GROUP BY ar.partner_id
  )
  SELECT pa.id, COALESCE(pa.nome_fantasia, pa.razao_social),
    COALESCE(p.total,0),
    COALESCE(r.rec,0),
    COALESCE(r.aberto,0),
    CASE WHEN COALESCE(p.qtd,0) > 0 THEN ROUND(p.total/p.qtd,2) ELSE 0 END,
    COALESCE(p.qtd,0)::int,
    ROUND(COALESCE(r.prazo_med,0)::numeric,2),
    CASE WHEN COALESCE(p.total,0) > 0 THEN ROUND((COALESCE(r.vencido,0)/p.total)*100,2) ELSE 0 END,
    COALESCE(prs.score,0),
    COALESCE(prs.risk_level,'baixo')
  FROM partner_accounts pa
  LEFT JOIN pedidos p ON p.partner_id = pa.id
  LEFT JOIN recebidos r ON r.partner_id = pa.id
  LEFT JOIN partner_risk_scores prs ON prs.partner_id = pa.id
  WHERE pa.ativo = true AND pa.deleted_at IS NULL
    AND (p_partner_id IS NULL OR pa.id = p_partner_id)
    AND (p.qtd IS NOT NULL OR r.rec IS NOT NULL)
  ORDER BY COALESCE(p.total,0) DESC
  ) as h7n_guarded
  where public.has_role(auth.uid(), 'administrador'::public.app_role)
      or public.has_role(auth.uid(), 'gestor'::public.app_role)
      or public.has_role(auth.uid(), 'financeiro'::public.app_role)
      or public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
      or public.has_role(auth.uid(), 'administrativo'::public.app_role);
$function$

--ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

