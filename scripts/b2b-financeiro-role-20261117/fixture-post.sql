-- Políticas LIVE relevantes (texto capturado), aplicadas após as funções.
ALTER TABLE public.partner_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY partner_orders_select ON public.partner_orders FOR SELECT TO authenticated USING (platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role) OR (platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND (partner_id = get_user_partner_id())));
ALTER TABLE public.partner_order_financial_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY pofl_partner_select_own ON public.partner_order_financial_links FOR SELECT USING (partner_id IN ( SELECT partner_users.partner_id FROM partner_users WHERE (partner_users.user_id = ( SELECT auth.uid() AS uid))));
ALTER TABLE public.partner_accounts ENABLE ROW LEVEL SECURITY;
-- Sintético: aproxima partner_accounts_self_select (b2b_coherent_self_partner não capturado).
CREATE POLICY partner_accounts_self_select ON public.partner_accounts FOR SELECT USING (id IN (SELECT partner_id FROM public.partner_users WHERE user_id=auth.uid()));
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar_partner_select_own_b2b_sint ON public.accounts_receivable FOR SELECT USING (origin_type='B2B_ORDER' AND platform_private.has_role(auth.uid(),'parceiro_b2b'::app_role) AND partner_id=public.get_user_partner_id());
ALTER TABLE public.accounts_receivable_installments ENABLE ROW LEVEL SECURITY;
