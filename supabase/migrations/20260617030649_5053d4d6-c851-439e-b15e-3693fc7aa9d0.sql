
-- ============================================================
-- FASE 3.4 — PORTAL COMERCIAL PREMIUM B2B
-- ============================================================

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE public.partner_type_enum AS ENUM (
    'distribuidor','revenda','cooperativa','produtor_parceiro','canal_estrategico','representante'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.partner_order_priority AS ENUM ('normal','urgente','programado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_message_author AS ENUM ('parceiro','comercial','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE public.partner_order_status ADD VALUE IF NOT EXISTS 'aguardando_ajuste_comercial';

-- 2. ALTER TABLES (additive)
ALTER TABLE public.partner_accounts
  ADD COLUMN IF NOT EXISTS partner_type public.partner_type_enum,
  ADD COLUMN IF NOT EXISTS commercial_region text,
  ADD COLUMN IF NOT EXISTS commercial_state text,
  ADD COLUMN IF NOT EXISTS commercial_city text,
  ADD COLUMN IF NOT EXISTS consultor_responsavel uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_parceiro text;

CREATE INDEX IF NOT EXISTS idx_partner_accounts_type ON public.partner_accounts(partner_type);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_region ON public.partner_accounts(commercial_region);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_consultor ON public.partner_accounts(consultor_responsavel);

ALTER TABLE public.partner_product_prices
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS price_table_name text,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_ppp_current ON public.partner_product_prices(partner_id, product_id) WHERE is_current;

ALTER TABLE public.partner_orders
  ADD COLUMN IF NOT EXISTS priority public.partner_order_priority NOT NULL DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_partner_orders_priority ON public.partner_orders(priority);
CREATE INDEX IF NOT EXISTS idx_partner_orders_full ON public.partner_orders(partner_id, status, priority, created_at DESC);

-- 3. CREATE ALL TABLES FIRST (sem policies cruzadas)

CREATE TABLE IF NOT EXISTS public.commercial_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commercial_campaign_partners (
  campaign_id uuid NOT NULL REFERENCES public.commercial_campaigns(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, partner_id)
);

CREATE TABLE IF NOT EXISTS public.commercial_campaign_products (
  campaign_id uuid NOT NULL REFERENCES public.commercial_campaigns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  price_table_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.partner_order_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  favorito boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.partner_orders(id) ON DELETE CASCADE,
  autor_id uuid,
  autor_tipo public.order_message_author NOT NULL,
  mensagem text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commercial_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid,
  partner_id uuid,
  order_id uuid,
  acao text NOT NULL,
  dados_anteriores jsonb,
  dados_novos jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_campaign_partners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_campaign_products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_order_templates TO authenticated;
GRANT SELECT, INSERT ON public.partner_order_messages TO authenticated;
GRANT SELECT, INSERT ON public.commercial_audit_log TO authenticated;
GRANT ALL ON public.commercial_campaigns, public.commercial_campaign_partners, public.commercial_campaign_products,
            public.partner_order_templates, public.partner_order_messages, public.commercial_audit_log TO service_role;

-- 5. ENABLE RLS
ALTER TABLE public.commercial_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_campaign_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_campaign_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_order_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_order_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_audit_log ENABLE ROW LEVEL SECURITY;

-- 6. POLICIES (todas as tabelas já existem)

-- commercial_campaigns
CREATE POLICY "campanhas_admin_all" ON public.commercial_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial'));
CREATE POLICY "campanhas_partner_select" ON public.commercial_campaigns FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'parceiro_b2b') AND ativa AND EXISTS (
    SELECT 1 FROM public.commercial_campaign_partners cp
    WHERE cp.campaign_id = commercial_campaigns.id AND cp.partner_id = public.get_user_partner_id()
  ));

-- commercial_campaign_partners
CREATE POLICY "campanhas_partners_admin" ON public.commercial_campaign_partners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial'));
CREATE POLICY "campanhas_partners_self" ON public.commercial_campaign_partners FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'parceiro_b2b') AND partner_id = public.get_user_partner_id());

-- commercial_campaign_products
CREATE POLICY "campanhas_products_admin" ON public.commercial_campaign_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial'));
CREATE POLICY "campanhas_products_partner" ON public.commercial_campaign_products FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'parceiro_b2b') AND EXISTS (
    SELECT 1 FROM public.commercial_campaign_partners cp
    WHERE cp.campaign_id = commercial_campaign_products.campaign_id
      AND cp.partner_id = public.get_user_partner_id()
  ));

-- partner_order_templates
CREATE POLICY "templates_admin_all" ON public.partner_order_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial'));
CREATE POLICY "templates_partner_select" ON public.partner_order_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'parceiro_b2b') AND partner_id = public.get_user_partner_id());
CREATE POLICY "templates_partner_insert" ON public.partner_order_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'parceiro_b2b') AND partner_id = public.get_user_partner_id());
CREATE POLICY "templates_partner_update" ON public.partner_order_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'parceiro_b2b') AND partner_id = public.get_user_partner_id())
  WITH CHECK (public.has_role(auth.uid(),'parceiro_b2b') AND partner_id = public.get_user_partner_id());
