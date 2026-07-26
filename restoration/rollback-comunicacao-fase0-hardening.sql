-- Rollback de 20260810000000_comunicacao_fase0_hardening.sql
-- Restaura as policies permissivas anteriores. NÃO recomendado em produção.

-- notificacoes_operacionais
DROP POLICY IF EXISTS "user_update_own_notif_op" ON public.notificacoes_operacionais;
CREATE POLICY "user_update_own_notif_op" ON public.notificacoes_operacionais
  FOR UPDATE USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "auth_insert_notif_op" ON public.notificacoes_operacionais;
CREATE POLICY "auth_insert_notif_op" ON public.notificacoes_operacionais
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP FUNCTION IF EXISTS public.rpc_create_notificacao_operacional(uuid, text, text, text, text);

-- aplicacao_emails
DROP POLICY IF EXISTS "Staff can record own aplicacao_emails" ON public.aplicacao_emails;
CREATE POLICY "Users can record sent emails" ON public.aplicacao_emails
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP FUNCTION IF EXISTS public.rpc_record_aplicacao_email(uuid, text, text);

-- portal_notificacoes
DROP POLICY IF EXISTS "Deny direct insert on portal_notificacoes" ON public.portal_notificacoes;
DROP POLICY IF EXISTS "Deny direct delete on portal_notificacoes" ON public.portal_notificacoes;
DROP POLICY IF EXISTS "Portal users can update own notifications" ON public.portal_notificacoes;
CREATE POLICY "Portal users can update own notifications"
  ON public.portal_notificacoes FOR UPDATE TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

-- monitoramento_avisos
DROP POLICY IF EXISTS "Deny authenticated write on monitoramento_avisos"
  ON public.monitoramento_avisos;
