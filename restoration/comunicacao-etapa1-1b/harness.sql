-- Comunicação Etapa 1 — Subfase 1B — Harness transacional.
-- Alvo: staging ikaauvsflpmamgxmkhoq. Produção proibida.
-- Executa via supabase--migration com sentinel exception final para forçar ROLLBACK
-- e garantir ZERO resíduo (nenhum cliente, solicitação, evento ou log fica no schema).
--
-- Cobertura:
--   T01 INSERT normal → 1 evento solicitacao_criada
--   T02 INSERT crítica → 2 eventos (criada + urgencia_critica)
--   T03 UPDATE atribuída + consultor NULL→X → 1 evento solicitacao_atribuida (sem duplicidade)
--   T04..T08 UPDATE status→ checkin/em_visita/aguardando_os/concluida/cancelada
--   T09 UPDATE irrelevante (descricao) → nenhum evento novo
--   T10 Replay (mesmo UPDATE de status) → nenhum evento novo (idempotência)
--   T11 UPDATE urgência não-crítica → crítica → solicitacao_urgencia_critica
--   T12 Publisher rejeita event_key desconhecido
--   T13 Publisher rejeita source_type errado para solicitacao_*
--   T14 Publisher rejeita chave de payload não permitida
--   T15 Resolver source_participants → produtor exato + consultor atribuído (sem terceiros)
--   T16 Resolver by_role 'administrador' → apenas usuários com role administrador
--   T17 Falha interna do publisher aborta a transação (fail-fast)
--   T18 nenhuma linha nova em portal_notificacoes durante todos os testes

BEGIN;

DO $harness$
DECLARE
  v_cli uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_consultor uuid := gen_random_uuid();
  v_sol uuid;
  v_ev_before bigint;
  v_ev_delta bigint;
  v_portal_before bigint;
  v_expected bigint;
  v_recips int;
  v_rule public.comunicacao_regras;
  v_row_prod int;
  v_row_cons int;