CREATE POLICY "templates_partner_delete" ON public.partner_order_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'parceiro_b2b') AND partner_id = public.get_user_partner_id());

-- partner_order_messages
CREATE POLICY "msg_admin_select" ON public.partner_order_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial'));
CREATE POLICY "msg_admin_insert" ON public.partner_order_messages FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial'))
    AND autor_tipo IN ('comercial','admin')
  );
CREATE POLICY "msg_partner_select" ON public.partner_order_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'parceiro_b2b') AND EXISTS (
    SELECT 1 FROM public.partner_orders po
    WHERE po.id = partner_order_messages.order_id AND po.partner_id = public.get_user_partner_id()
  ));
CREATE POLICY "msg_partner_insert" ON public.partner_order_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'parceiro_b2b')
    AND autor_tipo = 'parceiro'
    AND EXISTS (
      SELECT 1 FROM public.partner_orders po
      WHERE po.id = partner_order_messages.order_id AND po.partner_id = public.get_user_partner_id()
    )
  );

-- commercial_audit_log
CREATE POLICY "cau_admin_select" ON public.commercial_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial'));
CREATE POLICY "cau_authenticated_insert" ON public.commercial_audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 7. INDEXES extra
CREATE INDEX IF NOT EXISTS idx_partner_order_templates_partner ON public.partner_order_templates(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_order_messages_order ON public.partner_order_messages(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_commercial_audit_partner ON public.commercial_audit_log(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_audit_order ON public.commercial_audit_log(order_id, created_at DESC);

-- 8. UPDATED_AT triggers
CREATE TRIGGER trg_commercial_campaigns_updated BEFORE UPDATE ON public.commercial_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_partner_order_templates_updated BEFORE UPDATE ON public.partner_order_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. BUSINESS TRIGGERS

CREATE OR REPLACE FUNCTION public.tg_unique_current_price_table()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE public.partner_product_prices
       SET is_current = false
     WHERE partner_id = NEW.partner_id
       AND product_id = NEW.product_id
       AND id <> NEW.id
       AND is_current = true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_unique_current_price_table ON public.partner_product_prices;
CREATE TRIGGER trg_unique_current_price_table
  AFTER INSERT OR UPDATE OF is_current, partner_id, product_id ON public.partner_product_prices
  FOR EACH ROW EXECUTE FUNCTION public.tg_unique_current_price_table();

CREATE OR REPLACE FUNCTION public.tg_commercial_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_pid uuid;
  v_oid uuid;
BEGIN
  v_pid := COALESCE((to_jsonb(NEW)->>'partner_id')::uuid, (to_jsonb(OLD)->>'partner_id')::uuid);
  v_oid := COALESCE((to_jsonb(NEW)->>'order_id')::uuid, (to_jsonb(OLD)->>'order_id')::uuid);
  IF TG_TABLE_NAME = 'partner_orders' THEN
    v_oid := COALESCE(NEW.id, OLD.id);
  END IF;
  INSERT INTO public.commercial_audit_log(usuario_id, partner_id, order_id, acao, dados_anteriores, dados_novos)
  VALUES (
    auth.uid(),
    v_pid,
    v_oid,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_audit_ppp ON public.partner_product_prices;
CREATE TRIGGER trg_audit_ppp AFTER INSERT OR UPDATE OR DELETE ON public.partner_product_prices
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_audit();

DROP TRIGGER IF EXISTS trg_audit_campaigns ON public.commercial_campaigns;
CREATE TRIGGER trg_audit_campaigns AFTER INSERT OR UPDATE OR DELETE ON public.commercial_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_audit();

DROP TRIGGER IF EXISTS trg_audit_templates ON public.partner_order_templates;
CREATE TRIGGER trg_audit_templates AFTER INSERT OR UPDATE OR DELETE ON public.partner_order_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_audit();

DROP TRIGGER IF EXISTS trg_audit_messages ON public.partner_order_messages;
CREATE TRIGGER trg_audit_messages AFTER INSERT ON public.partner_order_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_audit();

CREATE OR REPLACE FUNCTION public.tg_audit_partner_order_commercial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.priority IS DISTINCT FROM OLD.priority OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.commercial_audit_log(usuario_id, partner_id, order_id, acao, dados_anteriores, dados_novos)
    VALUES (
      auth.uid(), NEW.partner_id, NEW.id, 'partner_orders.commercial_change',
      jsonb_build_object('status', OLD.status, 'priority', OLD.priority),
      jsonb_build_object('status', NEW.status, 'priority', NEW.priority)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_po_commercial ON public.partner_orders;
CREATE TRIGGER trg_audit_po_commercial AFTER UPDATE ON public.partner_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_partner_order_commercial();

-- 10. RPCs

CREATE OR REPLACE FUNCTION public.rpc_commercial_kpis(
  p_from date DEFAULT (now()::date - 30),
  p_to date DEFAULT now()::date,
  p_partner_id uuid DEFAULT NULL,
  p_consultor uuid DEFAULT NULL,
  p_region text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_commercial_history(
  p_partner_id uuid,
  p_from date DEFAULT (now()::date - 365),
  p_to date DEFAULT now()::date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.rpc_commercial_simulator(
  p_partner_id uuid,
  p_product_id uuid,
  p_quantidade numeric,
  p_desconto numeric
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tabela numeric;
  v_final numeric;
  v_total numeric;
  v_custo numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT COALESCE(ppp.preco_tabela, p.valor_ha_brl, 0)
    INTO v_tabela
  FROM public.produtos p
  LEFT JOIN public.partner_product_prices ppp
    ON ppp.product_id = p.id AND ppp.partner_id = p_partner_id AND ppp.is_current AND ppp.ativo
  WHERE p.id = p_product_id;

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
    'rentabilidade_total', ROUND((v_final - v_custo) * p_quantidade, 2)
  );
END $$;

CREATE OR REPLACE FUNCTION public.rpc_partner_dashboard(p_partner_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_pid uuid;
  r jsonb;
BEGIN
  v_pid := COALESCE(p_partner_id, public.get_user_partner_id());
  IF v_pid IS NULL THEN RAISE EXCEPTION 'no partner'; END IF;
  IF NOT (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'gestor_comercial')
    OR (public.has_role(auth.uid(),'parceiro_b2b') AND public.get_user_partner_id() = v_pid)
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'em_andamento', COUNT(*) FILTER (WHERE status IN ('aprovado','em_producao','produzido','aguardando_entrega','em_separacao','enviado')),
    'entregues', COUNT(*) FILTER (WHERE status IN ('entregue','faturado')),
    'aguardando_aprovacao', COUNT(*) FILTER (WHERE status IN ('solicitado','em_analise_comercial','aguardando_aprovacao_credito')),
    'aguardando_ajuste', COUNT(*) FILTER (WHERE status::text='aguardando_ajuste_comercial'),
    'favoritos_count', (SELECT COUNT(*) FROM public.partner_order_templates t WHERE t.partner_id = v_pid AND t.favorito),
    'ultimas_mensagens', COALESCE((
      SELECT jsonb_agg(row_to_json(m)) FROM (
        SELECT pm.id, pm.order_id, pm.autor_tipo, pm.mensagem, pm.created_at
        FROM public.partner_order_messages pm
        JOIN public.partner_orders po ON po.id = pm.order_id
        WHERE po.partner_id = v_pid
        ORDER BY pm.created_at DESC
        LIMIT 5
      ) m
    ), '[]'::jsonb)
  ) INTO r
  FROM public.partner_orders
  WHERE partner_id = v_pid;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_commercial_alerts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'pedidos_aguardando_aprovacao', (
      SELECT COUNT(*) FROM public.partner_orders WHERE status IN ('solicitado','em_analise_comercial')
    ),
    'pedidos_aguardando_ajuste', (
      SELECT COUNT(*) FROM public.partner_orders WHERE status::text='aguardando_ajuste_comercial'
    ),
    'campanhas_vencendo', (
      SELECT COALESCE(jsonb_agg(row_to_json(c)),'[]'::jsonb) FROM (
        SELECT id, nome, data_fim FROM public.commercial_campaigns
        WHERE ativa AND data_fim BETWEEN now()::date AND (now()::date + 15)
      ) c
    ),
    'tabelas_vencendo', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) FROM (
        SELECT partner_id, product_id, price_table_name, valid_until FROM public.partner_product_prices
        WHERE is_current AND valid_until IS NOT NULL AND valid_until BETWEEN now()::date AND (now()::date + 15)
      ) t
    ),
    'parceiros_sem_compras_60d', (
      SELECT COALESCE(jsonb_agg(row_to_json(p)),'[]'::jsonb) FROM (
        SELECT pa.id, pa.razao_social,
               (SELECT MAX(created_at) FROM public.partner_orders WHERE partner_id = pa.id) AS ultima_compra
        FROM public.partner_accounts pa
        WHERE pa.ativo AND NOT EXISTS (
          SELECT 1 FROM public.partner_orders WHERE partner_id = pa.id AND created_at > (now() - interval '60 days')
        )
      ) p
    )
  ) INTO r;
  RETURN r;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_commercial_kpis(date,date,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_partner_commercial_history(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_commercial_simulator(uuid,uuid,numeric,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_partner_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_commercial_alerts() TO authenticated;
