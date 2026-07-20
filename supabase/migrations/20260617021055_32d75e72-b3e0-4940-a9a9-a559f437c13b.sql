
-- ============================================================
-- FASE 5 — FINANCEIRO B2B
-- ============================================================

-- 1.1 partner_financial_settings
CREATE TABLE IF NOT EXISTS public.partner_financial_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL UNIQUE REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  billing_trigger text NOT NULL DEFAULT 'na_entrega' CHECK (billing_trigger IN ('na_aprovacao','na_producao_finalizada','na_entrega','manual')),
  payment_terms_days integer NOT NULL DEFAULT 7 CHECK (payment_terms_days >= 0),
  default_payment_method text DEFAULT 'pix' CHECK (default_payment_method IN ('pix','boleto','transferencia','dinheiro','cartao','prazo')),
  credit_limit numeric(14,2),
  block_if_overdue boolean NOT NULL DEFAULT false,
  auto_generate_receivable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pfs_partner ON public.partner_financial_settings(partner_id);
CREATE INDEX IF NOT EXISTS idx_pfs_trigger ON public.partner_financial_settings(billing_trigger) WHERE active;

GRANT SELECT, INSERT, UPDATE ON public.partner_financial_settings TO authenticated;
GRANT ALL ON public.partner_financial_settings TO service_role;
ALTER TABLE public.partner_financial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pfs_admin_fin_select" ON public.partner_financial_settings FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'gestor') OR has_role(auth.uid(),'gestor_comercial'));
CREATE POLICY "pfs_admin_fin_insert" ON public.partner_financial_settings FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'gestor') OR has_role(auth.uid(),'gestor_comercial'));
CREATE POLICY "pfs_admin_fin_update" ON public.partner_financial_settings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'gestor') OR has_role(auth.uid(),'gestor_comercial'));

CREATE OR REPLACE FUNCTION public.tg_pfs_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_pfs_updated_at ON public.partner_financial_settings;
CREATE TRIGGER trg_pfs_updated_at BEFORE UPDATE ON public.partner_financial_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_pfs_updated_at();

