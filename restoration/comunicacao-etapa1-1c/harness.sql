-- =============================================================================
-- Subfase 1C — Harness funcional + estrutural (hardening corretivo)
-- Ambiente: staging ikaauvsflpmamgxmkhoq. Fail-fast, transacional,
-- sentinel-rollback via RAISE EXCEPTION incondicional ao final.
-- Não escreve em auth.users; usa apenas UUIDs de auth.users pré-existentes
-- como FKs em fixtures 100% dentro de public.*.
--
-- Como executar (uma tool call): copie o bloco DO abaixo. A execução deve
-- terminar SEMPRE com uma exceção começando por 'HARNESS_' — o texto após
-- os dois-pontos é um JSON com o relatório de cada assert. Depois, execute
-- o bloco VERIFY (final do arquivo) para confirmar zero resíduo.
-- =============================================================================

-- ---------- BLOCO 1: harness transacional ----------
DO $harness$
DECLARE
  -- UUIDs reais de auth.users (staging) reutilizados APENAS como FKs.
  u_admin      uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a'; -- admin@arbio.com (role administrador)
  u_consultor  uuid := '3e16d523-1bc9-4502-a5d6-04d150747236'; -- gestor@arbio.com (usado como consultor atribuído)
  u_outro      uuid := '2767fb15-7f00-41d5-8360-622d6dea8de6'; -- tecnico_agronomo@arbio.com (não atribuído)
  u_prod_a     uuid := 'd56793fa-acb3-4862-a180-498c20f5317f'; -- FK user_id da solicitação A
  u_prod_b     uuid := '497b0307-0b64-42f4-a2b1-fd3e220fac3b'; -- FK user_id da solicitação B

  cli_a uuid; cli_b uuid;
  sol_a uuid; sol_b uuid;
  ev_dup jsonb;

  n_sc_a int; n_role_admin int; n_role_outros int; n_cross int;
  n_ac_atrib int; n_ac_outros int;
  n_pref_bloqueio int;
  n_replay_before int; n_replay_after int;
  neg_unknown_key boolean := false;
  neg_cli_mismatch boolean := false;
  neg_cons_mismatch boolean := false;
  neg_source_missing boolean := false;
  neg_bad_source_type boolean := false;
  seed_regras_off int;
  seed_tpl_ativos int;
  results jsonb := '{}'::jsonb;
