-- Comunicação — Etapa 1 — Subfase 1B — Harness pós-hardening.
-- Ambiente exclusivo: staging ikaauvsflpmamgxmkhoq (ar-bio-temp).
-- Produção navfzbwgwzruipouyfnk NÃO é tocada. Nenhum canal habilitado.
--
-- Uso local:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f harness.sql
-- O bloco termina com uma exceção sentinela (SQLSTATE P0001, mensagem
-- HARNESS_1B_HARDENING_OK_ROLLBACK_SENTINEL) que aborta a transação inteira,
-- garantindo ZERO resíduo (clientes, solicitações, eventos, outbox, notificações).
--
-- Cobertura: 22 asserts, incluindo negativos REAIS (flag boolean),
-- deduplicação de primeira atribuição, isolamento tenant, by_role fail-closed
-- (só administrador é global nesta 1B), spoof-checks do publisher e fail-fast
-- por subtransação. Sem dados pessoais plausíveis; apenas .invalid e UUIDs.

BEGIN;

DO $harness$
DECLARE
  v_cliA uuid := gen_random_uuid();
  v_cliB uuid := gen_random_uuid();
  v_userA uuid := gen_random_uuid();
  v_consA uuid := gen_random_uuid();
  v_consB uuid := gen_random_uuid();
  v_solA uuid;
  v_solB uuid;
  v_n bigint;
  v_ev_delta bigint;
  v_portal_before bigint;
  v_portal_after bigint;
  v_expected bigint;
  v_recips int;
  v_rule public.comunicacao_regras;
  v_row_prod int;
  v_row_cons int;
  v_ok boolean;
  v_desc_ret text;
