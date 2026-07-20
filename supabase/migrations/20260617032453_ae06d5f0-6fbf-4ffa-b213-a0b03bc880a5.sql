
-- =====================================================================
-- FASE 3.4.1 — CONSOLIDAÇÃO FINAL DO MÓDULO COMERCIAL B2B
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ENDURECER SEGURANÇA DAS CAMPANHAS
-- ---------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.commercial_campaigns FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.commercial_campaign_partners FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.commercial_campaign_products FROM authenticated;
GRANT SELECT ON public.commercial_campaigns TO authenticated;
GRANT SELECT ON public.commercial_campaign_partners TO authenticated;
GRANT SELECT ON public.commercial_campaign_products TO authenticated;
GRANT ALL ON public.commercial_campaigns TO service_role;
GRANT ALL ON public.commercial_campaign_partners TO service_role;
GRANT ALL ON public.commercial_campaign_products TO service_role;

-- Funções SECURITY DEFINER para que admin/gestor possam escrever via RPC
CREATE OR REPLACE FUNCTION public.rpc_campaign_upsert(p_payload jsonb, p_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.commercial_campaigns(nome, descricao, data_inicio, data_fim, ativa, created_by)
    VALUES (p_payload->>'nome', p_payload->>'descricao',
            (p_payload->>'data_inicio')::date, (p_payload->>'data_fim')::date,
            COALESCE((p_payload->>'ativa')::boolean, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.commercial_campaigns SET
      nome = COALESCE(p_payload->>'nome', nome),
      descricao = COALESCE(p_payload->>'descricao', descricao),
      data_inicio = COALESCE((p_payload->>'data_inicio')::date, data_inicio),
      data_fim = COALESCE((p_payload->>'data_fim')::date, data_fim),
      ativa = COALESCE((p_payload->>'ativa')::boolean, ativa),
      updated_at = now()
    WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_campaign_delete(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.commercial_campaigns WHERE id = p_id;
END $$;

-- ---------------------------------------------------------------------
-- 2. APENAS UMA TABELA COMERCIAL VIGENTE (defesa em profundidade)
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_partner_product_current
  ON public.partner_product_prices (partner_id, product_id)
  WHERE is_current = true;

CREATE OR REPLACE FUNCTION public.tg_set_current_price_table()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE public.partner_product_prices
       SET is_current = false, ativo = false, updated_at = now()
     WHERE partner_id = NEW.partner_id
       AND product_id = NEW.product_id
       AND id <> NEW.id
       AND is_current = true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_current_price_table ON public.partner_product_prices;
CREATE TRIGGER trg_set_current_price_table
  BEFORE INSERT OR UPDATE OF is_current ON public.partner_product_prices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_current_price_table();

-- ---------------------------------------------------------------------
-- 3. HIERARQUIA DE PREÇOS NO SIMULADOR (com price_source)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_commercial_simulator(
  p_partner_id uuid, p_product_id uuid, p_quantidade numeric, p_desconto numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tabela numeric; v_final numeric; v_total numeric; v_custo numeric;
  v_source text := 'base'; v_source_label text := 'Preço base';
  v_campanha_nome text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 1) Campanha ativa
  SELECT c.nome INTO v_campanha_nome
    FROM public.commercial_campaigns c
    JOIN public.commercial_campaign_partners cp ON cp.campaign_id = c.id AND cp.partner_id = p_partner_id
    JOIN public.commercial_campaign_products pp ON pp.campaign_id = c.id AND pp.product_id = p_product_id
   WHERE c.ativa = true AND CURRENT_DATE BETWEEN c.data_inicio AND c.data_fim
   ORDER BY c.data_inicio DESC LIMIT 1;

  IF v_campanha_nome IS NOT NULL THEN
    SELECT COALESCE(ppp.preco_tabela, p.valor_ha_brl, 0) INTO v_tabela
      FROM public.produtos p
      LEFT JOIN public.partner_product_prices ppp
        ON ppp.product_id = p.id AND ppp.partner_id = p_partner_id AND ppp.is_current AND ppp.ativo
     WHERE p.id = p_product_id;
    v_source := 'campanha';
    v_source_label := 'Preço aplicado pela campanha: ' || v_campanha_nome;
  ELSE
    -- 2) Tabela do parceiro
    SELECT ppp.preco_tabela INTO v_tabela
      FROM public.partner_product_prices ppp
     WHERE ppp.product_id = p_product_id AND ppp.partner_id = p_partner_id
       AND ppp.is_current AND ppp.ativo
     LIMIT 1;
    IF v_tabela IS NOT NULL THEN
      v_source := 'tabela_parceiro';
      v_source_label := 'Preço aplicado pela tabela comercial do parceiro';
    ELSE
      -- 3) Base
      SELECT COALESCE(p.valor_ha_brl, 0) INTO v_tabela
        FROM public.produtos p WHERE p.id = p_product_id;
      v_source := 'base';
      v_source_label := 'Preço base do produto';
    END IF;
  END IF;

  v_tabela := COALESCE(v_tabela, 0);
  v_final := ROUND(v_tabela * (1 - COALESCE(p_desconto,0)/100), 2);
  v_total := ROUND(v_final * p_quantidade, 2);
  v_custo := ROUND(v_tabela * 0.55, 2);

  RETURN jsonb_build_object(
    'preco_tabela', v_tabela,
    'desconto_pct', COALESCE(p_desconto,0),
    'preco_final', v_final,
    'quantidade', p_quantidade,
    'valor_total', v_total,
    'custo_estimado_unitario', v_custo,
    'margem_unitaria', v_final - v_custo,
    'margem_pct', CASE WHEN v_final > 0 THEN ROUND(((v_final - v_custo)/v_final)*100, 2) ELSE 0 END,
    'rentabilidade_total', ROUND((v_final - v_custo) * p_quantidade, 2),
    'price_source', v_source,
    'price_source_label', v_source_label,
    'campanha_nome', v_campanha_nome
  );
END $$;

-- ---------------------------------------------------------------------
-- 4. ANEXOS EM MENSAGENS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_order_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.partner_order_messages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_poma_message ON public.partner_order_message_attachments(message_id);

GRANT SELECT, INSERT, DELETE ON public.partner_order_message_attachments TO authenticated;
GRANT ALL ON public.partner_order_message_attachments TO service_role;
ALTER TABLE public.partner_order_message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poma_select" ON public.partner_order_message_attachments;
CREATE POLICY "poma_select" ON public.partner_order_message_attachments FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial')
    OR EXISTS (
      SELECT 1 FROM public.partner_order_messages m
      JOIN public.partner_orders po ON po.id = m.order_id
      WHERE m.id = partner_order_message_attachments.message_id
        AND has_role(auth.uid(),'parceiro_b2b')
        AND po.partner_id = get_user_partner_id()
    )
  );

DROP POLICY IF EXISTS "poma_insert" ON public.partner_order_message_attachments;
CREATE POLICY "poma_insert" ON public.partner_order_message_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.partner_order_messages m
      JOIN public.partner_orders po ON po.id = m.order_id
      WHERE m.id = message_id
        AND (
          has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial')
          OR (has_role(auth.uid(),'parceiro_b2b') AND po.partner_id = get_user_partner_id())
        )
    )
  );

