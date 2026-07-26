-- =============================================================
-- Comunicação — FASE 0.2 (PROPOSTA, NÃO APLICADA) — revisão bloqueante
-- Substitui integralmente artefatos anteriores das Fases 0.1 e 0.2 iniciais.
--
-- Este arquivo é PROPOSTA. Ele NÃO é canônico enquanto não estiver em
-- supabase/migrations/ e registrado no histórico oficial do projeto.
-- Aplicar SOMENTE pelo runbook (restoration/comunicacao-fase02/runbook.md).
--
-- Aditivo, idempotente, transacional. Preserva dados existentes.
-- Nome sugerido no histórico oficial:
--   20260810000000_comunicacao_fase02_hardening.sql
-- =============================================================

BEGIN;

-- =============================================================
-- 0. Guardas
-- =============================================================
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

-- =============================================================
-- Helper: drop dinâmico de TODAS as policies INSERT/DELETE/ALL de uma tabela.
--   - Preserva SELECT e UPDATE (recriadas explicitamente adiante).
--   - Necessário porque nomes de policies legadas variam entre migrations.
-- =============================================================
CREATE OR REPLACE FUNCTION pg_temp._drop_write_policies(_schema text, _table text)
RETURNS void LANGUAGE plpgsql AS $$
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
END $$;

-- =============================================================
-- 1. notificacoes_operacionais
-- =============================================================

