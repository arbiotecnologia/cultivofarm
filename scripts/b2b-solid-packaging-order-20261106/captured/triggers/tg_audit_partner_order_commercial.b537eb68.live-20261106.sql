CREATE OR REPLACE FUNCTION public.tg_audit_partner_order_commercial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.priority IS DISTINCT FROM OLD.priority OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.commercial_audit_log(usuario_id, partner_id, order_id, acao, dados_anteriores, dados_novos)
    VALUES (
      auth.uid(), NEW.partner_id, NEW.id, 'partner_orders.commercial_change',
      jsonb_build_object('status', OLD.status, 'priority', OLD.priority),
      jsonb_build_object('status', NEW.status, 'priority', NEW.priority)
    );
  END IF;
  RETURN NEW;
END $function$
