-- H7N ROLLBACK — P1 — restaura as 13 RPCs sensíveis à definição anterior (sem guarda de papel)
-- Reverte EXATAMENTE a migration 20260904130941_h7n_p1_rpc_guards (staging ikaauvsflpmamgxmkhoq).
-- Estado anterior reconstruído a partir de restoration/homologacao-h7/97-h7n-p0p1-auditoria.md
-- e restoration/homologacao-h7/h7n-inventario/ (fn_inventory.tsv, viewdefs.sql).
-- Executar SOMENTE via guard-staging.sh + staging-psql.sh, dentro de transação.
-- NÃO executar em produção (navfzbwgwzruipouyfnk).
begin;

-- Definições anteriores = corpo aplicado menos o bloco de guarda inserido pela forward
-- (a forward foi gerada por pg_get_functiondef + inserção do IF NOT (...) / subselect h7n_guarded).
-- Conferido contra as definições do repositório (ex.: 20260617022407 rpc_b2b_aging,
-- 20260520201607 fn_mark_financial_overdue). ACL anterior idêntica à atual
-- (authenticated + service_role; anon sem EXECUTE), reafirmada explicitamente abaixo.

-- fn_mark_financial_overdue (plpgsql-strip)
CREATE OR REPLACE FUNCTION public.fn_mark_financial_overdue()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.accounts_receivable_installments
    SET status='OVERDUE'
    WHERE status='OPEN' AND due_date < CURRENT_DATE;
  UPDATE public.accounts_payable_installments
    SET status='OVERDUE'
    WHERE status='OPEN' AND due_date < CURRENT_DATE;

  UPDATE public.accounts_receivable ar SET status='OVERDUE'
    WHERE status IN ('OPEN','PARTIAL')
      AND EXISTS (SELECT 1 FROM public.accounts_receivable_installments WHERE receivable_id = ar.id AND status='OVERDUE');
  UPDATE public.accounts_payable ap SET status='OVERDUE'
    WHERE status IN ('OPEN','PARTIAL')
      AND EXISTS (SELECT 1 FROM public.accounts_payable_installments WHERE payable_id = ap.id AND status='OVERDUE');
END $function$;

revoke execute on function public.fn_mark_financial_overdue() from public, anon;
grant execute on function public.fn_mark_financial_overdue() to authenticated, service_role;

