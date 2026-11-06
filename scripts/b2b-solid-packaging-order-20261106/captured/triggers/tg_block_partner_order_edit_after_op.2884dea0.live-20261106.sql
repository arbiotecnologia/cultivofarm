CREATE OR REPLACE FUNCTION public.tg_block_partner_order_edit_after_op()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_locked boolean;
BEGIN
  v_locked := public.partner_order_has_production(OLD.id);
  IF NOT v_locked THEN
    RETURN NEW;
  END IF;

  -- Campos sempre permitidos
  -- status, ready_for_production, approved_by, approved_at, approval_notes,
  -- estimated_delivery_date, observacoes, updated_at, future_financial_link

  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.desconto_total IS DISTINCT FROM OLD.desconto_total
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.requested_delivery_date IS DISTINCT FROM OLD.requested_delivery_date
  THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (OLD.id, OLD.partner_id, auth.uid(), 'edicao_bloqueada',
            to_jsonb(OLD), to_jsonb(NEW));
    RAISE EXCEPTION 'Este pedido já possui Ordem de Produção vinculada e não pode mais ser alterado.';
  END IF;

  RETURN NEW;
END;
$function$
