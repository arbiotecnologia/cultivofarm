-- H8-A3 ROLLBACK — recria as duas policies permissivas redundantes removidas,
-- com tabela, comando, role e expressões idênticas às originais.
-- Uso somente no staging ikaauvsflpmamgxmkhoq.

DROP POLICY IF EXISTS "ppp_select" ON public.partner_product_prices;
CREATE POLICY "ppp_select" ON public.partner_product_prices
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (
        has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role)
        OR has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)
    );

DROP POLICY IF EXISTS "Portal: Ler safras dos talhões acessíveis" ON public.talhao_safras;
CREATE POLICY "Portal: Ler safras dos talhões acessíveis" ON public.talhao_safras
    AS PERMISSIVE FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM talhoes t
             WHERE t.id = talhao_safras.talhao_id
               AND can_user_access_fazenda(t.fazenda_id)
        )
    );
