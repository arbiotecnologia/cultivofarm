
CREATE OR REPLACE FUNCTION public.tg_partner_orders_credit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  v_after numeric(14,2);
  v_should_check boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('rascunho') THEN v_should_check := true; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- libera quando admin aprova crédito manualmente
    IF NEW.credit_approved_by IS NOT NULL AND OLD.credit_approved_by IS NULL THEN RETURN NEW; END IF;
    -- valida se status muda para um estado validável OU se o total mudou em status validável
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('em_analise_comercial','aprovado') THEN
      v_should_check := true;
    ELSIF NEW.total IS DISTINCT FROM OLD.total
       AND NEW.status IN ('em_analise_comercial','aprovado','aguardando_aprovacao_credito') THEN
      v_should_check := true;
    END IF;
  END IF;

  IF NOT v_should_check THEN RETURN NEW; END IF;

  v := public.rpc_b2b_partner_credit(NEW.partner_id);

  -- Inadimplência
  IF (v->>'block_if_overdue')::boolean AND (v->>'tem_vencidos')::boolean THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := 'inadimplencia';
    RETURN NEW;
  END IF;

  v_after := COALESCE((v->>'saldo_em_aberto')::numeric,0) + COALESCE(NEW.total,0);
  IF COALESCE((v->>'credit_limit')::numeric,0) > 0
     AND v_after > (v->>'credit_limit')::numeric THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := CASE
      WHEN (v->>'credit_limit_action') = 'approval_required' THEN 'limite_excedido'
      ELSE 'limite_excedido_bloqueado'
    END;
  END IF;

  RETURN NEW;
END;$$;
