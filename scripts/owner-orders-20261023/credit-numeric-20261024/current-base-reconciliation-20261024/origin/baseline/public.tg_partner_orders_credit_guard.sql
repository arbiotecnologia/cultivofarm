CREATE OR REPLACE FUNCTION public.tg_partner_orders_credit_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_amount numeric(14,2);
  v_should_check boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('rascunho') THEN v_should_check := true; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.credit_approved_by IS NOT NULL
       AND NEW.status = 'em_analise_comercial'
       AND OLD.status = 'aguardando_aprovacao_credito'
       AND NEW.total IS NOT DISTINCT FROM OLD.total THEN
      NEW.credit_block_reason := NULL;
      RETURN NEW;
    END IF;

    IF NEW.credit_approved_by IS NOT NULL AND OLD.credit_approved_by IS NULL THEN
      NEW.credit_block_reason := NULL;
      RETURN NEW;
    END IF;

    IF OLD.credit_approved_by IS NOT NULL
       AND NEW.status = 'aprovado'
       AND OLD.status = 'em_analise_comercial'
       AND NEW.total IS NOT DISTINCT FROM OLD.total THEN
      RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('em_analise_comercial','aprovado') THEN
      v_should_check := true;
    ELSIF (NEW.total IS DISTINCT FROM OLD.total
        OR NEW.final_amount_with_interest IS DISTINCT FROM OLD.final_amount_with_interest)
       AND NEW.status IN ('em_analise_comercial','aprovado','aguardando_aprovacao_credito') THEN
      v_should_check := true;
    END IF;
  END IF;

  IF NOT v_should_check THEN RETURN NEW; END IF;

  -- Serializa a avaliacao de credito por parceiro dentro da transacao corrente.
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || NEW.partner_id::text, 0));

  v_amount := ROUND(COALESCE(NEW.final_amount_with_interest, NEW.total, 0), 2);
  v := public.fn_b2b_credit_exposure(NEW.partner_id, v_amount, NEW.id);

  IF (v->>'block_if_overdue')::boolean AND (v->>'tem_vencidos')::boolean THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := 'inadimplencia';
    RETURN NEW;
  END IF;

  IF COALESCE((v->>'credit_limit')::numeric,0) > 0
     AND (v->>'exposicao_projetada')::numeric > (v->>'credit_limit')::numeric THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := CASE
      WHEN (v->>'credit_limit_action') = 'approval_required' THEN 'limite_excedido'
      ELSE 'limite_excedido_bloqueado'
    END;
  END IF;

  RETURN NEW;
END $function$
