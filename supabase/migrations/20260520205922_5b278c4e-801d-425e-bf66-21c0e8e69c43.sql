
-- 1) Novos campos
ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS financial_status text,
  ADD COLUMN IF NOT EXISTS billing_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_generated_by uuid,
  ADD COLUMN IF NOT EXISTS not_billable_reason text;

-- CHECK constraint (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='entregas_financial_status_chk') THEN
    ALTER TABLE public.entregas
      ADD CONSTRAINT entregas_financial_status_chk
      CHECK (financial_status IS NULL OR financial_status IN ('NOT_BILLABLE','PENDING_BILLING','BILLED','CANCELED'));
  END IF;
END $$;

-- 2) Unicidade do receivable_id (parcial)
CREATE UNIQUE INDEX IF NOT EXISTS uq_entregas_receivable_id
  ON public.entregas (receivable_id)
  WHERE receivable_id IS NOT NULL;

-- 3) Trigger sincronizador
CREATE OR REPLACE FUNCTION public.fn_sync_entrega_financial_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- bloqueia troca de receivable_id já vinculado
  IF TG_OP = 'UPDATE'
     AND OLD.receivable_id IS NOT NULL
     AND NEW.receivable_id IS DISTINCT FROM OLD.receivable_id THEN
    RAISE EXCEPTION 'Esta entrega já possui faturamento gerado e não pode ser alterada.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- vinculou receivable agora => BILLED
  IF (TG_OP = 'INSERT' AND NEW.receivable_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND OLD.receivable_id IS NULL AND NEW.receivable_id IS NOT NULL) THEN
    NEW.financial_status := 'BILLED';
    NEW.billing_generated_at := COALESCE(NEW.billing_generated_at, now());
    NEW.billing_generated_by := COALESCE(NEW.billing_generated_by, auth.uid());
  END IF;

  -- entrega cancelada
  IF NEW.status::text = 'cancelada' THEN
    NEW.financial_status := 'CANCELED';
  END IF;

  -- valida NOT_BILLABLE
  IF NEW.financial_status = 'NOT_BILLABLE'
     AND (NEW.not_billable_reason IS NULL OR length(trim(NEW.not_billable_reason)) = 0) THEN
    RAISE EXCEPTION 'Informe o motivo para marcar a entrega como sem cobrança.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- default quando não definido
  IF NEW.financial_status IS NULL THEN
    NEW.financial_status := 'PENDING_BILLING';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_entrega_financial_status ON public.entregas;
CREATE TRIGGER trg_sync_entrega_financial_status
  BEFORE INSERT OR UPDATE ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_entrega_financial_status();

-- 4) Backfill
UPDATE public.entregas SET financial_status = 'BILLED'
  WHERE receivable_id IS NOT NULL AND (financial_status IS NULL OR financial_status <> 'BILLED');
UPDATE public.entregas SET financial_status = 'CANCELED'
  WHERE status::text = 'cancelada' AND (financial_status IS NULL OR financial_status <> 'CANCELED');
UPDATE public.entregas SET financial_status = 'PENDING_BILLING'
  WHERE financial_status IS NULL;

