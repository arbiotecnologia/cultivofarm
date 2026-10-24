CREATE OR REPLACE FUNCTION public.trg_partner_order_to_planning_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.ready_for_production = true AND (OLD.ready_for_production IS DISTINCT FROM NEW.ready_for_production) THEN
    INSERT INTO public.production_planning (partner_order_id, partner_id, status, created_by)
    VALUES (NEW.id, NEW.partner_id, 'aguardando_planejamento', NEW.approved_by)
    ON CONFLICT (partner_order_id) DO NOTHING;

    INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
    VALUES (NEW.id, 'planejamento_criado', NEW.approved_by, jsonb_build_object('approved_at', NEW.approved_at));
  END IF;
  RETURN NEW;
END $function$