-- generate_b2b_receivable_secure (plpgsql-strip)
CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure(p_partner_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_partner_order_id IS NULL THEN
    RAISE EXCEPTION 'partner_order_id_required' USING ERRCODE='P0001';
  END IF;

  -- Serializa concorrencia real (clique duplo / chamadas simultaneas).
  -- Chave unica bigint: assinatura pg_advisory_xact_lock(bigint).
  PERFORM pg_advisory_xact_lock(
    hashtextextended('b2b_receivable:' || p_partner_order_id::text, 0)
  );

  IF NOT public.fn_b2b_order_priceable(p_partner_order_id) THEN
    RAISE EXCEPTION 'order_not_priceable_quote_required' USING ERRCODE='P0001';
  END IF;

  RETURN public.generate_b2b_receivable_secure_impl(p_partner_order_id);
END $function$;

revoke execute on function public.generate_b2b_receivable_secure(p_partner_order_id uuid) from public, anon;
grant execute on function public.generate_b2b_receivable_secure(p_partner_order_id uuid) to authenticated, service_role;

-- rpc_b2b_aging (sql-unwrap)
CREATE OR REPLACE FUNCTION public.rpc_b2b_aging(p_partner_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(faixa text, qtd_titulos integer, valor numeric, parceiros integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT ar.partner_id, ari.id,
           (ari.original_amount - ari.received_amount) AS saldo,
           GREATEST(0, (current_date - ari.due_date)) AS dias
    FROM public.accounts_receivable ar
    JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
    WHERE ar.origin_type = 'B2B_ORDER'
      AND ar.status <> 'CANCELED'
      AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
      AND (p_partner_id IS NULL OR ar.partner_id = p_partner_id)
  ), faixas AS (
    SELECT CASE
             WHEN dias <= 30 THEN '0-30'
             WHEN dias <= 60 THEN '31-60'
             WHEN dias <= 90 THEN '61-90'
             ELSE '90+'
           END AS faixa, partner_id, saldo
    FROM base
  )
  SELECT faixa, COUNT(*)::int, COALESCE(SUM(saldo),0), COUNT(DISTINCT partner_id)::int
  FROM faixas GROUP BY faixa
  ORDER BY CASE faixa WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END;
$function$;

revoke execute on function public.rpc_b2b_aging(p_partner_id uuid) from public, anon;
grant execute on function public.rpc_b2b_aging(p_partner_id uuid) to authenticated, service_role;

-- rpc_b2b_aging_detalhado (plpgsql-strip)
CREATE OR REPLACE FUNCTION public.rpc_b2b_aging_detalhado(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_partner_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(faixa text, qtd_titulos integer, valor numeric, qtd_parceiros integer, pct_carteira numeric, valor_medio_parceiro numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
BEGIN
  WITH base AS (
    SELECT ar.partner_id, ari.id AS inst_id,
      (ari.original_amount - ari.received_amount) AS saldo,
      GREATEST(0, (CURRENT_DATE - ari.due_date)) AS dias_atraso
    FROM accounts_receivable ar
    JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
    WHERE ar.origin_type = 'B2B_ORDER'
      AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
      AND (p_partner_id IS NULL OR ar.partner_id = p_partner_id)
      AND (p_from IS NULL OR ar.issue_date >= p_from)
      AND (p_to   IS NULL OR ar.issue_date <= p_to)
      AND (p_status IS NULL OR ari.status = p_status)
  ),
  classed AS (
    SELECT *,
      CASE
        WHEN dias_atraso <= 30 THEN '0-30'
        WHEN dias_atraso <= 60 THEN '31-60'
        WHEN dias_atraso <= 90 THEN '61-90'
        ELSE '90+'
      END AS bucket
    FROM base
  )
  SELECT COALESCE(SUM(saldo),0) INTO v_total FROM classed;

  RETURN QUERY
  WITH base AS (
    SELECT ar.partner_id,
      (ari.original_amount - ari.received_amount) AS saldo,
      GREATEST(0, (CURRENT_DATE - ari.due_date)) AS dias_atraso
    FROM accounts_receivable ar
    JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
    WHERE ar.origin_type = 'B2B_ORDER'
      AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
      AND (p_partner_id IS NULL OR ar.partner_id = p_partner_id)
      AND (p_from IS NULL OR ar.issue_date >= p_from)
      AND (p_to   IS NULL OR ar.issue_date <= p_to)
      AND (p_status IS NULL OR ari.status = p_status)
  ),
  classed AS (
    SELECT *,
      CASE
        WHEN dias_atraso <= 30 THEN '0-30'
        WHEN dias_atraso <= 60 THEN '31-60'
        WHEN dias_atraso <= 90 THEN '61-90'
        ELSE '90+'
      END AS bucket
    FROM base
  )
  SELECT
    b AS faixa,
    COALESCE(COUNT(c.*),0)::int AS qtd_titulos,
    COALESCE(SUM(c.saldo),0)::numeric AS valor,
    COALESCE(COUNT(DISTINCT c.partner_id),0)::int AS qtd_parceiros,
    CASE WHEN v_total > 0 THEN ROUND((COALESCE(SUM(c.saldo),0)/v_total)*100,2) ELSE 0 END AS pct_carteira,
    CASE WHEN COUNT(DISTINCT c.partner_id) > 0 THEN ROUND(COALESCE(SUM(c.saldo),0)/COUNT(DISTINCT c.partner_id),2) ELSE 0 END AS valor_medio_parceiro
  FROM (VALUES ('0-30'),('31-60'),('61-90'),('90+')) AS f(b)
  LEFT JOIN classed c ON c.bucket = f.b
  GROUP BY f.b
  ORDER BY CASE f.b WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END;
END;$function$;

revoke execute on function public.rpc_b2b_aging_detalhado(p_from date, p_to date, p_partner_id uuid, p_status text) from public, anon;
grant execute on function public.rpc_b2b_aging_detalhado(p_from date, p_to date, p_partner_id uuid, p_status text) to authenticated, service_role;

-- rpc_b2b_capacity_kpis (plpgsql-strip)
CREATE OR REPLACE FUNCTION public.rpc_b2b_capacity_kpis()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH os AS (
    SELECT os.status::text AS status,
           COALESCE(os.volume_total_ml, 0) / 1000.0 AS litros,
           os.updated_at,
           os.partner_order_id
    FROM public.ordens_servico os
    WHERE os.origem = 'b2b' AND os.partner_order_id IS NOT NULL
  ),
  litros AS (
    SELECT
      SUM(CASE WHEN status IN ('aberta','em_producao') THEN litros ELSE 0 END) AS litros_programados,
      SUM(CASE WHEN status = 'em_producao' THEN litros ELSE 0 END) AS litros_em_producao,
      SUM(CASE WHEN status = 'finalizada' THEN litros ELSE 0 END) AS litros_produzidos,
      SUM(CASE WHEN status = 'finalizada' AND updated_at >= date_trunc('week', now()) THEN litros ELSE 0 END) AS producao_semana,
      SUM(CASE WHEN status = 'finalizada' AND updated_at >= date_trunc('month', now()) THEN litros ELSE 0 END) AS producao_mes
    FROM os
  ),
  pedidos AS (
    SELECT
      COUNT(*) FILTER (WHERE status::text = 'em_producao') AS pedidos_em_producao,
      COUNT(*) FILTER (WHERE status::text = 'aprovado' AND ready_for_production = false) AS aguardando_planejamento,
      COUNT(*) FILTER (WHERE status::text = 'aprovado' AND ready_for_production = true
                        AND NOT EXISTS (SELECT 1 FROM public.production_order_link pol WHERE pol.partner_order_id = po.id)) AS aguardando_producao,
      COUNT(*) FILTER (WHERE status::text = 'entregue') AS pedidos_entregues,
      SUM(CASE WHEN status::text = 'entregue' THEN
            (SELECT COALESCE(SUM(os2.volume_total_ml),0)/1000.0
               FROM public.ordens_servico os2 WHERE os2.partner_order_id = po.id)
          ELSE 0 END) AS litros_entregues
    FROM public.partner_orders po
  )
  SELECT jsonb_build_object(
    'litros_programados', COALESCE((SELECT litros_programados FROM litros), 0),
    'litros_em_producao', COALESCE((SELECT litros_em_producao FROM litros), 0),
    'litros_produzidos', COALESCE((SELECT litros_produzidos FROM litros), 0),
    'litros_entregues', COALESCE((SELECT litros_entregues FROM pedidos), 0),
    'producao_semana', COALESCE((SELECT producao_semana FROM litros), 0),
    'producao_mes', COALESCE((SELECT producao_mes FROM litros), 0),
    'pedidos_em_producao', COALESCE((SELECT pedidos_em_producao FROM pedidos), 0),
    'aguardando_planejamento', COALESCE((SELECT aguardando_planejamento FROM pedidos), 0),
    'aguardando_producao', COALESCE((SELECT aguardando_producao FROM pedidos), 0),
    'pedidos_entregues', COALESCE((SELECT pedidos_entregues FROM pedidos), 0)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

revoke execute on function public.rpc_b2b_capacity_kpis() from public, anon;
grant execute on function public.rpc_b2b_capacity_kpis() to authenticated, service_role;

-- rpc_b2b_carteira_kpis (plpgsql-strip)
CREATE OR REPLACE FUNCTION public.rpc_b2b_carteira_kpis(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  WITH base AS (
    SELECT ar.id, ar.issue_date, ari.original_amount, ari.received_amount, ari.due_date, ari.status, ari.paid_at
    FROM accounts_receivable ar
    JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
    WHERE ar.origin_type='B2B_ORDER'
  )
  SELECT jsonb_build_object(
    'carteira_total', COALESCE(SUM(original_amount),0),
    'carteira_recebida', COALESCE(SUM(received_amount),0),
    'carteira_vencida', COALESCE(SUM(original_amount - received_amount) FILTER (WHERE due_date < CURRENT_DATE AND status IN ('OPEN','PARTIAL','OVERDUE')),0),
    'carteira_aberto', COALESCE(SUM(original_amount - received_amount) FILTER (WHERE status IN ('OPEN','PARTIAL','OVERDUE')),0),
    'receita_mes', COALESCE(SUM(received_amount) FILTER (WHERE paid_at >= date_trunc('month',now())),0),
    'receita_ano', COALESCE(SUM(received_amount) FILTER (WHERE paid_at >= date_trunc('year',now())),0),
    'inadimplencia_pct', CASE WHEN SUM(original_amount) > 0 THEN ROUND((COALESCE(SUM(original_amount - received_amount) FILTER (WHERE due_date < CURRENT_DATE AND status IN ('OPEN','PARTIAL','OVERDUE')),0)/SUM(original_amount))*100,2) ELSE 0 END,
    'prazo_medio_recebimento', ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (paid_at - issue_date))/86400) FILTER (WHERE paid_at IS NOT NULL),0)::numeric,2),
    'ticket_medio', CASE WHEN COUNT(DISTINCT id) > 0 THEN ROUND(COALESCE(SUM(original_amount),0)/COUNT(DISTINCT id),2) ELSE 0 END
  ) INTO v
  FROM base
  WHERE (p_from IS NULL OR issue_date >= p_from) AND (p_to IS NULL OR issue_date <= p_to);
  RETURN v;
END;$function$;

revoke execute on function public.rpc_b2b_carteira_kpis(p_from date, p_to date) from public, anon;
grant execute on function public.rpc_b2b_carteira_kpis(p_from date, p_to date) to authenticated, service_role;

-- rpc_b2b_executive_alerts (plpgsql-strip)
CREATE OR REPLACE FUNCTION public.rpc_b2b_executive_alerts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  WITH credit AS (
    SELECT pa.id, pa.nome_fantasia, pa.razao_social, pfs.credit_limit,
      COALESCE((SELECT SUM(ari.original_amount - ari.received_amount)
        FROM accounts_receivable ar
        JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
        WHERE ar.origin_type='B2B_ORDER' AND ar.partner_id = pa.id
          AND ari.status IN ('OPEN','PARTIAL','OVERDUE')),0) AS aberto
    FROM partner_accounts pa
    LEFT JOIN partner_financial_settings pfs ON pfs.partner_id = pa.id
    WHERE pa.ativo = true AND pa.deleted_at IS NULL AND COALESCE(pfs.credit_limit,0) > 0
  ),
  classed AS (
    SELECT id, COALESCE(nome_fantasia, razao_social) AS nome, credit_limit, aberto,
      ROUND((aberto/credit_limit)*100,2) AS pct
    FROM credit
  )
  SELECT jsonb_build_object(
    'acima_80', (SELECT jsonb_agg(jsonb_build_object('partner_id',id,'nome',nome,'pct',pct,'aberto',aberto,'limite',credit_limit))
                 FROM classed WHERE pct >= 80 AND pct < 90),
    'acima_90', (SELECT jsonb_agg(jsonb_build_object('partner_id',id,'nome',nome,'pct',pct,'aberto',aberto,'limite',credit_limit))
                 FROM classed WHERE pct >= 90),
    'bloqueados', (SELECT jsonb_agg(jsonb_build_object('partner_id',po.partner_id,'numero',po.numero))
                   FROM partner_orders po WHERE po.status = 'aguardando_aprovacao_credito'),
    'com_vencidos', (SELECT jsonb_agg(jsonb_build_object('partner_id',prs.partner_id,'vencidos',prs.titulos_vencidos,'dias',prs.dias_medio_atraso))
                     FROM partner_risk_scores prs WHERE prs.titulos_vencidos > 0),
    'score_critico', (SELECT jsonb_agg(jsonb_build_object('partner_id',prs.partner_id,'score',prs.score))
                      FROM partner_risk_scores prs WHERE prs.risk_level = 'critico'),
    'receita_em_risco', (rpc_b2b_revenue_forecast(NULL)->>'em_risco')::numeric
  ) INTO v;
  RETURN v;
END;$function$;

revoke execute on function public.rpc_b2b_executive_alerts() from public, anon;
grant execute on function public.rpc_b2b_executive_alerts() to authenticated, service_role;

-- rpc_b2b_executive_dashboard (plpgsql-strip)
CREATE OR REPLACE FUNCTION public.rpc_b2b_executive_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; kpis jsonb; fc jsonb;
BEGIN
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
END;$function$;

revoke execute on function public.rpc_b2b_executive_dashboard() from public, anon;
grant execute on function public.rpc_b2b_executive_dashboard() to authenticated, service_role;

-- rpc_b2b_governance_kpis (plpgsql-strip)
CREATE OR REPLACE FUNCTION public.rpc_b2b_governance_kpis()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_concedido numeric := 0;
  v_total_utilizado numeric := 0;
  v_total_disponivel numeric := 0;
  v_bloqueados int := 0;
  v_vencidos numeric := 0;
  v_recebido_mes numeric := 0;
  v_inad_pct numeric := 0;
  v_receita numeric := 0;
BEGIN
  SELECT COALESCE(SUM(credit_limit),0) INTO v_total_concedido
    FROM public.partner_financial_settings WHERE active;

  SELECT COALESCE(SUM((ari.original_amount - ari.received_amount)),0) INTO v_total_utilizado
    FROM public.accounts_receivable ar
    JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
   WHERE ar.origin_type = 'B2B_ORDER' AND ar.status <> 'CANCELED'
     AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  v_total_disponivel := GREATEST(v_total_concedido - v_total_utilizado, 0);

  SELECT COUNT(DISTINCT partner_id) INTO v_bloqueados
    FROM public.partner_orders WHERE status = 'aguardando_aprovacao_credito';

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_vencidos
    FROM public.accounts_receivable ar
    JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
   WHERE ar.origin_type = 'B2B_ORDER' AND ar.status <> 'CANCELED'
     AND ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < current_date;

  SELECT COALESCE(SUM(rp.amount_received),0) INTO v_recebido_mes
    FROM public.receivable_payments rp
    JOIN public.accounts_receivable_installments ari ON ari.id = rp.installment_id
    JOIN public.accounts_receivable ar ON ar.id = ari.receivable_id
   WHERE ar.origin_type = 'B2B_ORDER'
     AND date_trunc('month', rp.payment_date) = date_trunc('month', current_date);

  SELECT COALESCE(SUM(total),0) INTO v_receita
    FROM public.partner_orders
   WHERE status IN ('entregue','faturado')
     AND date_trunc('month', created_at) = date_trunc('month', current_date);

  v_inad_pct := CASE WHEN v_total_utilizado > 0
                     THEN ROUND((v_vencidos / v_total_utilizado) * 100, 2)
                     ELSE 0 END;

  RETURN jsonb_build_object(
    'credito_total_concedido', v_total_concedido,
    'credito_utilizado', v_total_utilizado,
    'credito_disponivel', v_total_disponivel,
    'parceiros_bloqueados', v_bloqueados,
    'titulos_vencidos', v_vencidos,
    'recebimentos_mes', v_recebido_mes,
    'inadimplencia_pct', v_inad_pct,
    'receita_b2b_mes', v_receita
  );
END;$function$;

revoke execute on function public.rpc_b2b_governance_kpis() from public, anon;
grant execute on function public.rpc_b2b_governance_kpis() to authenticated, service_role;

-- rpc_b2b_partner_profitability (sql-unwrap)
CREATE OR REPLACE FUNCTION public.rpc_b2b_partner_profitability(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_partner_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(partner_id uuid, partner_name text, total_comprado numeric, total_recebido numeric, total_aberto numeric, ticket_medio numeric, qtd_pedidos integer, prazo_medio_pgto numeric, inadimplencia_pct numeric, risk_score integer, risk_level text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ORDER BY COALESCE(p.total,0) DESC;
$function$;

revoke execute on function public.rpc_b2b_partner_profitability(p_from date, p_to date, p_partner_id uuid) from public, anon;
grant execute on function public.rpc_b2b_partner_profitability(p_from date, p_to date, p_partner_id uuid) to authenticated, service_role;

-- rpc_b2b_revenue_forecast (plpgsql-strip)
CREATE OR REPLACE FUNCTION public.rpc_b2b_revenue_forecast(p_partner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  WITH conf AS (
    SELECT
      SUM(CASE WHEN ari.due_date <= CURRENT_DATE + 30 THEN ari.original_amount - ari.received_amount ELSE 0 END) AS c30,
      SUM(CASE WHEN ari.due_date <= CURRENT_DATE + 60 THEN ari.original_amount - ari.received_amount ELSE 0 END) AS c60,
      SUM(CASE WHEN ari.due_date <= CURRENT_DATE + 90 THEN ari.original_amount - ari.received_amount ELSE 0 END) AS c90
    FROM accounts_receivable ar
    JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
    WHERE ar.origin_type='B2B_ORDER' AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
      AND (p_partner_id IS NULL OR ar.partner_id = p_partner_id)
  ),
  proj AS (
    SELECT COALESCE(SUM(total),0) AS p30
    FROM partner_orders WHERE receivable_generated = false
      AND status IN ('aprovado','em_producao','produzido','aguardando_entrega','em_separacao','enviado','entregue')
      AND (p_partner_id IS NULL OR partner_id = p_partner_id)
  ),
  risk AS (
    SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) AS r
    FROM accounts_receivable ar
    JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
    LEFT JOIN partner_risk_scores prs ON prs.partner_id = ar.partner_id
    WHERE ar.origin_type='B2B_ORDER' AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
      AND (ari.due_date < CURRENT_DATE OR COALESCE(prs.risk_level,'baixo')='critico')
      AND (p_partner_id IS NULL OR ar.partner_id = p_partner_id)
  )
  SELECT jsonb_build_object(
    'confirmada_30', COALESCE((SELECT c30 FROM conf),0),
    'confirmada_60', COALESCE((SELECT c60 FROM conf),0),
    'confirmada_90', COALESCE((SELECT c90 FROM conf),0),
    'projetada', COALESCE((SELECT p30 FROM proj),0),
    'em_risco', COALESCE((SELECT r FROM risk),0)
  ) INTO v;
  RETURN v;
END;$function$;

revoke execute on function public.rpc_b2b_revenue_forecast(p_partner_id uuid) from public, anon;
grant execute on function public.rpc_b2b_revenue_forecast(p_partner_id uuid) to authenticated, service_role;

-- rpc_message_set_status (plpgsql-strip)
CREATE OR REPLACE FUNCTION public.rpc_message_set_status(p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_status NOT IN ('nao_lida','lida','respondida','encerrada') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.partner_order_messages
     SET status = p_status, status_updated_at = now()
   WHERE id = p_id;
END $function$;

revoke execute on function public.rpc_message_set_status(p_id uuid, p_status text) from public, anon;
grant execute on function public.rpc_message_set_status(p_id uuid, p_status text) to authenticated, service_role;

-- rpc_partner_message_counters (plpgsql-strip)
CREATE OR REPLACE FUNCTION public.rpc_partner_message_counters(p_partner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_partner uuid := COALESCE(p_partner_id, get_user_partner_id());
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'nao_lidas', COUNT(*) FILTER (WHERE m.status = 'nao_lida'),
      'pendentes', COUNT(*) FILTER (WHERE m.status IN ('nao_lida','lida')),
      'respondidas', COUNT(*) FILTER (WHERE m.status = 'respondida'),
      'encerradas', COUNT(*) FILTER (WHERE m.status = 'encerrada')
    )
    FROM public.partner_order_messages m
    JOIN public.partner_orders po ON po.id = m.order_id
    WHERE (v_partner IS NULL OR po.partner_id = v_partner)
  );
END $function$;

revoke execute on function public.rpc_partner_message_counters(p_partner_id uuid) from public, anon;
grant execute on function public.rpc_partner_message_counters(p_partner_id uuid) to authenticated, service_role;

commit;
