-- Relatórios BI legados: não há caller no frontend atual e as funções aceitam
-- IDs arbitrários sob SECURITY DEFINER. Preservamos as funções para rollback,
-- mas retiramos a superfície Data API até receberem escopo tenant completo.
REVOKE ALL ON FUNCTION public.rpc_bi_visitas_por_consultor(uuid,date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_bi_visitas_por_cliente(uuid,date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_bi_visitas_por_fazenda(uuid,date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_bi_visitas_por_talhao(uuid,date,date) FROM PUBLIC, anon, authenticated;

-- Consolidados B2B consultam fontes de várias organizações e permanecem
-- fail-closed até que todas as cadeias carreguem organization_id determinístico.
REVOKE ALL ON FUNCTION public.rpc_b2b_carteira_kpis(date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_b2b_revenue_forecast(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_b2b_executive_dashboard() FROM PUBLIC, anon, authenticated;

-- Conta bancária é dado tenant, mas a tabela legada não possui ownership.
-- Nenhum registro é alterado; a Data API fica fechada para usuários finais.
REVOKE ALL ON TABLE public.bank_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.bank_accounts TO service_role;
DROP POLICY IF EXISTS "Financial staff full access" ON public.bank_accounts;
DROP POLICY IF EXISTS "d51_5_bank_accounts_fail_closed" ON public.bank_accounts;
CREATE POLICY "d51_5_bank_accounts_fail_closed"
ON public.bank_accounts
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- Jobs de catálogo e auditoria BI são operações globais de plataforma.
DROP POLICY IF EXISTS "arj_insert_admin" ON public.ai_refresh_jobs;
DROP POLICY IF EXISTS "arj_select_admin" ON public.ai_refresh_jobs;
DROP POLICY IF EXISTS "arj_update_admin" ON public.ai_refresh_jobs;
DROP POLICY IF EXISTS "d51_5_ai_refresh_platform" ON public.ai_refresh_jobs;
CREATE POLICY "d51_5_ai_refresh_platform"
ON public.ai_refresh_jobs
FOR ALL
TO authenticated
USING (public.is_platform_superadmin((SELECT auth.uid())))
WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins e gestores visualizam auditoria de refresh BI" ON public.bi_refresh_audit;
DROP POLICY IF EXISTS "d51_5_bi_refresh_audit_platform_read" ON public.bi_refresh_audit;
CREATE POLICY "d51_5_bi_refresh_audit_platform_read"
ON public.bi_refresh_audit
FOR SELECT
TO authenticated
USING (public.is_platform_superadmin((SELECT auth.uid())));

-- O log herda ownership da solicitação -> cliente -> organização.
DROP POLICY IF EXISTS "Admins e Gestores podem gerenciar logs de sync" ON public.agenda_sync_log;
DROP POLICY IF EXISTS "d51_5_agenda_sync_tenant_read" ON public.agenda_sync_log;
CREATE POLICY "d51_5_agenda_sync_tenant_read"
ON public.agenda_sync_log
FOR SELECT
TO authenticated
USING (
  (
    public.has_role((SELECT auth.uid()), 'administrativo'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'gestor'::public.app_role)
  )
  AND EXISTS (
  SELECT 1
  FROM public.portal_solicitacoes ps
  JOIN public.clientes c ON c.id = ps.cliente_id
  WHERE ps.id = agenda_sync_log.solicitacao_id
    AND c.organization_id = public.h15_actor_organization()
  )
);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.agenda_sync_log FROM authenticated;
GRANT SELECT ON TABLE public.agenda_sync_log TO authenticated;
GRANT ALL ON TABLE public.agenda_sync_log TO service_role;