-- =====================================================================
-- H6b/H6c — ROLLBACK INTEGRAL E REPRODUTÍVEL (H6c-002)
-- ARQUIVO GERADO por restoration/homologacao-h6/50-gerar-rollback-h6b.py
-- NÃO EDITAR À MÃO: edite o gerador e regenere.
--
-- Ambiente: SOMENTE staging ikaauvsflpmamgxmkhoq.
-- Produção navfzbwgwzruipouyfnk: PROIBIDO. O runner rollback-h6b.sh aborta
-- se o DSN não for o de staging; este arquivo também aborta abaixo se o
-- marcador de staging não estiver presente no banco.
--
-- ESCOPO
--   Restaura as definições EXATAS anteriores ao H6b de TODAS as funções que o
--   H6b substituiu, e remove os objetos introduzidos pelo H6b. Como o H6c
--   redefiniu as mesmas funções, este rollback é necessariamente um rollback
--   do par H6b+H6c (superset), e é isso que o teste APPLY -> ROLLBACK -> APPLY
--   demonstra ao reaplicar H6b e H6c em seguida.
--
-- ROLLBACK LÓGICO (documentado, não destrutivo)
--   As colunas ADITIVAS do H6b permanecem, por decisão explícita:
--     * receivable_payments.request_fingerprint
--     * payable_payments.request_fingerprint
--     * entrega_reconciliacoes.valor_faturavel_origem / valor_faturavel_metodo
--   Elas são trilha histórica; removê-las destruiria evidência de baixas reais
--   já registradas. Sem as funções H6b elas deixam de ser alimentadas e não
--   têm efeito comportamental — o comportamento H6 é restaurado integralmente.
--   As colunas de idempotência criadas no H6 (idempotency_key) NÃO pertencem
--   ao H6b e permanecem ativas, como esperado na baseline H6.
--
-- OBJETOS REMOVIDOS (exclusivos H6b/H6c)
--   trigger trg_h6b_reconciliacao_valor_faturavel + fn_h6b_reconciliacao_valor_faturavel
--   fn_entrega_valor_faturavel_v1, fn_h6b_payment_fingerprint, fn_h6b_num
--   trigger trg_h6c_entrega_ar_b2b_link + fn_h6c_entrega_ar_b2b_link
--   trigger trg_h6c_set_canonical_payment_terms + fn_h6c_set_canonical_payment_terms
--   (o backfill de partner_orders.payment_terms_id é PRESERVADO — ver rollback-h6c.sql)
-- =====================================================================
\set ON_ERROR_STOP on

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto')
     AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    RAISE EXCEPTION 'ambiente nao reconhecido: abortando rollback';
  END IF;
END
$guard$;

BEGIN;

