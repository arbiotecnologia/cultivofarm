CREATE OR REPLACE FUNCTION public.tg_partner_order_items_resolve_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status partner_order_status;
  v_pid uuid;
BEGIN
  SELECT status, partner_id INTO v_status, v_pid
    FROM public.partner_orders WHERE id = NEW.order_id FOR UPDATE;

  IF v_status = 'aguardando_itens' THEN
    UPDATE public.partner_orders
       SET status = 'em_analise_comercial',
           itens_pendentes_resolvido_em = now(),
           updated_at = now()
     WHERE id = NEW.order_id
       AND status = 'aguardando_itens';

    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (NEW.order_id, v_pid, auth.uid(), 'items_added',
            jsonb_build_object('status','aguardando_itens'),
            jsonb_build_object('status','em_analise_comercial','item_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$function$
