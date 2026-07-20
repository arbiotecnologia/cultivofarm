-- 1. Adicionar coluna formal de forma de pagamento no Contas a Receber
ALTER TABLE public.accounts_receivable 
ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id);

-- 2. Índice para acelerar busca de entregas pendentes de faturamento
CREATE INDEX IF NOT EXISTS idx_entregas_financial_status ON public.entregas(financial_status);

-- 3. Atualizar RPC para aceitar payment_method_id e melhorar auditoria
CREATE OR REPLACE FUNCTION public.fn_generate_receivable_from_entrega(
  _entrega_id UUID,
  _payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receivable_id UUID;
  v_client_id UUID;
  v_inst JSONB;
  v_user_id UUID := auth.uid();
BEGIN
  -- Validações básicas
  SELECT cliente_id INTO v_client_id FROM public.entregas WHERE id = _entrega_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrega não encontrada'; END IF;

  -- Criar o cabeçalho do Contas a Receber
  INSERT INTO public.accounts_receivable (
    customer_id,
    description,
    category_id,
    cost_center_id,
    total_amount,
    issue_date,
    first_due_date,
    installment_count,
    fiscal_invoice_required,
    notes,
    origin_type,
    origin_id,
    payment_method_id, -- Nova coluna
    created_by
  ) VALUES (
    v_client_id,
    _payload->>'description',
    (_payload->>'category_id')::UUID,
    (_payload->>'cost_center_id')::UUID,
    (_payload->>'total_amount')::DECIMAL,
    (_payload->>'issue_date')::DATE,
    (_payload->>'first_due_date')::DATE,
    (_payload->>'installment_count')::INTEGER,
    (_payload->>'fiscal_invoice_required')::BOOLEAN,
    _payload->>'notes',
    'DELIVERY',
    _entrega_id,
    (_payload->>'payment_method_id')::UUID,
    v_user_id
  ) RETURNING id INTO v_receivable_id;

  -- Criar parcelas
  FOR v_inst IN SELECT * FROM jsonb_array_elements(_payload->'installments')
  LOOP
    INSERT INTO public.accounts_receivable_installments (
      receivable_id,
      installment_number,
      due_date,
      original_amount,
      net_amount,
      status
    ) VALUES (
      v_receivable_id,
      (v_inst->>'installment_number')::INTEGER,
      (v_inst->>'due_date')::DATE,
      (v_inst->>'amount')::DECIMAL,
      (v_inst->>'amount')::DECIMAL,
      'PENDING'
    );
  END LOOP;

  -- Vincular entrega e atualizar status
  UPDATE public.entregas 
  SET 
    receivable_id = v_receivable_id,
    financial_status = 'BILLED',
    billing_generated_at = now(),
    billing_generated_by = v_user_id
  WHERE id = _entrega_id;

  -- Log de Auditoria com verbo específico do prompt
  INSERT INTO public.financial_audit_log (
    entity_type,
    entity_id,
    action,
    new_data,
    performed_by
  ) VALUES (
    'entregas',
    _entrega_id,
    'DELIVERY_CONFIRMED_AND_RECEIVABLE_CREATED',
    jsonb_build_object('receivable_id', v_receivable_id, 'total', _payload->>'total_amount'),
    v_user_id
  );

  RETURN v_receivable_id;
END;
$$;