-- default row per partner
CREATE OR REPLACE FUNCTION public.tg_create_default_pfs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.partner_financial_settings(partner_id) VALUES (NEW.id)
  ON CONFLICT (partner_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_create_default_pfs ON public.partner_accounts;
CREATE TRIGGER trg_create_default_pfs AFTER INSERT ON public.partner_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_create_default_pfs();

-- backfill
INSERT INTO public.partner_financial_settings(partner_id)
SELECT id FROM public.partner_accounts
ON CONFLICT (partner_id) DO NOTHING;

-- 1.2 partner_orders columns
ALTER TABLE public.partner_orders
  ADD COLUMN IF NOT EXISTS financial_status text NOT NULL DEFAULT 'pendente'
    CHECK (financial_status IN ('pendente','gerado','parcial','recebido','vencido','cancelado')),
  ADD COLUMN IF NOT EXISTS receivable_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receivable_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS receivable_generated_by uuid,
  ADD COLUMN IF NOT EXISTS payment_due_date date,
  ADD COLUMN IF NOT EXISTS payment_method text;

-- 1.4 accounts_receivable extensions
ALTER TABLE public.accounts_receivable ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partner_accounts(id),
  ADD COLUMN IF NOT EXISTS external_payment_id text,
  ADD COLUMN IF NOT EXISTS payment_gateway text,
  ADD COLUMN IF NOT EXISTS pix_qr_code text,
  ADD COLUMN IF NOT EXISTS pix_copia_cola text,
  ADD COLUMN IF NOT EXISTS boleto_url text;

DO $$ BEGIN
  ALTER TABLE public.accounts_receivable
    ADD CONSTRAINT ar_customer_or_partner CHECK (customer_id IS NOT NULL OR partner_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_ar_partner_b2b ON public.accounts_receivable(partner_id) WHERE origin_type='B2B_ORDER';

-- partner can SELECT only own B2B receivables
CREATE POLICY "ar_partner_select_own_b2b" ON public.accounts_receivable FOR SELECT TO authenticated
  USING (
    origin_type = 'B2B_ORDER' AND partner_id IN (
      SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
    )
  );

-- 1.3 partner_order_financial_links
CREATE TABLE IF NOT EXISTS public.partner_order_financial_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_order_id uuid NOT NULL UNIQUE REFERENCES public.partner_orders(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id),
  receivable_id uuid NOT NULL REFERENCES public.accounts_receivable(id) ON DELETE RESTRICT,
  financial_status text NOT NULL DEFAULT 'gerado',
  billing_trigger text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pofl_partner ON public.partner_order_financial_links(partner_id);
CREATE INDEX IF NOT EXISTS idx_pofl_receivable ON public.partner_order_financial_links(receivable_id);

GRANT SELECT, INSERT, UPDATE ON public.partner_order_financial_links TO authenticated;
GRANT ALL ON public.partner_order_financial_links TO service_role;
ALTER TABLE public.partner_order_financial_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pofl_admin_fin_all" ON public.partner_order_financial_links FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'gestor') OR has_role(auth.uid(),'gestor_comercial'))
  WITH CHECK (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'gestor') OR has_role(auth.uid(),'gestor_comercial'));

CREATE POLICY "pofl_partner_select_own" ON public.partner_order_financial_links FOR SELECT TO authenticated
  USING (partner_id IN (SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_pofl_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_pofl_updated_at ON public.partner_order_financial_links;
CREATE TRIGGER trg_pofl_updated_at BEFORE UPDATE ON public.partner_order_financial_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_pofl_updated_at();

-- block deletes
CREATE OR REPLACE FUNCTION public.tg_block_pofl_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Vínculo financeiro não pode ser excluído'; END $$;
DROP TRIGGER IF EXISTS trg_block_pofl_delete ON public.partner_order_financial_links;
CREATE TRIGGER trg_block_pofl_delete BEFORE DELETE ON public.partner_order_financial_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_pofl_delete();

-- 2.1 generate_b2b_receivable_secure
CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure(p_partner_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_partner record;
  v_settings record;
  v_due date;
  v_receivable_id uuid;
  v_category_id uuid;
  v_payment_method_id uuid;
  v_existing uuid;
  v_system_call boolean := (v_uid IS NULL);
BEGIN
  -- permission (skip when called by system trigger with no auth context)
  IF NOT v_system_call THEN
    IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'financeiro') OR has_role(v_uid,'gestor') OR has_role(v_uid,'gestor_comercial')) THEN
      INSERT INTO public.partner_order_audit_logs(order_id, usuario_id, acao, dados_novos)
        VALUES (p_partner_order_id, v_uid, 'financeiro_permissao_negada', jsonb_build_object('motivo','sem permissão'));
      RAISE EXCEPTION 'Sem permissão para gerar cobrança B2B';
    END IF;
  END IF;

  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_partner_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  IF v_order.status IN ('cancelado','reprovado') THEN
    RAISE EXCEPTION 'Pedido % não pode gerar cobrança (status=%)', v_order.numero, v_order.status;
  END IF;
  IF COALESCE(v_order.total,0) <= 0 THEN
    RAISE EXCEPTION 'Pedido sem valor para cobrança';
  END IF;

  SELECT receivable_id INTO v_existing FROM public.partner_order_financial_links WHERE partner_order_id = p_partner_order_id;
  IF v_existing IS NOT NULL THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
      VALUES (p_partner_order_id, v_order.partner_id, v_uid, 'financeiro_duplicidade_bloqueada', jsonb_build_object('receivable_id', v_existing));
    RETURN jsonb_build_object('receivable_id', v_existing, 'partner_order_id', p_partner_order_id, 'duplicado', true);
  END IF;

  SELECT * INTO v_partner FROM public.partner_accounts WHERE id = v_order.partner_id;
  SELECT * INTO v_settings FROM public.partner_financial_settings WHERE partner_id = v_order.partner_id;
  IF NOT FOUND THEN
    INSERT INTO public.partner_financial_settings(partner_id) VALUES (v_order.partner_id) RETURNING * INTO v_settings;
  END IF;

  v_due := CURRENT_DATE + COALESCE(v_settings.payment_terms_days, 7);

  -- pick a default revenue category (first non-deleted)
  SELECT id INTO v_category_id FROM public.financial_categories
   WHERE COALESCE(type,'INCOME')='INCOME' AND COALESCE(active,true) = true
   ORDER BY created_at ASC LIMIT 1;
  IF v_category_id IS NULL THEN
    SELECT id INTO v_category_id FROM public.financial_categories ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma categoria financeira cadastrada — cadastre uma categoria de receita antes de gerar cobranças B2B';
  END IF;

  -- map payment method
  SELECT id INTO v_payment_method_id FROM public.payment_methods
   WHERE lower(name) = lower(COALESCE(v_settings.default_payment_method,'pix'))
   LIMIT 1;

  INSERT INTO public.accounts_receivable(
    origin_type, origin_id, customer_id, partner_id, description,
    category_id, total_amount, issue_date, first_due_date, installment_count,
    status, fiscal_invoice_required, fiscal_invoice_status, payment_method_id,
    created_by
  ) VALUES (
    'B2B_ORDER', p_partner_order_id,
    NULLIF(v_partner.client_id, NULL), v_order.partner_id,
    format('Pedido B2B %s - %s', v_order.numero, COALESCE(v_partner.nome_fantasia, v_partner.razao_social)),
    v_category_id, v_order.total, CURRENT_DATE, v_due, 1,
    'OPEN', false, 'NOT_REQUIRED', v_payment_method_id,
    COALESCE(v_uid, v_order.created_by)
  ) RETURNING id INTO v_receivable_id;

  -- ensure a parcela exists (fallback if no trigger handles it)
  IF NOT EXISTS (SELECT 1 FROM public.accounts_receivable_installments WHERE receivable_id = v_receivable_id) THEN
    INSERT INTO public.accounts_receivable_installments(
      receivable_id, installment_number, due_date, original_amount, status
    ) VALUES (v_receivable_id, 1, v_due, v_order.total, 'OPEN');
  END IF;

  INSERT INTO public.partner_order_financial_links(
    partner_order_id, partner_id, receivable_id, financial_status, billing_trigger, created_by
  ) VALUES (
    p_partner_order_id, v_order.partner_id, v_receivable_id, 'gerado', v_settings.billing_trigger, v_uid
  );

  UPDATE public.partner_orders SET
    financial_status = 'gerado',
    receivable_generated = true,
    receivable_generated_at = now(),
    receivable_generated_by = v_uid,
    payment_due_date = v_due,
    payment_method = COALESCE(v_settings.default_payment_method,'pix')
  WHERE id = p_partner_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (p_partner_order_id, v_order.partner_id, v_uid, 'financeiro_gerado',
    jsonb_build_object('receivable_id', v_receivable_id, 'valor', v_order.total, 'vencimento', v_due));

  RETURN jsonb_build_object(
    'receivable_id', v_receivable_id,
    'partner_order_id', p_partner_order_id,
    'valor', v_order.total,
    'vencimento', v_due,
    'status', 'OPEN'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) TO authenticated;

-- 2.2 cancel_b2b_receivable_secure
CREATE OR REPLACE FUNCTION public.cancel_b2b_receivable_secure(p_partner_order_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_link record;
  v_paid numeric;
BEGIN
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'financeiro')) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar cobrança B2B';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Informe motivo (mín. 5 caracteres)';
  END IF;

  SELECT * INTO v_link FROM public.partner_order_financial_links WHERE partner_order_id = p_partner_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sem cobrança vinculada'; END IF;

  SELECT COALESCE(SUM(received_amount),0) INTO v_paid
    FROM public.accounts_receivable_installments WHERE receivable_id = v_link.receivable_id;
  IF v_paid > 0 THEN RAISE EXCEPTION 'Cobrança possui pagamentos — não pode ser cancelada'; END IF;

  UPDATE public.accounts_receivable SET status='CANCELED', notes = COALESCE(notes,'') || E'\nCancelado B2B: ' || p_motivo
   WHERE id = v_link.receivable_id;
  UPDATE public.accounts_receivable_installments SET status='CANCELED'
   WHERE receivable_id = v_link.receivable_id AND status NOT IN ('PAID','CANCELED');

  UPDATE public.partner_order_financial_links SET financial_status='cancelado' WHERE id = v_link.id;
  UPDATE public.partner_orders SET financial_status='cancelado' WHERE id = p_partner_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (p_partner_order_id, v_link.partner_id, v_uid, 'financeiro_cancelado',
    jsonb_build_object('receivable_id', v_link.receivable_id, 'motivo', p_motivo));

  RETURN jsonb_build_object('ok', true, 'receivable_id', v_link.receivable_id);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_b2b_receivable_secure(uuid, text) TO authenticated;

-- Sync trigger: AR status -> partner_orders.financial_status
CREATE OR REPLACE FUNCTION public.tg_sync_b2b_financial_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link record;
  v_new text;
BEGIN
  SELECT * INTO v_link FROM public.partner_order_financial_links WHERE receivable_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_new := CASE NEW.status
    WHEN 'PAID' THEN 'recebido'
    WHEN 'PARTIAL' THEN 'parcial'
    WHEN 'OVERDUE' THEN 'vencido'
    WHEN 'CANCELED' THEN 'cancelado'
    ELSE 'gerado'
  END;

  UPDATE public.partner_orders SET financial_status = v_new WHERE id = v_link.partner_order_id;
  UPDATE public.partner_order_financial_links SET financial_status = v_new WHERE id = v_link.id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, acao, dados_novos)
  VALUES (v_link.partner_order_id, v_link.partner_id, 'financeiro_status_alterado',
    jsonb_build_object('ar_status', NEW.status, 'novo', v_new));

  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_b2b_financial_status ON public.accounts_receivable;
