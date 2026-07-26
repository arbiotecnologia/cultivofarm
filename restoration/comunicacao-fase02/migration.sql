-- =============================================================
-- Comunicação — FASE 0.2 (PROPOSTA, NÃO APLICADA)
-- Substitui integralmente o artefato da Fase 0.1
-- (restoration/pending-migration-20260810000000-comunicacao-fase0-hardening.sql).
--
-- Este arquivo é PROPOSTA. Ele NÃO é canônico enquanto não estiver em
-- supabase/migrations/ e registrado no histórico oficial do projeto.
-- Aplicar SOMENTE pelo runbook (restoration/comunicacao-fase02/runbook.md)
-- por operador humano autorizado.
--
-- Aditivo, idempotente, transacional. Preserva dados existentes.
-- Nome sugerido no histórico oficial:
--   20260810000000_comunicacao_fase02_hardening.sql
-- =============================================================

BEGIN;

-- =============================================================
-- 0. Guardas gerais e roles
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'role authenticated ausente — ambiente inválido para migration Supabase';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'role service_role ausente — ambiente inválido para migration Supabase';
  END IF;
END $$;

-- =============================================================
-- 1. notificacoes_operacionais
--    - Colunas idempotência/proveniência (aditivas)
--    - RLS: sem INSERT direto p/ authenticated (apenas via RPC/service_role/trigger SECURITY DEFINER)
--    - UPDATE simétrico (USING + WITH CHECK) restrito ao dono
--    - RPC canônica com whitelist AMPLA (compat legado) + validação server-side
-- =============================================================

