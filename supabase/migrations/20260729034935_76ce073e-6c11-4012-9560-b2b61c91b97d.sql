REVOKE ALL ON public.partner_order_idempotency FROM anon;
REVOKE ALL ON public.partner_order_idempotency FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.partner_order_idempotency FROM authenticated;
GRANT SELECT ON public.partner_order_idempotency TO authenticated;
GRANT ALL ON public.partner_order_idempotency TO service_role;