CREATE OR REPLACE FUNCTION public.audit_partner_order_payment_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_id uuid;
BEGIN
  SELECT partner_id INTO v_partner_id FROM public.partner_orders WHERE id = NEW.partner_order_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (NEW.partner_order_id, v_partner_id, auth.uid(), 'payment_terms_created', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (NEW.partner_order_id, v_partner_id, auth.uid(), 'payment_terms_updated', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$
