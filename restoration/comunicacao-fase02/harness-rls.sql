-- Harness RLS para Comunicação Fase 0.2.
-- Executar como service_role em STAGING. Usa transações abortadas (ROLLBACK) para não sujar dados.
-- Cada seção define um "papel" via SET LOCAL role authenticated + jwt.claim.sub e valida
-- que:
--  a) INSERT direto nas 3 tabelas alvo é BLOQUEADO.
--  b) As RPCs funcionam para os papéis certos e falham para os papéis errados.
--  c) portal_notificacoes rejeita tipo fora do enum (visita/os).
--  d) idempotência responde created:false, duplicated:true no segundo call.
--
-- Pré-requisitos:
--   - Ambiente STAGING (nunca produção).
--   - Existe pelo menos: um perfil staff (consultor_tecnico), um cliente com produtor autenticado,
--     um registros_consultor e uma aplicação vinculada.
--   - Substitua os placeholders <STAFF_UID>, <PRODUTOR_UID>, <CLIENTE_ID>,
--     <REGISTRO_ID>, <APLICACAO_ID> pelas UUIDs reais das fixtures antes de executar.

\set ON_ERROR_STOP on
\echo '=== Harness RLS Comunicação Fase 0.2 (STAGING) ==='

-- Guarda anti-produção
DO $$
DECLARE
  marker text;
BEGIN
  SELECT current_setting('app.env', true) INTO marker;
  IF marker = 'production' THEN
    RAISE EXCEPTION 'Aborta: harness rodando em produção';
  END IF;
END $$;

-- ========== 1) INSERT direto autenticado deve falhar ==========
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';

  DO $$ BEGIN
    BEGIN
      INSERT INTO public.notificacoes_operacionais (usuario_id, tipo, titulo)
      VALUES ('<STAFF_UID>'::uuid, 'informativo', 'X');
      RAISE EXCEPTION 'FALHOU: INSERT direto em notificacoes_operacionais foi permitido';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'OK: INSERT direto em notificacoes_operacionais bloqueado';
    END;

    BEGIN
      INSERT INTO public.portal_notificacoes (cliente_id, titulo, mensagem, tipo)
      VALUES ('<CLIENTE_ID>'::uuid, 'X', 'Y', 'informativo');
      RAISE EXCEPTION 'FALHOU: INSERT direto em portal_notificacoes foi permitido';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'OK: INSERT direto em portal_notificacoes bloqueado';
    END;

    BEGIN
      INSERT INTO public.aplicacao_emails (aplicacao_id, email)
      VALUES ('<APLICACAO_ID>'::uuid, 'x@y.com');
      RAISE EXCEPTION 'FALHOU: INSERT direto em aplicacao_emails foi permitido';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'OK: INSERT direto em aplicacao_emails bloqueado';
    END;
  END $$;
ROLLBACK;

-- ========== 2) RPC portal rejeita tipos fora do enum ==========
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';
  DO $$ BEGIN
    BEGIN
      PERFORM public.rpc_create_portal_notification_secure(
        '<CLIENTE_ID>'::uuid, 'visita', 'x', 'y'
      );
      RAISE EXCEPTION 'FALHOU: tipo visita foi aceito';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'OK: tipo visita rejeitado (%)', SQLERRM;
    END;
    BEGIN
      PERFORM public.rpc_create_portal_notification_secure(
        '<CLIENTE_ID>'::uuid, 'os', 'x', 'y'
      );
      RAISE EXCEPTION 'FALHOU: tipo os foi aceito';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'OK: tipo os rejeitado (%)', SQLERRM;
    END;
  END $$;
ROLLBACK;

-- ========== 3) Idempotência portal ==========
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';
  SELECT public.rpc_create_portal_notification_secure(
    '<CLIENTE_ID>'::uuid, 'informativo', 'T', 'M',
    NULL, 'registro_consultor', '<REGISTRO_ID>'::uuid, 'harness-key-1'
  ) AS first_call;
  SELECT public.rpc_create_portal_notification_secure(
    '<CLIENTE_ID>'::uuid, 'informativo', 'T', 'M',
    NULL, 'registro_consultor', '<REGISTRO_ID>'::uuid, 'harness-key-1'
  ) AS second_call;
  -- Esperado: first_call.created=true, second_call.duplicated=true
ROLLBACK;

-- ========== 4) Cross-client source_id é rejeitado ==========
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';
  DO $$ BEGIN
    BEGIN
      PERFORM public.rpc_create_portal_notification_secure(
        '<CLIENTE_ID_A>'::uuid, 'informativo', 'x', 'y',
        NULL, 'registro_consultor', '<REGISTRO_ID_DE_CLIENTE_B>'::uuid, NULL
      );
      RAISE EXCEPTION 'FALHOU: cross-client source_id aceito';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'OK: cross-client rejeitado (%)', SQLERRM;
    END;
  END $$;
ROLLBACK;

-- ========== 5) Produtor (sem papel staff) NÃO cria notificações ==========
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<PRODUTOR_UID>';
  DO $$ BEGIN
    BEGIN
      PERFORM public.rpc_create_portal_notification_secure(
        '<CLIENTE_ID>'::uuid, 'informativo', 'x', 'y'
      );
      RAISE EXCEPTION 'FALHOU: produtor conseguiu criar portal_notificacao';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'OK: produtor bloqueado (%)', SQLERRM;
    END;

    BEGIN
      PERFORM public.rpc_create_notificacao_operacional(
        '<STAFF_UID>'::uuid, 'informativo', 'x', 'y'
      );
      RAISE EXCEPTION 'FALHOU: produtor conseguiu criar notificacao_operacional';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'OK: produtor bloqueado em operacional (%)', SQLERRM;
    END;
  END $$;
ROLLBACK;

-- ========== 6) monitoramento_avisos: escrita autenticada bloqueada ==========
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';
  DO $$ BEGIN
    BEGIN
      INSERT INTO public.monitoramento_avisos (registro_consultor_id, tipo)
      VALUES ('<REGISTRO_ID>'::uuid, 'vencido');
      RAISE EXCEPTION 'FALHOU: INSERT direto em monitoramento_avisos foi permitido';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'OK: monitoramento_avisos bloqueado para authenticated';
    END;
  END $$;
ROLLBACK;

-- ========== 7) service_role escreve normalmente em monitoramento_avisos ==========
BEGIN;
  RESET role;
  INSERT INTO public.monitoramento_avisos (registro_consultor_id, tipo)
  VALUES ('<REGISTRO_ID>'::uuid, 'vencido');
  -- Segundo insert com mesma chave (registro,tipo,data_referencia) deve violar unique.
  DO $$ BEGIN
    BEGIN
      INSERT INTO public.monitoramento_avisos (registro_consultor_id, tipo)
      VALUES ('<REGISTRO_ID>'::uuid, 'vencido');
      RAISE EXCEPTION 'FALHOU: unique de idempotência diária não funcionou';
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'OK: unique idempotência diária ativa';
    END;
  END $$;
ROLLBACK;

\echo '=== Harness concluído (verifique NOTICE acima) ==='
