-- ============================================================================
-- H6b — Correcao focada dos bloqueios financeiros (staging ikaauvsflpmamgxmkhoq)
-- H6-001 baixa AR/AP com idempotencia obrigatoria + fingerprint fail-closed
-- H6-002 estorno determinístico (replay estavel / conflito estavel)
-- H6-003 entrega -> AR com valor canonico derivado server-side
-- H6-004 imutabilidade (valor derivado de snapshot historico, nunca de preco atual)
-- Nao edita migrations historicas. Idempotente (re-executavel).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Colunas incrementais
-- ---------------------------------------------------------------------------
ALTER TABLE public.receivable_payments  ADD COLUMN IF NOT EXISTS request_fingerprint text;
ALTER TABLE public.payable_payments     ADD COLUMN IF NOT EXISTS request_fingerprint text;
ALTER TABLE public.entrega_reconciliacoes ADD COLUMN IF NOT EXISTS valor_faturavel_origem text;
ALTER TABLE public.entrega_reconciliacoes ADD COLUMN IF NOT EXISTS valor_faturavel_metodo jsonb;

-- ---------------------------------------------------------------------------
-- 1. Fingerprint canonico de baixa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_h6b_num(p numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT to_char(round(COALESCE(p,0), 2), 'FM9999999999990.00');
$$;

CREATE OR REPLACE FUNCTION public.fn_h6b_payment_fingerprint(
  p_kind text, p_installment_id uuid, p_payload jsonb
) RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT encode(extensions.digest(
    concat_ws('|',
      'v1', p_kind, p_installment_id::text,
      public.fn_h6b_num(COALESCE((p_payload->>'amount_received')::numeric,
                                 (p_payload->>'amount_paid')::numeric)),
      public.fn_h6b_num((p_payload->>'discount_amount')::numeric),
      public.fn_h6b_num((p_payload->>'interest_amount')::numeric),
      public.fn_h6b_num((p_payload->>'penalty_amount')::numeric),
      COALESCE(NULLIF(p_payload->>'payment_method_id',''), '-'),
      COALESCE(NULLIF(p_payload->>'bank_account_id',''), '-'),
      COALESCE(NULLIF(p_payload->>'payment_date',''), '-'),
      COALESCE(NULLIF(p_payload->>'notes',''), '-'),
      COALESCE(NULLIF(p_payload->>'has_receipt',''), '-')
    ), 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION public.fn_h6b_payment_fingerprint(text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_h6b_num(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_h6b_payment_fingerprint(text, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_h6b_num(numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. H6-001 — rpc_register_receivable_payment (idempotencia obrigatoria)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_register_receivable_payment(p_installment_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_inst public.accounts_receivable_installments%ROWTYPE;
  v_amount numeric; v_disc numeric; v_int numeric; v_pen numeric; v_saldo numeric;
  v_pm uuid; v_ba uuid; v_pay_date date; v_notes text;
  v_has_receipt boolean; v_require_receipt boolean;
  v_payment_id uuid; v_idem text; v_fp text; v_existing record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para registrar recebimento.' USING ERRCODE='insufficient_privilege';
  END IF;

  -- H6-001: idempotency_key obrigatoria (fail-closed)
  v_idem := NULLIF(trim(p_payload->>'idempotency_key'), '');
  IF v_idem IS NULL OR length(v_idem) < 8 THEN
    RAISE EXCEPTION 'FIN_IDEMPOTENCY_REQUIRED: idempotency_key obrigatória (mín. 8 caracteres).'
      USING ERRCODE='check_violation';
  END IF;

  v_fp := public.fn_h6b_payment_fingerprint('receivable', p_installment_id, p_payload);

  -- lock determinístico por tipo + parcela + chave, ANTES da decisao de replay
  PERFORM pg_advisory_xact_lock(
    hashtextextended('fin_pay:receivable:' || p_installment_id::text || ':' || v_idem, 0));

  SELECT * INTO v_inst FROM public.accounts_receivable_installments
   WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;

  SELECT id, request_fingerprint INTO v_existing FROM public.receivable_payments
   WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
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
      discount_amount, interest_amount, penalty_amount, notes, created_by,
      idempotency_key, request_fingerprint
    ) VALUES (
      p_installment_id, v_pay_date, v_amount, v_pm, v_ba,
      v_disc, v_int, v_pen, v_notes, v_uid, v_idem, v_fp
    ) RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, request_fingerprint INTO v_existing FROM public.receivable_payments
     WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('receivable_payments', v_payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object('installment_id', p_installment_id, 'amount', v_amount,
      'payment_method_id', v_pm, 'bank_account_id', v_ba, 'payment_date', v_pay_date,
      'idempotency_key', v_idem, 'request_fingerprint', v_fp), v_uid);

  RETURN v_payment_id;
END $function$;

-- ---------------------------------------------------------------------------
-- 3. H6-001 — rpc_register_payable_payment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_register_payable_payment(p_installment_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_inst public.accounts_payable_installments%ROWTYPE;
  v_amount numeric; v_disc numeric; v_int numeric; v_pen numeric; v_saldo numeric;
  v_pm uuid; v_ba uuid; v_pay_date date; v_notes text;
  v_has_receipt boolean; v_require_receipt boolean;
  v_payment_id uuid; v_idem text; v_fp text; v_existing record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento.' USING ERRCODE='insufficient_privilege';
  END IF;

  v_idem := NULLIF(trim(p_payload->>'idempotency_key'), '');
  IF v_idem IS NULL OR length(v_idem) < 8 THEN
    RAISE EXCEPTION 'FIN_IDEMPOTENCY_REQUIRED: idempotency_key obrigatória (mín. 8 caracteres).'
      USING ERRCODE='check_violation';
  END IF;

  v_fp := public.fn_h6b_payment_fingerprint('payable', p_installment_id, p_payload);

  PERFORM pg_advisory_xact_lock(
    hashtextextended('fin_pay:payable:' || p_installment_id::text || ':' || v_idem, 0));

  SELECT * INTO v_inst FROM public.accounts_payable_installments
   WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;

  SELECT id, request_fingerprint INTO v_existing FROM public.payable_payments
   WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
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
      discount_amount, interest_amount, penalty_amount, notes, created_by,
      idempotency_key, request_fingerprint
    ) VALUES (
      p_installment_id, v_pay_date, v_amount, v_pm, v_ba,
      v_disc, v_int, v_pen, v_notes, v_uid, v_idem, v_fp
    ) RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, request_fingerprint INTO v_existing FROM public.payable_payments
     WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('payable_payments', v_payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object('installment_id', p_installment_id, 'amount', v_amount,
      'payment_method_id', v_pm, 'bank_account_id', v_ba, 'payment_date', v_pay_date,
      'idempotency_key', v_idem, 'request_fingerprint', v_fp), v_uid);

  RETURN v_payment_id;
END $function$;

-- ---------------------------------------------------------------------------
-- 4. H6-002 — estorno idempotente e determinístico
-- ---------------------------------------------------------------------------
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
  v_prev record;
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
  IF _kind NOT IN ('receivable','payable') THEN
    RAISE EXCEPTION 'Tipo inválido: %', _kind;
  END IF;

  -- lock determinístico por intencao de reversao (mesma baixa original)
  PERFORM pg_advisory_xact_lock(hashtextextended('fin_reverse:' || _kind || ':' || _payment_id::text, 0));

  IF _kind = 'receivable' THEN
    SELECT * INTO v_row FROM public.receivable_payments WHERE id = _payment_id FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;

    -- replay estavel: mesma intencao -> devolve reversao existente
    SELECT id, reversal_reason INTO v_prev FROM public.receivable_payments
     WHERE reversed_payment_id = _payment_id AND is_reversal = true;
    IF v_prev.id IS NOT NULL THEN
      IF trim(COALESCE(v_prev.reversal_reason,'')) IS DISTINCT FROM trim(_reason) THEN
        RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: baixa já estornada com motivo divergente.'
          USING ERRCODE='check_violation';
      END IF;
      RETURN v_prev.id;
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

  ELSE
    SELECT * INTO v_row FROM public.payable_payments WHERE id = _payment_id FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;

    SELECT id, reversal_reason INTO v_prev FROM public.payable_payments
     WHERE reversed_payment_id = _payment_id AND is_reversal = true;
    IF v_prev.id IS NOT NULL THEN
      IF trim(COALESCE(v_prev.reversal_reason,'')) IS DISTINCT FROM trim(_reason) THEN
        RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: baixa já estornada com motivo divergente.'
          USING ERRCODE='check_violation';
      END IF;
      RETURN v_prev.id;
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

-- ---------------------------------------------------------------------------
-- 5. H6-003 — valor faturavel canonico derivado server-side
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_entrega_valor_faturavel_v1(p_entrega_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_e public.entregas%ROWTYPE;
  v_total_snapshot numeric;
  v_origem text;
  v_base numeric;
  v_aceito numeric;
  v_valor numeric;
  v_conf int;
  v_itens jsonb;
BEGIN
  SELECT * INTO v_e FROM public.entregas WHERE id = p_entrega_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('origem','indisponivel','motivo','entrega_nao_encontrada');
  END IF;

  SELECT count(*)::int INTO v_conf
    FROM public.entrega_conferencia_itens WHERE entrega_id = p_entrega_id;

  -- ---------------- caminho B2B (snapshot historico do pedido) -------------
  IF v_e.partner_order_id IS NOT NULL THEN
    SELECT t.final_amount INTO v_total_snapshot
      FROM public.partner_order_payment_terms t
     WHERE t.partner_order_id = v_e.partner_order_id
       AND t.final_amount IS NOT NULL
     ORDER BY t.created_at DESC LIMIT 1;
    v_origem := 'B2B_PAYMENT_TERMS_SNAPSHOT';

    IF v_total_snapshot IS NULL THEN
      SELECT COALESCE(po.final_amount_with_interest, po.total) INTO v_total_snapshot
        FROM public.partner_orders po WHERE po.id = v_e.partner_order_id;
      v_origem := 'B2B_ORDER_SNAPSHOT_FALLBACK';
    END IF;

    IF v_total_snapshot IS NULL OR v_total_snapshot <= 0 THEN
      RETURN jsonb_build_object('origem','indisponivel','motivo','snapshot_b2b_ausente');
    END IF;

    -- base do pedido = soma dos subtotais snapshot dos itens
    SELECT COALESCE(sum(COALESCE(i.subtotal,
             COALESCE(i.preco_unitario_final_snapshot, i.preco_unitario, 0) * COALESCE(i.quantidade,0))), 0)
      INTO v_base
      FROM public.partner_order_items i WHERE i.order_id = v_e.partner_order_id;

    IF v_conf = 0 OR v_base <= 0 THEN
      -- entrega integral (sem conferencia por item) => teto = total snapshot
      RETURN jsonb_build_object('origem', v_origem, 'valor', round(v_total_snapshot,2),
        'metodo', jsonb_build_object('tipo','integral','total_snapshot', round(v_total_snapshot,2),
                                     'base_itens', round(COALESCE(v_base,0),2)));
    END IF;

    -- proporcao aceita por PRODUTO usando o volume das embalagens conferidas
    WITH conf AS (
      SELECT ee.produto_id AS produto_id, ci.status AS status,
             COALESCE(ee.volume,0) * COALESCE(ci.quantidade,1) AS vol
        FROM public.entrega_conferencia_itens ci
        JOIN public.estoque_embalagens ee ON ee.id = ci.embalagem_id
       WHERE ci.entrega_id = p_entrega_id
    ), ratio AS (
      SELECT produto_id,
             CASE WHEN SUM(vol) > 0
                  THEN LEAST(1, round(SUM(vol) FILTER (WHERE status='aceito') / SUM(vol), 6))
                  ELSE 0 END AS r
        FROM conf GROUP BY produto_id
    ), itens AS (
      SELECT i.product_id AS product_id,
             COALESCE(i.subtotal,
               COALESCE(i.preco_unitario_final_snapshot, i.preco_unitario, 0) * COALESCE(i.quantidade,0)) AS sub,
             COALESCE(r.r, 0) AS r
        FROM public.partner_order_items i
        LEFT JOIN ratio r ON r.produto_id = i.product_id
       WHERE i.order_id = v_e.partner_order_id
    )
    SELECT COALESCE(sum(sub * r),0),
           COALESCE(jsonb_agg(jsonb_build_object('produto_id', product_id,
                     'subtotal_snapshot', round(sub,2), 'ratio_aceito', r)
                    ORDER BY product_id), '[]'::jsonb)
      INTO v_aceito, v_itens
      FROM itens;

    IF abs(v_aceito - v_base) <= 0.01 THEN
      v_valor := round(v_total_snapshot, 2);            -- integral reconcilia com o total
    ELSE
      v_valor := round(v_total_snapshot * (v_aceito / v_base), 2);  -- rateio determinístico
    END IF;

    RETURN jsonb_build_object('origem', v_origem, 'valor', v_valor,
      'metodo', jsonb_build_object('tipo','itens_aceitos_x_snapshot',
        'total_snapshot', round(v_total_snapshot,2),
        'base_itens', round(v_base,2), 'base_aceita', round(v_aceito,2), 'itens', v_itens));
  END IF;

  -- ---------------- caminho OS / base de faturamento historica -------------
  IF v_e.os_faturamento_base_id IS NOT NULL THEN
    SELECT b.valor_total_faturavel INTO v_total_snapshot
      FROM public.os_faturamento_base b WHERE b.id = v_e.os_faturamento_base_id;
    IF v_total_snapshot IS NOT NULL AND v_total_snapshot > 0 THEN
      RETURN jsonb_build_object('origem','OS_FATURAMENTO_BASE_SNAPSHOT',
        'valor', round(v_total_snapshot,2),
        'metodo', jsonb_build_object('tipo','os_base','os_faturamento_base_id', v_e.os_faturamento_base_id));
    END IF;
  END IF;

  RETURN jsonb_build_object('origem','indisponivel','motivo','sem_fonte_historica_confiavel');
END $function$;

REVOKE ALL ON FUNCTION public.fn_entrega_valor_faturavel_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_entrega_valor_faturavel_v1(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. H6-003 — guard e geracao de AR com autoridade server-side
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_entrega_guard_faturamento_v1(p_entrega_id uuid, p_total numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_r public.entrega_reconciliacoes%ROWTYPE;
  v_conf int;
  v_canon jsonb;
  v_max numeric;
BEGIN
  SELECT count(*)::int INTO v_conf
    FROM public.entrega_conferencia_itens WHERE entrega_id = p_entrega_id;

  v_canon := public.fn_entrega_valor_faturavel_v1(p_entrega_id);

  IF v_conf = 0 THEN
    RETURN jsonb_build_object('modo', 'legado', 'ratio_aceito', 1, 'canonico', v_canon);
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

  v_max := COALESCE(v_r.valor_faturavel_max, (v_canon->>'valor')::numeric);
  IF v_max IS NOT NULL AND p_total > v_max + 0.01 THEN
    RAISE EXCEPTION 'valor_acima_do_aceito' USING ERRCODE='check_violation';
  END IF;

  RETURN jsonb_build_object('modo', 'reconciliado', 'reconciliacao_id', v_r.id,
                            'ratio_aceito', v_r.ratio_aceito,
                            'valor_faturavel_max', v_max, 'canonico', v_canon);
END $function$;

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
  v_canon jsonb;
  v_canon_valor numeric;
  v_canon_origem text;
  v_manual boolean;
  v_manual_reason text;
  v_count integer;
  v_category uuid; v_cost_center uuid; v_payment_method uuid;
  v_first_due date; v_issue date;
  v_fiscal_required boolean; v_fiscal_status text;
  v_installments jsonb; v_sum numeric(14,2) := 0; v_inst jsonb;
  v_desc text; v_notes text; v_guard jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para faturar entregas.' USING ERRCODE='insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('entrega_faturar:' || _entrega_id::text, 0));

  SELECT * INTO v_entrega FROM public.entregas WHERE id = _entrega_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega não encontrada.'; END IF;

  -- H6-003.5 replay estavel
  IF v_entrega.receivable_id IS NOT NULL THEN
    RETURN v_entrega.receivable_id;
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
  v_manual          := COALESCE((_payload->>'manual_financial_adjustment')::boolean, false);
  v_manual_reason   := NULLIF(trim(_payload->>'manual_adjustment_reason'), '');

  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Categoria financeira é obrigatória.' USING ERRCODE='check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE id = v_category) THEN
    RAISE EXCEPTION 'Categoria financeira não encontrada.' USING ERRCODE='check_violation';
  END IF;
  IF v_count < 1 OR v_count > 36 THEN
    RAISE EXCEPTION 'Número de parcelas deve estar entre 1 e 36.' USING ERRCODE='check_violation';
  END IF;

  -- ------- H6-003: valor canonico server-side é a autoridade do total -------
  v_canon := public.fn_entrega_valor_faturavel_v1(_entrega_id);
  v_canon_origem := v_canon->>'origem';

  -- reconciliacao parcial: usa exatamente o valor_faturavel_max persistido
  SELECT r.valor_faturavel_max INTO v_canon_valor
    FROM public.entrega_reconciliacoes r
   WHERE r.entrega_id = _entrega_id AND r.status = 'reconciliada'
   LIMIT 1;
  IF v_canon_valor IS NULL THEN
    v_canon_valor := (v_canon->>'valor')::numeric;
  ELSE
    v_canon_origem := 'RECONCILIACAO:' || COALESCE(v_canon_origem,'-');
  END IF;

  IF v_canon_valor IS NOT NULL THEN
    IF abs(v_total - v_canon_valor) > 0.01 THEN
      RAISE EXCEPTION 'valor_divergente_do_canonico: informado %, canônico % (origem %).',
        v_total, v_canon_valor, v_canon_origem USING ERRCODE='check_violation';
    END IF;
    v_total := round(v_canon_valor, 2);
  ELSE
    -- sem fonte historica confiavel: exige ajuste financeiro manual justificado
    IF NOT v_manual OR v_manual_reason IS NULL OR length(v_manual_reason) < 10 THEN
      RAISE EXCEPTION 'valor_canonico_indisponivel: informe manual_financial_adjustment com motivo (mín. 10 caracteres).'
        USING ERRCODE='check_violation';
    END IF;
  END IF;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Valor total inválido.' USING ERRCODE='check_violation';
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
    SELECT id INTO v_receivable_id FROM public.accounts_receivable
     WHERE origin_type = 'DELIVERY' AND origin_id = _entrega_id AND status <> 'CANCELED';
    IF v_receivable_id IS NOT NULL THEN RETURN v_receivable_id; END IF;
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
    jsonb_build_object('receivable_id', v_entrega.receivable_id,
                       'financial_status', v_entrega.financial_status),
    jsonb_build_object('receivable_id', v_receivable_id, 'total_amount', v_total,
      'installment_count', v_count, 'fiscal_invoice_required', v_fiscal_required,
      'payment_method_id', v_payment_method, 'origem', 'entrega',
      'valor_canonico', v_canon_valor, 'valor_canonico_origem', v_canon_origem,
      'manual_financial_adjustment', v_manual, 'manual_adjustment_reason', v_manual_reason,
      'reconciliacao', v_guard),
    v_uid
  );

  RETURN v_receivable_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. H6-003.2 — reconciliacao persiste valor_faturavel_max server-side
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_h6b_reconciliacao_valor_faturavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_canon jsonb;
BEGIN
  IF NEW.status = 'reconciliada' AND NEW.valor_faturavel_max IS NULL THEN
    v_canon := public.fn_entrega_valor_faturavel_v1(NEW.entrega_id);
    IF (v_canon->>'valor') IS NOT NULL THEN
      NEW.valor_faturavel_max  := round((v_canon->>'valor')::numeric, 2);
      NEW.valor_faturavel_origem := v_canon->>'origem';
      NEW.valor_faturavel_metodo := v_canon->'metodo';
    ELSE
      NEW.valor_faturavel_origem := 'indisponivel';
      NEW.valor_faturavel_metodo := v_canon;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_h6b_reconciliacao_valor_faturavel ON public.entrega_reconciliacoes;
CREATE TRIGGER trg_h6b_reconciliacao_valor_faturavel
  BEFORE INSERT ON public.entrega_reconciliacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6b_reconciliacao_valor_faturavel();

-- ---------------------------------------------------------------------------
-- 8. Blindagem de execucao (anon nunca executa RPC financeira critica)
-- ---------------------------------------------------------------------------
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