ALTER TABLE public.notificacoes_operacionais
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Unique parcial: não permite duas notificações operacionais com a mesma chave.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='ux_notif_op_idempotency'
  ) THEN
    CREATE UNIQUE INDEX ux_notif_op_idempotency
      ON public.notificacoes_operacionais (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- Remove policies antigas conhecidas
DROP POLICY IF EXISTS "auth_insert_notif_op" ON public.notificacoes_operacionais;
DROP POLICY IF EXISTS "user_update_own_notif_op" ON public.notificacoes_operacionais;

-- Recria UPDATE simétrico (dono só pode marcar como lida / atualizar seus próprios)
CREATE POLICY "user_update_own_notif_op"
  ON public.notificacoes_operacionais
  FOR UPDATE TO authenticated
  USING  (usuario_id = (SELECT auth.uid()))
  WITH CHECK (usuario_id = (SELECT auth.uid()));

-- INSERT direto negado para authenticated — só via RPC / trigger SECURITY DEFINER / service_role.
DROP POLICY IF EXISTS "Deny direct insert on notificacoes_operacionais"
  ON public.notificacoes_operacionais;
CREATE POLICY "Deny direct insert on notificacoes_operacionais"
  ON public.notificacoes_operacionais
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- DELETE direto: negado para authenticated (limpeza é operacional).
DROP POLICY IF EXISTS "Deny direct delete on notificacoes_operacionais"
  ON public.notificacoes_operacionais;
CREATE POLICY "Deny direct delete on notificacoes_operacionais"
  ON public.notificacoes_operacionais
  FOR DELETE TO authenticated
  USING (false);

-- Whitelist AMPLA de tipos legado (inventariados no repositório) + genéricos.
-- Coerente com triggers e migrations existentes; NUNCA quebrar tipos legítimos.
CREATE OR REPLACE FUNCTION public.rpc_create_notificacao_operacional(
  _usuario_id uuid,
  _tipo text,
  _titulo text,
  _mensagem text DEFAULT NULL,
  _link text DEFAULT NULL,
  _source_type text DEFAULT NULL,
  _source_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id uuid;
  existing_id uuid;
  allowed_tipos text[] := ARRAY[
    -- Genéricos
    'alerta','informativo','recomendacao','sistema','sla','erro',
    -- Visita técnica / retorno
    'retorno_programado','confirmacao_retorno','aprovacao_urgente',
    'aprovacao_recomendacao','urgencia_critica',
    -- B2B / pedidos
    'nova_solicitacao','nova_reserva','nova_demanda_producao','simulacao_enviada',
    'b2b_payment_terms','b2b_payment_terms_pending',
    'pedido_b2b','pedido_b2b_novo','pedido_b2b_aprovado','pedido_b2b_reprovado',
    'pedido_b2b_previsao','pedido_b2b_itens_pendentes',
    -- Produção / esteira
    'em_producao','produzido','entregue','remarcacao_solicitada',
    'confirmada','critica','nova_confirmacao'
  ];
  caller_uid uuid := auth.uid();
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
    RAISE EXCEPTION 'Link inválido: apenas caminhos internos são aceitos' USING ERRCODE = '22023';
  END IF;
  IF _source_type IS NOT NULL AND char_length(_source_type) > 50 THEN
    RAISE EXCEPTION 'source_type inválido' USING ERRCODE = '22023';
  END IF;
  IF _idempotency_key IS NOT NULL AND char_length(_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'idempotency_key excede 200 caracteres' USING ERRCODE = '22023';
  END IF;

  -- Autorização: se houver caller autenticado, ele precisa ter algum papel operacional.
  -- Triggers SECURITY DEFINER internos (sem auth.uid()) são permitidos.
  IF caller_uid IS NOT NULL
     AND NOT (
       has_role(caller_uid, 'administrador'::app_role)
       OR has_role(caller_uid, 'gestor'::app_role)
       OR has_role(caller_uid, 'administrativo'::app_role)
       OR has_role(caller_uid, 'consultor_tecnico'::app_role)
       OR has_role(caller_uid, 'tecnico_agronomo'::app_role)
       OR has_role(caller_uid, 'aplicador'::app_role)
       OR has_role(caller_uid, 'producao'::app_role)
       OR has_role(caller_uid, 'financeiro'::app_role)
     )
  THEN
    RAISE EXCEPTION 'Sem autorização para criar notificação operacional'
      USING ERRCODE = '42501';
  END IF;

  -- Destinatário deve existir em profiles (evita cross-user injection para uuids inventados)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _usuario_id) THEN
    RAISE EXCEPTION 'Destinatário inexistente' USING ERRCODE = '23503';
  END IF;

  -- Idempotência transacional
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO existing_id
      FROM public.notificacoes_operacionais
     WHERE idempotency_key = _idempotency_key
     LIMIT 1;
    IF existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'created', false,
        'duplicated', true,
        'notification_id', existing_id
      );
    END IF;
  END IF;

  INSERT INTO public.notificacoes_operacionais
    (usuario_id, tipo, titulo, mensagem, link, source_type, source_id, idempotency_key)
  VALUES
    (_usuario_id, _tipo, _titulo, _mensagem, _link, _source_type, _source_id, _idempotency_key)
  RETURNING id INTO new_id;

  RETURN jsonb_build_object(
    'created', true,
    'duplicated', false,
    'notification_id', new_id
  );
EXCEPTION WHEN unique_violation THEN
  -- Corrida perdida na chave de idempotência: devolve o registro vencedor.
  SELECT id INTO existing_id
    FROM public.notificacoes_operacionais
   WHERE idempotency_key = _idempotency_key
   LIMIT 1;
  RETURN jsonb_build_object(
    'created', false,
    'duplicated', true,
    'notification_id', existing_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_notificacao_operacional(
  uuid, text, text, text, text, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_notificacao_operacional(
  uuid, text, text, text, text, text, uuid, text
) TO authenticated, service_role;

-- Remove assinatura antiga (5-args) da Fase 0.1 se existir — evita ambiguidade.
DROP FUNCTION IF EXISTS public.rpc_create_notificacao_operacional(uuid, text, text, text, text);

-- =============================================================
-- 2. portal_notificacoes
--    - Preserva enum real tipo_notificacao_portal
--    - Colunas aditivas (created_by, source_type, source_id, idempotency_key, link)
--    - RLS: bloqueia INSERT/DELETE direto; UPDATE simétrico por cliente
--    - RPC canônica com validação estrita
-- =============================================================

-- Confirma enum e não altera valores existentes (informativo, alerta, entrega, recomendacao, aplicacao, sistema).
DO $$
DECLARE
  v_expected text[] := ARRAY['informativo','alerta','entrega','recomendacao','aplicacao','sistema'];
  v_missing  text[];
BEGIN
  SELECT ARRAY(
    SELECT unnest(v_expected)
    EXCEPT
    SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'tipo_notificacao_portal'
  ) INTO v_missing;
  IF v_missing IS NOT NULL AND array_length(v_missing,1) > 0 THEN
    RAISE EXCEPTION
      'Enum tipo_notificacao_portal não contém: %. Aborte a migration e alinhe manualmente.',
      v_missing;
  END IF;
END $$;

ALTER TABLE public.portal_notificacoes
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='ux_portal_notif_idempotency'
  ) THEN
    CREATE UNIQUE INDEX ux_portal_notif_idempotency
      ON public.portal_notificacoes (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- Substitui todas as policies de escrita anteriores conhecidas.
DROP POLICY IF EXISTS "Portal users can update own notifications" ON public.portal_notificacoes;
DROP POLICY IF EXISTS "Admins can manage all notifications"       ON public.portal_notificacoes;
DROP POLICY IF EXISTS "Deny direct insert on portal_notificacoes" ON public.portal_notificacoes;
DROP POLICY IF EXISTS "Deny direct delete on portal_notificacoes" ON public.portal_notificacoes;

-- SELECT canônico: só o cliente enxerga suas notificações.
DROP POLICY IF EXISTS "Portal users can read own notifications" ON public.portal_notificacoes;
CREATE POLICY "Portal users can read own notifications"
  ON public.portal_notificacoes FOR SELECT TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user((SELECT auth.uid()))));

-- UPDATE simétrico: só marcar como lido / atualizar dentro do próprio cliente.
CREATE POLICY "Portal users can update own notifications"
  ON public.portal_notificacoes FOR UPDATE TO authenticated
  USING     (cliente_id = ANY(get_cliente_ids_for_user((SELECT auth.uid()))))
  WITH CHECK (cliente_id = ANY(get_cliente_ids_for_user((SELECT auth.uid()))));

-- INSERT/DELETE diretos negados para authenticated (apenas via RPC/service_role).
CREATE POLICY "Deny direct insert on portal_notificacoes"
  ON public.portal_notificacoes FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny direct delete on portal_notificacoes"
  ON public.portal_notificacoes FOR DELETE TO authenticated
  USING (false);

-- RPC canônica: SEM fallback undefined_column. Enum estrito.
CREATE OR REPLACE FUNCTION public.rpc_create_portal_notification_secure(
  _cliente_id uuid,
  _tipo text,
  _titulo text,
  _mensagem text,
  _link text DEFAULT NULL,
  _source_type text DEFAULT NULL,
  _source_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id uuid;
  existing_id uuid;
  caller_uid uuid := auth.uid();
  allowed_tipos public.tipo_notificacao_portal[] := ARRAY[
    'informativo','alerta','entrega','recomendacao','aplicacao','sistema'
  ]::public.tipo_notificacao_portal[];
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória' USING ERRCODE = '42501';
  END IF;

  IF _cliente_id IS NULL OR _tipo IS NULL OR _titulo IS NULL OR _mensagem IS NULL THEN
    RAISE EXCEPTION 'cliente_id, tipo, titulo e mensagem são obrigatórios' USING ERRCODE = '22023';
  END IF;

  -- Rejeita explicitamente valores fora do enum (visita/os/qualquer outro).
  IF NOT (_tipo::public.tipo_notificacao_portal = ANY(allowed_tipos)) THEN
    RAISE EXCEPTION 'Tipo % não permitido no enum tipo_notificacao_portal', _tipo
      USING ERRCODE = '22023';
  END IF;

  IF char_length(_titulo) > 200 THEN
    RAISE EXCEPTION 'Título excede 200 caracteres' USING ERRCODE = '22023';
  END IF;
  IF char_length(_mensagem) > 2000 THEN
    RAISE EXCEPTION 'Mensagem excede 2000 caracteres' USING ERRCODE = '22023';
  END IF;
  IF _link IS NOT NULL AND _link !~ '^/[A-Za-z0-9_\-./?=&%#]{0,500}$' THEN
    RAISE EXCEPTION 'Link inválido: apenas caminhos internos são aceitos' USING ERRCODE = '22023';
  END IF;

  -- Autorização por papel (staff)
  IF NOT (
    has_role(caller_uid, 'administrador'::app_role)
    OR has_role(caller_uid, 'gestor'::app_role)
    OR has_role(caller_uid, 'administrativo'::app_role)
    OR has_role(caller_uid, 'consultor_tecnico'::app_role)
    OR has_role(caller_uid, 'tecnico_agronomo'::app_role)
    OR has_role(caller_uid, 'aplicador'::app_role)
    OR has_role(caller_uid, 'producao'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem autorização para notificar portal' USING ERRCODE = '42501';
  END IF;

  -- Cliente precisa existir
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = _cliente_id) THEN
    RAISE EXCEPTION 'Cliente inexistente' USING ERRCODE = '23503';
  END IF;

  -- Se veio source_id, valida vínculo cross-client conforme source_type conhecido.
  IF _source_id IS NOT NULL AND _source_type IS NOT NULL THEN
    IF _source_type = 'registro_consultor' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.registros_consultor
         WHERE id = _source_id AND cliente_id = _cliente_id
      ) THEN
        RAISE EXCEPTION 'source_id não pertence ao cliente_id informado' USING ERRCODE = '42501';
      END IF;
    ELSIF _source_type = 'ordem_servico' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.ordens_servico
         WHERE id = _source_id AND cliente_id = _cliente_id
      ) THEN
        RAISE EXCEPTION 'source_id não pertence ao cliente_id informado' USING ERRCODE = '42501';
      END IF;
    ELSIF _source_type = 'aplicacao' THEN
      IF NOT EXISTS (
        SELECT 1
          FROM public.aplicacoes a
          JOIN public.ordens_servico os ON os.id = a.ordem_servico_id
         WHERE a.id = _source_id AND os.cliente_id = _cliente_id
      ) THEN
        RAISE EXCEPTION 'source_id não pertence ao cliente_id informado' USING ERRCODE = '42501';
      END IF;
    END IF;
    -- Outros source_type ficam livres até serem catalogados (não travam cadastro).
  END IF;

  -- Idempotência
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO existing_id
      FROM public.portal_notificacoes
     WHERE idempotency_key = _idempotency_key
     LIMIT 1;
    IF existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'created', false,
        'duplicated', true,
        'notification_id', existing_id
      );
    END IF;
  END IF;

  INSERT INTO public.portal_notificacoes
    (cliente_id, tipo, titulo, mensagem, link, created_by, source_type, source_id, idempotency_key)
  VALUES
    (_cliente_id, _tipo::public.tipo_notificacao_portal, _titulo, _mensagem,
     _link, caller_uid, _source_type, _source_id, _idempotency_key)
  RETURNING id INTO new_id;

  RETURN jsonb_build_object(
    'created', true,
    'duplicated', false,
    'notification_id', new_id
  );
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO existing_id
    FROM public.portal_notificacoes
   WHERE idempotency_key = _idempotency_key
   LIMIT 1;
  RETURN jsonb_build_object(
    'created', false,
    'duplicated', true,
    'notification_id', existing_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_portal_notification_secure(
  uuid, text, text, text, text, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_portal_notification_secure(
  uuid, text, text, text, text, text, uuid, text
) TO authenticated, service_role;

-- Remove assinatura curta legada (5-args) se existir
DROP FUNCTION IF EXISTS public.rpc_create_portal_notification_secure(uuid, text, text, text, text);

-- =============================================================
-- 3. aplicacao_emails
--    - CHECK enum de status (inclui 'enviado' legado)
--    - INSERT direto negado; escrita apenas via RPC (server-side pela Edge Function)
--    - SELECT reforçado por vínculo aplicação → cliente do usuário
-- =============================================================

-- Ajusta CHECK preservando dados legados que usavam 'enviado'.
ALTER TABLE public.aplicacao_emails
  DROP CONSTRAINT IF EXISTS aplicacao_emails_status_chk;
ALTER TABLE public.aplicacao_emails
  ADD CONSTRAINT aplicacao_emails_status_chk
  CHECK (status IN (
    'queued','pending','sent','failed','link_generated_no_send','enviado'
  ));

ALTER TABLE public.aplicacao_emails
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='ux_aplicacao_emails_idempotency'
  ) THEN
    CREATE UNIQUE INDEX ux_aplicacao_emails_idempotency
      ON public.aplicacao_emails (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- Substitui todas as policies conhecidas.
DROP POLICY IF EXISTS "Users can record sent emails"          ON public.aplicacao_emails;
DROP POLICY IF EXISTS "Staff can record own aplicacao_emails" ON public.aplicacao_emails;
DROP POLICY IF EXISTS "Deny direct insert on aplicacao_emails" ON public.aplicacao_emails;
DROP POLICY IF EXISTS "Deny direct update on aplicacao_emails" ON public.aplicacao_emails;
DROP POLICY IF EXISTS "Deny direct delete on aplicacao_emails" ON public.aplicacao_emails;

CREATE POLICY "Deny direct insert on aplicacao_emails"
  ON public.aplicacao_emails FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY "Deny direct update on aplicacao_emails"
  ON public.aplicacao_emails FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "Deny direct delete on aplicacao_emails"
  ON public.aplicacao_emails FOR DELETE TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION public.rpc_record_aplicacao_email(
  _aplicacao_id uuid,
  _email text,
  _status text DEFAULT 'queued',
  _idempotency_key text DEFAULT NULL,
  _enviado_por uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id uuid;
  existing_id uuid;
  caller_uid uuid := auth.uid();
  allowed text[] := ARRAY[
    'queued','pending','sent','failed','link_generated_no_send','enviado'
  ];
  final_author uuid;
BEGIN
  IF _aplicacao_id IS NULL OR _email IS NULL THEN
    RAISE EXCEPTION 'aplicacao_id e email são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF NOT (_status = ANY(allowed)) THEN
    RAISE EXCEPTION 'status % inválido', _status USING ERRCODE = '22023';
  END IF;
  IF _email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR char_length(_email) > 320 THEN
    RAISE EXCEPTION 'e-mail inválido' USING ERRCODE = '22023';
  END IF;

  -- Autoria: SEMPRE derivada server-side. Se veio caller autenticado, ele é o autor.
  -- Se veio via service_role (Edge Function), pode informar _enviado_por (opcional).
  final_author := COALESCE(caller_uid, _enviado_por);

  -- Se autenticado, valida vínculo à aplicação (dono ou staff).
  IF caller_uid IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.aplicacoes a
      WHERE a.id = _aplicacao_id
        AND (
          a.responsavel_id = caller_uid
          OR a.created_by  = caller_uid
        )
    ) AND NOT (
      has_role(caller_uid, 'administrador'::app_role)
      OR has_role(caller_uid, 'gestor'::app_role)
      OR has_role(caller_uid, 'administrativo'::app_role)
      OR has_role(caller_uid, 'consultor_tecnico'::app_role)
      OR has_role(caller_uid, 'aplicador'::app_role)
    ) THEN
      RAISE EXCEPTION 'Sem vínculo com a aplicação' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Chamada não autenticada: garante que a aplicação existe (edge cases).
    IF NOT EXISTS (SELECT 1 FROM public.aplicacoes WHERE id = _aplicacao_id) THEN
      RAISE EXCEPTION 'Aplicação inexistente' USING ERRCODE = '23503';
    END IF;
  END IF;

  -- Idempotência
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO existing_id
      FROM public.aplicacao_emails
     WHERE idempotency_key = _idempotency_key
     LIMIT 1;
    IF existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'created', false,
        'duplicated', true,
        'record_id', existing_id
      );
    END IF;
  END IF;

  INSERT INTO public.aplicacao_emails
    (aplicacao_id, email, status, enviado_por, idempotency_key)
  VALUES
    (_aplicacao_id, _email, _status, final_author, _idempotency_key)
  RETURNING id INTO new_id;

  RETURN jsonb_build_object(
    'created', true,
    'duplicated', false,
    'record_id', new_id
  );
EXCEPTION WHEN unique_violation THEN
  SELECT id INTO existing_id
    FROM public.aplicacao_emails
   WHERE idempotency_key = _idempotency_key
   LIMIT 1;
  RETURN jsonb_build_object(
    'created', false,
    'duplicated', true,
    'record_id', existing_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_aplicacao_email(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_record_aplicacao_email(uuid, text, text, text, uuid)
  TO authenticated, service_role;

-- Remove assinatura curta legada
DROP FUNCTION IF EXISTS public.rpc_record_aplicacao_email(uuid, text, text);

-- =============================================================
-- 4. monitoramento_avisos
--    - data_referencia DATE NORMAL (não GENERATED) preenchida no servidor
--    - Backfill em America/Sao_Paulo
--    - Unique (registro_consultor_id, tipo, data_referencia)
--    - Trigger BEFORE INSERT preenche data_referencia se NULL
--    - RLS: SELECT autenticado (mantido); escrita negada para authenticated
-- =============================================================

-- Se a Fase 0.1 tiver criado uma coluna GENERATED, remove-a para reintroduzir como normal.
DO $$
DECLARE
  is_generated text;
BEGIN
  SELECT attgenerated::text INTO is_generated
    FROM pg_attribute
   WHERE attrelid = 'public.monitoramento_avisos'::regclass
     AND attname  = 'data_referencia'
     AND NOT attisdropped;
  IF is_generated IS NOT NULL AND is_generated <> '' THEN
    -- Precisa remover o índice unique dependente antes.
    EXECUTE 'DROP INDEX IF EXISTS public.ux_monitoramento_avisos_dia';
    EXECUTE 'ALTER TABLE public.monitoramento_avisos DROP COLUMN data_referencia';
  END IF;
END $$;

ALTER TABLE public.monitoramento_avisos
  ADD COLUMN IF NOT EXISTS data_referencia date;

-- Backfill em America/Sao_Paulo
UPDATE public.monitoramento_avisos
   SET data_referencia = (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE data_referencia IS NULL
   AND enviado_em IS NOT NULL;

-- Registros extremamente antigos sem enviado_em: usa CURRENT_DATE (BR).
UPDATE public.monitoramento_avisos
   SET data_referencia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE data_referencia IS NULL;

ALTER TABLE public.monitoramento_avisos
  ALTER COLUMN data_referencia SET NOT NULL;

-- Trigger de preenchimento server-side
CREATE OR REPLACE FUNCTION public.tg_monitoramento_avisos_set_dref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.data_referencia IS NULL THEN
    NEW.data_referencia :=
      (COALESCE(NEW.enviado_em, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_monitoramento_avisos_set_dref
  ON public.monitoramento_avisos;
CREATE TRIGGER trg_monitoramento_avisos_set_dref
  BEFORE INSERT ON public.monitoramento_avisos
  FOR EACH ROW EXECUTE FUNCTION public.tg_monitoramento_avisos_set_dref();

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

-- RLS: escrita negada explicitamente para authenticated (service_role passa).
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

-- =============================================================
-- 5. Grants (defensivos — RLS continua a última palavra)
-- =============================================================
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
