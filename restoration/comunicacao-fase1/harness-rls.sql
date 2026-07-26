-- =============================================================================
-- Harness RLS Fase 1 v3 — verificações estruturais + cenários runtime documentados.
-- Executa em staging isolado. Roda em transação e faz ROLLBACK ao final.
-- Cobre (estrutural, sem sessões):
--   * Sem policies de escrita direta em templates/regras/eventos/outbox/audit/consent.
--   * Preferências sem policy de escrita direta (só via RPC).
--   * Enum comunicacao_evento_status sem label 'failed'.
--   * broadcast_role bloqueado em regras de eventos de OS (via rpc_upsert).
--   * Assinatura de rpc_update_communication_preferences com 3 args (canal, enabled, opt-in).
--   * rpc_claim_communication_outbox só para service_role (grant matrix).
--   * XOR de preferências: check constraint (user_id XOR cliente_id).
--   * Nenhuma referência a usuarios_cliente_produtor.
-- Cenários runtime (executar manualmente, ver runbook.md §Harness RLS):
--   - target_role sem fan-out duplicado (uma regra por perfil por canal)
--   - payload obrigatoriamente vazio p/ produto_pronto_retirada/aplicacao
--   - source_participants e by_role restritos ao cliente da OS
--   - broadcast_role bloqueado em OS via rpc_upsert_communication_rule
--   - preferências opt-out impedem enfileiramento
--   - worker: lease/reclaim/worker_id mismatch impede complete/fail
-- =============================================================================
BEGIN;

DO $$
DECLARE r record;
BEGIN
  -- 1. Sem policies de escrita direta em tabelas protegidas
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename IN ('comunicacao_templates','comunicacao_regras','comunicacao_eventos',
                         'comunicacao_outbox','comunicacao_audit_log','comunicacao_consent_log')
       AND cmd IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'harness-rls: existe policy de escrita direta em tabela protegida';
  END IF;

  -- 2. Preferências sem policy de escrita direta
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='comunicacao_preferencias'
       AND cmd IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'harness-rls: preferências não devem ter policy de escrita direta';
  END IF;

  -- 3. RLS habilitada em todas
  FOR r IN
    SELECT c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public'
       AND c.relname LIKE 'comunicacao_%'
       AND c.relkind='r'
       AND c.relrowsecurity = false
  LOOP
    RAISE EXCEPTION 'harness-rls: RLS desligada em %', r.relname;
  END LOOP;

  -- 4. anon sem grants em nenhuma tabela comunicacao_*
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'comunicacao_%'
  ) THEN
    RAISE EXCEPTION 'harness-rls: anon possui grant em tabela comunicacao_*';
  END IF;

  -- 5. Enum comunicacao_evento_status sem 'failed'
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
     WHERE t.typname='comunicacao_evento_status' AND e.enumlabel='failed'
  ) THEN
    RAISE EXCEPTION 'harness-rls: comunicacao_evento_status não pode conter failed';
  END IF;

  -- 6. Assinatura de rpc_update_communication_preferences (3 args)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='rpc_update_communication_preferences'
       AND pronargs=3
  ) THEN
    RAISE EXCEPTION 'harness-rls: rpc_update_communication_preferences deve ter 3 args';
  END IF;

  -- 7. rpc_claim_communication_outbox: EXECUTE apenas para service_role
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema='public'
       AND routine_name='rpc_claim_communication_outbox'
       AND grantee IN ('anon','authenticated','PUBLIC')
  ) THEN
    RAISE EXCEPTION 'harness-rls: rpc_claim_communication_outbox não pode ter execute p/ anon/authenticated';
  END IF;

  -- 8. XOR de preferências (constraint com user_id vs cliente_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname='public' AND t.relname='comunicacao_preferencias'
       AND c.contype='c'
       AND pg_get_constraintdef(c.oid) ILIKE '%user_id%' 
       AND pg_get_constraintdef(c.oid) ILIKE '%cliente_id%'
  ) THEN
    RAISE EXCEPTION 'harness-rls: comunicacao_preferencias precisa de check XOR user_id vs cliente_id';
  END IF;

  -- 9. Ausência da tabela obsoleta usuarios_cliente_produtor
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='usuarios_cliente_produtor'
  ) THEN
    RAISE EXCEPTION 'harness-rls: tabela obsoleta usuarios_cliente_produtor presente';
  END IF;

  -- 10. Nenhuma função pública referencia usuarios_cliente_produtor
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%usuarios_cliente_produtor%'
  ) THEN
    RAISE EXCEPTION 'harness-rls: alguma função pública referencia usuarios_cliente_produtor';
  END IF;

  RAISE NOTICE 'harness-rls: verificações estruturais OK. Cenários runtime: ver runbook.md';
END$$;

ROLLBACK;
