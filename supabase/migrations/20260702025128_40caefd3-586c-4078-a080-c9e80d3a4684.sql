DROP POLICY IF EXISTS partner_accounts_self_select ON public.partner_accounts;
CREATE POLICY partner_accounts_self_select ON public.partner_accounts
FOR SELECT
USING (
  (public.has_role(auth.uid(), 'parceiro_b2b'::public.app_role)
   OR public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::public.app_role))
  AND id = public.get_user_partner_id()
);