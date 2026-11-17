-- Reversão: recusa se houver vínculo/papel financeiro ativo (não apaga dados nem usuários).
-- Restaura os corpos capturados verbatim; o valor de enum permanece (não removível com segurança).
BEGIN;
DO $$ BEGIN
  IF current_setting('app.expected_ref', true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'B2B_FIN_RB_REF_UNPROVEN'; END IF;
  IF EXISTS (SELECT 1 FROM public.partner_users WHERE papel='financeiro')
     OR EXISTS (SELECT 1 FROM public.user_roles WHERE role::text='parceiro_b2b_financeiro') THEN
    RAISE EXCEPTION 'B2B_FIN_ROLLBACK_ACTIVE_ROLE: revogue/encerre vínculos financeiros antes';
  END IF;
END $$;
DROP POLICY b2b_finance_role_direct_closed ON public.partner_order_financial_links;
DROP POLICY b2b_finance_role_direct_closed ON public.partner_accounts;
-- @@CAPTURED_ORIGINALS@@
DROP FUNCTION public.b2b_finance_credit_v1();
DROP FUNCTION platform_private.b2b_finance_credit_core();
DROP FUNCTION public.b2b_finance_capability_v1();
DROP FUNCTION platform_private.b2b_finance_capability_core();
DROP FUNCTION platform_private.b2b_finance_actor_partner();
DROP FUNCTION platform_private.b2b_finance_role_holder();
ALTER TABLE public.partner_users DROP CONSTRAINT partner_users_papel_check;
ALTER TABLE public.partner_users ADD CONSTRAINT partner_users_papel_check CHECK (papel = ANY (ARRAY['gestor'::text, 'tecnico'::text]));
COMMIT;
