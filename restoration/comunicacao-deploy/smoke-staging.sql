-- smoke-staging.sql — smoke ESTRITAMENTE read-only/de contrato.
-- BEGIN/ROLLBACK; sem simular auth.uid(); sem desabilitar RLS; sem
-- captura de exceção sentinela; sem chamar RPCs que dependem de authorização.

\set ON_ERROR_STOP on
BEGIN;

-- ============================================================
-- 1) Assinaturas obrigatórias (Fase 2 v2) — via to_regprocedure
-- ============================================================
DO $$
DECLARE
  v_needed text[] := ARRAY[
    'public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)',
    'public.rpc_set_communication_template_metadata(uuid,text,text,jsonb,text)',
    'public.rpc_preview_administrative_broadcast_count(public.app_role)',
    'public.rpc_resolve_outbox_address(uuid)',
    'public.rpc_skip_communication_delivery(uuid,text,text)',
    'public.rpc_cancel_communication_delivery(uuid,text,text)',
    'public.rpc_defer_communication_delivery(uuid,text,text,integer)',
    'public.rpc_fail_communication_delivery_v2(uuid,text,text,text,boolean)',
    'public.rpc_dispatch_inapp_notification(uuid,uuid,uuid,text,text)',
    'public.rpc_create_portal_notification_secure(uuid,text,text,text)',
    'public.rpc_create_operational_notification_secure(uuid,text,text,text,text)'
  ];
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY v_needed LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'smoke: assinatura ausente %', v_sig;
    END IF;
  END LOOP;
  RAISE NOTICE 'smoke: assinaturas OK';
END $$;

-- ============================================================
-- 2) Tipos de retorno mínimos via pg_proc (deterministicos)
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  SELECT prorettype::regtype::text AS t INTO r
  FROM pg_proc
  WHERE oid = to_regprocedure('public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)');
  IF r.t <> 'jsonb' THEN
    RAISE EXCEPTION 'smoke: rpc_publish_communication_event_v2 deve retornar jsonb, retorna %', r.t;
  END IF;

  SELECT prorettype::regtype::text AS t INTO r
  FROM pg_proc
  WHERE oid = to_regprocedure('public.rpc_resolve_outbox_address(uuid)');
  IF r.t <> 'jsonb' THEN
    RAISE EXCEPTION 'smoke: rpc_resolve_outbox_address deve retornar jsonb, retorna %', r.t;
  END IF;

  RAISE NOTICE 'smoke: tipos de retorno OK';
END $$;

-- ============================================================
-- 3) Grants POSITIVOS exatos
--    UI RPCs → authenticated (EXECUTE); Worker RPCs → service_role (EXECUTE)
-- ============================================================
DO $$
DECLARE
  v_ui   text[] := ARRAY[
    'rpc_publish_communication_event_v2',
    'rpc_set_communication_template_metadata',
    'rpc_preview_administrative_broadcast_count'
  ];
  v_wrk  text[] := ARRAY[
    'rpc_resolve_outbox_address',
    'rpc_skip_communication_delivery',
    'rpc_cancel_communication_delivery',
    'rpc_defer_communication_delivery',
    'rpc_fail_communication_delivery_v2',
    'rpc_dispatch_inapp_notification'
  ];
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY v_ui LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
      WHERE routine_schema='public' AND routine_name=v_fn
        AND grantee='authenticated' AND privilege_type='EXECUTE'
    ) THEN
      RAISE EXCEPTION 'smoke: falta EXECUTE para authenticated em %', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY v_wrk LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
      WHERE routine_schema='public' AND routine_name=v_fn
        AND grantee='service_role' AND privilege_type='EXECUTE'
    ) THEN
      RAISE EXCEPTION 'smoke: falta EXECUTE para service_role em %', v_fn;
    END IF;
  END LOOP;

  RAISE NOTICE 'smoke: grants positivos OK';
END $$;

