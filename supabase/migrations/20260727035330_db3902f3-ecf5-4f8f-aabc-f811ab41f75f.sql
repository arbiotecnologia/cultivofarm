BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'role authenticated ausente — ambiente inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'role service_role ausente — ambiente inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    RAISE EXCEPTION 'enum app_role ausente — pré-requisitos não atendidos';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp._drop_write_policies(_schema text, _table text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, cmd
      FROM pg_policies
     WHERE schemaname = _schema
       AND tablename  = _table
       AND cmd IN ('INSERT','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, _schema, _table);
  END LOOP;
END $fn$;

ALTER TABLE public.notificacoes_operacionais
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
DECLARE v_dup int;
BEGIN
  SELECT count(*) INTO v_dup
    FROM (
      SELECT idempotency_key
        FROM public.notificacoes_operacionais
       WHERE idempotency_key IS NOT NULL
       GROUP BY idempotency_key HAVING count(*) > 1
    ) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'notificacoes_operacionais possui % idempotency_key(s) duplicada(s)', v_dup USING ERRCODE = '23505';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ux_notif_op_idempotency') THEN
    CREATE UNIQUE INDEX ux_notif_op_idempotency
      ON public.notificacoes_operacionais (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

SELECT pg_temp._drop_write_policies('public','notificacoes_operacionais');
DROP POLICY IF EXISTS "user_update_own_notif_op" ON public.notificacoes_operacionais;

CREATE POLICY "user_update_own_notif_op"
  ON public.notificacoes_operacionais
  FOR UPDATE TO authenticated
  USING     (usuario_id = (SELECT auth.uid()))
  WITH CHECK (usuario_id = (SELECT auth.uid()));

CREATE POLICY "Deny direct insert on notificacoes_operacionais"
  ON public.notificacoes_operacionais
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny direct delete on notificacoes_operacionais"
  ON public.notificacoes_operacionais
  FOR DELETE TO authenticated USING (false);

DROP FUNCTION IF EXISTS public.rpc_create_notificacao_operacional(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_create_notificacao_operacional(uuid, text, text, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_create_notificacao_operacional(
  _usuario_id      uuid,
  _tipo            text,
  _titulo          text,
  _mensagem        text DEFAULT NULL,
  _link            text DEFAULT NULL,
  _source_type     text DEFAULT NULL,
  _source_id       uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  new_id uuid; existing_id uuid;
  caller_uid uuid := auth.uid();
  st text := lower(coalesce(_source_type, ''));
  allowed_source_types text[] := ARRAY['registros_consultor','registro_consultor','monitoramento_vencido','internal_cron'];
  allowed_tipos text[] := ARRAY[
    'alerta','informativo','recomendacao','sistema','sla','erro',
    'retorno_programado','confirmacao_retorno','aprovacao_urgente',
    'aprovacao_recomendacao','urgencia_critica',
    'nova_solicitacao','nova_reserva','nova_demanda_producao','simulacao_enviada',
    'b2b_payment_terms','b2b_payment_terms_pending',
    'pedido_b2b','pedido_b2b_novo','pedido_b2b_aprovado','pedido_b2b_reprovado',
    'pedido_b2b_previsao','pedido_b2b_itens_pendentes',
    'em_producao','produzido','entregue','remarcacao_solicitada',
    'confirmada','critica','nova_confirmacao'
  ];
  is_admin_caller boolean := false; is_staff_caller boolean := false; is_authorized boolean := false;
  v_rc_owner uuid; v_rc_created_by uuid; v_rc_finalized_by uuid; v_rc_cli uuid;
BEGIN
  IF _usuario_id IS NULL OR _tipo IS NULL OR _titulo IS NULL THEN
    RAISE EXCEPTION 'usuario_id, tipo e titulo são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF NOT (_tipo = ANY(allowed_tipos)) THEN
    RAISE EXCEPTION 'Tipo % não permitido', _tipo USING ERRCODE = '22023';
  END IF;
  IF char_length(_titulo) > 200 THEN
    RAISE EXCEPTION 'Título excede 200 caracteres' USING ERRCODE = '22023';
  END IF;
  IF _mensagem IS NOT NULL AND char_length(_mensagem) > 2000 THEN
    RAISE EXCEPTION 'Mensagem excede 2000 caracteres' USING ERRCODE = '22023';
  END IF;
  IF _link IS NOT NULL AND _link !~ '^/[A-Za-z0-9_\-./?=&%#]{0,500}$' THEN
    RAISE EXCEPTION 'Link inválido' USING ERRCODE = '22023';
  END IF;
  IF _idempotency_key IS NOT NULL AND char_length(_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'idempotency_key excede 200 caracteres' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _usuario_id) THEN
    RAISE EXCEPTION 'Destinatário inexistente' USING ERRCODE = '23503';
  END IF;

  IF caller_uid IS NOT NULL THEN
    IF _source_type IS NULL OR _source_id IS NULL THEN
      RAISE EXCEPTION 'source_type e source_id são obrigatórios' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _source_type IS NOT NULL AND NOT (st = ANY(allowed_source_types)) THEN
    RAISE EXCEPTION 'source_type % fora da whitelist', _source_type USING ERRCODE = '22023';
  END IF;

  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'Identidade obrigatória' USING ERRCODE = '42501';
  ELSE
    is_admin_caller := has_role(caller_uid, 'administrador'::app_role);
    is_staff_caller := is_admin_caller
      OR has_role(caller_uid, 'gestor'::app_role)
      OR has_role(caller_uid, 'administrativo'::app_role)
      OR has_role(caller_uid, 'consultor_tecnico'::app_role)
      OR has_role(caller_uid, 'tecnico_agronomo'::app_role)
      OR has_role(caller_uid, 'aplicador'::app_role)
      OR has_role(caller_uid, 'producao'::app_role)
      OR has_role(caller_uid, 'financeiro'::app_role);
    IF NOT is_staff_caller THEN
      RAISE EXCEPTION 'Sem papel operacional' USING ERRCODE = '42501';
    END IF;
    IF is_admin_caller THEN
      is_authorized := true;
    ELSE
      IF st IN ('registros_consultor','registro_consultor') THEN
        SELECT consultor_responsavel, created_by, finalized_by, cliente_id
          INTO v_rc_owner, v_rc_created_by, v_rc_finalized_by, v_rc_cli
          FROM public.registros_consultor WHERE id = _source_id;
        IF v_rc_owner IS NULL AND v_rc_cli IS NULL THEN
          RAISE EXCEPTION 'source_id não encontrado em registros_consultor' USING ERRCODE = '23503';
        END IF;
        IF caller_uid = v_rc_owner OR caller_uid = v_rc_created_by OR caller_uid = v_rc_finalized_by
           OR EXISTS (SELECT 1 FROM public.registros_consultor_status_log sl
                       WHERE sl.registro_consultor_id = _source_id AND sl.changed_by = caller_uid)
        THEN
          IF _tipo = 'retorno_programado' THEN
            is_authorized := (_usuario_id = caller_uid OR _usuario_id = v_rc_owner);
          ELSIF _tipo IN ('aprovacao_urgente','aprovacao_recomendacao') THEN
            is_authorized := has_role(_usuario_id, 'gestor'::app_role)
              OR has_role(_usuario_id, 'administrador'::app_role)
              OR has_role(_usuario_id, 'administrativo'::app_role);
          ELSE
            is_authorized := (_usuario_id = caller_uid OR _usuario_id = v_rc_owner);
          END IF;
        END IF;
      ELSIF st IN ('monitoramento_vencido','internal_cron') THEN
        RAISE EXCEPTION 'source_type % reservado ao cron interno', _source_type USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF NOT is_authorized THEN
    RAISE EXCEPTION 'Sem autorização para este evento' USING ERRCODE = '42501';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO existing_id FROM public.notificacoes_operacionais
     WHERE idempotency_key = _idempotency_key LIMIT 1;
    IF existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('created', false, 'duplicated', true, 'notification_id', existing_id);
    END IF;
  END IF;

  INSERT INTO public.notificacoes_operacionais
    (usuario_id, tipo, titulo, mensagem, link, source_type, source_id, idempotency_key)
  VALUES
    (_usuario_id, _tipo, _titulo, _mensagem, _link, _source_type, _source_id, _idempotency_key)
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('created', true, 'duplicated', false, 'notification_id', new_id);
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO existing_id FROM public.notificacoes_operacionais
   WHERE idempotency_key = _idempotency_key LIMIT 1;
  RETURN jsonb_build_object('created', false, 'duplicated', true, 'notification_id', existing_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_create_notificacao_operacional(uuid, text, text, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_notificacao_operacional(uuid, text, text, text, text, text, uuid, text)
  TO authenticated, service_role;

DO $$
DECLARE
  v_expected text[] := ARRAY['informativo','alerta','entrega','recomendacao','aplicacao','sistema'];
  v_missing  text[];
BEGIN
  SELECT ARRAY(
    SELECT unnest(v_expected)
    EXCEPT
    SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'tipo_notificacao_portal'
  ) INTO v_missing;
  IF v_missing IS NOT NULL AND array_length(v_missing,1) > 0 THEN
    RAISE EXCEPTION 'Enum tipo_notificacao_portal não contém: %', v_missing;
  END IF;
END $$;

ALTER TABLE public.portal_notificacoes
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
DECLARE v_dup int;
BEGIN
  SELECT count(*) INTO v_dup
    FROM (SELECT idempotency_key FROM public.portal_notificacoes
           WHERE idempotency_key IS NOT NULL
           GROUP BY idempotency_key HAVING count(*) > 1) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'portal_notificacoes possui % duplicatas', v_dup USING ERRCODE = '23505';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ux_portal_notif_idempotency') THEN
    CREATE UNIQUE INDEX ux_portal_notif_idempotency
      ON public.portal_notificacoes (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

SELECT pg_temp._drop_write_policies('public','portal_notificacoes');
DROP POLICY IF EXISTS "Portal users can read own notifications" ON public.portal_notificacoes;
DROP POLICY IF EXISTS "Portal users can update own notifications" ON public.portal_notificacoes;

CREATE POLICY "Portal users can read own notifications"
  ON public.portal_notificacoes FOR SELECT TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user((SELECT auth.uid()))));
CREATE POLICY "Portal users can update own notifications"
  ON public.portal_notificacoes FOR UPDATE TO authenticated
  USING     (cliente_id = ANY(get_cliente_ids_for_user((SELECT auth.uid()))))
  WITH CHECK (cliente_id = ANY(get_cliente_ids_for_user((SELECT auth.uid()))));
CREATE POLICY "Deny direct insert on portal_notificacoes"
  ON public.portal_notificacoes FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny direct delete on portal_notificacoes"
  ON public.portal_notificacoes FOR DELETE TO authenticated USING (false);

DROP FUNCTION IF EXISTS public.rpc_create_portal_notification_secure(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_create_portal_notification_secure(uuid, text, text, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_create_portal_notification_secure(
  _cliente_id uuid, _tipo text, _titulo text, _mensagem text,
  _link text DEFAULT NULL, _source_type text DEFAULT NULL,
  _source_id uuid DEFAULT NULL, _idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  new_id uuid; existing_id uuid; caller_uid uuid := auth.uid();
  st text := lower(coalesce(_source_type,''));
  allowed_source_types text[] := ARRAY['registros_consultor','ordem_servico','aplicacao'];
  allowed_tipos public.tipo_notificacao_portal[] := ARRAY['informativo','alerta','entrega','recomendacao','aplicacao','sistema']::public.tipo_notificacao_portal[];
  is_admin_caller boolean := false; is_authorized boolean := false;
  v_rc_cli uuid; v_rc_owner uuid; v_rc_created_by uuid; v_rc_finalized_by uuid;
  v_os_cli uuid; v_apl_cli uuid; v_apl_resp uuid; v_apl_created_by uuid;
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória' USING ERRCODE = '42501';
  END IF;
  IF _cliente_id IS NULL OR _tipo IS NULL OR _titulo IS NULL OR _mensagem IS NULL THEN
    RAISE EXCEPTION 'cliente_id, tipo, titulo e mensagem são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF (_source_type IS NULL) <> (_source_id IS NULL) THEN
    RAISE EXCEPTION 'source_type e source_id devem ser informados juntos' USING ERRCODE = '22023';
  END IF;
  IF _source_type IS NULL THEN
    RAISE EXCEPTION 'source_type/source_id são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF NOT (st = ANY(allowed_source_types)) THEN
    RAISE EXCEPTION 'source_type % fora da whitelist', _source_type USING ERRCODE = '22023';
  END IF;
  IF NOT (_tipo::public.tipo_notificacao_portal = ANY(allowed_tipos)) THEN
    RAISE EXCEPTION 'Tipo % não permitido', _tipo USING ERRCODE = '22023';
  END IF;
  IF char_length(_titulo) > 200 THEN RAISE EXCEPTION 'Título excede 200 caracteres' USING ERRCODE='22023'; END IF;
  IF char_length(_mensagem) > 2000 THEN RAISE EXCEPTION 'Mensagem excede 2000 caracteres' USING ERRCODE='22023'; END IF;
  IF _link IS NOT NULL AND _link !~ '^/[A-Za-z0-9_\-./?=&%#]{0,500}$' THEN
    RAISE EXCEPTION 'Link inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = _cliente_id) THEN
    RAISE EXCEPTION 'Cliente inexistente' USING ERRCODE = '23503';
  END IF;

  is_admin_caller := has_role(caller_uid, 'administrador'::app_role);
  IF st = 'registros_consultor' THEN
    SELECT cliente_id, consultor_responsavel, created_by, finalized_by
      INTO v_rc_cli, v_rc_owner, v_rc_created_by, v_rc_finalized_by
      FROM public.registros_consultor WHERE id = _source_id;
    IF v_rc_cli IS NULL THEN RAISE EXCEPTION 'source_id não encontrado' USING ERRCODE='23503'; END IF;
    IF v_rc_cli <> _cliente_id THEN RAISE EXCEPTION 'source_id pertence a outro cliente' USING ERRCODE='42501'; END IF;
    IF is_admin_caller OR caller_uid = v_rc_owner OR caller_uid = v_rc_created_by OR caller_uid = v_rc_finalized_by
       OR EXISTS (SELECT 1 FROM public.registros_consultor_status_log sl
                   WHERE sl.registro_consultor_id = _source_id AND sl.changed_by = caller_uid)
    THEN is_authorized := true; END IF;
  ELSIF st = 'ordem_servico' THEN
    SELECT cliente_id INTO v_os_cli FROM public.ordens_servico WHERE id = _source_id;
    IF v_os_cli IS NULL THEN RAISE EXCEPTION 'source_id não encontrado em ordens_servico' USING ERRCODE='23503'; END IF;
    IF v_os_cli <> _cliente_id THEN RAISE EXCEPTION 'source_id pertence a outro cliente' USING ERRCODE='42501'; END IF;
    IF is_admin_caller THEN is_authorized := true; END IF;
  ELSIF st = 'aplicacao' THEN
    SELECT os.cliente_id, a.responsavel_id, a.created_by
      INTO v_apl_cli, v_apl_resp, v_apl_created_by
      FROM public.aplicacoes a JOIN public.ordens_servico os ON os.id = a.ordem_servico_id
     WHERE a.id = _source_id;
    IF v_apl_cli IS NULL THEN RAISE EXCEPTION 'source_id não encontrado em aplicacoes' USING ERRCODE='23503'; END IF;
    IF v_apl_cli <> _cliente_id THEN RAISE EXCEPTION 'source_id pertence a outro cliente' USING ERRCODE='42501'; END IF;
    IF is_admin_caller OR caller_uid = v_apl_resp OR caller_uid = v_apl_created_by THEN is_authorized := true; END IF;
  END IF;

  IF NOT is_authorized THEN
    RAISE EXCEPTION 'Sem vínculo/papel para notificar cliente por %', _source_type USING ERRCODE='42501';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO existing_id FROM public.portal_notificacoes
     WHERE idempotency_key = _idempotency_key LIMIT 1;
    IF existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('created', false, 'duplicated', true, 'notification_id', existing_id);
    END IF;
  END IF;

  INSERT INTO public.portal_notificacoes
    (cliente_id, tipo, titulo, mensagem, link, created_by, source_type, source_id, idempotency_key)
  VALUES
    (_cliente_id, _tipo::public.tipo_notificacao_portal, _titulo, _mensagem,
     _link, caller_uid, _source_type, _source_id, _idempotency_key)
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('created', true, 'duplicated', false, 'notification_id', new_id);
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO existing_id FROM public.portal_notificacoes
   WHERE idempotency_key = _idempotency_key LIMIT 1;
  RETURN jsonb_build_object('created', false, 'duplicated', true, 'notification_id', existing_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_create_portal_notification_secure(uuid, text, text, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_portal_notification_secure(uuid, text, text, text, text, text, uuid, text)
  TO authenticated, service_role;

ALTER TABLE public.aplicacao_emails DROP CONSTRAINT IF EXISTS aplicacao_emails_status_chk;
ALTER TABLE public.aplicacao_emails
  ADD CONSTRAINT aplicacao_emails_status_chk
  CHECK (status IN ('queued','pending','sent','failed','link_generated_no_send','enviado'));

ALTER TABLE public.aplicacao_emails ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
DECLARE v_dup int;
BEGIN
  SELECT count(*) INTO v_dup
    FROM (SELECT idempotency_key FROM public.aplicacao_emails
           WHERE idempotency_key IS NOT NULL
           GROUP BY idempotency_key HAVING count(*) > 1) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'aplicacao_emails possui % duplicatas', v_dup USING ERRCODE='23505';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ux_aplicacao_emails_idempotency') THEN
    CREATE UNIQUE INDEX ux_aplicacao_emails_idempotency
      ON public.aplicacao_emails (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

SELECT pg_temp._drop_write_policies('public','aplicacao_emails');
CREATE POLICY "Deny direct insert on aplicacao_emails"
  ON public.aplicacao_emails FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny direct update on aplicacao_emails"
  ON public.aplicacao_emails FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny direct delete on aplicacao_emails"
  ON public.aplicacao_emails FOR DELETE TO authenticated USING (false);

DROP FUNCTION IF EXISTS public.rpc_record_aplicacao_email(uuid, text, text);
DROP FUNCTION IF EXISTS public.rpc_record_aplicacao_email(uuid, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.rpc_record_aplicacao_email(
  _aplicacao_id uuid, _email text, _status text DEFAULT 'queued',
  _idempotency_key text DEFAULT NULL, _enviado_por uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  caller_uid uuid := auth.uid();
  new_id uuid; existing_id uuid; existing_status text; final_author uuid;
  v_cli_id uuid; v_apl_resp uuid; v_apl_created_by uuid;
  allowed text[] := ARRAY['queued','pending','sent','failed','link_generated_no_send','enviado'];
  progressable text[] := ARRAY['queued','pending','failed','link_generated_no_send'];
BEGIN
  IF _aplicacao_id IS NULL OR _email IS NULL THEN
    RAISE EXCEPTION 'aplicacao_id e email são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF NOT (_status = ANY(allowed)) THEN
    RAISE EXCEPTION 'status % inválido', _status USING ERRCODE='22023';
  END IF;
  IF _email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR char_length(_email) > 320 THEN
    RAISE EXCEPTION 'e-mail inválido' USING ERRCODE='22023';
  END IF;
  final_author := COALESCE(caller_uid, _enviado_por);
  IF final_author IS NULL THEN RAISE EXCEPTION 'enviado_por obrigatório' USING ERRCODE='42501'; END IF;

  SELECT os.cliente_id, a.responsavel_id, a.created_by
    INTO v_cli_id, v_apl_resp, v_apl_created_by
    FROM public.aplicacoes a JOIN public.ordens_servico os ON os.id = a.ordem_servico_id
   WHERE a.id = _aplicacao_id;
  IF v_cli_id IS NULL THEN RAISE EXCEPTION 'Aplicação inexistente' USING ERRCODE='23503'; END IF;

  IF NOT (has_role(final_author, 'administrador'::app_role)
          OR final_author = v_apl_resp OR final_author = v_apl_created_by) THEN
    RAISE EXCEPTION 'Sem vínculo com a aplicação' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clientes c
     WHERE c.id = v_cli_id
       AND lower(_email) IN (lower(coalesce(c.email,'')), lower(coalesce(c.contato_financeiro_email,'')))
  ) THEN
    RAISE EXCEPTION 'Destinatário não cadastrado para o cliente' USING ERRCODE='42501';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    INSERT INTO public.aplicacao_emails (aplicacao_id, email, status, enviado_por, idempotency_key)
    VALUES (_aplicacao_id, lower(_email), _status, final_author, _idempotency_key)
    ON CONFLICT DO NOTHING RETURNING id INTO new_id;

    IF new_id IS NOT NULL THEN
      RETURN jsonb_build_object('created', true, 'duplicated', false, 'updated', false, 'record_id', new_id, 'status', _status);
    END IF;
    SELECT id, status INTO existing_id, existing_status FROM public.aplicacao_emails
     WHERE idempotency_key = _idempotency_key LIMIT 1;
    IF existing_id IS NULL THEN RAISE EXCEPTION 'Falha de idempotência' USING ERRCODE='23505'; END IF;
    IF _status = 'sent' AND existing_status = ANY(progressable) THEN
      UPDATE public.aplicacao_emails SET status='sent', email=lower(_email),
             enviado_por = COALESCE(enviado_por, final_author)
       WHERE id = existing_id RETURNING status INTO existing_status;
      RETURN jsonb_build_object('created', false, 'duplicated', false, 'updated', true, 'record_id', existing_id, 'status', existing_status);
    END IF;
    RETURN jsonb_build_object('created', false, 'duplicated', true, 'updated', false, 'record_id', existing_id, 'status', existing_status);
  END IF;

  INSERT INTO public.aplicacao_emails (aplicacao_id, email, status, enviado_por, idempotency_key)
  VALUES (_aplicacao_id, lower(_email), _status, final_author, NULL)
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('created', true, 'duplicated', false, 'updated', false, 'record_id', new_id, 'status', _status);
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_record_aplicacao_email(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_record_aplicacao_email(uuid, text, text, text, uuid) TO authenticated, service_role;

DO $$
DECLARE is_generated text;
BEGIN
  SELECT attgenerated::text INTO is_generated
    FROM pg_attribute
   WHERE attrelid = 'public.monitoramento_avisos'::regclass
     AND attname  = 'data_referencia' AND NOT attisdropped;
  IF is_generated IS NOT NULL AND is_generated <> '' THEN
    EXECUTE 'DROP INDEX IF EXISTS public.ux_monitoramento_avisos_dia';
    EXECUTE 'ALTER TABLE public.monitoramento_avisos DROP COLUMN data_referencia';
  END IF;
END $$;

ALTER TABLE public.monitoramento_avisos ADD COLUMN IF NOT EXISTS data_referencia date;

UPDATE public.monitoramento_avisos
   SET data_referencia = (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE data_referencia IS NULL AND enviado_em IS NOT NULL;

UPDATE public.monitoramento_avisos
   SET data_referencia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE data_referencia IS NULL;

ALTER TABLE public.monitoramento_avisos ALTER COLUMN data_referencia SET NOT NULL;

DO $$
DECLARE v_dup int;
BEGIN
  SELECT count(*) INTO v_dup
    FROM (SELECT registro_consultor_id, tipo, data_referencia
            FROM public.monitoramento_avisos
           GROUP BY registro_consultor_id, tipo, data_referencia HAVING count(*) > 1) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'monitoramento_avisos possui % duplicatas diárias', v_dup USING ERRCODE='23505';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_monitoramento_avisos_set_dref()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF NEW.data_referencia IS NULL THEN
    NEW.data_referencia := (COALESCE(NEW.enviado_em, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_monitoramento_avisos_set_dref ON public.monitoramento_avisos;
CREATE TRIGGER trg_monitoramento_avisos_set_dref
  BEFORE INSERT ON public.monitoramento_avisos
  FOR EACH ROW EXECUTE FUNCTION public.tg_monitoramento_avisos_set_dref();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ux_monitoramento_avisos_dia') THEN
    CREATE UNIQUE INDEX ux_monitoramento_avisos_dia
      ON public.monitoramento_avisos (registro_consultor_id, tipo, data_referencia);
  END IF;
END $$;

SELECT pg_temp._drop_write_policies('public','monitoramento_avisos');
DROP POLICY IF EXISTS "Visualização para usuários autenticados" ON public.monitoramento_avisos;
DROP POLICY IF EXISTS "Deny authenticated write on monitoramento_avisos" ON public.monitoramento_avisos;

CREATE POLICY "Deny authenticated write on monitoramento_avisos"
  ON public.monitoramento_avisos FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "Visualização para usuários autenticados"
  ON public.monitoramento_avisos FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.rpc_check_monitoramento_and_notify(_registro_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  caller_uid uuid := auth.uid();
  v_consultor uuid; v_cliente uuid; v_data_prox date; v_talhao_id uuid;
  v_talhao_nome text; v_cliente_nome text; v_reserved_id uuid; v_notif_id uuid;
  v_hoje_br date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_idem text;
BEGIN
  IF caller_uid IS NOT NULL AND NOT has_role(caller_uid, 'administrador'::app_role) THEN
    RAISE EXCEPTION 'Sem autorização' USING ERRCODE='42501';
  END IF;
  IF _registro_id IS NULL THEN RAISE EXCEPTION 'registro_id obrigatório' USING ERRCODE='22023'; END IF;

  SELECT r.consultor_responsavel, r.cliente_id, r.data_proxima_visita, r.talhao_id, t.nome, c.nome
    INTO v_consultor, v_cliente, v_data_prox, v_talhao_id, v_talhao_nome, v_cliente_nome
    FROM public.registros_consultor r
    LEFT JOIN public.talhoes t ON t.id = r.talhao_id
    LEFT JOIN public.clientes c ON c.id = r.cliente_id
   WHERE r.id = _registro_id
     AND r.necessidade_intervencao = 'monitorar'
     AND r.status = 'finalizado'
     AND r.data_proxima_visita IS NOT NULL
     AND r.data_proxima_visita <= v_hoje_br
   FOR UPDATE;

  IF v_consultor IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'not_eligible');
  END IF;

  INSERT INTO public.monitoramento_avisos (registro_consultor_id, tipo, data_referencia)
  VALUES (_registro_id, 'vencido', v_hoje_br)
  ON CONFLICT (registro_consultor_id, tipo, data_referencia) DO NOTHING
  RETURNING id INTO v_reserved_id;

  IF v_reserved_id IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'duplicate');
  END IF;

  v_idem := format('monit-venc-%s-%s', _registro_id, v_hoje_br);
  INSERT INTO public.notificacoes_operacionais
    (usuario_id, tipo, titulo, mensagem, link, source_type, source_id, idempotency_key)
  VALUES (
    v_consultor, 'alerta', 'Monitoramento Vencido',
    format('A reavaliação do talhão %s (%s) venceu em %s.',
           coalesce(v_talhao_nome,'—'), coalesce(v_cliente_nome,'—'), v_data_prox),
    format('/visita-tecnica/%s', _registro_id),
    'monitoramento_vencido', _registro_id, v_idem
  ) ON CONFLICT DO NOTHING RETURNING id INTO v_notif_id;

  IF v_notif_id IS NULL THEN
    SELECT id INTO v_notif_id FROM public.notificacoes_operacionais
     WHERE idempotency_key = v_idem LIMIT 1;
  END IF;
  IF v_notif_id IS NULL THEN
    RAISE EXCEPTION 'Reserva sem notificação; revertendo' USING ERRCODE='23514';
  END IF;

  RETURN jsonb_build_object('created', true, 'aviso_id', v_reserved_id, 'notification_id', v_notif_id,
    'consultor_id', v_consultor, 'talhao_id', v_talhao_id,
    'talhao_nome', v_talhao_nome, 'cliente_nome', v_cliente_nome);
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_check_monitoramento_and_notify(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_check_monitoramento_and_notify(uuid) TO service_role;

REVOKE INSERT, DELETE ON public.notificacoes_operacionais FROM authenticated, anon;
REVOKE INSERT, DELETE ON public.portal_notificacoes       FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.aplicacao_emails  FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.monitoramento_avisos FROM authenticated, anon;

GRANT SELECT, UPDATE ON public.notificacoes_operacionais TO authenticated;
GRANT ALL             ON public.notificacoes_operacionais TO service_role;
GRANT SELECT, UPDATE ON public.portal_notificacoes TO authenticated;
GRANT ALL             ON public.portal_notificacoes TO service_role;
GRANT SELECT          ON public.aplicacao_emails TO authenticated;
GRANT ALL             ON public.aplicacao_emails TO service_role;
GRANT SELECT          ON public.monitoramento_avisos TO authenticated;
GRANT ALL             ON public.monitoramento_avisos TO service_role;

REVOKE ALL ON public.notificacoes_operacionais FROM anon;
REVOKE ALL ON public.portal_notificacoes       FROM anon;
REVOKE ALL ON public.aplicacao_emails          FROM anon;
REVOKE ALL ON public.monitoramento_avisos      FROM anon;

COMMIT;