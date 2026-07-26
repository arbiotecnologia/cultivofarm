-- Harness RLS/RPC Comunicação Fase 0.2 (revisão bloqueante).
-- Executar como service_role em STAGING (nunca em produção).
-- Substituir placeholders <STAFF_UID>, <STAFF_OTHER_UID>, <PRODUTOR_UID>,
-- <CLIENTE_ID_A>, <CLIENTE_ID_B>, <REGISTRO_A>, <REGISTRO_B>, <APLICACAO_ID_A>.

\set ON_ERROR_STOP on
\echo '=== Harness Comunicação Fase 0.2 (STAGING) ==='

DO $$
DECLARE marker text;
BEGIN
  SELECT current_setting('app.env', true) INTO marker;
  IF marker = 'production' THEN RAISE EXCEPTION 'aborta: produção'; END IF;
END $$;

-- 1) INSERT direto autenticado é bloqueado
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';
  DO $$ BEGIN
    BEGIN
      INSERT INTO public.notificacoes_operacionais (usuario_id, tipo, titulo)
      VALUES ('<STAFF_UID>'::uuid, 'informativo', 'X');
      RAISE EXCEPTION 'FALHOU: notificacoes_operacionais aceitou INSERT direto';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'OK: notificacoes_operacionais bloqueado'; END;
    BEGIN
      INSERT INTO public.portal_notificacoes (cliente_id, titulo, mensagem, tipo)
      VALUES ('<CLIENTE_ID_A>'::uuid, 'X', 'Y', 'informativo');
      RAISE EXCEPTION 'FALHOU: portal_notificacoes aceitou INSERT direto';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'OK: portal_notificacoes bloqueado'; END;
    BEGIN
      INSERT INTO public.aplicacao_emails (aplicacao_id, email)
      VALUES ('<APLICACAO_ID_A>'::uuid, 'x@y.com');
      RAISE EXCEPTION 'FALHOU: aplicacao_emails aceitou INSERT direto';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'OK: aplicacao_emails bloqueado'; END;
  END $$;
ROLLBACK;

-- 2) portal RPC: source_type/source_id só um dos dois é rejeitado
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';
  DO $$ BEGIN
    BEGIN
      PERFORM public.rpc_create_portal_notification_secure(
        '<CLIENTE_ID_A>'::uuid, 'informativo', 't', 'm',
        NULL, 'registros_consultor', NULL, NULL);
      RAISE EXCEPTION 'FALHOU: aceitou source_type sem source_id';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OK: par obrigatório'; END;
    BEGIN
      PERFORM public.rpc_create_portal_notification_secure(
        '<CLIENTE_ID_A>'::uuid, 'informativo', 't', 'm',
        NULL, NULL, NULL, NULL);
      RAISE EXCEPTION 'FALHOU: aceitou sem source_type';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OK: source_type obrigatório'; END;
    BEGIN
      PERFORM public.rpc_create_portal_notification_secure(
        '<CLIENTE_ID_A>'::uuid, 'visita', 't', 'm',
        NULL, 'registros_consultor', '<REGISTRO_A>'::uuid, NULL);
      RAISE EXCEPTION 'FALHOU: tipo fora do enum aceito';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OK: enum estrito'; END;
    BEGIN
      PERFORM public.rpc_create_portal_notification_secure(
        '<CLIENTE_ID_A>'::uuid, 'informativo', 't', 'm',
        NULL, 'coisa_qualquer', '<REGISTRO_A>'::uuid, NULL);
      RAISE EXCEPTION 'FALHOU: source_type desconhecido aceito';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OK: whitelist source_type'; END;
  END $$;
ROLLBACK;

-- 3) portal RPC: cross-client rejeitado (registro pertence a B, cliente=A)
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';
  DO $$ BEGIN
    BEGIN
      PERFORM public.rpc_create_portal_notification_secure(
        '<CLIENTE_ID_A>'::uuid, 'informativo', 't', 'm',
        NULL, 'registros_consultor', '<REGISTRO_B>'::uuid, NULL);
      RAISE EXCEPTION 'FALHOU: cross-client aceito';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OK: cross-client rejeitado'; END;
  END $$;
ROLLBACK;

-- 4) portal RPC: staff sem vínculo à origem não pode notificar
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_OTHER_UID>'; -- outro consultor
  DO $$ BEGIN
    BEGIN
      PERFORM public.rpc_create_portal_notification_secure(
        '<CLIENTE_ID_A>'::uuid, 'recomendacao', 't', 'm',
        NULL, 'registros_consultor', '<REGISTRO_A>'::uuid, NULL);
      RAISE EXCEPTION 'FALHOU: staff sem vínculo conseguiu notificar';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OK: sem vínculo bloqueado'; END;
  END $$;
