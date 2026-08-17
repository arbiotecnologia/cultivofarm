-- ROLLBACK H1 — 20260906000000_h1_rls_hardening_v1
-- Restaura as policies permissivas anteriores e o EXECUTE anon.
-- USO EMERGENCIAL: reintroduz os achados H1-001..H1-006. Executar apenas via
-- restoration/os-e2e/staging-psql.sh no staging ikaauvsflpmamgxmkhoq.

BEGIN;

DROP POLICY IF EXISTS "aplicacao_emails_select_scoped" ON public.aplicacao_emails;
CREATE POLICY "Users can view emails sent for their applications"
  ON public.aplicacao_emails FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.aplicacoes a
    JOIN public.ordens_servico os ON os.id = a.ordem_servico_id
    WHERE a.id = aplicacao_emails.aplicacao_id));

DROP POLICY IF EXISTS "aev_select_scoped" ON public.aplicacao_evidencias_vinculos;
DROP POLICY IF EXISTS "aev_insert_scoped" ON public.aplicacao_evidencias_vinculos;
DROP POLICY IF EXISTS "aev_delete_scoped" ON public.aplicacao_evidencias_vinculos;
CREATE POLICY "Permitir leitura de vínculos para usuários autenticados"
  ON public.aplicacao_evidencias_vinculos FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de vínculos para usuários autenticados"
  ON public.aplicacao_evidencias_vinculos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Permitir exclusão de vínculos para usuários autenticados"
  ON public.aplicacao_evidencias_vinculos FOR DELETE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "arquivos_select_scoped" ON public.arquivos;
DROP POLICY IF EXISTS "arquivos_insert_scoped" ON public.arquivos;
CREATE POLICY "Authenticated users can read arquivos"
  ON public.arquivos FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert arquivos"
  ON public.arquivos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "rcsl_select_scoped" ON public.registros_consultor_status_log;
DROP POLICY IF EXISTS "rcsl_insert_scoped" ON public.registros_consultor_status_log;
CREATE POLICY "auth_select_status_log"
  ON public.registros_consultor_status_log FOR SELECT USING (true);
CREATE POLICY "auth_insert_status_log"
  ON public.registros_consultor_status_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "st_select_scoped" ON public.solicitacoes_timeline;
DROP POLICY IF EXISTS "st_insert_scoped" ON public.solicitacoes_timeline;
CREATE POLICY "auth_select_solicitacoes_timeline"
  ON public.solicitacoes_timeline FOR SELECT USING (true);
CREATE POLICY "auth_insert_solicitacoes_timeline"
  ON public.solicitacoes_timeline FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "organizations_select_scoped" ON public.organizations;
CREATE POLICY "organizations_select_authenticated"
  ON public.organizations FOR SELECT TO authenticated USING (true);

-- Reversão dos REVOKE (apenas se comprovada dependência legítima de anon).
-- Intencionalmente NÃO automatizada: reconceder EXECUTE a anon reintroduz
-- H1-008. Fazer caso a caso, com justificativa registrada no relatório.

COMMIT;