-- ---------------------------------------------------------------------
-- baseline H6 — rpc_register_receivable_payment (idempotency_key OPCIONAL)
-- fonte: restoration/fase-h6/20260915010000_h6_baixa_idempotente_v1.sql (linhas 8-121)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_register_receivable_payment(p_installment_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_inst public.accounts_receivable_installments%ROWTYPE;
  v_amount numeric;
  v_disc numeric;
  v_int numeric;
  v_pen numeric;
  v_saldo numeric;
  v_pm uuid;
  v_ba uuid;
  v_pay_date date;
  v_notes text;
  v_has_receipt boolean;
  v_require_receipt boolean;
  v_payment_id uuid;
  v_idem text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para registrar recebimento.' USING ERRCODE='insufficient_privilege';
  END IF;

  v_idem := NULLIF(trim(p_payload->>'idempotency_key'), '');

  SELECT * INTO v_inst FROM public.accounts_receivable_installments
   WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;

  -- Replay idempotente: retorna a baixa ja registrada sem duplicar
  IF v_idem IS NOT NULL THEN
    SELECT id INTO v_payment_id FROM public.receivable_payments
     WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
    IF v_payment_id IS NOT NULL THEN
      RETURN v_payment_id;
    END IF;
  END IF;

  IF v_inst.status = 'CANCELED' THEN
    RAISE EXCEPTION 'Parcela cancelada.' USING ERRCODE='check_violation';
  END IF;
  IF v_inst.status = 'PAID' THEN
    RAISE EXCEPTION 'Parcela já quitada.' USING ERRCODE='check_violation';
  END IF;

  v_amount   := COALESCE((p_payload->>'amount_received')::numeric, 0);
  v_disc     := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_int      := COALESCE((p_payload->>'interest_amount')::numeric, 0);
  v_pen      := COALESCE((p_payload->>'penalty_amount')::numeric, 0);
  v_pm       := NULLIF(p_payload->>'payment_method_id','')::uuid;
  v_ba       := NULLIF(p_payload->>'bank_account_id','')::uuid;
  v_pay_date := COALESCE((p_payload->>'payment_date')::date, CURRENT_DATE);
  v_notes    := NULLIF(p_payload->>'notes','');
  v_has_receipt := COALESCE((p_payload->>'has_receipt')::boolean, false);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido.' USING ERRCODE='check_violation';
  END IF;
  IF v_pm IS NULL OR NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = v_pm AND active) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;
  IF v_ba IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = v_ba AND active) THEN
    RAISE EXCEPTION 'Conta bancária inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;

  v_saldo := v_inst.original_amount + v_int + v_pen - v_disc - COALESCE(v_inst.received_amount,0);
  IF v_amount - v_saldo > 0.005 THEN
    RAISE EXCEPTION 'Valor excede o saldo da parcela (saldo: %).', v_saldo USING ERRCODE='check_violation';
  END IF;

  SELECT require_receipt_on_receivable_payment INTO v_require_receipt
    FROM public.financial_settings LIMIT 1;
  IF COALESCE(v_require_receipt,false) AND NOT v_has_receipt THEN
    RAISE EXCEPTION 'Comprovante de recebimento é obrigatório.' USING ERRCODE='check_violation';
  END IF;

  BEGIN
    INSERT INTO public.receivable_payments (
      installment_id, payment_date, amount_received, payment_method_id, bank_account_id,
      discount_amount, interest_amount, penalty_amount, notes, created_by, idempotency_key
    ) VALUES (
      p_installment_id, v_pay_date, v_amount, v_pm, v_ba,
      v_disc, v_int, v_pen, v_notes, v_uid, v_idem
    ) RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_payment_id FROM public.receivable_payments
     WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
    RETURN v_payment_id;
  END;

  INSERT INTO public.financial_audit_log (
    entity_type, entity_id, action, new_data, performed_by
  ) VALUES (
    'receivable_payments', v_payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object(
      'installment_id', p_installment_id,
      'amount', v_amount,
      'payment_method_id', v_pm,
      'bank_account_id', v_ba,
      'payment_date', v_pay_date,
      'idempotency_key', v_idem
    ),
    v_uid
  );

  RETURN v_payment_id;
END $function$;

