CREATE OR REPLACE FUNCTION public.tg_block_partner_order_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.partner_order_has_production(OLD.id) THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores)
    VALUES (OLD.id, OLD.partner_id, auth.uid(), 'exclusao_bloqueada', to_jsonb(OLD));
    RAISE EXCEPTION 'Pedido com Ordem de Produção vinculada não pode ser excluído.';
  END IF;
  RETURN OLD;
END;
$function$
