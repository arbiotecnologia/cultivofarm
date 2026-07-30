DO $$
DECLARE v_order uuid := '18546691-f588-4cbd-887f-84bbf2cbd17a';
BEGIN
  DELETE FROM public.partner_order_idempotency WHERE idempotency_key LIKE 'GATE-RUNTIME-%';
  DELETE FROM public.partner_order_payment_schedule WHERE partner_order_id = v_order;
  UPDATE public.partner_orders SET payment_terms_id = NULL WHERE id = v_order;
  DELETE FROM public.partner_order_payment_terms WHERE partner_order_id = v_order;
  DELETE FROM public.partner_order_items WHERE order_id = v_order;
  DELETE FROM public.partner_order_audit_logs WHERE order_id = v_order;
  DELETE FROM public.partner_orders WHERE id = v_order AND observacoes LIKE 'GATE-RUNTIME%';
END $$;