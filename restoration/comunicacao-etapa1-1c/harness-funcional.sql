-- =============================================================================
-- Subfase 1C — Hardening corretivo — Harness FUNCIONAL (rollback sentinel)
-- Ambiente: staging ikaauvsflpmamgxmkhoq. Produção proibida.
-- Executar com ferramenta que permita escrita transacional (supabase--insert):
-- ao final o RAISE EXCEPTION 'HARNESS_PASS_ROLLBACK: {...}' força ROLLBACK
-- automático — nada é persistido. Se qualquer assert falhar, a exceção começa
-- com 'HARNESS_FAIL'.
--
-- Cobertura (13 asserts, todos verdadeiros no run de 2026-07-27):
--   A1  source_cliente entrega 1 outbox ao produtor A em solicitacao_criada
--   A2  isolamento cross-tenant: produtor A não recebe evento de B
--   A3  by_role/administrador entrega 1 outbox ao admin
--   A4  by_role NÃO entrega para outros perfis (gestor/consultor/parceiro)
--   A5  assigned_consultant entrega 1 outbox ao consultor atribuído
--   A6  assigned_consultant NÃO entrega para qualquer outro usuário
--   A7  replay: mesma (event_key, source_id, idempotency_key) → duplicated=true
--       (verificar pelo campo `duplicated` do retorno; NÃO comparar count
--       antes/depois porque `n_replay_before` é capturado antes da 1ª chamada)
--   A8  publisher rejeita chave desconhecida em payload (mensagem contém
--       'payload não permitida')
--   A9  publisher rejeita cliente_id divergente do source row
--   A10 publisher rejeita consultor_atribuido divergente do source row
--   A11 publisher rejeita source_id inexistente
--   A12 publisher rejeita source_type <> 'portal_solicitacoes'
--   A13 preferência in_app disabled bloqueia entrega ao admin
-- =============================================================================
DO $harness$
DECLARE
  u_admin      uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a';
  u_consultor  uuid := '3e16d523-1bc9-4502-a5d6-04d150747236';
  u_outro      uuid := '2767fb15-7f00-41d5-8360-622d6dea8de6';
  u_prod_a     uuid := 'd56793fa-acb3-4862-a180-498c20f5317f';
  u_prod_b     uuid := '497b0307-0b64-42f4-a2b1-fd3e220fac3b';
  cli_a uuid; cli_b uuid; sol_a uuid; sol_b uuid; ev_dup jsonb;
  n_sc_a int; n_role_admin int; n_role_outros int; n_cross int;
  n_ac_atrib int; n_ac_outros int; n_pref_bloqueio int;
  n_replay_before int; n_replay_after int; a7_dup boolean := false;
  neg_unknown_key boolean := false; neg_cli_mismatch boolean := false;
  neg_cons_mismatch boolean := false; neg_source_missing boolean := false;
  neg_bad_source_type boolean := false;
  seed_regras_off int; seed_tpl_ativos int; results jsonb;