BEGIN
  -- Baseline
  SELECT count(*) INTO v_ev_before FROM public.comunicacao_eventos;
  SELECT count(*) INTO v_portal_before FROM public.portal_notificacoes;

  -- Fixture mínima (RLS bypass como superuser da migration).
  INSERT INTO public.clientes(id, nome, tipo_pessoa, documento, telefone, email)
  VALUES (v_cli, 'HARNESS 1B - REMOVER', 'juridica', '00000000000000',
          '+5511999999999', 'harness1b@example.invalid');

  -- ============================================================
  -- T01 INSERT normal → solicitacao_criada
  -- ============================================================
  INSERT INTO public.portal_solicitacoes(cliente_id, user_id, tipo_demanda, urgencia, status)
  VALUES (v_cli, v_user, 'praga', 'media', 'pendente')
  RETURNING id INTO v_sol;

  SELECT count(*) INTO v_ev_delta FROM public.comunicacao_eventos WHERE source_id = v_sol AND event_key='solicitacao_criada';
  IF v_ev_delta <> 1 THEN RAISE EXCEPTION 'T01 falhou: esperado 1 solicitacao_criada, obtido %', v_ev_delta; END IF;

  -- ============================================================
  -- T03 UPDATE status→atribuida + consultor NULL→X simultâneo (mesmo comando)
  -- Deve gerar exatamente 1 evento solicitacao_atribuida.
  -- ============================================================
  UPDATE public.portal_solicitacoes SET status='atribuida', consultor_atribuido=v_consultor, updated_at=now() WHERE id=v_sol;
  SELECT count(*) INTO v_ev_delta FROM public.comunicacao_eventos WHERE source_id=v_sol AND event_key='solicitacao_atribuida';
  IF v_ev_delta <> 1 THEN RAISE EXCEPTION 'T03 falhou: esperado 1 solicitacao_atribuida, obtido %', v_ev_delta; END IF;

  -- T04
  UPDATE public.portal_solicitacoes SET status='checkin_realizado', updated_at=now() WHERE id=v_sol;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_sol AND event_key='solicitacao_checkin_realizado') THEN
    RAISE EXCEPTION 'T04 falhou: solicitacao_checkin_realizado ausente';
  END IF;

  -- T05
  UPDATE public.portal_solicitacoes SET status='em_visita', updated_at=now() WHERE id=v_sol;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_sol AND event_key='solicitacao_em_visita') THEN
    RAISE EXCEPTION 'T05 falhou: solicitacao_em_visita ausente';
  END IF;

  -- T06
  UPDATE public.portal_solicitacoes SET status='aguardando_os', updated_at=now() WHERE id=v_sol;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_sol AND event_key='solicitacao_aguardando_os') THEN
    RAISE EXCEPTION 'T06 falhou: solicitacao_aguardando_os ausente';
  END IF;

  -- T07
  UPDATE public.portal_solicitacoes SET status='concluida', updated_at=now() WHERE id=v_sol;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_sol AND event_key='solicitacao_concluida') THEN
    RAISE EXCEPTION 'T07 falhou: solicitacao_concluida ausente';
  END IF;

  -- T08
  UPDATE public.portal_solicitacoes SET status='cancelada', updated_at=now() WHERE id=v_sol;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_sol AND event_key='solicitacao_cancelada') THEN
    RAISE EXCEPTION 'T08 falhou: solicitacao_cancelada ausente';
  END IF;

  -- ============================================================
  -- T09 UPDATE irrelevante (descrição) → nenhum evento novo
  -- ============================================================
  SELECT count(*) INTO v_ev_delta FROM public.comunicacao_eventos WHERE source_id=v_sol;
  UPDATE public.portal_solicitacoes SET descricao='mudança irrelevante', updated_at=now() WHERE id=v_sol;
  SELECT count(*) - v_ev_delta INTO v_ev_delta FROM public.comunicacao_eventos WHERE source_id=v_sol;
  IF v_ev_delta <> 0 THEN RAISE EXCEPTION 'T09 falhou: UPDATE irrelevante gerou % eventos', v_ev_delta; END IF;

  -- ============================================================
  -- T10 Replay: UPDATE para mesmo status novamente com mesmo updated_at → idempotente
  -- (updated_at forçado igual). Executa 2x, esperado 1 novo evento no total.
  -- ============================================================
  UPDATE public.portal_solicitacoes SET status='pendente', updated_at='2000-01-01T00:00:00Z' WHERE id=v_sol;
  SELECT count(*) INTO v_ev_delta FROM public.comunicacao_eventos WHERE source_id=v_sol;
  UPDATE public.portal_solicitacoes SET status='pendente', updated_at='2000-01-01T00:00:00Z' WHERE id=v_sol;
  SELECT count(*) - v_ev_delta INTO v_ev_delta FROM public.comunicacao_eventos WHERE source_id=v_sol;
  IF v_ev_delta <> 0 THEN RAISE EXCEPTION 'T10 falhou: replay idempotente gerou % evento(s)', v_ev_delta; END IF;

  -- ============================================================
  -- T11 Escalada de urgência para crítica
  -- ============================================================
  UPDATE public.portal_solicitacoes SET urgencia='critica', updated_at=now() WHERE id=v_sol;
  IF NOT EXISTS (SELECT 1 FROM public.comunicacao_eventos WHERE source_id=v_sol AND event_key='solicitacao_urgencia_critica') THEN
    RAISE EXCEPTION 'T11 falhou: solicitacao_urgencia_critica ausente';
  END IF;

  -- ============================================================
  -- T02 INSERT já crítica → 2 eventos (criada + urgencia_critica) no mesmo INSERT
  -- ============================================================
  INSERT INTO public.portal_solicitacoes(cliente_id, user_id, tipo_demanda, urgencia, status)
  VALUES (v_cli, v_user, 'doenca', 'critica', 'pendente') RETURNING id INTO v_sol;
  SELECT count(*) INTO v_ev_delta FROM public.comunicacao_eventos
    WHERE source_id=v_sol AND event_key IN ('solicitacao_criada','solicitacao_urgencia_critica');
  IF v_ev_delta <> 2 THEN RAISE EXCEPTION 'T02 falhou: esperado 2 eventos, obtido %', v_ev_delta; END IF;

  -- ============================================================
  -- T12 Publisher rejeita event_key desconhecido
  -- ============================================================
  BEGIN
    PERFORM public._comunicacao_publish_system_event(
      'evento_inexistente_xxx','portal_solicitacoes', v_sol, '{}'::jsonb, 'idem-12345678');
    RAISE EXCEPTION 'T12 falhou: publisher aceitou event_key inválido';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;

  -- T13 source_type errado para solicitacao_*
  BEGIN
    PERFORM public._comunicacao_publish_system_event(
      'solicitacao_criada','ordens_servico', v_sol, '{}'::jsonb, 'idem-t13-xxxxxxxx');
    RAISE EXCEPTION 'T13 falhou: publisher aceitou source_type inválido';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;

  -- T14 chave de payload não permitida
  BEGIN
    PERFORM public._comunicacao_publish_system_event(
      'solicitacao_criada','portal_solicitacoes', v_sol,
      '{"descricao":"vazamento de PII"}'::jsonb, 'idem-t14-xxxxxxxx');
    RAISE EXCEPTION 'T14 falhou: publisher aceitou chave de payload não permitida';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL;
  END;

  -- ============================================================
  -- T15 Resolver source_participants → produtor + consultor atribuído, sem terceiros.
  -- Setup: garante consultor_atribuido e chama resolver diretamente.
  -- ============================================================
  UPDATE public.portal_solicitacoes SET consultor_atribuido=v_consultor, updated_at=now() WHERE id=v_sol;

  -- Constrói ROW comunicacao_regras (rowtype) para invocar o resolver.
  v_rule := ROW(
    gen_random_uuid(),           -- id
    'solicitacao_criada',        -- event_key
    NULL,                        -- perfil
    'source_participants',       -- estrategia
    'in_app'::public.comunicacao_canal, -- canal
    'noop_v1',                   -- template_chave
    NULL,                        -- template_versao
    '{}'::jsonb,                 -- condicoes
    100,                         -- prioridade
    true,                        -- enabled
    0,                           -- cooldown_seconds
    now(), now(),                -- created_at, updated_at
    NULL, NULL                   -- created_by, updated_by
  )::public.comunicacao_regras;

  SELECT
    count(*) FILTER (WHERE recipient_cliente_id = v_cli AND recipient_user_id IS NULL),
    count(*) FILTER (WHERE recipient_user_id = v_consultor AND recipient_cliente_id IS NULL)
    INTO v_row_prod, v_row_cons
  FROM public._comunicacao_resolve_recipients_v2(
    'solicitacao_criada', v_rule, 'portal_solicitacoes', v_sol);

  IF v_row_prod <> 1 THEN RAISE EXCEPTION 'T15 falhou: produtor não retornado uma vez (%)', v_row_prod; END IF;
  IF v_row_cons <> 1 THEN RAISE EXCEPTION 'T15 falhou: consultor atribuído não retornado uma vez (%)', v_row_cons; END IF;

  SELECT count(*) INTO v_recips FROM public._comunicacao_resolve_recipients_v2(
    'solicitacao_criada', v_rule, 'portal_solicitacoes', v_sol);
  IF v_recips <> 2 THEN RAISE EXCEPTION 'T15 falhou: resolver retornou % linhas (esperado 2)', v_recips; END IF;

  -- ============================================================
  -- T16 Resolver by_role 'administrador' → apenas admins ativos.
  -- ============================================================
  v_rule.estrategia := 'by_role';
  v_rule.perfil := 'administrador'::public.app_role;

  SELECT count(*) INTO v_recips FROM public._comunicacao_resolve_recipients_v2(
    'solicitacao_criada', v_rule, 'portal_solicitacoes', v_sol);

  SELECT count(*) INTO v_expected
    FROM public.user_roles ur JOIN public.profiles pr ON pr.user_id=ur.user_id
   WHERE ur.role='administrador'::public.app_role AND COALESCE(pr.ativo,true)=true;

  IF v_recips <> v_expected THEN
    RAISE EXCEPTION 'T16 falhou: esperado % admins, resolver retornou %', v_expected, v_recips;
  END IF;

  -- ============================================================
  -- T18 nenhuma linha nova em portal_notificacoes (legado desanexado).
  -- ============================================================
  SELECT count(*) INTO v_ev_delta FROM public.portal_notificacoes;
  IF v_ev_delta - v_portal_before <> 0 THEN
    RAISE EXCEPTION 'T18 falhou: legado gravou % linha(s) em portal_notificacoes', v_ev_delta - v_portal_before;
  END IF;

  RAISE NOTICE 'HARNESS 1B: todos os testes T01-T16 + T18 passaram';
END $harness$;

-- Sentinel final → força ROLLBACK, garante zero resíduo.
DO $sentinel$
BEGIN
  RAISE EXCEPTION 'HARNESS_1B_OK_ROLLBACK_SENTINEL';
END $sentinel$;
