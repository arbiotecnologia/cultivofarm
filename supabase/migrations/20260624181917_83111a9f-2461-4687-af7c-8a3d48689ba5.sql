
-- 1) Remove pedido de teste PB-001001
DELETE FROM public.partner_order_items WHERE order_id = 'fa71c401-8037-4e0b-b0ec-cb53cd182de8';
DELETE FROM public.partner_order_messages WHERE order_id = 'fa71c401-8037-4e0b-b0ec-cb53cd182de8';
DELETE FROM public.production_timeline_events WHERE partner_order_id = 'fa71c401-8037-4e0b-b0ec-cb53cd182de8';
DELETE FROM public.partner_orders WHERE id = 'fa71c401-8037-4e0b-b0ec-cb53cd182de8';

-- 2) Trigger: ao criar pedido, registra evento pedido_criado
CREATE OR REPLACE FUNCTION public.trg_partner_order_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS partner_order_timeline_ins ON public.partner_orders;
CREATE TRIGGER partner_order_timeline_ins
AFTER INSERT ON public.partner_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_partner_order_timeline();

DROP TRIGGER IF EXISTS partner_order_timeline_upd ON public.partner_orders;
CREATE TRIGGER partner_order_timeline_upd
AFTER UPDATE ON public.partner_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_partner_order_timeline();

-- 3) Backfill: criar evento pedido_criado para pedidos existentes que não têm
INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, actor_id, meta)
SELECT po.id, 'pedido_criado', po.created_at, po.created_by, '{}'::jsonb
FROM public.partner_orders po
WHERE NOT EXISTS (
  SELECT 1 FROM public.production_timeline_events e
  WHERE e.partner_order_id = po.id AND e.event_type = 'pedido_criado'
);

-- Backfill pedido_aprovado para pedidos que já estão em status >= aprovado
INSERT INTO public.production_timeline_events(partner_order_id, event_type, event_at, meta)
SELECT po.id, 'pedido_aprovado', COALESCE(po.updated_at, po.created_at), '{}'::jsonb
FROM public.partner_orders po
WHERE po.status IN ('aprovado','em_producao','produzido','aguardando_entrega','entregue','faturado')
  AND NOT EXISTS (
    SELECT 1 FROM public.production_timeline_events e
    WHERE e.partner_order_id = po.id AND e.event_type = 'pedido_aprovado'
  );