CREATE TRIGGER trg_sync_b2b_financial_status AFTER UPDATE OF status ON public.accounts_receivable
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.tg_sync_b2b_financial_status();

-- Auto-generate trigger on partner_orders status changes
CREATE OR REPLACE FUNCTION public.tg_auto_b2b_receivable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings record;
  v_should boolean := false;
BEGIN
  SELECT * INTO v_settings FROM public.partner_financial_settings WHERE partner_id = NEW.partner_id AND active = true;
  IF NOT FOUND OR NOT v_settings.auto_generate_receivable THEN RETURN NEW; END IF;
  IF NEW.receivable_generated THEN RETURN NEW; END IF;

  IF v_settings.billing_trigger = 'na_aprovacao' AND NEW.status = 'aprovado' AND OLD.status IS DISTINCT FROM 'aprovado' THEN
    v_should := true;
  ELSIF v_settings.billing_trigger = 'na_entrega' AND NEW.status = 'entregue' AND OLD.status IS DISTINCT FROM 'entregue' THEN
    v_should := true;
  ELSIF v_settings.billing_trigger = 'na_producao_finalizada' AND NEW.status IN ('produzido','pronto','finalizado_producao') AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_should := true;
  END IF;

  IF v_should THEN
    BEGIN
      PERFORM public.generate_b2b_receivable_secure(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, acao, dados_novos)
      VALUES (NEW.id, NEW.partner_id, 'financeiro_auto_falhou', jsonb_build_object('erro', SQLERRM));
    END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_auto_b2b_receivable ON public.partner_orders;
