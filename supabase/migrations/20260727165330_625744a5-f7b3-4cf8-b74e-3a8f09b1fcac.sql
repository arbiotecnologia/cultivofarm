
-- Fase A/B — Correções P0: Realtime + RLS admin no audit de provider settings.
-- Idempotente e transaction-neutral (mantém flags de entrega OFF).

-- 1) Realtime publication para as tabelas de notificação in-app usadas pelos sinos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND schemaname='public'
                   AND tablename='notificacoes_operacionais') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes_operacionais';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND schemaname='public'
                   AND tablename='portal_notificacoes') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_notificacoes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND schemaname='public'
                   AND tablename='comunicacao_inapp_dispatch') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_inapp_dispatch';
  END IF;
END$$;

-- 2) REPLICA IDENTITY FULL para receber payload completo em UPDATE (marcar como lido).
ALTER TABLE public.notificacoes_operacionais REPLICA IDENTITY FULL;
ALTER TABLE public.portal_notificacoes       REPLICA IDENTITY FULL;
ALTER TABLE public.comunicacao_inapp_dispatch REPLICA IDENTITY FULL;

-- 3) Política admin-only para leitura do audit de provider settings.
DROP POLICY IF EXISTS provider_settings_audit_select_admin
  ON public.communication_provider_settings_audit;
CREATE POLICY provider_settings_audit_select_admin
  ON public.communication_provider_settings_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));