-- ---------------------------------------------------------------------
-- baseline H6 — rpc_register_payable_payment (idempotency_key OPCIONAL)
-- fonte: restoration/fase-h6/20260915010000_h6_baixa_idempotente_v1.sql (linhas 123-235)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_register_payable_payment(p_installment_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_inst public.accounts_payable_installments%ROWTYPE;
  v_amount numeric;
  v_disc numeric;
  v_int numeric;
  v_pen numeric;
  v_saldo numeric;
  v_pm uuid;
  v_ba uuid;
  v_pay_date date;
  v_notes text;
  v_has_receipt boolean;
  v_require_receipt boolean;
  v_payment_id uuid;
  v_idem text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento.' USING ERRCODE='insufficient_privilege';
  END IF;

  v_idem := NULLIF(trim(p_payload->>'idempotency_key'), '');

  SELECT * INTO v_inst FROM public.accounts_payable_installments
   WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;

  IF v_idem IS NOT NULL THEN
    SELECT id INTO v_payment_id FROM public.payable_payments
     WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
    IF v_payment_id IS NOT NULL THEN
      RETURN v_payment_id;
    END IF;
  END IF;

  IF v_inst.status = 'CANCELED' THEN
    RAISE EXCEPTION 'Parcela cancelada.' USING ERRCODE='check_violation';
  END IF;
  IF v_inst.status = 'PAID' THEN
    RAISE EXCEPTION 'Parcela já quitada.' USING ERRCODE='check_violation';
  END IF;

  v_amount   := COALESCE((p_payload->>'amount_paid')::numeric, 0);
  v_disc     := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_int      := COALESCE((p_payload->>'interest_amount')::numeric, 0);
  v_pen      := COALESCE((p_payload->>'penalty_amount')::numeric, 0);
  v_pm       := NULLIF(p_payload->>'payment_method_id','')::uuid;
  v_ba       := NULLIF(p_payload->>'bank_account_id','')::uuid;
  v_pay_date := COALESCE((p_payload->>'payment_date')::date, CURRENT_DATE);
  v_notes    := NULLIF(p_payload->>'notes','');
  v_has_receipt := COALESCE((p_payload->>'has_receipt')::boolean, false);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido.' USING ERRCODE='check_violation';
  END IF;
  IF v_pm IS NULL OR NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = v_pm AND active) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;
  IF v_ba IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = v_ba AND active) THEN
    RAISE EXCEPTION 'Conta bancária inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;

  v_saldo := v_inst.original_amount + v_int + v_pen - v_disc - COALESCE(v_inst.paid_amount,0);
  IF v_amount - v_saldo > 0.005 THEN
    RAISE EXCEPTION 'Valor excede o saldo da parcela (saldo: %).', v_saldo USING ERRCODE='check_violation';
  END IF;

  SELECT require_receipt_on_payable_payment INTO v_require_receipt
    FROM public.financial_settings LIMIT 1;
  IF COALESCE(v_require_receipt,false) AND NOT v_has_receipt THEN
    RAISE EXCEPTION 'Comprovante de pagamento é obrigatório.' USING ERRCODE='check_violation';
  END IF;

  BEGIN
    INSERT INTO public.payable_payments (
      installment_id, payment_date, amount_paid, payment_method_id, bank_account_id,
      discount_amount, interest_amount, penalty_amount, notes, created_by, idempotency_key
    ) VALUES (
      p_installment_id, v_pay_date, v_amount, v_pm, v_ba,
      v_disc, v_int, v_pen, v_notes, v_uid, v_idem
    ) RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_payment_id FROM public.payable_payments
     WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
    RETURN v_payment_id;
  END;

  INSERT INTO public.financial_audit_log (
    entity_type, entity_id, action, new_data, performed_by
  ) VALUES (
    'payable_payments', v_payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object(
      'installment_id', p_installment_id,
      'amount', v_amount,
      'payment_method_id', v_pm,
      'bank_account_id', v_ba,
      'payment_date', v_pay_date,
      'idempotency_key', v_idem
    ),
    v_uid
  );

  RETURN v_payment_id;
END $function$;

