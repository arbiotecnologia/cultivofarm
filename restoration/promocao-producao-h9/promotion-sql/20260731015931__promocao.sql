-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É UMA MIGRATION HISTÓRICA
-- Origem: supabase/migrations/20260731015931_d970d467-904a-45df-bf56-1852d1973aea.sql
-- SHA-256 da origem: 7623957e737f047d56afe58e6b607182ef376f10b19eae37e336949fbff8454a
-- Gerado por: restoration/promocao-producao-h9/gerar-promotion-sql.py (determinístico)
-- Transformação aplicada: literal de ref homologacao -> producao
-- O arquivo de origem NÃO foi alterado.
--
-- Guarda canônica: o runner valida o ref do alvo por canal externo e só então
-- executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela marcadora
-- de homologação é consultada.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- ============================================================
-- FASE C — Gate fiscal, política parametrizável e vínculos
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker
                 WHERE marker='STAGING' AND project_ref='navfzbwgwzruipouyfnk') THEN
    RAISE EXCEPTION 'ABORT: marcador STAGING ausente';
  END IF;
END$$;

-- ---------- 1) Política fiscal parametrizável ----------
CREATE TABLE IF NOT EXISTS public.fiscal_operation_policies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_channel     text NOT NULL CHECK (sales_channel IN ('b2b_partner','direct_producer','internal')),
  operation_type    text NOT NULL,
  uf                text,
  requires_invoice  boolean NOT NULL,
  document_model    text,
  legal_basis       text,
  notes             text,
  active            boolean NOT NULL DEFAULT true,
  valid_from        date NOT NULL DEFAULT CURRENT_DATE,
  valid_until       date,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fop_validity_ck CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS fop_active_uq
  ON public.fiscal_operation_policies (sales_channel, operation_type, COALESCE(uf,'*'), valid_from)
  WHERE active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_operation_policies TO authenticated;
GRANT ALL ON public.fiscal_operation_policies TO service_role;
ALTER TABLE public.fiscal_operation_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fop_admin_manage ON public.fiscal_operation_policies;
CREATE POLICY fop_admin_manage ON public.fiscal_operation_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'));
REVOKE ALL ON public.fiscal_operation_policies FROM anon;

-- ---------- 2) Isenções explícitas ----------
CREATE TABLE IF NOT EXISTS public.fiscal_requirement_exemptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type        text NOT NULL CHECK (scope_type IN ('partner_order','receivable','partner','customer')),
  scope_id          uuid NOT NULL,
  motivo            text NOT NULL CHECK (length(btrim(motivo)) > 0),
  legal_basis       text,
  approved_by       uuid NOT NULL,
  approved_role     text NOT NULL,
  approved_at       timestamptz NOT NULL DEFAULT now(),
  revoked_by        uuid,
  revoked_at        timestamptz,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fre_active_uq
  ON public.fiscal_requirement_exemptions (scope_type, scope_id) WHERE active;

GRANT SELECT, INSERT, UPDATE ON public.fiscal_requirement_exemptions TO authenticated;
GRANT ALL ON public.fiscal_requirement_exemptions TO service_role;
ALTER TABLE public.fiscal_requirement_exemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fre_admin_manage ON public.fiscal_requirement_exemptions;
CREATE POLICY fre_admin_manage ON public.fiscal_requirement_exemptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'));
REVOKE ALL ON public.fiscal_requirement_exemptions FROM anon;

DROP TRIGGER IF EXISTS trg_fop_touch ON public.fiscal_operation_policies;
CREATE TRIGGER trg_fop_touch BEFORE UPDATE ON public.fiscal_operation_policies
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_conditions_touch();
DROP TRIGGER IF EXISTS trg_fre_touch ON public.fiscal_requirement_exemptions;
CREATE TRIGGER trg_fre_touch BEFORE UPDATE ON public.fiscal_requirement_exemptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_conditions_touch();

-- ---------- 3) Rastreabilidade da decisão fiscal no recebível ----------
ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS fiscal_requirement_source text,
  ADD COLUMN IF NOT EXISTS fiscal_policy_id uuid REFERENCES public.fiscal_operation_policies(id),
  ADD COLUMN IF NOT EXISTS fiscal_exemption_id uuid REFERENCES public.fiscal_requirement_exemptions(id);
COMMENT ON COLUMN public.accounts_receivable.fiscal_requirement_source IS
  'policy | exemption | pending_parametrization | legacy (histórico anterior à Fase C)';

-- ---------- 4) Vínculo da nota ao pedido/canal/devedor ----------
ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS partner_order_id uuid REFERENCES public.partner_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_channel text,
  ADD COLUMN IF NOT EXISTS debtor_type text,
  ADD COLUMN IF NOT EXISTS debtor_partner_id uuid REFERENCES public.partner_accounts(id),
  ADD COLUMN IF NOT EXISTS debtor_customer_id uuid REFERENCES public.clientes(id),
  ADD COLUMN IF NOT EXISTS billing_scope text;
COMMENT ON COLUMN public.fiscal_invoices.billing_scope IS 'total | parcial — faturamento parcial legítimo permite múltiplas notas por pedido';
CREATE INDEX IF NOT EXISTS fi_partner_order_ix ON public.fiscal_invoices (partner_order_id) WHERE partner_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fi_debtor_ix ON public.fiscal_invoices (debtor_type, debtor_partner_id, debtor_customer_id);
-- Idempotência de emissão: mesma chave nunca gera duas notas (não bloqueia notas parciais distintas)
CREATE UNIQUE INDEX IF NOT EXISTS fi_idempotency_uq
  ON public.fiscal_invoices (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ---------- 5) Itens fiscais: vínculo e snapshot congelado ----------
