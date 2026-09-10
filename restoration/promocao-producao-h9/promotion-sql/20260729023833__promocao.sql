-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260729023833_96d32366-672c-4efa-a43f-0b3a39965deb.sql
-- SHA-256 orig: 41e707ebe971028faac8ab92327297c50a7bcd944780cfc659fb27c9b6bcfd03
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-sql.py
-- Transformação: 1 bloco(s) DO de guarda removido(s); guarda canônica de promoção prefixada
--
-- A guarda de homologação foi REMOVIDA e substituída pela guarda canônica de
-- promoção. O runner valida o ref do alvo por canal externo (API/DSN) e só
-- então executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela
-- marcadora de homologação é consultada em produção.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- STAGING_GUARD normalizado (portatil / forward-only):
-- recusa apenas ambiente comprovadamente de PRODUCAO. Em banco novo (marker ausente)
-- a migration segue adiante, tornando o replay reprodutivel fora deste projeto.
-- [guarda de homologação removida pelo gerador de promoção]


CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure_impl(p_partner_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_partner record;
  v_settings record;
  v_terms record;
  v_receivable_id uuid;
  v_category_id uuid;
  v_payment_method_id uuid;
  v_existing uuid;
  v_sch record;
  v_ari_id uuid;
  v_installments_json jsonb := '[]'::jsonb;
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

  SELECT * INTO v_terms FROM public.partner_order_payment_terms
    WHERE partner_order_id = p_partner_order_id
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_terms_not_defined'; END IF;

  IF COALESCE(v_order.financial_approval_status,'not_required') = 'pending' THEN
    RAISE EXCEPTION 'financial_approval_pending';
  END IF;
  IF COALESCE(v_order.financial_approval_status,'not_required') = 'rejected' THEN
    RAISE EXCEPTION 'financial_approval_rejected';
  END IF;

  IF COALESCE(v_terms.final_amount,0) <= 0 THEN
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
   WHERE lower(name) = lower(COALESCE(v_settings.default_payment_method,'pix')) LIMIT 1;

  INSERT INTO public.accounts_receivable(
    origin_type, origin_id, customer_id, partner_id, description,
    category_id, total_amount, issue_date, first_due_date, installment_count,
    status, fiscal_invoice_required, fiscal_invoice_status, payment_method_id,
    notes, created_by
  ) VALUES (
    'B2B_ORDER', p_partner_order_id,
    NULLIF(v_partner.client_id, NULL), v_order.partner_id,
    format('Pedido B2B %s - %s', v_order.numero, COALESCE(v_partner.nome_fantasia, v_partner.razao_social)),
    v_category_id, v_terms.final_amount, CURRENT_DATE, v_terms.first_due_date, v_terms.installment_count,
    'OPEN', false, 'NOT_REQUIRED', v_payment_method_id,
    format(E'Condição: %s (%s)\nDesconto: %s%%  Juros: %s%% a.m. x %s meses\nTabela: %s  Líquido: %s  Final: %s',
           v_terms.plan_name_snapshot, v_terms.plan_code_snapshot,
           v_terms.discount_percent_snapshot, v_terms.monthly_interest_percent_snapshot, v_terms.months_count_snapshot,
           v_terms.table_amount, v_terms.net_amount_after_discount, v_terms.final_amount),
    COALESCE(v_uid, v_order.created_by)
  ) RETURNING id INTO v_receivable_id;

  DELETE FROM public.accounts_receivable_installments WHERE receivable_id = v_receivable_id;

  FOR v_sch IN
    SELECT * FROM public.partner_order_payment_schedule
     WHERE partner_order_id = p_partner_order_id AND payment_terms_id = v_terms.id
     ORDER BY installment_number
  LOOP
    INSERT INTO public.accounts_receivable_installments(
      receivable_id, installment_number, due_date,
      original_amount, interest_amount, net_amount, status
    ) VALUES (
      v_receivable_id, v_sch.installment_number, v_sch.due_date,
      v_sch.amount, COALESCE(v_sch.interest_amount, 0), v_sch.amount, 'OPEN'
    ) RETURNING id INTO v_ari_id;

    UPDATE public.partner_order_payment_schedule
       SET status = 'generated', receivable_installment_id = v_ari_id
     WHERE id = v_sch.id;

    v_installments_json := v_installments_json || jsonb_build_array(jsonb_build_object(
      'installment_number', v_sch.installment_number,
      'due_date', v_sch.due_date,
      'amount', v_sch.amount
    ));
  END LOOP;

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
    payment_due_date = v_terms.first_due_date,
    payment_method = COALESCE(v_settings.default_payment_method,'pix')
  WHERE id = p_partner_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (p_partner_order_id, v_order.partner_id, v_uid, 'financeiro_gerado_com_plano',
    jsonb_build_object(
      'receivable_id', v_receivable_id,
      'plan_code', v_terms.plan_code_snapshot,
      'plan_name', v_terms.plan_name_snapshot,
      'table_amount', v_terms.table_amount,
      'discount_amount', v_terms.discount_amount,
      'net_amount', v_terms.net_amount_after_discount,
      'interest_amount', v_terms.financial_interest_amount,
      'final_amount', v_terms.final_amount,
      'first_due_date', v_terms.first_due_date,
      'installment_count', v_terms.installment_count,
      'installments', v_installments_json
    ));

  RETURN jsonb_build_object(
    'receivable_id', v_receivable_id,
    'partner_order_id', p_partner_order_id,
    'valor', v_terms.final_amount,
    'vencimento', v_terms.first_due_date,
    'installment_count', v_terms.installment_count,
    'status', 'OPEN'
  );
END $function$;

REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) TO service_role;