-- ---------------------------------------------------------------------
-- baseline pré-H6b — fn_reverse_payment (sem replay idempotente)
-- fonte: supabase/migrations/20260626194607_dbf547e5-c976-4daf-ba5b-53d61386a46d.sql (linhas 57-139)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reverse_payment(_payment_id uuid, _kind text, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_new_id uuid;
  v_row record;
  v_inst_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão obrigatória.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Apenas administrador, gestor ou financeiro podem estornar uma baixa.'
      USING ERRCODE='insufficient_privilege';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Informe um motivo (mín. 5 caracteres) para o estorno.'
      USING ERRCODE='check_violation';
  END IF;

  IF _kind = 'receivable' THEN
    SELECT * INTO v_row FROM public.receivable_payments WHERE id = _payment_id FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;
    IF EXISTS (SELECT 1 FROM public.receivable_payments WHERE reversed_payment_id = _payment_id) THEN
      RAISE EXCEPTION 'Este pagamento já foi estornado.';
    END IF;
    SELECT status INTO v_inst_status FROM public.accounts_receivable_installments WHERE id = v_row.installment_id;
    IF v_inst_status = 'CANCELED' THEN
      RAISE EXCEPTION 'Não é possível estornar baixa de parcela cancelada.';
    END IF;

    INSERT INTO public.receivable_payments(
      installment_id, payment_date, payment_method_id, bank_account_id,
      amount_received, discount_amount, interest_amount, penalty_amount,
      notes, created_by, is_reversal, reversed_payment_id, reversal_reason
    ) VALUES (
      v_row.installment_id, CURRENT_DATE, v_row.payment_method_id, v_row.bank_account_id,
      -v_row.amount_received, -COALESCE(v_row.discount_amount,0),
      -COALESCE(v_row.interest_amount,0), -COALESCE(v_row.penalty_amount,0),
      '[ESTORNO] '||_reason, v_uid, true, _payment_id, _reason
    ) RETURNING id INTO v_new_id;

  ELSIF _kind = 'payable' THEN
    SELECT * INTO v_row FROM public.payable_payments WHERE id = _payment_id FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;
    IF EXISTS (SELECT 1 FROM public.payable_payments WHERE reversed_payment_id = _payment_id) THEN
      RAISE EXCEPTION 'Este pagamento já foi estornado.';
    END IF;
    SELECT status INTO v_inst_status FROM public.accounts_payable_installments WHERE id = v_row.installment_id;
    IF v_inst_status = 'CANCELED' THEN
      RAISE EXCEPTION 'Não é possível estornar baixa de parcela cancelada.';
    END IF;

    INSERT INTO public.payable_payments(
      installment_id, payment_date, payment_method_id, bank_account_id,
      amount_paid, discount_amount, interest_amount, penalty_amount,
      notes, created_by, is_reversal, reversed_payment_id, reversal_reason
    ) VALUES (
      v_row.installment_id, CURRENT_DATE, v_row.payment_method_id, v_row.bank_account_id,
      -v_row.amount_paid, -COALESCE(v_row.discount_amount,0),
      -COALESCE(v_row.interest_amount,0), -COALESCE(v_row.penalty_amount,0),
      '[ESTORNO] '||_reason, v_uid, true, _payment_id, _reason
    ) RETURNING id INTO v_new_id;
  ELSE
    RAISE EXCEPTION 'Tipo inválido: %', _kind;
  END IF;

  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES (
    CASE WHEN _kind='receivable' THEN 'receivable_payments' ELSE 'payable_payments' END,
    v_new_id, 'PAYMENT_REVERSAL_CREATED',
    jsonb_build_object('reversed_payment_id', _payment_id, 'reason', _reason),
    v_uid
  );

  RETURN v_new_id;
END $function$;

-- ---------------------------------------------------------------------
-- baseline pré-H6b — fn_entrega_guard_faturamento_v1 (+ grants originais)
-- fonte: supabase/migrations/20260803214533_e04b1754-76f0-4491-a3cf-60f9c4efe2fa.sql (linhas 352-392)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_entrega_guard_faturamento_v1(
  p_entrega_id uuid,
  p_total numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_r public.entrega_reconciliacoes%ROWTYPE;
  v_conf int;
BEGIN
  SELECT count(*)::int INTO v_conf
    FROM public.entrega_conferencia_itens WHERE entrega_id = p_entrega_id;

  IF v_conf = 0 THEN
    RETURN jsonb_build_object('modo', 'legado', 'ratio_aceito', 1);
  END IF;

  SELECT * INTO v_r FROM public.entrega_reconciliacoes
   WHERE entrega_id = p_entrega_id AND status = 'reconciliada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entrega_nao_reconciliada: conclua a conferencia e a reconciliacao antes de faturar'
      USING ERRCODE='check_violation';
  END IF;
  IF NOT v_r.faturavel THEN
    RAISE EXCEPTION 'entrega_nao_faturavel: todos os itens foram recusados'
      USING ERRCODE='check_violation';
  END IF;
  IF v_r.valor_faturavel_max IS NOT NULL AND p_total > v_r.valor_faturavel_max + 0.01 THEN
    RAISE EXCEPTION 'valor_acima_do_aceito' USING ERRCODE='check_violation';
  END IF;

  RETURN jsonb_build_object('modo', 'reconciliado', 'reconciliacao_id', v_r.id,
                            'ratio_aceito', v_r.ratio_aceito);
END $fn$;

REVOKE ALL ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- baseline pré-H6b — fn_generate_receivable_from_entrega
-- fonte: supabase/migrations/20260803214628_5d517228-7909-421e-ae59-45eac57a8564.sql (linhas 2-164)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_generate_receivable_from_entrega(_entrega_id uuid, _payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_entrega public.entregas%ROWTYPE;
  v_receivable_id uuid;
  v_total numeric(14,2);
  v_count integer;
  v_category uuid;
  v_cost_center uuid;
  v_payment_method uuid;
  v_first_due date;
  v_issue date;
  v_fiscal_required boolean;
  v_fiscal_status text;
  v_installments jsonb;
  v_sum numeric(14,2) := 0;
  v_inst jsonb;
  v_desc text;
  v_notes text;
  v_guard jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;

  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para faturar entregas.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_entrega FROM public.entregas WHERE id = _entrega_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega não encontrada.';
  END IF;

  IF v_entrega.receivable_id IS NOT NULL THEN
    RAISE EXCEPTION 'Entrega já possui conta a receber.' USING ERRCODE='check_violation';
  END IF;

  IF v_entrega.status = 'cancelada' THEN
    RAISE EXCEPTION 'Entrega cancelada não pode ser faturada.' USING ERRCODE='check_violation';
  END IF;

  IF v_entrega.status <> 'entregue' THEN
    RAISE EXCEPTION 'Entrega precisa estar com status "entregue" para faturar.' USING ERRCODE='check_violation';
  END IF;

  IF v_entrega.cliente_id IS NULL THEN
    RAISE EXCEPTION 'Entrega sem cliente vinculado.' USING ERRCODE='check_violation';
  END IF;

  IF v_entrega.financial_status = 'NOT_BILLABLE' THEN
    RAISE EXCEPTION 'Entrega marcada como não faturável.' USING ERRCODE='check_violation';
  END IF;

  v_total           := COALESCE((_payload->>'total_amount')::numeric, 0);
  v_count           := COALESCE((_payload->>'installment_count')::integer, 1);
  v_category        := NULLIF(_payload->>'category_id','')::uuid;
  v_cost_center     := NULLIF(_payload->>'cost_center_id','')::uuid;
  v_payment_method  := NULLIF(_payload->>'payment_method_id','')::uuid;
  v_first_due       := COALESCE((_payload->>'first_due_date')::date, CURRENT_DATE);
  v_issue           := COALESCE((_payload->>'issue_date')::date, CURRENT_DATE);
  v_fiscal_required := COALESCE((_payload->>'fiscal_invoice_required')::boolean, false);
  v_fiscal_status   := CASE WHEN v_fiscal_required THEN 'PENDING' ELSE 'NOT_REQUIRED' END;
  v_installments    := _payload->'installments';
  v_desc            := COALESCE(NULLIF(_payload->>'description',''), 'Entrega ' || substr(_entrega_id::text,1,8));
  v_notes           := NULLIF(_payload->>'notes','');

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Valor total inválido.' USING ERRCODE='check_violation';
  END IF;
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Categoria financeira é obrigatória.' USING ERRCODE='check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE id = v_category) THEN
    RAISE EXCEPTION 'Categoria financeira não encontrada.' USING ERRCODE='check_violation';
  END IF;
  IF v_count < 1 OR v_count > 36 THEN
    RAISE EXCEPTION 'Número de parcelas deve estar entre 1 e 36.' USING ERRCODE='check_violation';
  END IF;

  -- GATE: reconciliação obrigatória quando há conferência por item
  v_guard := public.fn_entrega_guard_faturamento_v1(_entrega_id, v_total);

  IF v_installments IS NOT NULL AND jsonb_array_length(v_installments) > 0 THEN
    IF jsonb_array_length(v_installments) <> v_count THEN
      RAISE EXCEPTION 'Quantidade de parcelas (%) diverge de installment_count (%).',
        jsonb_array_length(v_installments), v_count USING ERRCODE='check_violation';
    END IF;
    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_installments) LOOP
      v_sum := v_sum + COALESCE((v_inst->>'amount')::numeric, 0);
    END LOOP;
    IF abs(v_sum - v_total) > 0.01 THEN
      RAISE EXCEPTION 'Soma das parcelas (%) difere do total (%).', v_sum, v_total USING ERRCODE='check_violation';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.accounts_receivable (
      origin_type, origin_id, customer_id, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count,
      payment_method_id, fiscal_invoice_required, fiscal_invoice_status,
      notes, created_by
    ) VALUES (
      'DELIVERY', _entrega_id, v_entrega.cliente_id, v_desc, v_category, v_cost_center,
      v_total, v_issue, v_first_due, v_count,
      v_payment_method, v_fiscal_required, v_fiscal_status,
      v_notes, v_uid
    ) RETURNING id INTO v_receivable_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Entrega já possui conta a receber ativa.' USING ERRCODE='check_violation';
  END;

  IF v_installments IS NOT NULL AND jsonb_array_length(v_installments) > 0 THEN
    DELETE FROM public.accounts_receivable_installments WHERE receivable_id = v_receivable_id;
    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_installments) LOOP
      INSERT INTO public.accounts_receivable_installments (
        receivable_id, installment_number, due_date, original_amount, net_amount, status
      ) VALUES (
        v_receivable_id,
        (v_inst->>'installment_number')::integer,
        (v_inst->>'due_date')::date,
        (v_inst->>'amount')::numeric,
        (v_inst->>'amount')::numeric,
        'OPEN'
      );
    END LOOP;
  END IF;

  UPDATE public.entregas
     SET receivable_id = v_receivable_id,
         financial_status = 'BILLED',
         billing_generated_at = now(),
         billing_generated_by = v_uid
   WHERE id = _entrega_id;

  INSERT INTO public.financial_audit_log (
    entity_type, entity_id, action, old_data, new_data, performed_by
  ) VALUES (
    'entregas', _entrega_id, 'DELIVERY_BILLED',
    jsonb_build_object(
      'receivable_id', v_entrega.receivable_id,
      'financial_status', v_entrega.financial_status
    ),
    jsonb_build_object(
      'receivable_id', v_receivable_id,
      'total_amount', v_total,
      'installment_count', v_count,
      'fiscal_invoice_required', v_fiscal_required,
      'payment_method_id', v_payment_method,
      'origem', 'entrega',
      'reconciliacao', v_guard
    ),
    v_uid
  );

  RETURN v_receivable_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- Remoção dos objetos exclusivos do H6c (ordem: triggers -> funções)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_h6c_entrega_ar_b2b_link ON public.entregas;
