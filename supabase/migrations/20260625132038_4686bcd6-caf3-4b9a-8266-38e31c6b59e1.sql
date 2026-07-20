
CREATE OR REPLACE FUNCTION public.rpc_b2b_governance_kpis()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_total_concedido numeric := 0;
  v_total_utilizado numeric := 0;
  v_total_disponivel numeric := 0;
  v_bloqueados int := 0;
  v_vencidos numeric := 0;
  v_recebido_mes numeric := 0;
  v_inad_pct numeric := 0;
  v_receita numeric := 0;
BEGIN
  SELECT COALESCE(SUM(credit_limit),0) INTO v_total_concedido
    FROM public.partner_financial_settings WHERE active;

  SELECT COALESCE(SUM((ari.original_amount - ari.received_amount)),0) INTO v_total_utilizado
    FROM public.accounts_receivable ar
    JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
   WHERE ar.origin_type = 'B2B_ORDER' AND ar.status <> 'CANCELED'
     AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  v_total_disponivel := GREATEST(v_total_concedido - v_total_utilizado, 0);

  SELECT COUNT(DISTINCT partner_id) INTO v_bloqueados
    FROM public.partner_orders WHERE status = 'aguardando_aprovacao_credito';

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_vencidos
    FROM public.accounts_receivable ar
    JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
   WHERE ar.origin_type = 'B2B_ORDER' AND ar.status <> 'CANCELED'
     AND ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < current_date;

  SELECT COALESCE(SUM(rp.amount_received),0) INTO v_recebido_mes
    FROM public.receivable_payments rp
    JOIN public.accounts_receivable_installments ari ON ari.id = rp.installment_id
    JOIN public.accounts_receivable ar ON ar.id = ari.receivable_id
   WHERE ar.origin_type = 'B2B_ORDER'
     AND date_trunc('month', rp.payment_date) = date_trunc('month', current_date);

  SELECT COALESCE(SUM(total),0) INTO v_receita
    FROM public.partner_orders
   WHERE status IN ('entregue','faturado')
     AND date_trunc('month', created_at) = date_trunc('month', current_date);

  v_inad_pct := CASE WHEN v_total_utilizado > 0
                     THEN ROUND((v_vencidos / v_total_utilizado) * 100, 2)
                     ELSE 0 END;

  RETURN jsonb_build_object(
    'credito_total_concedido', v_total_concedido,
    'credito_utilizado', v_total_utilizado,
    'credito_disponivel', v_total_disponivel,
    'parceiros_bloqueados', v_bloqueados,
    'titulos_vencidos', v_vencidos,
    'recebimentos_mes', v_recebido_mes,
    'inadimplencia_pct', v_inad_pct,
    'receita_b2b_mes', v_receita
  );
END;$function$;

CREATE OR REPLACE FUNCTION public.rpc_portal_partner_credit_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_partner uuid;
BEGIN
  v_partner := public.get_user_partner_id();
  IF v_partner IS NULL THEN
    RETURN jsonb_build_object(
      'partner_id', null,
      'has_partner', false,
      'credit_limit', 0,
      'credit_used', 0,
      'credit_available', 0
    );
  END IF;
  RETURN public.rpc_b2b_partner_credit(v_partner);
END;$function$;
