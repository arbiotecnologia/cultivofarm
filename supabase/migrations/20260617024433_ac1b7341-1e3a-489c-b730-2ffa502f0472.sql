
-- ============== TABLES ==============

CREATE TABLE IF NOT EXISTS public.partner_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL UNIQUE REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  score int NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'baixo',
  dias_medio_atraso numeric(8,2) NOT NULL DEFAULT 0,
  titulos_vencidos int NOT NULL DEFAULT 0,
  pct_credito_utilizado numeric(6,2) NOT NULL DEFAULT 0,
  freq_compras_30d int NOT NULL DEFAULT 0,
  meses_relacionamento int NOT NULL DEFAULT 0,
  calculado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prs_score_range CHECK (score >= 0 AND score <= 100),
  CONSTRAINT prs_risk_level CHECK (risk_level IN ('baixo','medio','alto','critico'))
);
CREATE INDEX IF NOT EXISTS idx_prs_partner ON public.partner_risk_scores(partner_id);
CREATE INDEX IF NOT EXISTS idx_prs_level ON public.partner_risk_scores(risk_level);

GRANT SELECT ON public.partner_risk_scores TO authenticated;
GRANT ALL ON public.partner_risk_scores TO service_role;
ALTER TABLE public.partner_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prs_select_staff" ON public.partner_risk_scores FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'administrador'::app_role)
  OR has_role(auth.uid(),'gestor'::app_role)
  OR has_role(auth.uid(),'gestor_comercial'::app_role)
  OR has_role(auth.uid(),'financeiro'::app_role)
);

CREATE TABLE IF NOT EXISTS public.financial_governance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regra text NOT NULL UNIQUE,
  descricao text,
  por_credito boolean NOT NULL DEFAULT true,
  por_inadimplencia boolean NOT NULL DEFAULT true,
  por_score_critico boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fgr_regra CHECK (regra IN ('bloquear_pedido','bloquear_aprovacao','bloquear_producao','bloquear_entrega'))
);

GRANT SELECT ON public.financial_governance_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.financial_governance_rules TO authenticated;
GRANT ALL ON public.financial_governance_rules TO service_role;
ALTER TABLE public.financial_governance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fgr_select_staff" ON public.financial_governance_rules FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'administrador'::app_role)
  OR has_role(auth.uid(),'gestor'::app_role)
  OR has_role(auth.uid(),'gestor_comercial'::app_role)
  OR has_role(auth.uid(),'financeiro'::app_role)
);
CREATE POLICY "fgr_modify_admin" ON public.financial_governance_rules FOR ALL TO authenticated
USING (has_role(auth.uid(),'administrador'::app_role) OR has_role(auth.uid(),'gestor'::app_role) OR has_role(auth.uid(),'financeiro'::app_role))
WITH CHECK (has_role(auth.uid(),'administrador'::app_role) OR has_role(auth.uid(),'gestor'::app_role) OR has_role(auth.uid(),'financeiro'::app_role));

INSERT INTO public.financial_governance_rules (regra, descricao, por_credito, por_inadimplencia, por_score_critico, ativo) VALUES
  ('bloquear_pedido','Bloqueia criação de novos pedidos',true,true,true,true),
  ('bloquear_aprovacao','Bloqueia aprovação comercial',true,true,true,true),
  ('bloquear_producao','Bloqueia envio à produção',false,true,true,false),
  ('bloquear_entrega','Bloqueia liberação de entrega',false,true,false,false)
ON CONFLICT (regra) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.financial_governance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid,
  partner_id uuid,
  acao text NOT NULL,
  dados_anteriores jsonb,
  dados_novos jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fgal_partner ON public.financial_governance_audit_log(partner_id);
CREATE INDEX IF NOT EXISTS idx_fgal_created ON public.financial_governance_audit_log(created_at DESC);

GRANT SELECT, INSERT ON public.financial_governance_audit_log TO authenticated;
GRANT ALL ON public.financial_governance_audit_log TO service_role;
ALTER TABLE public.financial_governance_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fgal_select_staff" ON public.financial_governance_audit_log FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'administrador'::app_role)
  OR has_role(auth.uid(),'gestor'::app_role)
  OR has_role(auth.uid(),'financeiro'::app_role)
);
CREATE POLICY "fgal_insert_system" ON public.financial_governance_audit_log FOR INSERT TO authenticated
WITH CHECK (true);

-- updated_at triggers
CREATE TRIGGER trg_prs_updated_at BEFORE UPDATE ON public.partner_risk_scores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fgr_updated_at BEFORE UPDATE ON public.financial_governance_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== FUNCTIONS ==============