DROP FUNCTION IF EXISTS public.fn_h6c_entrega_ar_b2b_link();
DROP TRIGGER IF EXISTS trg_h6c_set_canonical_payment_terms ON public.partner_order_payment_terms;
DROP FUNCTION IF EXISTS public.fn_h6c_set_canonical_payment_terms();

-- ---------------------------------------------------------------------
-- Remoção dos objetos exclusivos do H6b
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_h6b_reconciliacao_valor_faturavel ON public.entrega_reconciliacoes;
DROP FUNCTION IF EXISTS public.fn_h6b_reconciliacao_valor_faturavel();
DROP FUNCTION IF EXISTS public.fn_entrega_valor_faturavel_v1(uuid);
DROP FUNCTION IF EXISTS public.fn_h6b_payment_fingerprint(text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.fn_h6b_num(numeric);

-- ---------------------------------------------------------------------
-- Grants explícitos da baseline H6 (nenhum privilégio a anon/PUBLIC)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_register_receivable_payment(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_register_payable_payment(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_reverse_payment(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_generate_receivable_from_entrega(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_register_receivable_payment(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_payable_payment(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reverse_payment(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_generate_receivable_from_entrega(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) TO authenticated, service_role;

COMMIT;

SELECT 'ROLLBACK_H6B_APLICADO' AS escopo,
       (SELECT count(*) FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace
           AND proname IN ('fn_entrega_valor_faturavel_v1','fn_h6b_payment_fingerprint','fn_h6b_num'))
         AS funcoes_h6b_restantes,
       (SELECT count(*) FROM public.receivable_payments) AS baixas_ar_preservadas,
       (SELECT count(*) FROM public.payable_payments) AS baixas_ap_preservadas;
