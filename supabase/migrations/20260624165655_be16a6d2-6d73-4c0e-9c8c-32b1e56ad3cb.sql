CREATE OR REPLACE FUNCTION public.tg_auto_b2b_receivable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings record;
  v_should boolean := false;
BEGIN
  SELECT * INTO v_settings FROM public.partner_financial_settings WHERE partner_id = NEW.partner_id AND active = true;
  IF NOT FOUND OR NOT v_settings.auto_generate_receivable THEN RETURN NEW; END IF;
  IF NEW.receivable_generated THEN RETURN NEW; END IF;

  IF v_settings.billing_trigger = 'na_aprovacao' AND NEW.status = 'aprovado' AND OLD.status IS DISTINCT FROM 'aprovado' THEN
    v_should := true;
  ELSIF v_settings.billing_trigger = 'na_entrega' AND NEW.status = 'entregue' AND OLD.status IS DISTINCT FROM 'entregue' THEN
    v_should := true;
  ELSIF v_settings.billing_trigger = 'na_producao_finalizada' AND NEW.status = 'produzido' AND OLD.status IS DISTINCT FROM 'produzido' THEN
    v_should := true;
  END IF;

  IF v_should THEN
    BEGIN
      PERFORM public.generate_b2b_receivable_secure(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, acao, dados_novos)
      VALUES (NEW.id, NEW.partner_id, 'financeiro_auto_falhou', jsonb_build_object('erro', SQLERRM));
    END;
  END IF;
  RETURN NEW;
END $function$;