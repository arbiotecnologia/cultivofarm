-- =========================================================
-- FASE 5.2 — HARDENING DE SEGURANÇA
-- =========================================================

-- 1) Policies permissivas: trocar TRUE por auth.uid() IS NOT NULL
DROP POLICY IF EXISTS "Authenticated users can insert formulacoes" ON public.formulacoes;
CREATE POLICY "Authenticated users can insert formulacoes" ON public.formulacoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert arquivos" ON public.arquivos;
CREATE POLICY "Authenticated users can insert arquivos" ON public.arquivos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth_insert_status_log" ON public.registros_consultor_status_log;
CREATE POLICY "auth_insert_status_log" ON public.registros_consultor_status_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth_insert_atribuicoes" ON public.solicitacoes_atribuicoes;
CREATE POLICY "auth_insert_atribuicoes" ON public.solicitacoes_atribuicoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth_update_atribuicoes" ON public.solicitacoes_atribuicoes;
CREATE POLICY "auth_update_atribuicoes" ON public.solicitacoes_atribuicoes
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth_insert_visitas_logs" ON public.visitas_logs;
CREATE POLICY "auth_insert_visitas_logs" ON public.visitas_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth_insert_solicitacoes_timeline" ON public.solicitacoes_timeline;
CREATE POLICY "auth_insert_solicitacoes_timeline" ON public.solicitacoes_timeline
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth_insert_notif_op" ON public.notificacoes_operacionais;
CREATE POLICY "auth_insert_notif_op" ON public.notificacoes_operacionais
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Permitir inserção de vínculos para usuários autenticados" ON public.aplicacao_evidencias_vinculos;
CREATE POLICY "Permitir inserção de vínculos para usuários autenticados" ON public.aplicacao_evidencias_vinculos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Permitir exclusão de vínculos para usuários autenticados" ON public.aplicacao_evidencias_vinculos;
CREATE POLICY "Permitir exclusão de vínculos para usuários autenticados" ON public.aplicacao_evidencias_vinculos
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can record sent emails" ON public.aplicacao_emails;
CREATE POLICY "Users can record sent emails" ON public.aplicacao_emails
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "fgal_insert_system" ON public.financial_governance_audit_log;
CREATE POLICY "fgal_insert_system" ON public.financial_governance_audit_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- 2) Fixar search_path em funções SECURITY DEFINER (assinaturas reais)
ALTER FUNCTION public.is_financial_staff(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_avancar_esteira_laboratorio(text, uuid, uuid, text, text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_avancar_esteira_laboratorio(text, uuid, uuid, text, uuid)
  SET search_path = public, pg_temp;

-- 3) Realtime para mensagens B2B
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='partner_order_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_order_messages';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='partner_order_message_attachments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_order_message_attachments';
  END IF;
END $$;

ALTER TABLE public.partner_order_messages REPLICA IDENTITY FULL;
ALTER TABLE public.partner_order_message_attachments REPLICA IDENTITY FULL;