BEGIN
  SELECT count(*) INTO v_portal_before FROM public.portal_notificacoes;

  INSERT INTO public.clientes(id, nome, codigo_cliente)
  VALUES (v_cliA, 'HARN-1B-CLI-A .invalid', 'HARN-1B-A-'||substr(v_cliA::text,1,8));
  INSERT INTO public.clientes(id, nome, codigo_cliente)
  VALUES (v_cliB, 'HARN-1B-CLI-B .invalid', 'HARN-1B-B-'||substr(v_cliB::text,1,8));

  -- T01 INSERT normal
  INSERT INTO public.portal_solicitacoes(cliente_id,user_id,tipo_demanda,urgencia,status)
  VALUES (v_cliA, v_userA, 'praga', 'media', 'pendente') RETURNING id INTO v_solA;
  SELECT count(*) INTO v_n FROM public.comunicacao_eventos WHERE source_id=v_solA AND event_key='solicitacao_criada';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T01: esperado 1 criada, obtido %', v_n; END IF;

  -- T03a Primeira atribuição SOMENTE por consultor (sem mudança de status)
  UPDATE public.portal_solicitacoes SET consultor_atribuido=v_consA, updated_at=now() WHERE id=v_solA;
  SELECT count(*) INTO v_n FROM public.comunicacao_eventos WHERE source_id=v_solA AND event_key='solicitacao_atribuida';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T03a: esperado 1 (primeira atribuição), obtido %', v_n; END IF;

  -- T04..T08 ciclo de status
  UPDATE public.portal_solicitacoes SET status='checkin_realizado', updated_at=now() WHERE id=v_solA;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_solA AND event_key='solicitacao_checkin_realizado') THEN RAISE EXCEPTION 'T04'; END IF;
  UPDATE public.portal_solicitacoes SET status='em_visita', updated_at=now() WHERE id=v_solA;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_solA AND event_key='solicitacao_em_visita') THEN RAISE EXCEPTION 'T05'; END IF;
  UPDATE public.portal_solicitacoes SET status='aguardando_os', updated_at=now() WHERE id=v_solA;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_solA AND event_key='solicitacao_aguardando_os') THEN RAISE EXCEPTION 'T06'; END IF;
  UPDATE public.portal_solicitacoes SET status='concluida', updated_at=now() WHERE id=v_solA;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_solA AND event_key='solicitacao_concluida') THEN RAISE EXCEPTION 'T07'; END IF;
  UPDATE public.portal_solicitacoes SET status='cancelada', updated_at=now() WHERE id=v_solA;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_solA AND event_key='solicitacao_cancelada') THEN RAISE EXCEPTION 'T08'; END IF;

  -- T09 UPDATE irrelevante (só descricao) → nenhum evento novo
  SELECT count(*) INTO v_n FROM public.comunicacao_eventos WHERE source_id=v_solA;
  UPDATE public.portal_solicitacoes SET descricao='irrelevante-harness', updated_at=now() WHERE id=v_solA;
  SELECT count(*) - v_n INTO v_ev_delta FROM public.comunicacao_eventos WHERE source_id=v_solA;
  IF v_ev_delta <> 0 THEN RAISE EXCEPTION 'T09: irrelevante gerou % evento(s)', v_ev_delta; END IF;

  -- T10 replay idempotente
  UPDATE public.portal_solicitacoes SET status='pendente', updated_at='2000-01-01T00:00:00Z' WHERE id=v_solA;
  SELECT count(*) INTO v_n FROM public.comunicacao_eventos WHERE source_id=v_solA;
  UPDATE public.portal_solicitacoes SET status='pendente', updated_at='2000-01-01T00:00:00Z' WHERE id=v_solA;
  SELECT count(*) - v_n INTO v_ev_delta FROM public.comunicacao_eventos WHERE source_id=v_solA;
  IF v_ev_delta <> 0 THEN RAISE EXCEPTION 'T10 replay: gerou % evento(s)', v_ev_delta; END IF;

  -- T11 escalada de urgência para crítica
  UPDATE public.portal_solicitacoes SET urgencia='critica', updated_at=now() WHERE id=v_solA;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_solA AND event_key='solicitacao_urgencia_critica') THEN RAISE EXCEPTION 'T11'; END IF;

  -- T02 INSERT já crítica em nova linha → criada + urgencia_critica
  INSERT INTO public.portal_solicitacoes(cliente_id,user_id,tipo_demanda,urgencia,status)
  VALUES (v_cliA, v_userA, 'doenca', 'critica', 'pendente') RETURNING id INTO v_solB;
  SELECT count(*) INTO v_n FROM public.comunicacao_eventos
    WHERE source_id=v_solB AND event_key IN ('solicitacao_criada','solicitacao_urgencia_critica');
  IF v_n <> 2 THEN RAISE EXCEPTION 'T02: esperado 2, obtido %', v_n; END IF;

  -- T03b Joint dedup: status→atribuida + consultor NULL→X mesmo comando → 1 evento
  DECLARE v_solC uuid; BEGIN
    INSERT INTO public.portal_solicitacoes(cliente_id,user_id,tipo_demanda,urgencia,status)
    VALUES (v_cliA, v_userA, 'nematoide', 'baixa', 'pendente') RETURNING id INTO v_solC;
    UPDATE public.portal_solicitacoes SET status='atribuida', consultor_atribuido=v_consA, updated_at=now() WHERE id=v_solC;
    SELECT count(*) INTO v_n FROM public.comunicacao_eventos WHERE source_id=v_solC AND event_key='solicitacao_atribuida';
    IF v_n <> 1 THEN RAISE EXCEPTION 'T03b: esperado 1 (dedup joint), obtido %', v_n; END IF;
  END;

  -- T12/T13/T14* NEGATIVOS REAIS com flag boolean (fora do bloco EXCEPTION).
  -- Padrão anterior era falso-positivo: capturava o próprio RAISE de falha.
  v_ok := false;
  BEGIN
    PERFORM public._comunicacao_publish_system_event('evento_inexistente_xxx','portal_solicitacoes', v_solA, '{}'::jsonb, 'idem-t12aaaa');
  EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T12 FALHOU: publisher aceitou event_key inválido'; END IF;

  v_ok := false;
  BEGIN
    PERFORM public._comunicacao_publish_system_event('solicitacao_criada','ordens_servico', v_solA, '{}'::jsonb, 'idem-t13aaaa');
  EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T13 FALHOU: publisher aceitou source_type inválido'; END IF;

  v_ok := false;
  BEGIN
    PERFORM public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes', v_solA,
      '{"descricao":"PII-tentativa"}'::jsonb, 'idem-t14aaaa');
  EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T14 FALHOU: publisher aceitou chave fora da allowlist'; END IF;

  v_ok := false;
  BEGIN
    PERFORM public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes', v_solA,
      jsonb_build_object('solicitacao_id', gen_random_uuid()), 'idem-t14bxxx');
  EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T14b FALHOU: publisher aceitou solicitacao_id spoof'; END IF;

  v_ok := false;
  BEGIN
    PERFORM public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes', v_solA,
      jsonb_build_object('cliente_id', v_cliB), 'idem-t14cxxx');
  EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T14c FALHOU: publisher aceitou cliente_id spoof cross-tenant'; END IF;

  v_ok := false;
  BEGIN
    PERFORM public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes',
      gen_random_uuid(), '{}'::jsonb, 'idem-t14dxxx');
  EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T14d FALHOU: publisher aceitou source_id inexistente'; END IF;

  -- T15 source_participants
  UPDATE public.portal_solicitacoes SET consultor_atribuido=v_consA, updated_at=now() WHERE id=v_solA;
  v_rule := ROW(gen_random_uuid(),'solicitacao_criada',NULL,'source_participants',
    'in_app'::public.comunicacao_canal,'noop_v1',NULL,'{}'::jsonb,100,true,0,NULL,NULL,now(),now()
  )::public.comunicacao_regras;
  SELECT
    count(*) FILTER (WHERE recipient_cliente_id=v_cliA AND recipient_user_id IS NULL),
    count(*) FILTER (WHERE recipient_user_id=v_consA AND recipient_cliente_id IS NULL)
    INTO v_row_prod, v_row_cons
  FROM public._comunicacao_resolve_recipients_v2('solicitacao_criada', v_rule, 'portal_solicitacoes', v_solA);
  IF v_row_prod <> 1 THEN RAISE EXCEPTION 'T15 produtor: %', v_row_prod; END IF;
  IF v_row_cons <> 1 THEN RAISE EXCEPTION 'T15 consultor: %', v_row_cons; END IF;
  SELECT count(*) INTO v_recips FROM public._comunicacao_resolve_recipients_v2('solicitacao_criada', v_rule, 'portal_solicitacoes', v_solA);
  IF v_recips <> 2 THEN RAISE EXCEPTION 'T15 total: %', v_recips; END IF;

  -- T15tenant isolamento cross-tenant
  INSERT INTO public.portal_solicitacoes(cliente_id,user_id,tipo_demanda,urgencia,status,consultor_atribuido)
  VALUES (v_cliB, v_userA, 'praga', 'media', 'atribuida', v_consB);
  IF EXISTS (
    SELECT 1 FROM public._comunicacao_resolve_recipients_v2('solicitacao_criada', v_rule, 'portal_solicitacoes', v_solA) r
     WHERE r.recipient_user_id = v_consB OR r.recipient_cliente_id = v_cliB
  ) THEN RAISE EXCEPTION 'T15tenant FALHOU: resolver vazou cross-tenant'; END IF;

  -- T16 by_role administrador (corporativo global)
  v_rule.estrategia := 'by_role';
  v_rule.perfil := 'administrador'::public.app_role;
  SELECT count(*) INTO v_recips FROM public._comunicacao_resolve_recipients_v2('solicitacao_criada', v_rule, 'portal_solicitacoes', v_solA);
  SELECT count(*) INTO v_expected FROM public.user_roles ur JOIN public.profiles pr ON pr.user_id=ur.user_id
    WHERE ur.role='administrador'::public.app_role AND COALESCE(pr.ativo,true)=true;
  IF v_recips <> v_expected THEN RAISE EXCEPTION 'T16 admin: esperado %, obtido %', v_expected, v_recips; END IF;

  -- T16fc by_role fail-closed (gestor/consultor_tecnico/parceiro_b2b → 0 até 1C)
  v_rule.perfil := 'gestor'::public.app_role;
  SELECT count(*) INTO v_recips FROM public._comunicacao_resolve_recipients_v2('solicitacao_criada', v_rule, 'portal_solicitacoes', v_solA);
  IF v_recips <> 0 THEN RAISE EXCEPTION 'T16fc gestor: esperado 0 (fail-closed), obtido %', v_recips; END IF;
  v_rule.perfil := 'consultor_tecnico'::public.app_role;
  SELECT count(*) INTO v_recips FROM public._comunicacao_resolve_recipients_v2('solicitacao_criada', v_rule, 'portal_solicitacoes', v_solA);
  IF v_recips <> 0 THEN RAISE EXCEPTION 'T16fc consultor_tecnico: esperado 0, obtido %', v_recips; END IF;
  v_rule.perfil := 'parceiro_b2b'::public.app_role;
  SELECT count(*) INTO v_recips FROM public._comunicacao_resolve_recipients_v2('solicitacao_criada', v_rule, 'portal_solicitacoes', v_solA);
  IF v_recips <> 0 THEN RAISE EXCEPTION 'T16fc parceiro_b2b: esperado 0, obtido %', v_recips; END IF;

  -- T17 fail-fast real: exceção do publisher aborta o UPDATE via subtransação
  UPDATE public.portal_solicitacoes SET descricao='baseline-antes-t17', updated_at=now() WHERE id=v_solA;
  BEGIN
    UPDATE public.portal_solicitacoes SET descricao='mutation-que-deve-reverter', updated_at=now() WHERE id=v_solA;
    PERFORM public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes', v_solA,
      '{"chave_pii_ilegal":"x"}'::jsonb, 'idem-t17aaaa');
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL; END;
  SELECT descricao INTO v_desc_ret FROM public.portal_solicitacoes WHERE id=v_solA;
  IF v_desc_ret = 'mutation-que-deve-reverter' THEN
    RAISE EXCEPTION 'T17 FALHOU: mutação persistiu apesar de exceção do publisher (%)', v_desc_ret;
  END IF;
  IF v_desc_ret <> 'baseline-antes-t17' THEN
    RAISE EXCEPTION 'T17: estado inesperado após subtransação: %', v_desc_ret;
  END IF;

  -- T18 portal_notificacoes inalterada (legado desanexado)
  SELECT count(*) INTO v_portal_after FROM public.portal_notificacoes;
  IF v_portal_after - v_portal_before <> 0 THEN
    RAISE EXCEPTION 'T18 FALHOU: legado gravou % linha(s)', v_portal_after - v_portal_before;
  END IF;

  -- T19 preserva allowlist do canal produto_pronto_retirada (não regrediu)
  v_ok := false;
  BEGIN
    PERFORM public._comunicacao_publish_system_event('produto_pronto_retirada','portal_solicitacoes', v_solA, '{}'::jsonb, 'idem-t19aaaa');
  EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'T19 FALHOU: publisher aceitou produto_pronto_retirada com source errado'; END IF;

  RAISE NOTICE 'HARNESS 1B pós-hardening: 22 asserts OK';
  RAISE EXCEPTION 'HARNESS_1B_HARDENING_OK_ROLLBACK_SENTINEL';
END $harness$;
