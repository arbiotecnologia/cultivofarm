-- Canonical binding verified: swzpzcwiasxmjutrmvkm. Forward-only; no data writes.
-- Reuse exactly the existing partner_simulations_insert technical assignment predicate.
DO $fix$
DECLARE src text; old_guard text := 'IF cl IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=cl AND c.organization_id=public.h15_actor_organization()) THEN RAISE EXCEPTION ''client_scope_denied'' USING ERRCODE=''42501''; END IF;'; new_guard text := 'IF cl IS NOT NULL AND NOT (EXISTS (SELECT 1 FROM public.partner_user_clients puc WHERE puc.cliente_id=cl AND puc.user_id=u AND puc.partner_id=p AND puc.active=true) OR EXISTS (SELECT 1 FROM public.partner_technician_clients ptc WHERE ptc.cliente_id=cl AND ptc.technician_user_id=u AND ptc.partner_id=p AND ptc.active=true)) THEN RAISE EXCEPTION ''client_scope_denied'' USING ERRCODE=''42501''; END IF;';
BEGIN
 SELECT pg_get_functiondef('platform_private.b2b_save_technical_simulation(jsonb)'::regprocedure) INTO src;
 IF strpos(src,old_guard)>0 THEN EXECUTE replace(src,old_guard,new_guard);
 ELSIF strpos(src,new_guard)=0 THEN RAISE EXCEPTION 'technical_guard_definition_drift'; END IF;
END $fix$;
REVOKE ALL ON FUNCTION platform_private.b2b_save_technical_simulation(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.b2b_save_technical_simulation(jsonb) TO authenticated,service_role;

ALTER POLICY b2b_technical_no_raw_prices ON public.partner_simulations USING (NOT (SELECT public.has_role(auth.uid(),'parceiro_b2b_tecnico')));
ALTER POLICY b2b_technical_no_raw_prices ON public.partner_simulation_items USING (NOT (SELECT public.has_role(auth.uid(),'parceiro_b2b_tecnico')));
ALTER POLICY b2b_phase1_tenant_guard ON public.partner_simulations
 USING (platform_private.b2b_phase1_partner_visible(partner_id,true) AND (NOT (SELECT public.has_role(auth.uid(),'parceiro_b2b_tecnico')) OR created_by=(SELECT auth.uid())))
 WITH CHECK (platform_private.b2b_phase1_partner_visible(partner_id,true) AND (NOT (SELECT public.has_role(auth.uid(),'parceiro_b2b_tecnico')) OR created_by=(SELECT auth.uid())));

DROP POLICY IF EXISTS b2b_technical_financial_write_guard ON public.partner_simulations;
CREATE POLICY b2b_technical_financial_write_guard ON public.partner_simulations AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT (SELECT public.has_role(auth.uid(),'parceiro_b2b_tecnico')) OR (total_cheio=0 AND status IN ('rascunho','enviada_gestor') AND converted_order_id IS NULL AND converted_by IS NULL AND converted_at IS NULL))
 WITH CHECK (NOT (SELECT public.has_role(auth.uid(),'parceiro_b2b_tecnico')) OR (total_cheio=0 AND status IN ('rascunho','enviada_gestor') AND converted_order_id IS NULL AND converted_by IS NULL AND converted_at IS NULL));
DROP POLICY IF EXISTS b2b_technical_financial_write_guard ON public.partner_simulation_items;
CREATE POLICY b2b_technical_financial_write_guard ON public.partner_simulation_items AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT (SELECT public.has_role(auth.uid(),'parceiro_b2b_tecnico')) OR (coalesce(valor_unitario_cheio,0)=0 AND coalesce(subtotal,0)=0 AND coalesce(preco_tabela_snapshot,0)=0 AND coalesce(preco_unitario,0)=0 AND coalesce(desconto_percentual,0)=0))
 WITH CHECK (NOT (SELECT public.has_role(auth.uid(),'parceiro_b2b_tecnico')) OR (coalesce(valor_unitario_cheio,0)=0 AND coalesce(subtotal,0)=0 AND coalesce(preco_tabela_snapshot,0)=0 AND coalesce(preco_unitario,0)=0 AND coalesce(desconto_percentual,0)=0));
-- Only row-independent actor calls in the new B2B financial policy; row-dependent EXISTS stays correlated.
ALTER POLICY b2b_financial_settings_tenant_guard ON public.partner_financial_settings
 USING ((SELECT public.is_platform_superadmin(auth.uid())) OR (NOT (SELECT public.has_role(auth.uid(),'parceiro_b2b_tecnico')) AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id JOIN public.partner_accounts pa ON pa.id=o.partner_account_id WHERE p.user_id=(SELECT auth.uid()) AND p.ativo=true AND o.ativo=true AND o.status='ativa' AND pa.id=partner_financial_settings.partner_id AND pa.ativo=true AND pa.deleted_at IS NULL)))
 WITH CHECK ((SELECT public.is_platform_superadmin(auth.uid())) OR (NOT (SELECT public.has_role(auth.uid(),'parceiro_b2b_tecnico')) AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id JOIN public.partner_accounts pa ON pa.id=o.partner_account_id WHERE p.user_id=(SELECT auth.uid()) AND p.ativo=true AND o.ativo=true AND o.status='ativa' AND pa.id=partner_financial_settings.partner_id AND pa.ativo=true AND pa.deleted_at IS NULL)));
-- Reversal must retain an equivalent price-write and assignment barrier; do not drop guards without replacement.