BEGIN
  -- Preflight: seeds da 1C intactos
  SELECT count(*) INTO seed_regras_off FROM public.comunicacao_regras
   WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\' AND enabled=false;
  IF seed_regras_off <> 11 THEN RAISE EXCEPTION 'HARNESS_FAIL preflight regras=%',seed_regras_off; END IF;
  SELECT count(*) INTO seed_tpl_ativos FROM public.comunicacao_templates
   WHERE chave LIKE 'solic\_%' ESCAPE '\' AND canal='in_app' AND status='active';
  IF seed_tpl_ativos <> 11 THEN RAISE EXCEPTION 'HARNESS_FAIL preflight tpl=%',seed_tpl_ativos; END IF;

  -- Ativa regras in_app temporariamente (rollback ao final descarta)
  UPDATE public.comunicacao_regras SET enabled=true
   WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\' AND canal='in_app';

  -- Fixtures cliente A/B
  INSERT INTO public.clientes(id,nome,codigo_cliente)
    VALUES(gen_random_uuid(),'HARNESS-1C-A.invalid','HRN1C-A-'||substr(gen_random_uuid()::text,1,8))
    RETURNING id INTO cli_a;
  INSERT INTO public.clientes(id,nome,codigo_cliente)
    VALUES(gen_random_uuid(),'HARNESS-1C-B.invalid','HRN1C-B-'||substr(gen_random_uuid()::text,1,8))
    RETURNING id INTO cli_b;

  -- Solicitações A e B (disparam solicitacao_criada via trigger)
  INSERT INTO public.portal_solicitacoes(id,cliente_id,user_id,tipo_demanda,urgencia,status,numero_solicitacao)
    VALUES(gen_random_uuid(),cli_a,u_prod_a,'praga','alta','pendente','HRN1C-A')
    RETURNING id INTO sol_a;
  INSERT INTO public.portal_solicitacoes(id,cliente_id,user_id,tipo_demanda,urgencia,status,numero_solicitacao)
    VALUES(gen_random_uuid(),cli_b,u_prod_b,'praga','media','pendente','HRN1C-B')
    RETURNING id INTO sol_b;

  -- A1
  SELECT count(*) INTO n_sc_a FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
   WHERE e.source_id=sol_a AND e.event_key='solicitacao_criada'
     AND r.estrategia='source_cliente' AND o.recipient_cliente_id=cli_a AND o.recipient_user_id IS NULL;
  IF n_sc_a<>1 THEN RAISE EXCEPTION 'HARNESS_FAIL A1=%',n_sc_a; END IF;

  -- A2 isolamento
  SELECT count(*) INTO n_cross FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
   WHERE e.source_id=sol_b AND r.estrategia='source_cliente' AND o.recipient_cliente_id=cli_a;
  IF n_cross<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL A2=%',n_cross; END IF;

  -- A3 by_role admin
  SELECT count(*) INTO n_role_admin FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
   WHERE e.source_id=sol_a AND e.event_key='solicitacao_criada'
     AND r.estrategia='by_role' AND r.perfil='administrador'::public.app_role
     AND o.recipient_user_id=u_admin;
  IF n_role_admin<>1 THEN RAISE EXCEPTION 'HARNESS_FAIL A3=%',n_role_admin; END IF;

  -- A4 by_role fail-closed
  SELECT count(*) INTO n_role_outros FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
    JOIN public.user_roles ur ON ur.user_id=o.recipient_user_id
   WHERE e.source_id=sol_a AND r.estrategia='by_role' AND ur.role<>'administrador'::public.app_role;
  IF n_role_outros<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL A4=%',n_role_outros; END IF;

  -- Atribui consultor a solA
  UPDATE public.portal_solicitacoes
     SET consultor_atribuido=u_consultor, status='atribuida', updated_at=now()
   WHERE id=sol_a;

  -- A5
  SELECT count(*) INTO n_ac_atrib FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
   WHERE e.source_id=sol_a AND e.event_key='solicitacao_atribuida'
     AND r.estrategia='assigned_consultant' AND o.recipient_user_id=u_consultor;
  IF n_ac_atrib<>1 THEN RAISE EXCEPTION 'HARNESS_FAIL A5=%',n_ac_atrib; END IF;

  -- A6
  SELECT count(*) INTO n_ac_outros FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
   WHERE e.source_id=sol_a AND r.estrategia='assigned_consultant'
     AND o.recipient_user_id IS DISTINCT FROM u_consultor;
  IF n_ac_outros<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL A6=%',n_ac_outros; END IF;

  -- A7 replay via idempotency_key: 2ª chamada deve retornar duplicated=true
  ev_dup := public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes',sol_a,
    jsonb_build_object('solicitacao_id',sol_a,'cliente_id',cli_a,'numero','HRN1C-A',
      'tipo_demanda','praga','urgencia','alta','status_novo','pendente'),
    'harness-replay-a-1');
  SELECT count(*) INTO n_replay_before FROM public.comunicacao_outbox;
  ev_dup := public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes',sol_a,
    jsonb_build_object('solicitacao_id',sol_a,'cliente_id',cli_a,'numero','HRN1C-A',
      'tipo_demanda','praga','urgencia','alta','status_novo','pendente'),
    'harness-replay-a-1');
  a7_dup := (ev_dup->>'duplicated')::boolean;
  SELECT count(*) INTO n_replay_after FROM public.comunicacao_outbox;
  IF NOT a7_dup OR n_replay_before <> n_replay_after THEN
    RAISE EXCEPTION 'HARNESS_FAIL A7 dup=% before=% after=%', a7_dup, n_replay_before, n_replay_after;
  END IF;

  -- Negativos publisher
  BEGIN PERFORM public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes',sol_a,
    jsonb_build_object('descricao','x'),'harness-neg-unknown-1');
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%payload não permitida%' THEN neg_unknown_key:=true; END IF; END;
  IF NOT neg_unknown_key THEN RAISE EXCEPTION 'HARNESS_FAIL A8'; END IF;

  BEGIN PERFORM public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes',sol_a,
    jsonb_build_object('cliente_id',cli_b),'harness-neg-cli-1');
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%cliente_id divergente%' THEN neg_cli_mismatch:=true; END IF; END;
  IF NOT neg_cli_mismatch THEN RAISE EXCEPTION 'HARNESS_FAIL A9'; END IF;

  BEGIN PERFORM public._comunicacao_publish_system_event('solicitacao_atribuida','portal_solicitacoes',sol_a,
    jsonb_build_object('consultor_atribuido',u_outro),'harness-neg-cons-1');
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%consultor_atribuido divergente%' THEN neg_cons_mismatch:=true; END IF; END;
  IF NOT neg_cons_mismatch THEN RAISE EXCEPTION 'HARNESS_FAIL A10'; END IF;

  BEGIN PERFORM public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes',gen_random_uuid(),
    jsonb_build_object('numero','X'),'harness-neg-nosrc-1');
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%source_id não encontrado%' THEN neg_source_missing:=true; END IF; END;
  IF NOT neg_source_missing THEN RAISE EXCEPTION 'HARNESS_FAIL A11'; END IF;

  BEGIN PERFORM public._comunicacao_publish_system_event('solicitacao_criada','ordens_servico',sol_a,'{}'::jsonb,'harness-neg-badtype-1');
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%source inválido%' THEN neg_bad_source_type:=true; END IF; END;
  IF NOT neg_bad_source_type THEN RAISE EXCEPTION 'HARNESS_FAIL A12'; END IF;

  -- A13 preferência bloqueia
  DECLARE cli_c uuid; sol_c uuid;
  BEGIN
    INSERT INTO public.comunicacao_preferencias(id,user_id,canal,enabled,source)
      VALUES(gen_random_uuid(),u_admin,'in_app',false,'system');
    INSERT INTO public.clientes(id,nome,codigo_cliente)
      VALUES(gen_random_uuid(),'HARNESS-1C-C.invalid','HRN1C-C-'||substr(gen_random_uuid()::text,1,8))
      RETURNING id INTO cli_c;
    INSERT INTO public.portal_solicitacoes(id,cliente_id,user_id,tipo_demanda,urgencia,status,numero_solicitacao)
      VALUES(gen_random_uuid(),cli_c,u_prod_a,'praga','alta','pendente','HRN1C-C')
      RETURNING id INTO sol_c;
    SELECT count(*) INTO n_pref_bloqueio FROM public.comunicacao_outbox o
      JOIN public.comunicacao_eventos e ON e.id=o.event_id
      JOIN public.comunicacao_regras r ON r.id=o.rule_id
     WHERE e.source_id=sol_c AND r.estrategia='by_role' AND o.recipient_user_id=u_admin;
    IF n_pref_bloqueio<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL A13=%',n_pref_bloqueio; END IF;
  END;

  results := jsonb_build_object(
    'A1',n_sc_a,'A2',n_cross,'A3',n_role_admin,'A4',n_role_outros,
    'A5',n_ac_atrib,'A6',n_ac_outros,'A7_dup',a7_dup,
    'A8',neg_unknown_key,'A9',neg_cli_mismatch,'A10',neg_cons_mismatch,
    'A11',neg_source_missing,'A12',neg_bad_source_type,'A13',n_pref_bloqueio);
  RAISE EXCEPTION 'HARNESS_PASS_ROLLBACK: %', results::text;
END $harness$;
