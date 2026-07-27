-- =============================================================
-- Comunicação — FASE 0.1: Hardening canônico
-- Aditivo e idempotente. Preserva dados existentes.
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
  allowed_tipos text[] := ARRAY['alerta','informativo','recomendacao','sistema','sla','erro'];
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
  IF NOT (_tipo = ANY(allowed_tipos)) THEN
    RAISE EXCEPTION 'Tipo % não permitido', _tipo;
  END IF;
  IF char_length(_titulo) > 200 THEN
    RAISE EXCEPTION 'Título excede 200 caracteres';
  END IF;
  IF _mensagem IS NOT NULL AND char_length(_mensagem) > 2000 THEN
    RAISE EXCEPTION 'Mensagem excede 2000 caracteres';
  END IF;
  IF _link IS NOT NULL AND _link !~ '^/[A-Za-z0-9_\-./?=&%]{0,500}$' THEN
    RAISE EXCEPTION 'Link inválido: apenas caminhos internos são aceitos';
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
DROP POLICY IF EXISTS "Staff can record own aplicacao_emails" ON public.aplicacao_emails;
DROP POLICY IF EXISTS "Deny direct insert on aplicacao_emails" ON public.aplicacao_emails;
CREATE POLICY "Deny direct insert on aplicacao_emails"
  ON public.aplicacao_emails FOR INSERT TO authenticated
  WITH CHECK (false);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aplicacao_emails_status_chk') THEN
    ALTER TABLE public.aplicacao_emails
      ADD CONSTRAINT aplicacao_emails_status_chk
      CHECK (status IN ('queued','pending','sent','failed','link_generated_no_send'));
  END IF;
END $$;

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
  allowed text[] := ARRAY['queued','pending','sent','failed','link_generated_no_send'];
BEGIN
  IF _aplicacao_id IS NULL OR _email IS NULL THEN
    RAISE EXCEPTION 'aplicacao_id e email são obrigatórios';
  END IF;
  IF NOT (_status = ANY(allowed)) THEN
    RAISE EXCEPTION 'status % inválido', _status;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.aplicacoes a
      WHERE a.id = _aplicacao_id
        AND (a.responsavel_id = auth.uid() OR a.created_by = auth.uid())
    ) AND NOT (
      has_role(auth.uid(), 'administrador'::app_role)
      OR has_role(auth.uid(), 'gestor'::app_role)
      OR has_role(auth.uid(), 'administrativo'::app_role)
    ) THEN
      RAISE EXCEPTION 'Sem vínculo com a aplicação';
    END IF;
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

CREATE OR REPLACE FUNCTION public.rpc_create_portal_notification_secure(
  _cliente_id uuid,
  _tipo text,
  _titulo text,
  _mensagem text,
  _link text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id uuid;
  allowed_tipos text[] := ARRAY['informativo','alerta','recomendacao','aplicacao','visita','entrega','os'];
BEGIN
  IF _cliente_id IS NULL OR _tipo IS NULL OR _titulo IS NULL THEN
    RAISE EXCEPTION 'cliente_id, tipo e titulo são obrigatórios';
  END IF;
  IF NOT (_tipo = ANY(allowed_tipos)) THEN
    RAISE EXCEPTION 'Tipo % não permitido', _tipo;
  END IF;
  IF char_length(_titulo) > 200 THEN
    RAISE EXCEPTION 'Título excede 200 caracteres';
  END IF;
  IF _mensagem IS NOT NULL AND char_length(_mensagem) > 2000 THEN
    RAISE EXCEPTION 'Mensagem excede 2000 caracteres';
  END IF;
  IF _link IS NOT NULL AND _link !~ '^/[A-Za-z0-9_\-./?=&%]{0,500}$' THEN
    RAISE EXCEPTION 'Link inválido: apenas caminhos internos são aceitos';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória';
  END IF;

  IF NOT (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
    OR has_role(auth.uid(), 'aplicador'::app_role)
    OR has_role(auth.uid(), 'producao'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem autorização para notificar portal';
  END IF;

  BEGIN
    INSERT INTO public.portal_notificacoes (cliente_id, tipo, titulo, mensagem, link, created_by)
    VALUES (_cliente_id, _tipo, _titulo, _mensagem, _link, auth.uid())
    RETURNING id INTO new_id;
  EXCEPTION WHEN undefined_column THEN
    INSERT INTO public.portal_notificacoes (cliente_id, tipo, titulo, mensagem, link)
    VALUES (_cliente_id, _tipo, _titulo, _mensagem, _link)
    RETURNING id INTO new_id;
  END;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_portal_notification_secure(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_portal_notification_secure(uuid, text, text, text, text)
  TO authenticated, service_role;

-- -------- monitoramento_avisos: idempotência --------
ALTER TABLE public.monitoramento_avisos
  ADD COLUMN IF NOT EXISTS data_referencia date
  GENERATED ALWAYS AS ((enviado_em AT TIME ZONE 'UTC')::date) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='ux_monitoramento_avisos_dia'
  ) THEN
    CREATE UNIQUE INDEX ux_monitoramento_avisos_dia
      ON public.monitoramento_avisos (registro_consultor_id, tipo, data_referencia);
  END IF;
END $$;

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