DROP POLICY IF EXISTS "poma_delete" ON public.partner_order_message_attachments;
CREATE POLICY "poma_delete" ON public.partner_order_message_attachments FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial')
  );

-- ---------------------------------------------------------------------
-- 5. STATUS NAS MENSAGENS
-- ---------------------------------------------------------------------
ALTER TABLE public.partner_order_messages
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'nao_lida'
  CHECK (status IN ('nao_lida','lida','respondida','encerrada'));
ALTER TABLE public.partner_order_messages
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.rpc_message_set_status(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('nao_lida','lida','respondida','encerrada') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.partner_order_messages
     SET status = p_status, status_updated_at = now()
   WHERE id = p_id;
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_message_set_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_partner_message_counters(p_partner_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_partner_message_counters(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. MÉTRICAS COMERCIAIS (view)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_partner_commercial_metrics
WITH (security_invoker = on) AS
SELECT
  pa.id AS partner_id,
  pa.razao_social,
  COUNT(po.id) AS qtd_pedidos,
  COALESCE(SUM(po.total), 0) AS total_comprado,
  COALESCE(SUM(po.total) FILTER (WHERE po.status::text IN ('aprovado','em_producao','pronto_entrega','entregue','faturado')), 0) AS total_aprovado,
  COALESCE(SUM(po.total) FILTER (WHERE po.status::text = 'entregue'), 0) AS total_entregue,
  COALESCE(SUM(po.total) FILTER (WHERE po.status::text = 'faturado'), 0) AS total_faturado,
  CASE WHEN COUNT(po.id) > 0 THEN ROUND(SUM(po.total)::numeric / COUNT(po.id), 2) ELSE 0 END AS ticket_medio,
  MAX(po.created_at) AS ultima_compra
FROM public.partner_accounts pa
LEFT JOIN public.partner_orders po ON po.partner_id = pa.id
GROUP BY pa.id, pa.razao_social;

GRANT SELECT ON public.vw_partner_commercial_metrics TO authenticated;

-- ---------------------------------------------------------------------
-- 7. ENGAJAMENTO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_engagement_metrics (
  partner_id uuid PRIMARY KEY REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  ultima_compra timestamptz,
  dias_sem_compra int,
  pedidos_30d int NOT NULL DEFAULT 0,
  pedidos_90d int NOT NULL DEFAULT 0,
  top_produtos jsonb NOT NULL DEFAULT '[]'::jsonb,
  campanhas_usadas jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.partner_engagement_metrics TO authenticated;
GRANT ALL ON public.partner_engagement_metrics TO service_role;
ALTER TABLE public.partner_engagement_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pem_admin" ON public.partner_engagement_metrics;
CREATE POLICY "pem_admin" ON public.partner_engagement_metrics FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial'));
DROP POLICY IF EXISTS "pem_self" ON public.partner_engagement_metrics;
CREATE POLICY "pem_self" ON public.partner_engagement_metrics FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'parceiro_b2b') AND partner_id = get_user_partner_id());

CREATE OR REPLACE FUNCTION public.refresh_partner_engagement(p_partner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.tg_refresh_engagement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.refresh_partner_engagement(COALESCE(NEW.partner_id, OLD.partner_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_refresh_engagement ON public.partner_orders;
CREATE TRIGGER trg_refresh_engagement
  AFTER INSERT OR UPDATE OR DELETE ON public.partner_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_engagement();

-- ---------------------------------------------------------------------
-- 8. DASHBOARD CONSOLIDADO
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_commercial_consolidated_dashboard(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_partner_id uuid DEFAULT NULL, p_consultor uuid DEFAULT NULL,
  p_region text DEFAULT NULL, p_partner_type text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from date := COALESCE(p_from, (now() - interval '30 days')::date);
        v_to date := COALESCE(p_to, now()::date);
BEGIN
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN jsonb_build_object(
    'parceiros_ativos', (SELECT COUNT(*) FROM public.partner_accounts WHERE ativo
      AND (p_region IS NULL OR commercial_region = p_region)
      AND (p_partner_type IS NULL OR partner_type::text = p_partner_type)
      AND (p_consultor IS NULL OR consultor_responsavel = p_consultor)),
    'parceiros_inativos', (SELECT COUNT(*) FROM public.partner_accounts WHERE NOT ativo),
    'parceiros_novos', (SELECT COUNT(*) FROM public.partner_accounts WHERE created_at::date BETWEEN v_from AND v_to),
    'receita_aprovada', (SELECT COALESCE(SUM(total),0) FROM public.partner_orders po
      JOIN public.partner_accounts pa ON pa.id = po.partner_id
      WHERE po.created_at::date BETWEEN v_from AND v_to
        AND po.status::text IN ('aprovado','em_producao','pronto_entrega','entregue','faturado')
        AND (p_partner_id IS NULL OR po.partner_id = p_partner_id)
        AND (p_region IS NULL OR pa.commercial_region = p_region)
        AND (p_partner_type IS NULL OR pa.partner_type::text = p_partner_type)
        AND (p_consultor IS NULL OR pa.consultor_responsavel = p_consultor)),
    'receita_entregue', (SELECT COALESCE(SUM(total),0) FROM public.partner_orders
      WHERE created_at::date BETWEEN v_from AND v_to AND status::text = 'entregue'),
    'receita_faturada', (SELECT COALESCE(SUM(total),0) FROM public.partner_orders
      WHERE created_at::date BETWEEN v_from AND v_to AND status::text = 'faturado'),
    'pedidos_em_ajuste', (SELECT COUNT(*) FROM public.partner_orders WHERE status::text = 'aguardando_ajuste_comercial'),
    'pedidos_aguardando_aprovacao', (SELECT COUNT(*) FROM public.partner_orders WHERE status::text IN ('solicitado','em_analise_comercial')),
    'campanhas_ativas', (SELECT COUNT(*) FROM public.commercial_campaigns WHERE ativa AND CURRENT_DATE BETWEEN data_inicio AND data_fim),
    'periodo', jsonb_build_object('from', v_from, 'to', v_to)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_commercial_consolidated_dashboard(date,date,uuid,uuid,text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 9. ALERTAS ESTENDIDOS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_commercial_alerts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN jsonb_build_object(
    'pedidos_aguardando_aprovacao', (SELECT COUNT(*) FROM public.partner_orders WHERE status::text IN ('solicitado','em_analise_comercial')),
    'pedidos_aguardando_ajuste', (SELECT COUNT(*) FROM public.partner_orders WHERE status::text = 'aguardando_ajuste_comercial'),
    'campanhas_vencendo', (SELECT COALESCE(jsonb_agg(row_to_json(c)),'[]'::jsonb) FROM (
       SELECT id, nome, data_fim FROM public.commercial_campaigns
       WHERE ativa AND data_fim BETWEEN now()::date AND (now()::date + 15)) c),
    'tabelas_vencendo', (SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) FROM (
       SELECT partner_id, product_id, price_table_name, valid_until FROM public.partner_product_prices
       WHERE is_current AND valid_until IS NOT NULL AND valid_until BETWEEN now()::date AND (now()::date + 15)) t),
    'parceiros_sem_tabela', (SELECT COALESCE(jsonb_agg(row_to_json(p)),'[]'::jsonb) FROM (
       SELECT pa.id, pa.razao_social FROM public.partner_accounts pa
       WHERE pa.ativo AND NOT EXISTS (SELECT 1 FROM public.partner_product_prices ppp
         WHERE ppp.partner_id = pa.id AND ppp.is_current AND ppp.ativo) LIMIT 50) p),
    'parceiros_sem_compras_30d', (SELECT COALESCE(jsonb_agg(row_to_json(p)),'[]'::jsonb) FROM (
       SELECT pa.id, pa.razao_social,
              (SELECT MAX(created_at) FROM public.partner_orders WHERE partner_id = pa.id) AS ultima_compra
       FROM public.partner_accounts pa WHERE pa.ativo
       AND NOT EXISTS (SELECT 1 FROM public.partner_orders WHERE partner_id = pa.id AND created_at > now() - interval '30 days')
       LIMIT 50) p),
    'parceiros_sem_compras_60d', (SELECT COALESCE(jsonb_agg(row_to_json(p)),'[]'::jsonb) FROM (
       SELECT pa.id, pa.razao_social,
              (SELECT MAX(created_at) FROM public.partner_orders WHERE partner_id = pa.id) AS ultima_compra
       FROM public.partner_accounts pa WHERE pa.ativo
       AND NOT EXISTS (SELECT 1 FROM public.partner_orders WHERE partner_id = pa.id AND created_at > now() - interval '60 days')
       LIMIT 50) p),
    'mensagens_nao_respondidas', (SELECT COUNT(*) FROM public.partner_order_messages WHERE status IN ('nao_lida','lida'))
  );
END $$;

-- ---------------------------------------------------------------------
-- 10. AUDITORIA AVANÇADA (triggers adicionais)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_ppp ON public.partner_product_prices;
CREATE TRIGGER trg_audit_ppp AFTER INSERT OR UPDATE OR DELETE ON public.partner_product_prices
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_audit();

DROP TRIGGER IF EXISTS trg_audit_messages ON public.partner_order_messages;
CREATE TRIGGER trg_audit_messages AFTER INSERT OR UPDATE OR DELETE ON public.partner_order_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_audit();

DROP TRIGGER IF EXISTS trg_audit_attachments ON public.partner_order_message_attachments;
CREATE TRIGGER trg_audit_attachments AFTER INSERT OR DELETE ON public.partner_order_message_attachments
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_audit();

-- ---------------------------------------------------------------------
-- 11. VIEWS BI EXECUTIVO
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_bi_commercial_revenue WITH (security_invoker = on) AS
SELECT
  date_trunc('month', po.created_at)::date AS mes,
  pa.id AS partner_id, pa.razao_social, pa.commercial_region, pa.partner_type,
  COUNT(po.id) AS qtd_pedidos,
  COALESCE(SUM(po.total),0) AS receita_total,
  COALESCE(SUM(po.total) FILTER (WHERE po.status::text IN ('aprovado','em_producao','pronto_entrega','entregue','faturado')),0) AS receita_aprovada,
  COALESCE(SUM(po.total) FILTER (WHERE po.status::text = 'faturado'),0) AS receita_faturada
FROM public.partner_orders po
JOIN public.partner_accounts pa ON pa.id = po.partner_id
GROUP BY 1,2,3,4,5;

CREATE OR REPLACE VIEW public.vw_bi_commercial_engagement WITH (security_invoker = on) AS
SELECT pa.id AS partner_id, pa.razao_social, pa.partner_type, pa.commercial_region,
       pem.ultima_compra, pem.dias_sem_compra, pem.pedidos_30d, pem.pedidos_90d
FROM public.partner_accounts pa
LEFT JOIN public.partner_engagement_metrics pem ON pem.partner_id = pa.id;

CREATE OR REPLACE VIEW public.vw_bi_commercial_campaigns WITH (security_invoker = on) AS
SELECT c.id, c.nome, c.data_inicio, c.data_fim, c.ativa,
       (SELECT COUNT(*) FROM public.commercial_campaign_partners cp WHERE cp.campaign_id = c.id) AS qtd_parceiros,
       (SELECT COUNT(*) FROM public.commercial_campaign_products cpp WHERE cpp.campaign_id = c.id) AS qtd_produtos
FROM public.commercial_campaigns c;

GRANT SELECT ON public.vw_bi_commercial_revenue TO authenticated;
GRANT SELECT ON public.vw_bi_commercial_engagement TO authenticated;
GRANT SELECT ON public.vw_bi_commercial_campaigns TO authenticated;

-- Storage bucket criado fora da migration via tool dedicada.
