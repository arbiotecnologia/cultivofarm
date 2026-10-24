CREATE OR REPLACE FUNCTION public.trg_partner_order_timeline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, actor_id, meta)
    VALUES (NEW.id, 'pedido_criado', NEW.created_at, NEW.created_by, '{}'::jsonb);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'aprovado' THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'pedido_aprovado', now(), '{}'::jsonb);
    ELSIF NEW.status = 'em_producao' THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'producao_iniciada', now(), '{}'::jsonb);
    ELSIF NEW.status IN ('produzido','aguardando_entrega') THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'producao_finalizada', now(), '{}'::jsonb);
    ELSIF NEW.status = 'entregue' THEN
      INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
      VALUES (NEW.id, 'entrega_realizada', now(), '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
