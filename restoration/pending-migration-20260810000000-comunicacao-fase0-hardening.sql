-- =============================================================
-- Comunicação — FASE 0: Hardening de RLS e RPCs seguros
-- APLICAR MANUALMENTE via fluxo de migration do Supabase
-- Nome sugerido: 20260810000000_comunicacao_fase0_hardening.sql
-- Rollback: restoration/rollback-comunicacao-fase0-hardening.sql
-- Aditivo: preserva dados existentes.
-- =============================================================

-- -------- notificacoes_operacionais --------
DROP POLICY IF EXISTS "auth_insert_notif_op" ON public.notificacoes_operacionais;

DROP POLICY IF EXISTS "user_update_own_notif_op" ON public.notificacoes_operacionais;
CREATE POLICY "user_update_own_notif_op" ON public.notificacoes_operacionais
  FOR UPDATE TO authenticated
  USING (usuario_id = (SELECT auth.uid()))
  WITH CHECK (usuario_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.rpc_create_notificacao_operacional(
  _usuario_id uuid,
  _tipo text,
  _titulo text,
  _mensagem text DEFAULT NULL,
  _link text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       has_role(auth.uid(), 'administrador'::app_role)
       OR has_role(auth.uid(), 'gestor'::app_role)
       OR has_role(auth.uid(), 'administrativo'::app_role)
       OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
       OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
       OR has_role(auth.uid(), 'aplicador'::app_role)
       OR has_role(auth.uid(), 'producao'::app_role)
       OR has_role(auth.uid(), 'financeiro'::app_role)
     )
  THEN
    RAISE EXCEPTION 'Sem autorização para criar notificação operacional';
  END IF;

  IF _usuario_id IS NULL OR _tipo IS NULL OR _titulo IS NULL THEN
    RAISE EXCEPTION 'usuario_id, tipo e titulo são obrigatórios';
  END IF;

  INSERT INTO public.notificacoes_operacionais (usuario_id, tipo, titulo, mensagem, link)
  VALUES (_usuario_id, _tipo, _titulo, _mensagem, _link)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_notificacao_operacional(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_notificacao_operacional(uuid, text, text, text, text)
  TO authenticated, service_role;

-- -------- aplicacao_emails --------
DROP POLICY IF EXISTS "Users can record sent emails" ON public.aplicacao_emails;

CREATE POLICY "Staff can record own aplicacao_emails" ON public.aplicacao_emails
  FOR INSERT TO authenticated
  WITH CHECK (
    (enviado_por = (SELECT auth.uid()))
    AND (
      has_role((SELECT auth.uid()), 'administrador'::app_role)
      OR has_role((SELECT auth.uid()), 'gestor'::app_role)
      OR has_role((SELECT auth.uid()), 'administrativo'::app_role)
      OR has_role((SELECT auth.uid()), 'consultor_tecnico'::app_role)
      OR has_role((SELECT auth.uid()), 'tecnico_agronomo'::app_role)
      OR has_role((SELECT auth.uid()), 'aplicador'::app_role)
      OR has_role((SELECT auth.uid()), 'producao'::app_role)
    )
  );

CREATE OR REPLACE FUNCTION public.rpc_record_aplicacao_email(
  _aplicacao_id uuid,
  _email text,
  _status text DEFAULT 'queued'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF _aplicacao_id IS NULL OR _email IS NULL THEN
    RAISE EXCEPTION 'aplicacao_id e email são obrigatórios';
  END IF;

  INSERT INTO public.aplicacao_emails (aplicacao_id, email, status, enviado_por)
  VALUES (_aplicacao_id, _email, _status, auth.uid())
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_aplicacao_email(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_record_aplicacao_email(uuid, text, text)
  TO authenticated, service_role;

-- -------- portal_notificacoes --------
DROP POLICY IF EXISTS "Portal users can update own notifications" ON public.portal_notificacoes;
CREATE POLICY "Portal users can update own notifications"
  ON public.portal_notificacoes FOR UPDATE TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user((SELECT auth.uid()))))
  WITH CHECK (cliente_id = ANY(get_cliente_ids_for_user((SELECT auth.uid()))));

DROP POLICY IF EXISTS "Deny direct insert on portal_notificacoes" ON public.portal_notificacoes;
CREATE POLICY "Deny direct insert on portal_notificacoes"
  ON public.portal_notificacoes FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct delete on portal_notificacoes" ON public.portal_notificacoes;
CREATE POLICY "Deny direct delete on portal_notificacoes"
  ON public.portal_notificacoes FOR DELETE TO authenticated
  USING (false);

-- -------- monitoramento_avisos --------
DROP POLICY IF EXISTS "Deny authenticated write on monitoramento_avisos"
  ON public.monitoramento_avisos;
CREATE POLICY "Deny authenticated write on monitoramento_avisos"
  ON public.monitoramento_avisos FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Visualização para usuários autenticados"
  ON public.monitoramento_avisos;
CREATE POLICY "Visualização para usuários autenticados"
  ON public.monitoramento_avisos FOR SELECT TO authenticated
  USING (true);