BEGIN
  -- Guardrail 1: garantir zero regra habilitada em disco (estado inicial).
  SELECT count(*) INTO seed_regras_off
    FROM public.comunicacao_regras
   WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\' AND enabled=false;
  IF seed_regras_off <> 11 THEN
    RAISE EXCEPTION 'HARNESS_FAIL: preflight regras — esperado 11 disabled, obtido %', seed_regras_off;
  END IF;

  -- Guardrail 2: templates in_app ativos v2 = 11.
  SELECT count(*) INTO seed_tpl_ativos
    FROM public.comunicacao_templates
   WHERE chave LIKE 'solic\_%' ESCAPE '\' AND canal='in_app' AND status='active';
  IF seed_tpl_ativos <> 11 THEN
    RAISE EXCEPTION 'HARNESS_FAIL: preflight templates ativos — esperado 11, obtido %', seed_tpl_ativos;
  END IF;

  -- ============ ATIVAÇÃO TEMPORÁRIA (rolled back) ============
  UPDATE public.comunicacao_regras
     SET enabled = true
   WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\' AND canal='in_app';

  -- ============ FIXTURES ============
  INSERT INTO public.clientes(id, nome, codigo_cliente)
    VALUES (gen_random_uuid(), 'HARNESS-1C-A.invalid', 'HRN1C-A-' || substr(gen_random_uuid()::text,1,8))
    RETURNING id INTO cli_a;
  INSERT INTO public.clientes(id, nome, codigo_cliente)
    VALUES (gen_random_uuid(), 'HARNESS-1C-B.invalid', 'HRN1C-B-' || substr(gen_random_uuid()::text,1,8))
    RETURNING id INTO cli_b;

  -- Solicitação A (cliente A, sem consultor ainda). O trigger emite
  -- solicitacao_criada automaticamente.
  INSERT INTO public.portal_solicitacoes(
      id, cliente_id, user_id, tipo_demanda, urgencia, status, numero_solicitacao)
    VALUES (gen_random_uuid(), cli_a, u_prod_a, 'praga', 'alta', 'pendente', 'HRN1C-A')
    RETURNING id INTO sol_a;

  -- Solicitação B (cliente B). Só para provar isolamento cross-tenant.
  INSERT INTO public.portal_solicitacoes(
      id, cliente_id, user_id, tipo_demanda, urgencia, status, numero_solicitacao)
    VALUES (gen_random_uuid(), cli_b, u_prod_b, 'praga', 'media', 'pendente', 'HRN1C-B')
    RETURNING id INTO sol_b;

  -- ============ ASSERTS: solicitacao_criada ============
  -- A1: source_cliente resolve APENAS cliente A para o evento de A.
  SELECT count(*) INTO n_sc_a
    FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id = o.event_id
    JOIN public.comunicacao_regras r ON r.id = o.rule_id
   WHERE e.source_id = sol_a AND e.event_key='solicitacao_criada'
     AND r.estrategia='source_cliente'
     AND o.recipient_cliente_id = cli_a AND o.recipient_user_id IS NULL;
  IF n_sc_a <> 1 THEN
    RAISE EXCEPTION 'HARNESS_FAIL A1 source_cliente — esperado 1 outbox para cliente A, obtido %', n_sc_a;
  END IF;

  -- A2: source_cliente NÃO produz outbox de cliente A para evento de B.
  SELECT count(*) INTO n_cross
    FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id = o.event_id
    JOIN public.comunicacao_regras r ON r.id = o.rule_id
   WHERE e.source_id = sol_b AND r.estrategia='source_cliente'
     AND o.recipient_cliente_id = cli_a;
  IF n_cross <> 0 THEN
    RAISE EXCEPTION 'HARNESS_FAIL A2 isolamento cross-tenant — obtido % (esperado 0)', n_cross;
  END IF;

  -- A3: by_role/administrador resolve exatamente o usuário admin (1) para evento A.
  SELECT count(*) INTO n_role_admin
    FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id = o.event_id
    JOIN public.comunicacao_regras r ON r.id = o.rule_id
   WHERE e.source_id = sol_a AND e.event_key='solicitacao_criada'
     AND r.estrategia='by_role' AND r.perfil = 'administrador'::public.app_role
     AND o.recipient_user_id = u_admin;
  IF n_role_admin <> 1 THEN
    RAISE EXCEPTION 'HARNESS_FAIL A3 by_role admin — esperado 1, obtido %', n_role_admin;
  END IF;

  -- A4: nenhum outro perfil recebeu via by_role no evento A.
  SELECT count(*) INTO n_role_outros
    FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id = o.event_id
    JOIN public.comunicacao_regras r ON r.id = o.rule_id
    JOIN public.user_roles ur ON ur.user_id = o.recipient_user_id
   WHERE e.source_id = sol_a AND r.estrategia='by_role'
     AND ur.role <> 'administrador'::public.app_role;
  IF n_role_outros <> 0 THEN
    RAISE EXCEPTION 'HARNESS_FAIL A4 by_role outros perfis — obtido % (esperado 0)', n_role_outros;
  END IF;

  -- ============ ASSERTS: solicitacao_atribuida ============
  -- Atribui consultor à solicitação A. Trigger deve emitir 'solicitacao_atribuida'.
  UPDATE public.portal_solicitacoes
     SET consultor_atribuido = u_consultor, status = 'atribuida', updated_at = now()
   WHERE id = sol_a;

  -- A5: assigned_consultant resolve exatamente 1 = u_consultor.
  SELECT count(*) INTO n_ac_atrib
    FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id = o.event_id
    JOIN public.comunicacao_regras r ON r.id = o.rule_id
   WHERE e.source_id = sol_a AND e.event_key='solicitacao_atribuida'
     AND r.estrategia='assigned_consultant'
     AND o.recipient_user_id = u_consultor;
  IF n_ac_atrib <> 1 THEN
    RAISE EXCEPTION 'HARNESS_FAIL A5 assigned_consultant — esperado 1, obtido %', n_ac_atrib;
  END IF;

  -- A6: nenhum outro usuário atinge outbox via assigned_consultant.
  SELECT count(*) INTO n_ac_outros
    FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id = o.event_id
    JOIN public.comunicacao_regras r ON r.id = o.rule_id
   WHERE e.source_id = sol_a AND r.estrategia='assigned_consultant'
     AND o.recipient_user_id IS DISTINCT FROM u_consultor;
  IF n_ac_outros <> 0 THEN
    RAISE EXCEPTION 'HARNESS_FAIL A6 assigned_consultant leak — obtido % (esperado 0)', n_ac_outros;
  END IF;

  -- ============ ASSERTS: idempotência (replay do publisher) ============
  SELECT count(*) INTO n_replay_before FROM public.comunicacao_outbox;
  -- Republica evento com mesma idempotency_key do trigger canônico.
  ev_dup := public._comunicacao_publish_system_event(
    'solicitacao_criada','portal_solicitacoes', sol_a,
    jsonb_build_object('solicitacao_id',sol_a,'cliente_id',cli_a,'numero','HRN1C-A',
                       'tipo_demanda','praga','urgencia','alta','status_novo','pendente'),
    'harness-replay-a-1' );
  -- Segunda chamada com MESMA idem key → duplicated=true, sem novas outbox.
  ev_dup := public._comunicacao_publish_system_event(
    'solicitacao_criada','portal_solicitacoes', sol_a,
    jsonb_build_object('solicitacao_id',sol_a,'cliente_id',cli_a,'numero','HRN1C-A',
                       'tipo_demanda','praga','urgencia','alta','status_novo','pendente'),
    'harness-replay-a-1' );
  IF (ev_dup->>'duplicated')::boolean <> true THEN
    RAISE EXCEPTION 'HARNESS_FAIL A7 idempotency — replay não sinalizou duplicated. ev=%', ev_dup;
  END IF;
  SELECT count(*) INTO n_replay_after FROM public.comunicacao_outbox;

  -- ============ ASSERTS: publisher negative ============
  -- A8: chave desconhecida no payload.
  BEGIN
    PERFORM public._comunicacao_publish_system_event(
      'solicitacao_criada','portal_solicitacoes', sol_a,
      jsonb_build_object('descricao','payload malicioso'),
      'harness-neg-unknown-1');
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%payload não permitida%' THEN neg_unknown_key := true; END IF;
  END;
  IF NOT neg_unknown_key THEN RAISE EXCEPTION 'HARNESS_FAIL A8 unknown key não rejeitada'; END IF;

  -- A9: cliente_id divergente do da linha.
  BEGIN
    PERFORM public._comunicacao_publish_system_event(
      'solicitacao_criada','portal_solicitacoes', sol_a,
      jsonb_build_object('cliente_id', cli_b),
      'harness-neg-cli-1');
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%cliente_id divergente%' THEN neg_cli_mismatch := true; END IF;
  END;
  IF NOT neg_cli_mismatch THEN RAISE EXCEPTION 'HARNESS_FAIL A9 cliente_id spoof não rejeitado'; END IF;

  -- A10: consultor divergente do atual (sol_a agora tem u_consultor).
  BEGIN
    PERFORM public._comunicacao_publish_system_event(
      'solicitacao_atribuida','portal_solicitacoes', sol_a,
      jsonb_build_object('consultor_atribuido', u_outro),
      'harness-neg-cons-1');
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%consultor_atribuido divergente%' THEN neg_cons_mismatch := true; END IF;
  END;
  IF NOT neg_cons_mismatch THEN RAISE EXCEPTION 'HARNESS_FAIL A10 consultor spoof não rejeitado'; END IF;

  -- A11: source_id inexistente.
  BEGIN
    PERFORM public._comunicacao_publish_system_event(
      'solicitacao_criada','portal_solicitacoes', gen_random_uuid(),
      jsonb_build_object('numero','X'),
      'harness-neg-nosrc-1');
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%source_id não encontrado%' THEN neg_source_missing := true; END IF;
  END;
  IF NOT neg_source_missing THEN RAISE EXCEPTION 'HARNESS_FAIL A11 source_id ausente não rejeitado'; END IF;

  -- A12: source_type inválido para solicitacao_*.
  BEGIN
    PERFORM public._comunicacao_publish_system_event(
      'solicitacao_criada','ordens_servico', sol_a, '{}'::jsonb, 'harness-neg-badtype-1');
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%source inválido%' THEN neg_bad_source_type := true; END IF;
  END;
  IF NOT neg_bad_source_type THEN RAISE EXCEPTION 'HARNESS_FAIL A12 source_type inválido não rejeitado'; END IF;

  -- ============ ASSERT: preferência bloqueia ============
  -- Insere preferência in_app disabled para admin e publica um evento novo
  -- (nova solicitação C). Espera-se que admin NÃO receba.
  DECLARE
    cli_c uuid; sol_c uuid;
  BEGIN
    INSERT INTO public.comunicacao_preferencias(id,user_id,canal,enabled,source)
      VALUES(gen_random_uuid(), u_admin, 'in_app', false, 'harness-1c');
    INSERT INTO public.clientes(id, nome, codigo_cliente)
      VALUES (gen_random_uuid(), 'HARNESS-1C-C.invalid','HRN1C-C-'||substr(gen_random_uuid()::text,1,8))
      RETURNING id INTO cli_c;
    INSERT INTO public.portal_solicitacoes(
        id, cliente_id, user_id, tipo_demanda, urgencia, status, numero_solicitacao)
      VALUES (gen_random_uuid(), cli_c, u_prod_a, 'praga','alta','pendente','HRN1C-C')
      RETURNING id INTO sol_c;
    SELECT count(*) INTO n_pref_bloqueio
      FROM public.comunicacao_outbox o
      JOIN public.comunicacao_eventos e ON e.id=o.event_id
      JOIN public.comunicacao_regras r ON r.id=o.rule_id
     WHERE e.source_id = sol_c AND r.estrategia='by_role'
       AND o.recipient_user_id = u_admin;
    IF n_pref_bloqueio <> 0 THEN
      RAISE EXCEPTION 'HARNESS_FAIL A13 preferência não bloqueou admin (obtido %)', n_pref_bloqueio;
    END IF;
  END;

  -- Monta relatório e força ROLLBACK.
  results := jsonb_build_object(
    'A1_source_cliente_a', n_sc_a,
    'A2_cross_tenant_zero', n_cross,
    'A3_by_role_admin', n_role_admin,
    'A4_by_role_outros_zero', n_role_outros,
    'A5_assigned_consultant', n_ac_atrib,
    'A6_ac_leak_zero', n_ac_outros,
    'A7_replay_outbox_before', n_replay_before,
    'A7_replay_outbox_after', n_replay_after,
    'A7_replay_same_count', (n_replay_before = n_replay_after),
    'A8_unknown_key_rejected', neg_unknown_key,
    'A9_cli_mismatch_rejected', neg_cli_mismatch,
    'A10_cons_mismatch_rejected', neg_cons_mismatch,
    'A11_source_missing_rejected', neg_source_missing,
    'A12_bad_source_type_rejected', neg_bad_source_type,
    'A13_pref_block_zero', n_pref_bloqueio
  );
  RAISE EXCEPTION 'HARNESS_PASS_ROLLBACK: %', results::text;
