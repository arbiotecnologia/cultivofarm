CREATE OR REPLACE FUNCTION public.tg_block_partner_order_items_after_op()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF public.partner_order_has_production(v_order_id) THEN
    INSERT INTO public.partner_order_audit_logs (order_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (v_order_id, auth.uid(),
            CASE WHEN TG_OP='DELETE' THEN 'exclusao_item_bloqueada' ELSE 'edicao_item_bloqueada' END,
            CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
            CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
    RAISE EXCEPTION 'Itens do pedido não podem ser alterados após a geração da Ordem de Produção.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$
