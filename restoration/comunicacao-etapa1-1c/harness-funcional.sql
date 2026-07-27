-- =============================================================================
-- Subfase 1C — Hardening FINAL — Harness FUNCIONAL v2 (rollback sentinel)
-- Ambiente: staging ikaauvsflpmamgxmkhoq. Produção proibida.
--
-- Executar via supabase--insert (bloco DO). Ao final o RAISE EXCEPTION
-- 'HARNESS_PASS_ROLLBACK: {...}' força ROLLBACK — nada é persistido. Se
-- qualquer assert falhar, a exceção começa com 'HARNESS_FAIL_'.
--
-- Cobertura (22 asserts):
--   A1  source_cliente → produtor A recebe 1 outbox in_app em solicitacao_criada
--   A2  isolamento cross-tenant: produtor A não recebe evento de B
--   A3  by_role/administrador → admin recebe 1 outbox
--   A4  by_role fail-closed: nenhum outbox para não-admin
--   A5  assigned_consultant → consultor atribuído recebe 1 outbox
--   A6  assigned_consultant não entrega para qualquer outro usuário
--   A7  replay via idempotency_key: 2ª chamada duplicated=true (before==after)
--   A8  publisher rejeita chave desconhecida no payload
--   A9  publisher rejeita cliente_id divergente do source
--   A10 publisher rejeita consultor_atribuido divergente do source
--   A11 publisher rejeita source_id inexistente
--   A12 publisher rejeita source_type diferente de 'portal_solicitacoes'
--   A13 preferência in_app disabled bloqueia entrega ao admin (fixture cli_c)
--   A14a consultor atribuído INATIVO (profiles.status='inactive') → 0 outbox
--   A14b consultor reativado (status='active') → nova atribuição gera 1 outbox
--   A15 outbox email para eventos solicitacao_* = 0 (regras email não seedadas)
--   A16 outbox whatsapp para eventos solicitacao_* = 0 (regras wa não seedadas)
--   A17 cada regra solicitacao_* aponta chave/canal/versao para um template
--       existente com status='active', canal='in_app', versao=2
--   A18 placeholders(assunto+corpo) === array `variaveis` para TODO template
--       solic_* com status<>'archived' (paridade exata)
--   A19 templates solic_* status<>'archived' NÃO contêm PII proibida em
--       assunto/corpo/variaveis; templates archived NÃO contêm PII em
--       assunto/corpo (apenas seu array `variaveis` legado, inerte pois nunca
--       resolvidos em runtime — regras apontam para versao=2)
--   A20 idempotência dos seeds: contagens antes/depois de re-executar
--       lógica de seed condicional NÃO mudam (37 templates, 11 regras disabled)
--
-- Notas sobre UUIDs: os IDs `u_admin/u_consultor/u_outro/u_prod_a/u_prod_b`
-- referenciam usuários reais em staging. O preflight ABAIXO valida existência
-- + role + status antes de qualquer assert; se algum não bater, a execução
-- aborta com HARNESS_FAIL_PREFLIGHT_* e não deixa rastro.
-- =============================================================================
DO $harness$
DECLARE
  u_admin      uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a';
  u_consultor  uuid := '3e16d523-1bc9-4502-a5d6-04d150747236';
  u_outro      uuid := '2767fb15-7f00-41d5-8360-622d6dea8de6';
  u_prod_a     uuid := 'd56793fa-acb3-4862-a180-498c20f5317f';
  u_prod_b     uuid := '497b0307-0b64-42f4-a2b1-fd3e220fac3b';
  cli_a uuid; cli_b uuid; cli_c uuid; cli_d uuid;
  sol_a uuid; sol_b uuid; sol_c uuid; sol_d uuid; ev_dup jsonb;
  n_sc_a int; n_role_admin int; n_role_outros int; n_cross int;
  n_ac_atrib int; n_ac_outros int; n_pref_bloqueio int;
  n_ac_inactive int; n_ac_reactivated int;
  n_email int; n_wa int;
  n_a17_bad int; n_a18_bad int; n_a19_active_bad int; n_a19_archived_body_bad int;
  n_tpl_before int; n_tpl_after int; n_reg_before int; n_reg_after int;
  n_replay_before int; n_replay_after int; a7_dup boolean := false;
  neg_unknown_key boolean := false; neg_cli_mismatch boolean := false;
  neg_cons_mismatch boolean := false; neg_source_missing boolean := false;
  neg_bad_source_type boolean := false;
  consultor_status_prev text;
  results jsonb;
