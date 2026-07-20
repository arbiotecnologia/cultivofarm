
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

  SELECT id INTO v_category_id FROM public.financial_categories
   WHERE upper(COALESCE(type::text,'')) IN ('RECEITA','INCOME') AND COALESCE(active,true) = true
   ORDER BY created_at ASC LIMIT 1;
  IF v_category_id IS NULL THEN
    SELECT id INTO v_category_id FROM public.financial_categories ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma categoria financeira cadastrada — cadastre uma categoria de receita antes de gerar cobranças B2B';
  END IF;

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