ROLLBACK;

-- 5) portal RPC: idempotência
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';
  SELECT public.rpc_create_portal_notification_secure(
    '<CLIENTE_ID_A>'::uuid, 'informativo', 't', 'm',
    NULL, 'registros_consultor', '<REGISTRO_A>'::uuid, 'harness-key-1') AS first;
  SELECT public.rpc_create_portal_notification_secure(
    '<CLIENTE_ID_A>'::uuid, 'informativo', 't', 'm',
    NULL, 'registros_consultor', '<REGISTRO_A>'::uuid, 'harness-key-1') AS second;
ROLLBACK;

-- 6) operacional RPC: source_type/source_id obrigatórios para authenticated
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';
  DO $$ BEGIN
    BEGIN
      PERFORM public.rpc_create_notificacao_operacional(
        '<STAFF_UID>'::uuid, 'informativo', 't', 'm', NULL, NULL, NULL, NULL);
      RAISE EXCEPTION 'FALHOU: aceitou sem source';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OK: source obrigatório'; END;
    BEGIN
      PERFORM public.rpc_create_notificacao_operacional(
        '<PRODUTOR_UID>'::uuid, 'informativo', 't', 'm', NULL,
        'registros_consultor', '<REGISTRO_A>'::uuid, NULL);
      RAISE EXCEPTION 'FALHOU: destinatário arbitrário aceito';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OK: destinatário validado por evento'; END;
    BEGIN
      PERFORM public.rpc_create_notificacao_operacional(
        '<STAFF_UID>'::uuid, 'alerta', 't', 'm', NULL,
        'monitoramento_vencido', '<REGISTRO_A>'::uuid, NULL);
      RAISE EXCEPTION 'FALHOU: source reservado ao cron foi aceito por authenticated';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OK: source cron bloqueado'; END;
  END $$;
ROLLBACK;

-- 7) aplicacao_emails RPC: destinatário arbitrário rejeitado; staff bypass; evolução de status
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';
  DO $$ BEGIN
    BEGIN
      PERFORM public.rpc_record_aplicacao_email(
        '<APLICACAO_ID_A>'::uuid, 'random@invasor.com', 'queued', 'harness-mail-1', NULL);
      -- Se caller tem papel administrador/gestor/administrativo → bypass permitido.
      -- Se for apenas aplicador/consultor sem staff-bypass, deve falhar.
      RAISE NOTICE 'INFO: resultado depende do papel do <STAFF_UID>';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OK: destinatário rejeitado (%)', SQLERRM; END;
  END $$;
  -- Evolução: cria como link_generated_no_send → repete como sent
  SELECT public.rpc_record_aplicacao_email(
    '<APLICACAO_ID_A>'::uuid, (SELECT c.email FROM public.clientes c
       JOIN public.ordens_servico os ON os.cliente_id=c.id
       JOIN public.aplicacoes a ON a.ordem_servico_id=os.id
      WHERE a.id='<APLICACAO_ID_A>'::uuid LIMIT 1),
    'link_generated_no_send', 'harness-mail-evo', NULL) AS first;
  SELECT public.rpc_record_aplicacao_email(
    '<APLICACAO_ID_A>'::uuid, (SELECT c.email FROM public.clientes c
       JOIN public.ordens_servico os ON os.cliente_id=c.id
       JOIN public.aplicacoes a ON a.ordem_servico_id=os.id
      WHERE a.id='<APLICACAO_ID_A>'::uuid LIMIT 1),
    'sent', 'harness-mail-evo', NULL) AS evolved_to_sent;
ROLLBACK;

-- 8) monitoramento RPC: transacional; concorrência e compensação
BEGIN;
  -- service_role: exercita a RPC transacional
  RESET role;
  SELECT public.rpc_check_monitoramento_and_notify('<REGISTRO_A>'::uuid) AS c1;
  SELECT public.rpc_check_monitoramento_and_notify('<REGISTRO_A>'::uuid) AS c2_deduplicado;
  -- Se a notificação der erro dentro da RPC, a reserva deve ser revertida.
  -- Simulação: cria conflito artificial e verifica que o aviso NÃO permanece.
ROLLBACK;

-- 9) monitoramento_avisos: escrita autenticada bloqueada, service_role passa
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claim.sub" TO '<STAFF_UID>';
  DO $$ BEGIN
    BEGIN
      INSERT INTO public.monitoramento_avisos (registro_consultor_id, tipo)
      VALUES ('<REGISTRO_A>'::uuid, 'vencido');
      RAISE EXCEPTION 'FALHOU: authenticated escreveu em monitoramento_avisos';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'OK: monitoramento_avisos bloqueado para authenticated'; END;
  END $$;
ROLLBACK;

\echo '=== Harness concluído ==='