END $harness$;

-- =============================================================================
-- BLOCO 2: VERIFY pós-rollback — confirma zero resíduo.
-- Rodar em chamada separada após o BLOCO 1 (todas as expectativas = 0/estado inicial).
-- =============================================================================
SELECT
  (SELECT count(*) FROM public.clientes WHERE nome LIKE 'HARNESS-1C-%') AS r1_clientes_resid,
  (SELECT count(*) FROM public.portal_solicitacoes WHERE numero_solicitacao LIKE 'HRN1C-%') AS r2_solic_resid,
  (SELECT count(*) FROM public.comunicacao_preferencias WHERE source='harness-1c') AS r3_pref_resid,
  (SELECT count(*) FROM public.comunicacao_eventos WHERE idempotency_key LIKE 'harness-%') AS r4_events_resid,
  (SELECT count(*) FROM public.comunicacao_outbox o
     JOIN public.comunicacao_eventos e ON e.id=o.event_id
    WHERE e.idempotency_key LIKE 'harness-%'
       OR e.source_id IN (SELECT id FROM public.portal_solicitacoes WHERE numero_solicitacao LIKE 'HRN1C-%')) AS r5_outbox_resid,
  (SELECT count(*) FROM public.comunicacao_regras WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\' AND enabled=true) AS r6_regras_habilitadas,
  (SELECT count(*) FROM public.comunicacao_regras WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\') AS r7_regras_total,
  (SELECT count(*) FROM public.comunicacao_templates WHERE chave LIKE 'solic\_%' ESCAPE '\' AND canal='in_app' AND status='active') AS r8_templates_ativos;
-- Esperado: r1..r6 = 0; r7 = 11; r8 = 11.