CREATE TRIGGER trg_auto_b2b_receivable AFTER UPDATE OF status ON public.partner_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_auto_b2b_receivable();

-- 2.3 KPIs dashboard
CREATE OR REPLACE FUNCTION public.rpc_b2b_financial_kpis(p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_partner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_from date := COALESCE(p_from, date_trunc('month', CURRENT_DATE)::date);
  v_to date := COALESCE(p_to, CURRENT_DATE);
  v_result jsonb;
BEGIN
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'financeiro') OR has_role(v_uid,'gestor') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  WITH ar AS (
    SELECT a.*, i.due_date, i.original_amount, i.received_amount, i.status AS inst_status
    FROM public.accounts_receivable a
    JOIN public.accounts_receivable_installments i ON i.receivable_id = a.id
    WHERE a.origin_type='B2B_ORDER'
      AND a.created_at::date BETWEEN v_from AND v_to
      AND (p_partner_id IS NULL OR a.partner_id = p_partner_id)
  )
  SELECT jsonb_build_object(
    'total_a_receber', COALESCE(SUM(CASE WHEN inst_status IN ('OPEN','PARTIAL','OVERDUE') THEN original_amount - COALESCE(received_amount,0) END),0),
    'total_recebido', COALESCE(SUM(received_amount),0),
    'total_vencido', COALESCE(SUM(CASE WHEN inst_status='OVERDUE' OR (inst_status IN ('OPEN','PARTIAL') AND due_date < CURRENT_DATE) THEN original_amount - COALESCE(received_amount,0) END),0),
    'total_em_aberto', COALESCE(SUM(CASE WHEN inst_status IN ('OPEN','PARTIAL') THEN original_amount - COALESCE(received_amount,0) END),0),
    'ticket_medio', COALESCE(AVG(total_amount),0),
    'vencendo_7d', COALESCE(SUM(CASE WHEN inst_status IN ('OPEN','PARTIAL') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7 THEN original_amount - COALESCE(received_amount,0) END),0)
  ) INTO v_result FROM ar;

  v_result := v_result || jsonb_build_object(
    'pedidos_entregues_sem_cobranca', (
      SELECT COUNT(*) FROM public.partner_orders po
      WHERE po.status='entregue' AND po.receivable_generated=false
        AND (p_partner_id IS NULL OR po.partner_id = p_partner_id)
    ),
    'parceiros_inadimplentes', (
      SELECT COUNT(DISTINCT partner_id) FROM public.accounts_receivable a
      JOIN public.accounts_receivable_installments i ON i.receivable_id=a.id
      WHERE a.origin_type='B2B_ORDER' AND (i.status='OVERDUE' OR (i.status IN ('OPEN','PARTIAL') AND i.due_date < CURRENT_DATE))
    )
  );

  RETURN v_result;
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_financial_kpis(date, date, uuid) TO authenticated;

-- 2.4 Portal partner financial (SECURITY DEFINER, scoped to caller)
CREATE OR REPLACE FUNCTION public.rpc_portal_partner_financial()
RETURNS TABLE(
  partner_order_id uuid,
  numero text,
  receivable_id uuid,
  total numeric,
  vencimento date,
  financial_status text,
  payment_method text,
  ar_status text,
  installments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    po.id, po.numero, ar.id, po.total, po.payment_due_date, po.financial_status, po.payment_method, ar.status,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', i.installment_number, 'vencimento', i.due_date,
        'valor', i.original_amount, 'recebido', i.received_amount, 'status', i.status
      ) ORDER BY i.installment_number)
      FROM public.accounts_receivable_installments i WHERE i.receivable_id = ar.id
    ), '[]'::jsonb)
  FROM public.partner_orders po
  JOIN public.partner_order_financial_links l ON l.partner_order_id = po.id
  JOIN public.accounts_receivable ar ON ar.id = l.receivable_id
  WHERE po.partner_id IN (SELECT partner_id FROM public.partner_users WHERE user_id = v_uid)
  ORDER BY po.created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.rpc_portal_partner_financial() TO authenticated;
