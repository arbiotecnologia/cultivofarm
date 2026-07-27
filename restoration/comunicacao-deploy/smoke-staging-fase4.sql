-- smoke-staging-fase4.sql — checagens de contrato Fase 4 (read-only).
-- BEGIN/ROLLBACK. Não simula auth, não desabilita RLS, não chama RPCs autorizadas.
\set ON_ERROR_STOP on
BEGIN;

-- 1) Assinatura exata da RPC service_role-only.
DO $$
BEGIN
  IF to_regprocedure('public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text)') IS NULL THEN
    RAISE EXCEPTION 'smoke-f4: rpc_record_whatsapp_delivery_status assinatura ausente';
  END IF;
END $$;

-- 2) Tipo de retorno jsonb.
DO $$
DECLARE v_t text;
BEGIN
  SELECT prorettype::regtype::text INTO v_t
    FROM pg_proc
   WHERE oid = to_regprocedure('public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text)');
  IF v_t <> 'jsonb' THEN
    RAISE EXCEPTION 'smoke-f4: retorno esperado jsonb, obtido %', v_t;
  END IF;
END $$;

-- 3) Grants: service_role EXECUTE; anon/authenticated SEM EXECUTE.
DO $$
DECLARE v_g text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public'
       AND routine_name='rpc_record_whatsapp_delivery_status'
       AND grantee='service_role' AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'smoke-f4: falta EXECUTE service_role';
  END IF;
  FOREACH v_g IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
       WHERE routine_schema='public'
         AND routine_name='rpc_record_whatsapp_delivery_status'
         AND grantee=v_g AND privilege_type='EXECUTE'
    ) THEN
      RAISE EXCEPTION 'smoke-f4: % NÃO deve ter EXECUTE', v_g;
    END IF;
  END LOOP;
END $$;

-- 4) Tabela de recibos: existe, RLS ON, sem GRANT p/ anon.
DO $$
BEGIN
  IF to_regclass('public.comunicacao_provider_receipts') IS NULL THEN
    RAISE EXCEPTION 'smoke-f4: tabela comunicacao_provider_receipts ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='comunicacao_provider_receipts'
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'smoke-f4: RLS desligada em comunicacao_provider_receipts';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='comunicacao_provider_receipts'
       AND grantee='anon'
  ) THEN
    RAISE EXCEPTION 'smoke-f4: anon NÃO deve ter privilégio em comunicacao_provider_receipts';
  END IF;
END $$;

-- 5) Colunas novas em outbox + CHECK do enum de status do provedor.
DO $$
DECLARE v_col text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY[
    'provider_delivery_status','provider_status_at','delivered_at','read_at','provider_failed_at'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='comunicacao_outbox' AND column_name=v_col
    ) THEN
      RAISE EXCEPTION 'smoke-f4: coluna ausente comunicacao_outbox.%', v_col;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname='comunicacao_outbox_provider_delivery_status_chk'
  ) THEN
    RAISE EXCEPTION 'smoke-f4: CHECK provider_delivery_status ausente';
  END IF;
END $$;

-- 6) Trigger append-only nos recibos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname='trg_comunicacao_provider_receipts_noupd' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'smoke-f4: trigger append-only ausente';
  END IF;
END $$;

-- 7) Presença contratual no fonte da RPC (state machine + FOR UPDATE + idempotência).
DO $$
DECLARE v_src text;
BEGIN
  v_src := pg_get_functiondef(to_regprocedure(
    'public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text)'));
  IF v_src IS NULL OR position('FOR UPDATE' IN v_src) = 0 THEN
    RAISE EXCEPTION 'smoke-f4: RPC sem FOR UPDATE';
  END IF;
  IF position('ON CONFLICT' IN v_src) = 0 THEN
    RAISE EXCEPTION 'smoke-f4: RPC sem cláusula ON CONFLICT (idempotência)';
  END IF;
END $$;

ROLLBACK;
