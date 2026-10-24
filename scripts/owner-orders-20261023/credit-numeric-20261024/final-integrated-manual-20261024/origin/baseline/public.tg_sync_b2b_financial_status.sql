CREATE OR REPLACE FUNCTION public.tg_sync_b2b_financial_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link record;
  v_new text;
BEGIN
  SELECT * INTO v_link FROM public.partner_order_financial_links WHERE receivable_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_new := CASE NEW.status
    WHEN 'PAID' THEN 'recebido'
    WHEN 'PARTIAL' THEN 'parcial'
    WHEN 'OVERDUE' THEN 'vencido'
    WHEN 'CANCELED' THEN 'cancelado'
    ELSE 'gerado'
  END;

  UPDATE public.partner_orders SET financial_status = v_new WHERE id = v_link.partner_order_id;
  UPDATE public.partner_order_financial_links SET financial_status = v_new WHERE id = v_link.id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, acao, dados_novos)
  VALUES (v_link.partner_order_id, v_link.partner_id, 'financeiro_status_alterado',
    jsonb_build_object('ar_status', NEW.status, 'novo', v_new));

  RETURN NEW;
END $function$