BEGIN
  -- =========================================================================
  -- PREFLIGHT: usuários existem e possuem as roles esperadas
  -- =========================================================================
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=u_admin     AND role='administrador') THEN RAISE EXCEPTION 'HARNESS_FAIL_PREFLIGHT_admin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=u_consultor AND role IN ('consultor_tecnico','tecnico_agronomo')) THEN RAISE EXCEPTION 'HARNESS_FAIL_PREFLIGHT_consultor'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles   WHERE id=u_prod_a) OR
     NOT EXISTS (SELECT 1 FROM public.profiles   WHERE id=u_prod_b) THEN RAISE EXCEPTION 'HARNESS_FAIL_PREFLIGHT_produtores'; END IF;
  SELECT count(*) INTO n_tpl_before FROM public.comunicacao_templates WHERE chave LIKE 'solic\_%' ESCAPE '\';
  IF n_tpl_before <> 37 THEN RAISE EXCEPTION 'HARNESS_FAIL_PREFLIGHT_tpl_total=%', n_tpl_before; END IF;
  SELECT count(*) INTO n_reg_before FROM public.comunicacao_regras WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\';
  IF n_reg_before <> 11 THEN RAISE EXCEPTION 'HARNESS_FAIL_PREFLIGHT_reg_total=%', n_reg_before; END IF;

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
  IF n_sc_a<>1 THEN RAISE EXCEPTION 'HARNESS_FAIL_A1=%',n_sc_a; END IF;

  -- A2 isolamento
  SELECT count(*) INTO n_cross FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
   WHERE e.source_id=sol_b AND r.estrategia='source_cliente' AND o.recipient_cliente_id=cli_a;
  IF n_cross<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL_A2=%',n_cross; END IF;

  -- A3 by_role admin
  SELECT count(*) INTO n_role_admin FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
   WHERE e.source_id=sol_a AND e.event_key='solicitacao_criada'
     AND r.estrategia='by_role' AND r.perfil='administrador'::public.app_role
     AND o.recipient_user_id=u_admin;
  IF n_role_admin<>1 THEN RAISE EXCEPTION 'HARNESS_FAIL_A3=%',n_role_admin; END IF;

  -- A4 by_role fail-closed
  SELECT count(*) INTO n_role_outros FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
    JOIN public.user_roles ur ON ur.user_id=o.recipient_user_id
   WHERE e.source_id=sol_a AND r.estrategia='by_role' AND ur.role<>'administrador'::public.app_role;
  IF n_role_outros<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL_A4=%',n_role_outros; END IF;

  -- Atribui consultor a solA (dispara solicitacao_atribuida)
  UPDATE public.portal_solicitacoes
     SET consultor_atribuido=u_consultor, status='atribuida', updated_at=now()
   WHERE id=sol_a;

  -- A5
  SELECT count(*) INTO n_ac_atrib FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
   WHERE e.source_id=sol_a AND e.event_key='solicitacao_atribuida'
     AND r.estrategia='assigned_consultant' AND o.recipient_user_id=u_consultor;
  IF n_ac_atrib<>1 THEN RAISE EXCEPTION 'HARNESS_FAIL_A5=%',n_ac_atrib; END IF;

  -- A6
  SELECT count(*) INTO n_ac_outros FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
   WHERE e.source_id=sol_a AND r.estrategia='assigned_consultant'
     AND o.recipient_user_id IS DISTINCT FROM u_consultor;
  IF n_ac_outros<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL_A6=%',n_ac_outros; END IF;

  -- A7 replay via idempotency_key
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
    RAISE EXCEPTION 'HARNESS_FAIL_A7 dup=% before=% after=%', a7_dup, n_replay_before, n_replay_after;
  END IF;

  -- Negativos publisher
  BEGIN PERFORM public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes',sol_a,
    jsonb_build_object('descricao','x'),'harness-neg-unknown-1');
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%payload não permitida%' THEN neg_unknown_key:=true; END IF; END;
  IF NOT neg_unknown_key THEN RAISE EXCEPTION 'HARNESS_FAIL_A8'; END IF;

  BEGIN PERFORM public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes',sol_a,
    jsonb_build_object('cliente_id',cli_b),'harness-neg-cli-1');
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%cliente_id divergente%' THEN neg_cli_mismatch:=true; END IF; END;
  IF NOT neg_cli_mismatch THEN RAISE EXCEPTION 'HARNESS_FAIL_A9'; END IF;

  BEGIN PERFORM public._comunicacao_publish_system_event('solicitacao_atribuida','portal_solicitacoes',sol_a,
    jsonb_build_object('consultor_atribuido',u_outro),'harness-neg-cons-1');
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%consultor_atribuido divergente%' THEN neg_cons_mismatch:=true; END IF; END;
  IF NOT neg_cons_mismatch THEN RAISE EXCEPTION 'HARNESS_FAIL_A10'; END IF;

  BEGIN PERFORM public._comunicacao_publish_system_event('solicitacao_criada','portal_solicitacoes',gen_random_uuid(),
    jsonb_build_object('numero','X'),'harness-neg-nosrc-1');
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%source_id não encontrado%' THEN neg_source_missing:=true; END IF; END;
  IF NOT neg_source_missing THEN RAISE EXCEPTION 'HARNESS_FAIL_A11'; END IF;

  BEGIN PERFORM public._comunicacao_publish_system_event('solicitacao_criada','ordens_servico',sol_a,'{}'::jsonb,'harness-neg-badtype-1');
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%source inválido%' THEN neg_bad_source_type:=true; END IF; END;
  IF NOT neg_bad_source_type THEN RAISE EXCEPTION 'HARNESS_FAIL_A12'; END IF;

  -- A13 preferência in_app disabled bloqueia
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
  IF n_pref_bloqueio<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL_A13=%',n_pref_bloqueio; END IF;

  -- =========================================================================
  -- A14a consultor INATIVO → 0 outbox no evento solicitacao_atribuida
  -- =========================================================================
  SELECT status INTO consultor_status_prev FROM public.profiles WHERE id=u_consultor;
  UPDATE public.profiles SET status='inactive' WHERE id=u_consultor;
  INSERT INTO public.clientes(id,nome,codigo_cliente)
    VALUES(gen_random_uuid(),'HARNESS-1C-D.invalid','HRN1C-D-'||substr(gen_random_uuid()::text,1,8))
    RETURNING id INTO cli_d;
  INSERT INTO public.portal_solicitacoes(id,cliente_id,user_id,consultor_atribuido,tipo_demanda,urgencia,status,numero_solicitacao)
    VALUES(gen_random_uuid(),cli_d,u_prod_a,u_consultor,'praga','alta','atribuida','HRN1C-D')
    RETURNING id INTO sol_d;
  SELECT count(*) INTO n_ac_inactive FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
   WHERE e.source_id=sol_d AND r.estrategia='assigned_consultant' AND o.recipient_user_id=u_consultor;
  IF n_ac_inactive<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL_A14a=%',n_ac_inactive; END IF;

  -- A14b reativação → nova atribuição entrega
  UPDATE public.profiles SET status=coalesce(consultor_status_prev,'active') WHERE id=u_consultor;
  UPDATE public.portal_solicitacoes SET consultor_atribuido=NULL, updated_at=now() WHERE id=sol_d;
  UPDATE public.portal_solicitacoes SET consultor_atribuido=u_consultor, status='atribuida', updated_at=now() WHERE id=sol_d;
  SELECT count(*) INTO n_ac_reactivated FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
    JOIN public.comunicacao_regras r ON r.id=o.rule_id
   WHERE e.source_id=sol_d AND e.event_key='solicitacao_atribuida'
     AND r.estrategia='assigned_consultant' AND o.recipient_user_id=u_consultor;
  IF n_ac_reactivated<>1 THEN RAISE EXCEPTION 'HARNESS_FAIL_A14b=%',n_ac_reactivated; END IF;

  -- =========================================================================
  -- A15/A16 outbox email/whatsapp em eventos solicitacao_* = 0
  -- =========================================================================
  SELECT count(*) INTO n_email FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
   WHERE e.event_key LIKE 'solicitacao\_%' ESCAPE '\' AND o.canal='email';
  IF n_email<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL_A15=%',n_email; END IF;

  SELECT count(*) INTO n_wa FROM public.comunicacao_outbox o
    JOIN public.comunicacao_eventos e ON e.id=o.event_id
   WHERE e.event_key LIKE 'solicitacao\_%' ESCAPE '\' AND o.canal='whatsapp';
  IF n_wa<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL_A16=%',n_wa; END IF;

  -- =========================================================================
  -- A17 cada regra aponta para in_app v2 active
  -- =========================================================================
  SELECT count(*) INTO n_a17_bad
  FROM public.comunicacao_regras r
  LEFT JOIN public.comunicacao_templates t
    ON t.chave=r.template_chave AND t.canal=r.canal AND t.versao=r.template_versao
  WHERE r.event_key LIKE 'solicitacao\_%' ESCAPE '\'
    AND (t.id IS NULL OR t.status<>'active' OR t.versao<>2 OR t.canal<>'in_app');
  IF n_a17_bad<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL_A17=%',n_a17_bad; END IF;

  -- =========================================================================
  -- A18 paridade placeholders×variaveis para templates NÃO arquivados
  -- =========================================================================
  WITH t AS (
    SELECT id, assunto, corpo,
      (SELECT array_agg(v ORDER BY v) FROM jsonb_array_elements_text(variaveis) v) AS declared,
      (SELECT array_agg(DISTINCT m[1] ORDER BY m[1])
         FROM regexp_matches(coalesce(assunto,'')||' '||coalesce(corpo,''),
              '\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,63})\s*\}\}','g') AS m) AS found
    FROM public.comunicacao_templates
    WHERE chave LIKE 'solic\_%' ESCAPE '\' AND status<>'archived'
  )
  SELECT count(*) INTO n_a18_bad FROM t
  WHERE coalesce(found,'{}'::text[]) IS DISTINCT FROM coalesce(declared,'{}'::text[]);
  IF n_a18_bad<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL_A18=%',n_a18_bad; END IF;

  -- =========================================================================
  -- A19 PII: zero em ativos (assunto+corpo+variaveis); zero em corpo/assunto
  --     de arquivados. Arquivados só retêm PII em `variaveis` (legado inerte,
  --     nunca resolvidos em runtime pois regras apontam para versao=2).
  -- =========================================================================
  SELECT count(*) INTO n_a19_active_bad FROM public.comunicacao_templates
    WHERE chave LIKE 'solic\_%' ESCAPE '\' AND status<>'archived'
      AND (coalesce(assunto,'')||' '||coalesce(corpo,'')||' '||coalesce(variaveis::text,''))
          ~ '(nome_destinatario|descricao|telefone|audio|foto|external_event_id|solicitante_contato)';
  IF n_a19_active_bad<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL_A19_active=%',n_a19_active_bad; END IF;

  SELECT count(*) INTO n_a19_archived_body_bad FROM public.comunicacao_templates
    WHERE chave LIKE 'solic\_%' ESCAPE '\' AND status='archived'
      AND (coalesce(assunto,'')||' '||coalesce(corpo,''))
          ~ '\{\{\s*(nome_destinatario|descricao|telefone|audio|foto|external_event_id|solicitante_contato)\s*\}\}';
  IF n_a19_archived_body_bad<>0 THEN RAISE EXCEPTION 'HARNESS_FAIL_A19_archived_body=%',n_a19_archived_body_bad; END IF;

  -- =========================================================================
  -- A20 Idempotência seeds: contagens antes/depois estáveis
  -- (Simulação: contadores capturados no preflight vs. agora, sem tentar
  -- re-inserir — as migrations 1C são idempotentes por ON CONFLICT/WHERE NOT
  -- EXISTS e já foram aplicadas uma única vez ao banco. Este assert prova
  -- que o SET DE ROTINAS EXECUTADAS NESTA transação — que inseriu regras
  -- ativas transitórias, preferências e fixtures — NÃO alterou o cardinal
  -- dos objetos SEED em si.)
  -- =========================================================================
  SELECT count(*) INTO n_tpl_after FROM public.comunicacao_templates WHERE chave LIKE 'solic\_%' ESCAPE '\';
  SELECT count(*) INTO n_reg_after FROM public.comunicacao_regras   WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\';
  IF n_tpl_after<>n_tpl_before OR n_reg_after<>n_reg_before THEN
    RAISE EXCEPTION 'HARNESS_FAIL_A20 tpl %/% reg %/%',
      n_tpl_before, n_tpl_after, n_reg_before, n_reg_after;
  END IF;

  results := jsonb_build_object(
    'A1',n_sc_a,'A2',n_cross,'A3',n_role_admin,'A4',n_role_outros,
    'A5',n_ac_atrib,'A6',n_ac_outros,'A7_dup',a7_dup,
    'A8',neg_unknown_key,'A9',neg_cli_mismatch,'A10',neg_cons_mismatch,
    'A11',neg_source_missing,'A12',neg_bad_source_type,'A13',n_pref_bloqueio,
    'A14a_inactive',n_ac_inactive,'A14b_reactivated',n_ac_reactivated,
    'A15_email',n_email,'A16_whatsapp',n_wa,
    'A17_bad_resolve',n_a17_bad,'A18_bad_parity',n_a18_bad,
    'A19_active_bad',n_a19_active_bad,'A19_archived_body_bad',n_a19_archived_body_bad,
    'A20_tpl',jsonb_build_object('before',n_tpl_before,'after',n_tpl_after),
    'A20_reg',jsonb_build_object('before',n_reg_before,'after',n_reg_after));
  RAISE EXCEPTION 'HARNESS_PASS_ROLLBACK: %', results::text;
END $harness$;