-- Aging detalhado
CREATE OR REPLACE FUNCTION public.rpc_b2b_aging_detalhado(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_partner_id uuid DEFAULT NULL, p_status text DEFAULT NULL
)
RETURNS TABLE(faixa text, qtd_titulos int, valor numeric, qtd_parceiros int, pct_carteira numeric, valor_medio_parceiro numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
END;$$;

GRANT EXECUTE ON FUNCTION public.rpc_b2b_aging_detalhado(date,date,uuid,text) TO authenticated;

-- Recalcula score de risco
CREATE OR REPLACE FUNCTION public.recalc_partner_risk_score(p_partner_id uuid)
RETURNS public.partner_risk_scores
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_dias_atraso numeric := 0;
  v_vencidos int := 0;
  v_pct numeric := 0;
  v_freq int := 0;
  v_meses int := 0;
  v_limite numeric := 0;
  v_aberto numeric := 0;
  v_score int := 0;
  v_level text := 'baixo';
  v_row public.partner_risk_scores;
BEGIN
  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'partner_id required'; END IF;

  SELECT COALESCE(AVG(GREATEST(0, CURRENT_DATE - ari.due_date)),0)::numeric,
         COUNT(*) FILTER (WHERE ari.status='OVERDUE' OR (ari.status IN ('OPEN','PARTIAL') AND ari.due_date < CURRENT_DATE))
    INTO v_dias_atraso, v_vencidos
  FROM accounts_receivable ar
  JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.origin_type='B2B_ORDER' AND ar.partner_id = p_partner_id
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  SELECT COALESCE(credit_limit,0) INTO v_limite FROM partner_financial_settings WHERE partner_id = p_partner_id;
  v_limite := COALESCE(v_limite,0);

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_aberto
  FROM accounts_receivable ar
  JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.origin_type='B2B_ORDER' AND ar.partner_id = p_partner_id
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  v_pct := CASE WHEN v_limite > 0 THEN LEAST(100,(v_aberto/v_limite)*100) ELSE 0 END;

  SELECT COUNT(*) INTO v_freq FROM partner_orders
   WHERE partner_id = p_partner_id AND created_at >= now() - interval '30 days'
     AND status NOT IN ('cancelado','reprovado');

  SELECT GREATEST(0, EXTRACT(YEAR FROM age(now(), pa.created_at))*12 + EXTRACT(MONTH FROM age(now(), pa.created_at)))::int
    INTO v_meses FROM partner_accounts pa WHERE id = p_partner_id;

  -- score (peso): atraso 35, vencidos 25, util 20, freq -10, relacionamento -10
  v_score := LEAST(100, GREATEST(0,
      ROUND(LEAST(v_dias_atraso/90.0,1)*35)
    + ROUND(LEAST(v_vencidos/5.0,1)*25)
    + ROUND((v_pct/100.0)*20)
    - ROUND(LEAST(v_freq/10.0,1)*10)
    - ROUND(LEAST(COALESCE(v_meses,0)/24.0,1)*10)
  ));
  v_level := CASE
    WHEN v_score <= 30 THEN 'baixo'
    WHEN v_score <= 60 THEN 'medio'
    WHEN v_score <= 80 THEN 'alto'
    ELSE 'critico' END;

  INSERT INTO partner_risk_scores (partner_id, score, risk_level, dias_medio_atraso, titulos_vencidos, pct_credito_utilizado, freq_compras_30d, meses_relacionamento, calculado_em)
  VALUES (p_partner_id, v_score, v_level, v_dias_atraso, v_vencidos, v_pct, v_freq, COALESCE(v_meses,0), now())
  ON CONFLICT (partner_id) DO UPDATE SET
    score = EXCLUDED.score,
    risk_level = EXCLUDED.risk_level,
    dias_medio_atraso = EXCLUDED.dias_medio_atraso,
    titulos_vencidos = EXCLUDED.titulos_vencidos,
    pct_credito_utilizado = EXCLUDED.pct_credito_utilizado,
    freq_compras_30d = EXCLUDED.freq_compras_30d,
    meses_relacionamento = EXCLUDED.meses_relacionamento,
    calculado_em = now()
  RETURNING * INTO v_row;

  INSERT INTO financial_governance_audit_log(usuario_id, partner_id, acao, dados_novos)
  VALUES (auth.uid(), p_partner_id, 'score_recalculado', to_jsonb(v_row));

  RETURN v_row;
END;$$;
GRANT EXECUTE ON FUNCTION public.recalc_partner_risk_score(uuid) TO authenticated;

-- Trigger: recalcular score em mudança de installments
CREATE OR REPLACE FUNCTION public.tg_recalc_risk_on_ar_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_partner uuid;
BEGIN
  SELECT ar.partner_id INTO v_partner FROM accounts_receivable ar
   WHERE ar.id = COALESCE(NEW.receivable_id, OLD.receivable_id) AND ar.origin_type='B2B_ORDER';
  IF v_partner IS NOT NULL THEN
    PERFORM recalc_partner_risk_score(v_partner);
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_recalc_risk_on_ar_change ON public.accounts_receivable_installments;
CREATE TRIGGER trg_recalc_risk_on_ar_change
AFTER INSERT OR UPDATE OF status, received_amount ON public.accounts_receivable_installments
FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_risk_on_ar_change();

-- Previsão de receita
CREATE OR REPLACE FUNCTION public.rpc_b2b_revenue_forecast(p_partner_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
END;$$;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_revenue_forecast(uuid) TO authenticated;

-- Rentabilidade por parceiro
CREATE OR REPLACE FUNCTION public.rpc_b2b_partner_profitability(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_partner_id uuid DEFAULT NULL
)
RETURNS TABLE(
  partner_id uuid, partner_name text,
  total_comprado numeric, total_recebido numeric, total_aberto numeric,
  ticket_medio numeric, qtd_pedidos int,
  prazo_medio_pgto numeric, inadimplencia_pct numeric, risk_score int, risk_level text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
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
$$;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_partner_profitability(date,date,uuid) TO authenticated;

-- Alertas executivos
CREATE OR REPLACE FUNCTION public.rpc_b2b_executive_alerts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
END;$$;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_executive_alerts() TO authenticated;

-- KPIs carteira
CREATE OR REPLACE FUNCTION public.rpc_b2b_carteira_kpis(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
END;$$;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_carteira_kpis(date,date) TO authenticated;

-- Dashboard executivo
CREATE OR REPLACE FUNCTION public.rpc_b2b_executive_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
END;$$;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_executive_dashboard() TO authenticated;

-- Bloqueios inteligentes (consultado por terceiros)
CREATE OR REPLACE FUNCTION public.rpc_b2b_check_governance_block(p_partner_id uuid, p_acao text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rule public.financial_governance_rules%ROWTYPE;
  v_pfs public.partner_financial_settings%ROWTYPE;
  v_aberto numeric := 0;
  v_vencido numeric := 0;
  v_score_level text := 'baixo';
  v_motivo text;
BEGIN
  SELECT * INTO v_rule FROM financial_governance_rules WHERE regra = p_acao AND ativo=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('blocked',false); END IF;

  SELECT * INTO v_pfs FROM partner_financial_settings WHERE partner_id = p_partner_id;
  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0),
         COALESCE(SUM(ari.original_amount - ari.received_amount) FILTER (WHERE ari.due_date < CURRENT_DATE),0)
    INTO v_aberto, v_vencido
  FROM accounts_receivable ar
  JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.origin_type='B2B_ORDER' AND ar.partner_id=p_partner_id
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  SELECT risk_level INTO v_score_level FROM partner_risk_scores WHERE partner_id = p_partner_id;

  IF v_rule.por_credito AND v_pfs.credit_limit IS NOT NULL AND v_pfs.credit_limit > 0 AND v_aberto >= v_pfs.credit_limit THEN
    v_motivo := 'credito_excedido';
  ELSIF v_rule.por_inadimplencia AND v_vencido > 0 THEN
    v_motivo := 'inadimplencia';
  ELSIF v_rule.por_score_critico AND COALESCE(v_score_level,'baixo') = 'critico' THEN
    v_motivo := 'score_critico';
  END IF;

  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('blocked',true,'motivo',v_motivo);
  END IF;
  RETURN jsonb_build_object('blocked',false);
END;$$;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_check_governance_block(uuid,text) TO authenticated;

-- Auditoria de mudanças em pfs e fgr
CREATE OR REPLACE FUNCTION public.tg_governance_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_partner uuid;
BEGIN
  v_partner := CASE WHEN TG_TABLE_NAME='partner_financial_settings' THEN COALESCE(NEW.partner_id, OLD.partner_id) ELSE NULL END;
  INSERT INTO financial_governance_audit_log(usuario_id, partner_id, acao, dados_anteriores, dados_novos)
  VALUES (auth.uid(), v_partner,
    TG_TABLE_NAME || '_' || lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END;$$;

DROP TRIGGER IF EXISTS trg_pfs_governance_audit ON public.partner_financial_settings;
CREATE TRIGGER trg_pfs_governance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.partner_financial_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_governance_audit();

DROP TRIGGER IF EXISTS trg_fgr_governance_audit ON public.financial_governance_rules;
CREATE TRIGGER trg_fgr_governance_audit
AFTER INSERT OR UPDATE OR DELETE ON public.financial_governance_rules
FOR EACH ROW EXECUTE FUNCTION public.tg_governance_audit();