ALTER TABLE public.fiscal_invoice_items
  ADD COLUMN IF NOT EXISTS partner_order_item_id uuid REFERENCES public.partner_order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entrega_id uuid REFERENCES public.entregas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ncm_snapshot text,
  ADD COLUMN IF NOT EXISTS cest_snapshot text,
  ADD COLUMN IF NOT EXISTS cfop_snapshot text,
  ADD COLUMN IF NOT EXISTS cst_icms_snapshot text,
  ADD COLUMN IF NOT EXISTS csosn_snapshot text,
  ADD COLUMN IF NOT EXISTS origem_snapshot text,
  ADD COLUMN IF NOT EXISTS freight_apportionment_value numeric;
CREATE INDEX IF NOT EXISTS fii_order_item_ix ON public.fiscal_invoice_items (partner_order_item_id);
CREATE INDEX IF NOT EXISTS fii_entrega_ix ON public.fiscal_invoice_items (entrega_id);

-- ---------- 6) Derivação da obrigação fiscal (fail-closed) ----------
CREATE OR REPLACE FUNCTION public.fn_fiscal_requirement_resolve(
  p_sales_channel text, p_operation_type text, p_uf text,
  p_scope_type text DEFAULT NULL, p_scope_id uuid DEFAULT NULL, p_ref_date date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ex record; v_pol record;
BEGIN
  IF p_scope_type IS NOT NULL AND p_scope_id IS NOT NULL THEN
    SELECT * INTO v_ex FROM public.fiscal_requirement_exemptions
     WHERE active AND scope_type = p_scope_type AND scope_id = p_scope_id LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('required', false, 'status','EXEMPT', 'source','exemption',
        'exemption_id', v_ex.id, 'motivo', v_ex.motivo, 'approved_by', v_ex.approved_by);
    END IF;
  END IF;

  SELECT * INTO v_pol FROM public.fiscal_operation_policies
   WHERE active AND sales_channel = p_sales_channel AND operation_type = p_operation_type
     AND (uf IS NULL OR uf = p_uf)
     AND valid_from <= p_ref_date AND (valid_until IS NULL OR valid_until >= p_ref_date)
   ORDER BY (uf IS NOT NULL) DESC, valid_from DESC LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('required', v_pol.requires_invoice,
      'status', CASE WHEN v_pol.requires_invoice THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
      'source','policy','policy_id', v_pol.id, 'document_model', v_pol.document_model);
  END IF;

  -- Fail-closed: nunca assume NOT_REQUIRED em silêncio
  RETURN jsonb_build_object('required', true, 'status','PENDING_PARAMETRIZATION',
    'source','pending_parametrization', 'policy_id', NULL,
    'motivo','Nenhuma política fiscal cadastrada para o canal/operação/UF — parametrização contábil pendente');
END $$;

-- ---------- 7) Gate de elegibilidade de faturamento B2B ----------
CREATE OR REPLACE FUNCTION public.fn_b2b_order_billing_eligibility(p_partner_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order record; v_terms record; v_quote int; v_noprice int;
BEGIN
  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_partner_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_NOT_FOUND'); END IF;

  IF v_order.status IN ('cancelado','reprovado','reprovado_sem_itens') THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_CANCELED_OR_REJECTED','status',v_order.status);
  END IF;
  IF v_order.status IN ('rascunho','pendente','solicitado','em_analise_comercial',
                        'aguardando_aprovacao_credito','aguardando_ajuste_comercial',
                        'aguardando_itens','aguardando_cotacao') THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_NOT_APPROVED','status',v_order.status);
  END IF;
  IF COALESCE(v_order.financial_approval_status,'not_required') = 'pending' THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','FINANCIAL_APPROVAL_PENDING');
  END IF;
  IF COALESCE(v_order.financial_approval_status,'not_required') = 'rejected' THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','FINANCIAL_APPROVAL_REJECTED');
  END IF;

  SELECT count(*) FILTER (WHERE COALESCE(pricing_mode_snapshot,'') = 'quote_only'),
         count(*) FILTER (WHERE COALESCE(preco_unitario_final_snapshot, preco_unitario, 0) <= 0)
    INTO v_quote, v_noprice
    FROM public.partner_order_items WHERE order_id = p_partner_order_id;
  IF COALESCE(v_quote,0) > 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','QUOTE_ONLY_ITEMS','count',v_quote);
  END IF;
  IF COALESCE(v_noprice,0) > 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ITEM_WITHOUT_FINAL_PRICE','count',v_noprice);
  END IF;

  SELECT * INTO v_terms FROM public.partner_order_payment_terms
   WHERE partner_order_id = p_partner_order_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_NOT_DEFINED'); END IF;
  IF COALESCE(v_terms.final_amount,0) <= 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','NO_FINAL_AMOUNT');
  END IF;

  RETURN jsonb_build_object('eligible',true,'reason_code','OK',
    'final_amount',v_terms.final_amount,'payment_terms_id',v_terms.id);
END $$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname IN
              ('fn_fiscal_requirement_resolve','fn_b2b_order_billing_eligibility')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END$$;
