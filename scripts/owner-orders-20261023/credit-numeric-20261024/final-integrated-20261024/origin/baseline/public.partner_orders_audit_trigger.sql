CREATE OR REPLACE FUNCTION public.partner_orders_audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acao text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'order_created';
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_acao := CASE WHEN NEW.status = 'cancelado' THEN 'order_cancelled' ELSE 'status_changed' END;
    ELSE
      v_acao := 'order_updated';
    END IF;
  ELSE
    RETURN NULL;
  END IF;
  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (COALESCE(NEW.id, OLD.id), COALESCE(NEW.partner_id, OLD.partner_id), auth.uid(), v_acao, v_old, v_new);
  RETURN NEW;
END;
$function$