-- Aprovacao comercial nao libera cotacao nem pedido sem preco
CREATE OR REPLACE FUNCTION public.approve_partner_order(
  p_order_id uuid, p_approval_notes text DEFAULT NULL, p_estimated_delivery_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid; v_prev partner_order_status; v_partner_user uuid; v_numero text;
  v_final_status partner_order_status; v_final_ready boolean; v_block text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT partner_id, status, numero INTO v_pid, v_prev, v_numero
    FROM public.partner_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF v_prev = 'aguardando_cotacao' THEN
    RAISE EXCEPTION 'quote_required: defina o preco da cotacao antes de aprovar';
  END IF;
  IF NOT public.fn_b2b_order_priceable(p_order_id) THEN
    RAISE EXCEPTION 'order_not_priceable_quote_required';
  END IF;

  IF v_prev IN ('aprovado','reprovado','cancelado') THEN
    RAISE EXCEPTION 'already_processed: pedido já está em status %', v_prev;
  END IF;

  IF v_prev = 'aguardando_aprovacao_credito' THEN
    RAISE EXCEPTION 'credit_pending: aprove o crédito antes da análise comercial';
  END IF;

  IF v_prev NOT IN ('em_analise_comercial','solicitado','rascunho') THEN
    RAISE EXCEPTION 'invalid_status_transition: %', v_prev;
  END IF;

  UPDATE public.partner_orders
     SET status = 'aprovado', approved_by = v_uid, approved_at = now(),
         approval_notes = NULLIF(p_approval_notes,''),
         estimated_delivery_date = COALESCE(p_estimated_delivery_date, estimated_delivery_date),
         ready_for_production = true, updated_at = now()
   WHERE id = p_order_id AND status = v_prev;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_update: status do pedido mudou durante a aprovação';
  END IF;

  SELECT status, ready_for_production, credit_block_reason
    INTO v_final_status, v_final_ready, v_block
    FROM public.partner_orders WHERE id = p_order_id;

  IF v_final_status <> 'aprovado' OR v_final_ready IS NOT TRUE THEN
    RAISE EXCEPTION 'credit_block: %', COALESCE(v_block, 'aprovacao_credito_pendente');
  END IF;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'approved',
          jsonb_build_object('status', v_prev),
          jsonb_build_object('status','aprovado','approval_notes',p_approval_notes,'estimated_delivery_date',p_estimated_delivery_date));

  FOR v_partner_user IN SELECT user_id FROM public.partner_users WHERE partner_id = v_pid LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user, 'pedido_b2b_aprovado',
            'Pedido ' || v_numero || ' aprovado',
            'Seu pedido foi aprovado e seguirá para planejamento de produção.',
            '/portal-parceiro/pedidos');
  END LOOP;
END $function$;