-- 5) RPC para gerar receivable atômico
CREATE OR REPLACE FUNCTION public.fn_generate_receivable_from_entrega(
  _entrega_id uuid,
  _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entrega public.entregas%ROWTYPE;
  v_total numeric;
  v_qtd int;
  v_count int;
  v_receivable_id uuid;
  v_inst jsonb;
  v_sum numeric := 0;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para gerar lançamento financeiro.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_entrega FROM public.entregas WHERE id = _entrega_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega não encontrada.'; END IF;
  IF v_entrega.receivable_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta entrega já possui faturamento gerado.' USING ERRCODE='unique_violation';
  END IF;
  IF v_entrega.status::text <> 'entregue' THEN
    RAISE EXCEPTION 'Entrega precisa estar confirmada (status entregue) para faturar.' USING ERRCODE='check_violation';
  END IF;
  IF v_entrega.cliente_id IS NULL THEN
    RAISE EXCEPTION 'Entrega sem cliente vinculado.' USING ERRCODE='check_violation';
  END IF;

  v_total := COALESCE((_payload->>'total_amount')::numeric, 0);
  v_count := COALESCE((_payload->>'installment_count')::int, 1);
  IF v_total <= 0 THEN RAISE EXCEPTION 'Valor total inválido.' USING ERRCODE='check_violation'; END IF;
  IF v_count < 1 OR v_count > 36 THEN RAISE EXCEPTION 'Número de parcelas inválido.' USING ERRCODE='check_violation'; END IF;

  -- valida soma das parcelas (se vier custom)
  IF jsonb_typeof(_payload->'installments') = 'array' THEN
    SELECT COUNT(*) INTO v_qtd FROM jsonb_array_elements(_payload->'installments');
    IF v_qtd <> v_count THEN
      RAISE EXCEPTION 'Quantidade de parcelas (%) difere de installment_count (%).', v_qtd, v_count USING ERRCODE='check_violation';
    END IF;
    SELECT COALESCE(SUM((value->>'amount')::numeric),0) INTO v_sum FROM jsonb_array_elements(_payload->'installments') value;
    IF abs(v_sum - v_total) > 0.01 THEN
      RAISE EXCEPTION 'A soma das parcelas (%) difere do total (%).', v_sum, v_total USING ERRCODE='check_violation';
    END IF;
  END IF;

  INSERT INTO public.accounts_receivable (
    origin_type, origin_id, customer_id, description, category_id, cost_center_id,
    total_amount, issue_date, first_due_date, installment_count,
    fiscal_invoice_required, fiscal_invoice_status, notes, created_by
  ) VALUES (
    'DELIVERY', _entrega_id, v_entrega.cliente_id,
    COALESCE(_payload->>'description', 'Entrega ' || left(_entrega_id::text,8)),
    NULLIF(_payload->>'category_id','')::uuid,
    NULLIF(_payload->>'cost_center_id','')::uuid,
    v_total,
    COALESCE((_payload->>'issue_date')::date, CURRENT_DATE),
    (_payload->>'first_due_date')::date,
    v_count,
    COALESCE((_payload->>'fiscal_invoice_required')::boolean, false),
    CASE WHEN COALESCE((_payload->>'fiscal_invoice_required')::boolean, false) THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
    _payload->>'notes',
    v_uid
  ) RETURNING id INTO v_receivable_id;

  -- se vieram parcelas custom, substitui as geradas pelo trigger fn_generate_receivable_installments
  IF jsonb_typeof(_payload->'installments') = 'array' THEN
    DELETE FROM public.accounts_receivable_installments WHERE receivable_id = v_receivable_id;
    FOR v_inst IN SELECT * FROM jsonb_array_elements(_payload->'installments') LOOP
      INSERT INTO public.accounts_receivable_installments
        (receivable_id, installment_number, due_date, original_amount, net_amount, status)
      VALUES (
        v_receivable_id,
        (v_inst->>'installment_number')::int,
        (v_inst->>'due_date')::date,
        (v_inst->>'amount')::numeric,
        (v_inst->>'amount')::numeric,
        'OPEN'
      );
    END LOOP;
  END IF;

  UPDATE public.entregas
    SET receivable_id = v_receivable_id,
        billing_generated_at = now(),
        billing_generated_by = v_uid
    WHERE id = _entrega_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES ('entregas', _entrega_id, 'BILL',
    jsonb_build_object('receivable_id', NULL),
    jsonb_build_object('receivable_id', v_receivable_id, 'total_amount', v_total, 'installment_count', v_count),
    v_uid);

  RETURN v_receivable_id;
END $$;

-- 6) RPC para marcar não faturável
CREATE OR REPLACE FUNCTION public.fn_mark_entrega_not_billable(
  _entrega_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entrega public.entregas%ROWTYPE;
BEGIN
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para marcar entrega como sem cobrança.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Motivo é obrigatório.' USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_entrega FROM public.entregas WHERE id = _entrega_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega não encontrada.'; END IF;
  IF v_entrega.receivable_id IS NOT NULL THEN
    RAISE EXCEPTION 'Entrega já foi faturada.' USING ERRCODE='check_violation';
  END IF;

  UPDATE public.entregas
    SET financial_status = 'NOT_BILLABLE',
        not_billable_reason = _reason
    WHERE id = _entrega_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES ('entregas', _entrega_id, 'MARK_NOT_BILLABLE',
    jsonb_build_object('financial_status', v_entrega.financial_status),
    jsonb_build_object('financial_status', 'NOT_BILLABLE', 'reason', _reason),
    v_uid);
END $$;