ALTER TABLE public.notificacoes_operacionais
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Idempotência: apaga eventuais duplicatas legadas antes de criar unique.
--  (Nova coluna nunca terá duplicatas; guarda por segurança.)
WITH d AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY idempotency_key ORDER BY created_at NULLS LAST, id) AS rn
    FROM public.notificacoes_operacionais
   WHERE idempotency_key IS NOT NULL
)
DELETE FROM public.notificacoes_operacionais x
 USING d
 WHERE x.id = d.id AND d.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public' AND indexname='ux_notif_op_idempotency') THEN
    CREATE UNIQUE INDEX ux_notif_op_idempotency
      ON public.notificacoes_operacionais (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- Drop dinâmico de todas as policies de escrita.
SELECT pg_temp._drop_write_policies('public','notificacoes_operacionais');
DROP POLICY IF EXISTS "user_update_own_notif_op" ON public.notificacoes_operacionais;

-- UPDATE simétrico (dono marca como lido)
CREATE POLICY "user_update_own_notif_op"
  ON public.notificacoes_operacionais
  FOR UPDATE TO authenticated
  USING     (usuario_id = (SELECT auth.uid()))
  WITH CHECK (usuario_id = (SELECT auth.uid()));

-- INSERT/DELETE negados para authenticated.
CREATE POLICY "Deny direct insert on notificacoes_operacionais"
  ON public.notificacoes_operacionais
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny direct delete on notificacoes_operacionais"
  ON public.notificacoes_operacionais
  FOR DELETE TO authenticated USING (false);

-- Assinaturas legadas fora
DROP FUNCTION IF EXISTS public.rpc_create_notificacao_operacional(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_create_notificacao_operacional(uuid, text, text, text, text, text, uuid, text);

-- RPC canônica: autorização server-side por evento.
-- Whitelist fechada de source_type. Para chamadas authenticated, source_type é OBRIGATÓRIO.
-- Chamadas SECURITY DEFINER internas (sem auth.uid()) mantêm liberdade controlada:
-- devem ser feitas apenas por outras RPCs SECURITY DEFINER auditadas nesta migration.
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id      uuid;
  existing_id uuid;
  caller_uid  uuid := auth.uid();
  st          text := lower(coalesce(_source_type, ''));
  allowed_source_types text[] := ARRAY[
    'registros_consultor',  -- alias canônico
    'registro_consultor',   -- alias legado aceito
    'ordem_servico',
    'aplicacao',
    'pedido_b2b',
    'esteira_producao',
    'monitoramento_vencido',
    'internal_cron'
  ];
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
  is_admin_caller boolean := false;
  is_staff_caller boolean := false;
  is_authorized   boolean := false;
  v_rc_owner uuid;
  v_rc_cli   uuid;
BEGIN
  ----------------------------------------------------------------
  -- Validação sintática
  ----------------------------------------------------------------
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
  IF _idempotency_key IS NOT NULL AND char_length(_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'idempotency_key excede 200 caracteres' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _usuario_id) THEN
    RAISE EXCEPTION 'Destinatário inexistente' USING ERRCODE = '23503';
  END IF;

  ----------------------------------------------------------------
  -- source_type/source_id são OBRIGATÓRIOS EM PAR para authenticated.
  -- (SECURITY DEFINER interno pode omitir; usa 'internal_cron'.)
  ----------------------------------------------------------------
  IF caller_uid IS NOT NULL THEN
    IF _source_type IS NULL OR _source_id IS NULL THEN
      RAISE EXCEPTION 'source_type e source_id são obrigatórios' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF _source_type IS NOT NULL AND NOT (st = ANY(allowed_source_types)) THEN
    RAISE EXCEPTION 'source_type % fora da whitelist', _source_type USING ERRCODE = '22023';
  END IF;

  ----------------------------------------------------------------
  -- Autorização por papel do caller
  ----------------------------------------------------------------
  IF caller_uid IS NULL THEN
    -- Chamada interna via SECURITY DEFINER (ex.: RPC de cron). Autorizada.
    is_authorized := true;
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
      RAISE EXCEPTION 'Sem papel operacional para criar notificação' USING ERRCODE = '42501';
    END IF;

    -- Administrador atua globalmente.
    IF is_admin_caller THEN
      is_authorized := true;
    ELSE
      -- Autorização por evento
      IF st IN ('registros_consultor','registro_consultor') THEN
        SELECT consultor_responsavel, cliente_id
          INTO v_rc_owner, v_rc_cli
          FROM public.registros_consultor
         WHERE id = _source_id;
        IF v_rc_owner IS NULL AND v_rc_cli IS NULL THEN
          RAISE EXCEPTION 'source_id não encontrado em registros_consultor' USING ERRCODE = '23503';
        END IF;
        -- Caller precisa ter vínculo: dono do registro OU staff aprovador (gestor/administrativo)
        IF caller_uid = v_rc_owner
           OR has_role(caller_uid, 'gestor'::app_role)
           OR has_role(caller_uid, 'administrativo'::app_role)
        THEN
          -- Destinatário permitido: (a) o próprio caller, (b) o consultor responsável,
          --                        (c) qualquer usuário com papel gestor/administrador/administrativo.
          IF _usuario_id = caller_uid
             OR _usuario_id = v_rc_owner
             OR has_role(_usuario_id, 'gestor'::app_role)
             OR has_role(_usuario_id, 'administrador'::app_role)
             OR has_role(_usuario_id, 'administrativo'::app_role)
          THEN
            is_authorized := true;
          END IF;
        END IF;

      ELSIF st = 'ordem_servico' THEN
        IF NOT EXISTS (SELECT 1 FROM public.ordens_servico WHERE id = _source_id) THEN
          RAISE EXCEPTION 'source_id não encontrado em ordens_servico' USING ERRCODE = '23503';
        END IF;
        -- Apenas gestor/administrativo pode disparar notificações operacionais por OS
        -- (fluxos de aplicador/produção rodam via triggers SECURITY DEFINER).
        IF has_role(caller_uid, 'gestor'::app_role)
           OR has_role(caller_uid, 'administrativo'::app_role)
        THEN
          is_authorized := true;
        END IF;

      ELSIF st = 'aplicacao' THEN
        IF NOT EXISTS (SELECT 1 FROM public.aplicacoes WHERE id = _source_id) THEN
          RAISE EXCEPTION 'source_id não encontrado em aplicacoes' USING ERRCODE = '23503';
        END IF;
        IF has_role(caller_uid, 'gestor'::app_role)
           OR has_role(caller_uid, 'administrativo'::app_role)
           OR has_role(caller_uid, 'aplicador'::app_role)
        THEN
          is_authorized := true;
        END IF;

      ELSIF st IN ('pedido_b2b','esteira_producao') THEN
        -- Escopos B2B/produção: gestor/administrativo/producao/financeiro.
        IF has_role(caller_uid, 'gestor'::app_role)
           OR has_role(caller_uid, 'administrativo'::app_role)
           OR has_role(caller_uid, 'producao'::app_role)
           OR has_role(caller_uid, 'financeiro'::app_role)
        THEN
          is_authorized := true;
        END IF;

      ELSIF st IN ('monitoramento_vencido','internal_cron') THEN
        -- Reservado ao caminho SECURITY DEFINER. authenticated não pode usar diretamente.
        RAISE EXCEPTION 'source_type % reservado a cron interno', _source_type USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF NOT is_authorized THEN
    RAISE EXCEPTION 'Sem autorização para este evento' USING ERRCODE = '42501';
  END IF;

  ----------------------------------------------------------------
  -- Idempotência e insert
  ----------------------------------------------------------------
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO existing_id
      FROM public.notificacoes_operacionais
     WHERE idempotency_key = _idempotency_key
     LIMIT 1;
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
  SELECT id INTO existing_id
    FROM public.notificacoes_operacionais
   WHERE idempotency_key = _idempotency_key
   LIMIT 1;
  RETURN jsonb_build_object('created', false, 'duplicated', true, 'notification_id', existing_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_notificacao_operacional(
  uuid, text, text, text, text, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_notificacao_operacional(
  uuid, text, text, text, text, text, uuid, text
) TO authenticated, service_role;

-- =============================================================
-- 2. portal_notificacoes
-- =============================================================

-- Verifica enum canônico
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

-- Dedup preventivo
WITH d AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY idempotency_key ORDER BY created_at NULLS LAST, id) rn
    FROM public.portal_notificacoes WHERE idempotency_key IS NOT NULL
)
DELETE FROM public.portal_notificacoes x USING d WHERE x.id = d.id AND d.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public' AND indexname='ux_portal_notif_idempotency') THEN
    CREATE UNIQUE INDEX ux_portal_notif_idempotency
      ON public.portal_notificacoes (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;

-- Drop dinâmico de policies de escrita legadas
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

-- RPC portal: source_type/source_id OBRIGATÓRIOS EM PAR. Whitelist fechada.
-- Caller precisa: ser administrador OU staff com vínculo comprovado com a origem/cliente.
CREATE OR REPLACE FUNCTION public.rpc_create_portal_notification_secure(
  _cliente_id      uuid,
  _tipo            text,
  _titulo          text,
  _mensagem        text,
  _link            text DEFAULT NULL,
  _source_type     text DEFAULT NULL,
  _source_id       uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id      uuid;
  existing_id uuid;
  caller_uid  uuid := auth.uid();
  st          text := lower(coalesce(_source_type,''));
  allowed_source_types text[] := ARRAY['registros_consultor','ordem_servico','aplicacao'];
  allowed_tipos public.tipo_notificacao_portal[] := ARRAY[
    'informativo','alerta','entrega','recomendacao','aplicacao','sistema'
  ]::public.tipo_notificacao_portal[];
  is_admin_caller boolean := false;
  v_rc_cli uuid;
  v_rc_owner uuid;
  v_os_cli uuid;
  v_apl_cli uuid;
  is_authorized boolean := false;
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória' USING ERRCODE = '42501';
  END IF;
  IF _cliente_id IS NULL OR _tipo IS NULL OR _titulo IS NULL OR _mensagem IS NULL THEN
    RAISE EXCEPTION 'cliente_id, tipo, titulo e mensagem são obrigatórios' USING ERRCODE = '22023';
  END IF;

  -- source_type/source_id são OBRIGATÓRIOS EM PAR (nunca um sem o outro)
  IF (_source_type IS NULL) <> (_source_id IS NULL) THEN
    RAISE EXCEPTION 'source_type e source_id devem ser informados juntos' USING ERRCODE = '22023';
  END IF;
  IF _source_type IS NULL THEN
    RAISE EXCEPTION 'source_type/source_id são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF NOT (st = ANY(allowed_source_types)) THEN
    RAISE EXCEPTION 'source_type % fora da whitelist', _source_type USING ERRCODE = '22023';
  END IF;

  -- Validação sintática do restante
  IF NOT (_tipo::public.tipo_notificacao_portal = ANY(allowed_tipos)) THEN
    RAISE EXCEPTION 'Tipo % não permitido no enum tipo_notificacao_portal', _tipo USING ERRCODE = '22023';
  END IF;
  IF char_length(_titulo) > 200   THEN RAISE EXCEPTION 'Título excede 200 caracteres'   USING ERRCODE = '22023'; END IF;
  IF char_length(_mensagem) > 2000 THEN RAISE EXCEPTION 'Mensagem excede 2000 caracteres' USING ERRCODE = '22023'; END IF;
  IF _link IS NOT NULL AND _link !~ '^/[A-Za-z0-9_\-./?=&%#]{0,500}$' THEN
    RAISE EXCEPTION 'Link inválido: apenas caminhos internos são aceitos' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = _cliente_id) THEN
    RAISE EXCEPTION 'Cliente inexistente' USING ERRCODE = '23503';
  END IF;

  -- Autorização por evento
  is_admin_caller := has_role(caller_uid, 'administrador'::app_role);

  IF st = 'registros_consultor' THEN
    SELECT cliente_id, consultor_responsavel INTO v_rc_cli, v_rc_owner
      FROM public.registros_consultor WHERE id = _source_id;
    IF v_rc_cli IS NULL THEN
      RAISE EXCEPTION 'source_id não encontrado em registros_consultor' USING ERRCODE = '23503';
    END IF;
    IF v_rc_cli <> _cliente_id THEN
      RAISE EXCEPTION 'source_id pertence a outro cliente' USING ERRCODE = '42501';
    END IF;
    IF is_admin_caller
       OR caller_uid = v_rc_owner
       OR has_role(caller_uid, 'gestor'::app_role)
       OR has_role(caller_uid, 'administrativo'::app_role)
    THEN
      is_authorized := true;
    END IF;

  ELSIF st = 'ordem_servico' THEN
    SELECT cliente_id INTO v_os_cli FROM public.ordens_servico WHERE id = _source_id;
    IF v_os_cli IS NULL THEN
      RAISE EXCEPTION 'source_id não encontrado em ordens_servico' USING ERRCODE = '23503';
    END IF;
    IF v_os_cli <> _cliente_id THEN
      RAISE EXCEPTION 'source_id pertence a outro cliente' USING ERRCODE = '42501';
    END IF;
    IF is_admin_caller
       OR has_role(caller_uid, 'gestor'::app_role)
       OR has_role(caller_uid, 'administrativo'::app_role)
       OR has_role(caller_uid, 'aplicador'::app_role)
       OR has_role(caller_uid, 'producao'::app_role)
    THEN
      is_authorized := true;
    END IF;

  ELSIF st = 'aplicacao' THEN
    SELECT os.cliente_id INTO v_apl_cli
      FROM public.aplicacoes a
      JOIN public.ordens_servico os ON os.id = a.ordem_servico_id
     WHERE a.id = _source_id;
    IF v_apl_cli IS NULL THEN
      RAISE EXCEPTION 'source_id não encontrado em aplicacoes' USING ERRCODE = '23503';
    END IF;
    IF v_apl_cli <> _cliente_id THEN
      RAISE EXCEPTION 'source_id pertence a outro cliente' USING ERRCODE = '42501';
    END IF;
    IF is_admin_caller
       OR has_role(caller_uid, 'gestor'::app_role)
       OR has_role(caller_uid, 'administrativo'::app_role)
       OR has_role(caller_uid, 'aplicador'::app_role)
    THEN
      is_authorized := true;
    END IF;
  END IF;

  IF NOT is_authorized THEN
    RAISE EXCEPTION 'Sem vínculo/papel para notificar este cliente por %', _source_type USING ERRCODE = '42501';
  END IF;

  -- Idempotência
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
$$;

REVOKE ALL ON FUNCTION public.rpc_create_portal_notification_secure(
  uuid, text, text, text, text, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_portal_notification_secure(
  uuid, text, text, text, text, text, uuid, text
) TO authenticated, service_role;

-- =============================================================
-- 3. aplicacao_emails
-- =============================================================

-- Ajusta CHECK preservando dados legados que usavam 'enviado'.
ALTER TABLE public.aplicacao_emails DROP CONSTRAINT IF EXISTS aplicacao_emails_status_chk;
ALTER TABLE public.aplicacao_emails
  ADD CONSTRAINT aplicacao_emails_status_chk
  CHECK (status IN ('queued','pending','sent','failed','link_generated_no_send','enviado'));

ALTER TABLE public.aplicacao_emails
  ADD COLUMN IF NOT EXISTS idempotency_key text;

WITH d AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY idempotency_key ORDER BY created_at NULLS LAST, id) rn
    FROM public.aplicacao_emails WHERE idempotency_key IS NOT NULL
)
DELETE FROM public.aplicacao_emails x USING d WHERE x.id = d.id AND d.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public' AND indexname='ux_aplicacao_emails_idempotency') THEN
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

-- RPC: valida destinatário permitido (e-mail do cliente do OS) OU staff com override.
-- Permite EVOLUÇÃO de status por idempotency_key: failed/link_generated_no_send/queued/pending → sent.
CREATE OR REPLACE FUNCTION public.rpc_record_aplicacao_email(
  _aplicacao_id     uuid,
  _email            text,
  _status           text    DEFAULT 'queued',
  _idempotency_key  text    DEFAULT NULL,
  _enviado_por      uuid    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_uid   uuid := auth.uid();
  new_id       uuid;
  existing_id  uuid;
  existing_status text;
  final_author uuid;
  v_cli_email  text;
  v_cli_id     uuid;
  can_bypass   boolean := false;
  allowed      text[] := ARRAY['queued','pending','sent','failed','link_generated_no_send','enviado'];
  progressable text[] := ARRAY['queued','pending','failed','link_generated_no_send'];
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

  -- Autoria: derivada server-side.
  -- _enviado_por só é respeitado se a chamada NÃO é authenticated (service_role/internal).
  IF caller_uid IS NOT NULL THEN
    final_author := caller_uid;
  ELSE
    final_author := _enviado_por;
  END IF;

  -- Busca cliente da aplicação
  SELECT os.cliente_id, c.email
    INTO v_cli_id, v_cli_email
    FROM public.aplicacoes a
    JOIN public.ordens_servico os ON os.id = a.ordem_servico_id
    JOIN public.clientes c        ON c.id  = os.cliente_id
   WHERE a.id = _aplicacao_id;
  IF v_cli_id IS NULL THEN
    RAISE EXCEPTION 'Aplicação inexistente' USING ERRCODE = '23503';
  END IF;

  -- Autorização de vínculo à aplicação
  IF caller_uid IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.aplicacoes a
       WHERE a.id = _aplicacao_id
         AND (a.responsavel_id = caller_uid OR a.created_by = caller_uid)
    ) AND NOT (
      has_role(caller_uid, 'administrador'::app_role)
      OR has_role(caller_uid, 'gestor'::app_role)
      OR has_role(caller_uid, 'administrativo'::app_role)
      OR has_role(caller_uid, 'consultor_tecnico'::app_role)
      OR has_role(caller_uid, 'aplicador'::app_role)
    ) THEN
      RAISE EXCEPTION 'Sem vínculo com a aplicação' USING ERRCODE = '42501';
    END IF;
    -- Regra documentada: staff (administrador/gestor/administrativo) pode enviar para qualquer email.
    can_bypass := has_role(caller_uid, 'administrador'::app_role)
      OR has_role(caller_uid, 'gestor'::app_role)
      OR has_role(caller_uid, 'administrativo'::app_role);
  ELSE
    -- Chamada não autenticada (service_role): permite bypass.
    can_bypass := true;
  END IF;

  -- Destinatário deve ser o email cadastrado no cliente da aplicação, OU caller bypass.
  IF NOT can_bypass THEN
    IF v_cli_email IS NULL OR lower(v_cli_email) <> lower(_email) THEN
      RAISE EXCEPTION 'Destinatário não permitido para esta aplicação' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Idempotência com evolução de status controlada.
  IF _idempotency_key IS NOT NULL THEN
    SELECT id, status INTO existing_id, existing_status
      FROM public.aplicacao_emails
     WHERE idempotency_key = _idempotency_key
     LIMIT 1;
    IF existing_id IS NOT NULL THEN
      IF _status = 'sent' AND existing_status = ANY(progressable) THEN
        UPDATE public.aplicacao_emails
           SET status = 'sent',
               email = _email,
               enviado_por = COALESCE(enviado_por, final_author)
         WHERE id = existing_id;
        RETURN jsonb_build_object(
          'created', false, 'updated', true, 'record_id', existing_id, 'status', 'sent');
      END IF;
      RETURN jsonb_build_object(
        'created', false, 'duplicated', true, 'record_id', existing_id, 'status', existing_status);
    END IF;
  END IF;

  INSERT INTO public.aplicacao_emails
    (aplicacao_id, email, status, enviado_por, idempotency_key)
  VALUES
    (_aplicacao_id, _email, _status, final_author, _idempotency_key)
  RETURNING id INTO new_id;

  RETURN jsonb_build_object(
    'created', true, 'duplicated', false, 'record_id', new_id, 'status', _status);
EXCEPTION WHEN unique_violation THEN
  SELECT id, status INTO existing_id, existing_status FROM public.aplicacao_emails
   WHERE idempotency_key = _idempotency_key LIMIT 1;
  RETURN jsonb_build_object(
    'created', false, 'duplicated', true, 'record_id', existing_id, 'status', existing_status);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_aplicacao_email(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_record_aplicacao_email(uuid, text, text, text, uuid)
  TO authenticated, service_role;

-- =============================================================
-- 4. monitoramento_avisos + RPC transacional cron
-- =============================================================

-- Se a Fase 0.1 criou coluna GENERATED, remove para reintroduzir como normal.
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

ALTER TABLE public.monitoramento_avisos
  ADD COLUMN IF NOT EXISTS data_referencia date;

UPDATE public.monitoramento_avisos
   SET data_referencia = (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE data_referencia IS NULL AND enviado_em IS NOT NULL;

UPDATE public.monitoramento_avisos
   SET data_referencia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE data_referencia IS NULL;

ALTER TABLE public.monitoramento_avisos
  ALTER COLUMN data_referencia SET NOT NULL;

-- Dedup antes do unique
WITH d AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY registro_consultor_id, tipo, data_referencia
    ORDER BY enviado_em NULLS LAST, id
  ) rn FROM public.monitoramento_avisos
)
DELETE FROM public.monitoramento_avisos x USING d
 WHERE x.id = d.id AND d.rn > 1;

CREATE OR REPLACE FUNCTION public.tg_monitoramento_avisos_set_dref()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.data_referencia IS NULL THEN
    NEW.data_referencia :=
      (COALESCE(NEW.enviado_em, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_monitoramento_avisos_set_dref ON public.monitoramento_avisos;
CREATE TRIGGER trg_monitoramento_avisos_set_dref
  BEFORE INSERT ON public.monitoramento_avisos
  FOR EACH ROW EXECUTE FUNCTION public.tg_monitoramento_avisos_set_dref();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public' AND indexname='ux_monitoramento_avisos_dia') THEN
    CREATE UNIQUE INDEX ux_monitoramento_avisos_dia
      ON public.monitoramento_avisos (registro_consultor_id, tipo, data_referencia);
  END IF;
END $$;

-- Remove policies ALL/write residuais antes de recriar SELECT.
SELECT pg_temp._drop_write_policies('public','monitoramento_avisos');
DROP POLICY IF EXISTS "Visualização para usuários autenticados" ON public.monitoramento_avisos;
DROP POLICY IF EXISTS "Deny authenticated write on monitoramento_avisos"
  ON public.monitoramento_avisos;

CREATE POLICY "Deny authenticated write on monitoramento_avisos"
  ON public.monitoramento_avisos FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Visualização para usuários autenticados"
  ON public.monitoramento_avisos FOR SELECT TO authenticated
  USING (true);

-- RPC TRANSACIONAL: reserva + notificação em uma única transação.
--  - ON CONFLICT DO NOTHING na reserva; se 0 linhas → skipped.
--  - Só cria notificação operacional se reserva ocorreu.
--  - Consultor destinatário resolvido no servidor a partir do registro.
--  - Chamável apenas por administrador ou service_role (a Edge Function usa service).
CREATE OR REPLACE FUNCTION public.rpc_check_monitoramento_and_notify(
  _registro_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_uid uuid := auth.uid();
  v_consultor uuid;
  v_cliente uuid;
  v_data_prox date;
  v_talhao_id uuid;
  v_talhao_nome text;
  v_cliente_nome text;
  v_reserved_id uuid;
  v_notif_id uuid;
  v_hoje_br date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_idem text;
BEGIN
  -- Autorização
  IF caller_uid IS NOT NULL
     AND NOT has_role(caller_uid, 'administrador'::app_role) THEN
    RAISE EXCEPTION 'Sem autorização (cron interno ou administrador)' USING ERRCODE = '42501';
  END IF;

  IF _registro_id IS NULL THEN
    RAISE EXCEPTION 'registro_id obrigatório' USING ERRCODE = '22023';
  END IF;

  -- Trava e lê o registro com dados relacionados.
  SELECT r.consultor_responsavel, r.cliente_id, r.data_proxima_visita, r.talhao_id,
         t.nome, c.nome
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

  -- Reserva idempotente diária (unique registra + tipo + data_referencia).
  INSERT INTO public.monitoramento_avisos (registro_consultor_id, tipo, data_referencia)
  VALUES (_registro_id, 'vencido', v_hoje_br)
  ON CONFLICT (registro_consultor_id, tipo, data_referencia) DO NOTHING
  RETURNING id INTO v_reserved_id;

  IF v_reserved_id IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'duplicate');
  END IF;

  -- Notificação operacional na MESMA transação — se falhar, tudo é revertido.
  v_idem := format('monit-venc-%s-%s', _registro_id, v_hoje_br);
  INSERT INTO public.notificacoes_operacionais
    (usuario_id, tipo, titulo, mensagem, link, source_type, source_id, idempotency_key)
  VALUES (
    v_consultor,
    'alerta',
    'Monitoramento Vencido',
    format('A reavaliação do talhão %s (%s) venceu em %s.',
           coalesce(v_talhao_nome,'—'), coalesce(v_cliente_nome,'—'), v_data_prox),
    format('/visita-tecnica/%s', _registro_id),
    'monitoramento_vencido',
    _registro_id,
    v_idem
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_notif_id;

  -- Se colidiu com notificação já existente, resolve o ID
  IF v_notif_id IS NULL THEN
    SELECT id INTO v_notif_id FROM public.notificacoes_operacionais
     WHERE idempotency_key = v_idem LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'created', true,
    'aviso_id', v_reserved_id,
    'notification_id', v_notif_id,
    'consultor_id', v_consultor,
    'talhao_id', v_talhao_id,
    'talhao_nome', v_talhao_nome,
    'cliente_nome', v_cliente_nome
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_check_monitoramento_and_notify(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_check_monitoramento_and_notify(uuid) TO service_role;
-- authenticated NÃO recebe execute: acesso apenas via administrador é raro; se
-- necessário, roteie via Edge Function autenticada com bypass administrador.

-- =============================================================
-- 5. Grants (defensivos)
-- =============================================================
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
