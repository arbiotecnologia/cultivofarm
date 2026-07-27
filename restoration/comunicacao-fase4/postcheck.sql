-- Postcheck Fase 4 (read-only). Aborta se schema divergir da migration.
-- Transaction-neutral: não abre BEGIN próprio; caller usa --single-transaction.
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_col text;
  v_missing text;
  v_ret text;
  v_indexdef text;
  v_isunique boolean;
  v_msgid_chk text;
BEGIN
  -- Colunas novas em comunicacao_outbox
  FOREACH v_col IN ARRAY ARRAY[
    'provider_delivery_status','provider_status_at',
    'delivered_at','read_at','provider_failed_at'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='comunicacao_outbox'
         AND column_name=v_col
    ) THEN
      RAISE EXCEPTION 'postcheck: coluna ausente comunicacao_outbox.%', v_col;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname='comunicacao_outbox_provider_delivery_status_chk'
  ) THEN
    RAISE EXCEPTION 'postcheck: CHECK provider_delivery_status ausente';
  END IF;

  -- Índice UNIQUE parcial de correlação: precisa ser UNIQUE, sobre
  -- provider_message_id, com predicado canal='whatsapp' AND provider_message_id IS NOT NULL.
  SELECT indexdef INTO v_indexdef
    FROM pg_indexes
   WHERE schemaname='public'
     AND indexname='ix_comunicacao_outbox_wa_provider_msgid';
  IF v_indexdef IS NULL THEN
    RAISE EXCEPTION 'postcheck: índice ix_comunicacao_outbox_wa_provider_msgid ausente';
  END IF;
  SELECT indisunique INTO v_isunique
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname='ix_comunicacao_outbox_wa_provider_msgid';
  IF NOT COALESCE(v_isunique, false) THEN
    RAISE EXCEPTION 'postcheck: índice ix_comunicacao_outbox_wa_provider_msgid deve ser UNIQUE';
  END IF;
  IF position('provider_message_id' IN v_indexdef) = 0
     OR position('whatsapp' IN v_indexdef) = 0
     OR position('IS NOT NULL' IN v_indexdef) = 0 THEN
    RAISE EXCEPTION 'postcheck: predicado/coluna do índice divergem (indexdef=%)', v_indexdef;
  END IF;

  -- Tabela append-only
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='comunicacao_provider_receipts'
  ) THEN
    RAISE EXCEPTION 'postcheck: tabela comunicacao_provider_receipts ausente';
  END IF;

  -- outbox_id: NOT NULL + FK ON DELETE RESTRICT (retenção append-only explícita).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='comunicacao_provider_receipts'
       AND column_name='outbox_id' AND is_nullable='NO'
  ) THEN
    RAISE EXCEPTION 'postcheck: comunicacao_provider_receipts.outbox_id deve ser NOT NULL';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname='public'
       AND rel.relname='comunicacao_provider_receipts'
       AND c.contype='f'
       AND c.confdeltype='r'  -- 'r' = ON DELETE RESTRICT
       AND (SELECT attname FROM pg_attribute
             WHERE attrelid=rel.oid AND attnum=c.conkey[1]) = 'outbox_id'
  ) THEN
    RAISE EXCEPTION 'postcheck: FK outbox_id deve ser ON DELETE RESTRICT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='comunicacao_provider_receipts'
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'postcheck: RLS não habilitada em comunicacao_provider_receipts';
  END IF;

  -- CHECK de tamanho msgid alinhado a 200 chars.
  SELECT pg_get_constraintdef(oid) INTO v_msgid_chk
    FROM pg_constraint
   WHERE conname='comunicacao_provider_receipts_msgid_chk';
  IF v_msgid_chk IS NULL OR position('200' IN v_msgid_chk) = 0 THEN
    RAISE EXCEPTION 'postcheck: CHECK msgid deve limitar a 200 chars (def=%)', v_msgid_chk;
  END IF;

  -- Índice de idempotência único
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public'
       AND indexname='ux_comunicacao_provider_receipts_idem'
  ) THEN
    RAISE EXCEPTION 'postcheck: UNIQUE de idempotência ausente';
  END IF;

  -- Política admin SELECT presente (única)
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname='public' AND tablename='comunicacao_provider_receipts') <> 1 THEN
    RAISE EXCEPTION 'postcheck: número de policies inesperado em comunicacao_provider_receipts';
  END IF;

  -- Trigger append-only
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname='trg_comunicacao_provider_receipts_noupd'
  ) THEN
    RAISE EXCEPTION 'postcheck: trigger append-only ausente';
  END IF;

  -- Grants na tabela: authenticated=SELECT; service_role, anon, PUBLIC NÃO
  -- podem ter INSERT/UPDATE/DELETE diretos (escrita só via RPC SECURITY DEFINER).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='comunicacao_provider_receipts'
       AND grantee='authenticated' AND privilege_type='SELECT'
  ) THEN
    RAISE EXCEPTION 'postcheck: authenticated deve ter SELECT em receipts';
  END IF;
  FOREACH v_missing IN ARRAY ARRAY['anon','service_role','PUBLIC'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
       WHERE table_schema='public' AND table_name='comunicacao_provider_receipts'
         AND grantee=v_missing
         AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
    ) THEN
      RAISE EXCEPTION 'postcheck: % não pode ter DML direto em receipts', v_missing;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='comunicacao_provider_receipts'
       AND grantee='anon'
  ) THEN
    RAISE EXCEPTION 'postcheck: anon não pode ter privilégio algum em receipts';
  END IF;

  -- RPC service_role-only presente com tipo de retorno jsonb
  IF to_regprocedure('public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text)') IS NULL THEN
    RAISE EXCEPTION 'postcheck: rpc_record_whatsapp_delivery_status assinatura ausente';
  END IF;
  SELECT format_type(prorettype, NULL) INTO v_ret
    FROM pg_proc
   WHERE oid = to_regprocedure('public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text)');
  IF v_ret <> 'jsonb' THEN
    RAISE EXCEPTION 'postcheck: rpc_record_whatsapp_delivery_status deve retornar jsonb (retorna %)', v_ret;
  END IF;

  -- Grants: service_role possui EXECUTE; anon/authenticated NÃO possuem.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema='public'
       AND routine_name='rpc_record_whatsapp_delivery_status'
       AND grantee='service_role' AND privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'postcheck: falta EXECUTE service_role em rpc_record_whatsapp_delivery_status';
  END IF;
  FOREACH v_missing IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
       WHERE routine_schema='public'
         AND routine_name='rpc_record_whatsapp_delivery_status'
         AND grantee=v_missing AND privilege_type='EXECUTE'
    ) THEN
      RAISE EXCEPTION 'postcheck: % NÃO deve ter EXECUTE em rpc_record_whatsapp_delivery_status', v_missing;
    END IF;
  END LOOP;

  -- Enum comunicacao_outbox_status intacto (Fase 4 não muda)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
     WHERE t.typname='comunicacao_outbox_status' AND e.enumlabel='dead_letter'
  ) THEN
    RAISE EXCEPTION 'postcheck: enum comunicacao_outbox_status alterado inesperadamente';
  END IF;

  RAISE NOTICE 'postcheck Fase 4 OK';
END$$;