-- ============================================================
-- 4) Grants NEGATIVOS exatos — anon nunca deve ter EXECUTE
-- ============================================================
DO $$
DECLARE
  v_all text[] := ARRAY[
    'rpc_publish_communication_event_v2',
    'rpc_set_communication_template_metadata',
    'rpc_preview_administrative_broadcast_count',
    'rpc_resolve_outbox_address',
    'rpc_skip_communication_delivery',
    'rpc_cancel_communication_delivery',
    'rpc_defer_communication_delivery',
    'rpc_fail_communication_delivery_v2',
    'rpc_dispatch_inapp_notification',
    'rpc_create_portal_notification_secure',
    'rpc_create_operational_notification_secure'
  ];
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY v_all LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
      WHERE routine_schema='public' AND routine_name=v_fn
        AND grantee='anon' AND privilege_type='EXECUTE'
    ) THEN
      RAISE EXCEPTION 'smoke: anon possui EXECUTE indevido em %', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'smoke: grants negativos (anon) OK';
END $$;

-- ============================================================
-- 5) RLS habilitada nas tabelas centrais do módulo
-- ============================================================
DO $$
DECLARE
  v_tbls text[] := ARRAY[
    'comunicacao_templates','comunicacao_regras','comunicacao_eventos',
    'comunicacao_outbox','comunicacao_preferencias','comunicacao_audit_log',
    'comunicacao_consent_log','comunicacao_inapp_dispatch'
  ];
  v_t text;
  v_enabled boolean;
BEGIN
  FOREACH v_t IN ARRAY v_tbls LOOP
    IF to_regclass('public.'||v_t) IS NULL THEN
      RAISE EXCEPTION 'smoke: tabela ausente public.%', v_t;
    END IF;
    SELECT c.relrowsecurity INTO v_enabled
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=v_t;
    IF NOT v_enabled THEN
      RAISE EXCEPTION 'smoke: RLS desligada em public.%', v_t;
    END IF;
  END LOOP;
  RAISE NOTICE 'smoke: RLS habilitada nas tabelas do módulo';
END $$;

-- ============================================================
-- 6) Triggers Fase 2 presentes (OS regular + on-farm)
-- ============================================================
DO $$
DECLARE
  v_trg text[] := ARRAY[
    'trg_comunicacao_os_pronto_retirada',
    'trg_comunicacao_os_onfarm_pronto_retirada'
  ];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_trg LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=v_name AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'smoke: trigger ausente %', v_name;
    END IF;
  END LOOP;
  RAISE NOTICE 'smoke: triggers Fase 2 OK';
END $$;

-- ============================================================
-- 7) Constraints essenciais em comunicacao_templates
-- ============================================================
DO $$
DECLARE
  v_cons text[] := ARRAY[
    'comunicacao_templates_email_assunto_chk',
    'comunicacao_templates_whatsapp_meta_chk',
    'comunicacao_templates_non_whatsapp_meta_chk',
    'comunicacao_templates_provider_status_chk'
  ];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_cons LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname='comunicacao_templates' AND c.conname=v_name
    ) THEN
      RAISE EXCEPTION 'smoke: constraint ausente %', v_name;
    END IF;
  END LOOP;
  RAISE NOTICE 'smoke: constraints comunicacao_templates OK';
END $$;

-- ============================================================
-- 8) Presença contratual de validações críticas no fonte das RPCs
--    (verificação determinística por pg_get_functiondef)
-- ============================================================
DO $$
DECLARE
  v_src text;
BEGIN
  v_src := pg_get_functiondef(to_regprocedure(
    'public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)'));
  IF v_src IS NULL OR position('idempotency_key' IN v_src) = 0 THEN
    RAISE EXCEPTION 'smoke: rpc_publish_communication_event_v2 sem menção a idempotency_key';
  END IF;

  v_src := pg_get_functiondef(to_regprocedure(
    'public.rpc_set_communication_template_metadata(uuid,text,text,jsonb,text)'));
  IF v_src IS NULL OR position('parameter_mapping' IN v_src) = 0 THEN
    RAISE EXCEPTION 'smoke: rpc_set_communication_template_metadata sem menção a parameter_mapping';
  END IF;
  RAISE NOTICE 'smoke: validações críticas presentes no fonte das RPCs';
END $$;

-- Nunca comitar: smoke read-only.
ROLLBACK;
