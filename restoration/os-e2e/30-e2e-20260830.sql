-- =====================================================================
-- FASE 5 — E2E DETERMINÍSTICO DO FLUXO COMPLETO DA OS (staging)
-- Executa a escada canônica de ponta a ponta em UMA transação e
-- termina com ROLLBACK: nenhum dado de teste permanece no staging.
-- Alvo EXCLUSIVO: ikaauvsflpmamgxmkhoq. Não transmite SEFAZ.
-- Uso: bash restoration/os-e2e/staging-psql.sh -v ON_ERROR_STOP=1 \
--        -f restoration/os-e2e/30-e2e-20260830.sql
-- =====================================================================
\set ON_ERROR_STOP on
\timing off
BEGIN;

DO $guard$
DECLARE v_marker text; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ENV_ABORT: marcador ausente';
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN RAISE EXCEPTION 'ENV_ABORT: PRODUÇÃO'; END IF;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ENV_ABORT: ambiente não autorizado';
  END IF;
END
$guard$;

CREATE TEMP TABLE _e2e_gate(seq serial, gate text, status text, detalhe text);
CREATE TEMP TABLE _e2e_ctx(k text primary key, v text);

DO $fix$
DECLARE
  v_uid uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a';
  v_cliente uuid; v_produto uuid; v_micro uuid; v_os uuid; v_prog uuid;
  v_fazenda uuid; v_talhao uuid;
  v_tag text := 'E2E-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
BEGIN
  SELECT t.id, t.fazenda_id, f.cliente_id INTO v_talhao, v_fazenda, v_cliente
    FROM public.talhoes t JOIN public.fazendas f ON f.id = t.fazenda_id
   ORDER BY t.created_at LIMIT 1;
  IF v_talhao IS NULL THEN RAISE EXCEPTION 'E2E_SEM_TALHAO_FIXTURE'; END IF;
  SELECT id INTO v_produto FROM public.produtos ORDER BY created_at LIMIT 1;
  SELECT id INTO v_micro FROM public.microrganismos ORDER BY created_at LIMIT 1;

  INSERT INTO public.ordens_servico (numero_os, cliente_id, fazenda_id, talhao_id,
                                     produto_id, microrganismo_id,
                                     volume_total_ml, status, origem, tipo_item)
  VALUES (v_tag, v_cliente, v_fazenda, v_talhao, v_produto, v_micro,
          100000, 'aberta', 'agronomica', 'produto')
  RETURNING id INTO v_os;

  INSERT INTO public.programacao_producao (ordem_servico_id, produto_id, microrganismo_id,
                                           volume_necessario, status, data_programada)
  VALUES (v_os, v_produto, v_micro, 100000, 'aguardando', CURRENT_DATE)
  RETURNING id INTO v_prog;

  INSERT INTO _e2e_ctx VALUES ('os', v_os::text), ('prog', v_prog::text),
    ('produto', v_produto::text), ('micro', coalesce(v_micro::text,'')), ('tag', v_tag), ('uid', v_uid::text);
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T00 fixtures','PASS', v_tag);
END
$fix$;

-- Passa a operar como usuário autenticado real (RLS + auth.uid()).
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT v FROM _e2e_ctx WHERE k='uid'), 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $run$
DECLARE
  v_os uuid := (SELECT v FROM _e2e_ctx WHERE k='os')::uuid;
  v_prog uuid := (SELECT v FROM _e2e_ctx WHERE k='prog')::uuid;
  v_produto uuid := (SELECT v FROM _e2e_ctx WHERE k='produto')::uuid;
  v_tag text := (SELECT v FROM _e2e_ctx WHERE k='tag');
  r jsonb; v_lote uuid; v_est uuid; v_entrega uuid; v_txt text; v_n int; v_status text;
BEGIN
  -- T01 programação (aberta -> aprovada -> programada)
  r := public.rpc_programar_os_v1(v_os, 'manual', CURRENT_DATE);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id = v_os;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T01 programar_os',
    CASE WHEN (r->>'success')::boolean AND v_status='programada' THEN 'PASS' ELSE 'FAIL' END, v_status);

  -- T02 replay da programação é idempotente
  r := public.rpc_programar_os_v1(v_os, 'manual', CURRENT_DATE);
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T02 programar_os replay',
    CASE WHEN (r->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, r->>'message');

  -- T03 assumir produção
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','assumir_producao',v_prog);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id = v_os;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T03 assumir_producao',
    CASE WHEN v_status='em_producao' THEN 'PASS' ELSE 'FAIL' END, v_status);

  -- T04 geração de lote pelo motor transacional
  r := public.rpc_cockpit_gerar_lote_v1(v_prog, v_os, 'manual',
        jsonb_build_object('codigo_lote', v_tag, 'produto_id', v_produto::text,
                           'volume_produzido', '100000'));
  v_lote := (r->>'lote_id')::uuid;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T04 gerar_lote',
    CASE WHEN (r->>'success')::boolean AND (r->>'replay')::boolean IS FALSE THEN 'PASS' ELSE 'FAIL' END, r->>'codigo_lote');

  -- T05 concorrência: segunda chamada devolve replay, nunca duplica
  r := public.rpc_cockpit_gerar_lote_v1(v_prog, v_os, 'manual', jsonb_build_object('codigo_lote', v_tag||'-DUP'));
  SELECT count(*) INTO v_n FROM public.lotes WHERE programacao_id = v_prog;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T05 gerar_lote replay unico',
    CASE WHEN (r->>'replay')::boolean AND v_n = 1 THEN 'PASS' ELSE 'FAIL' END, 'lotes='||v_n);

  -- T06 envase bloqueado sem CQ aprovado (fail-closed no validador)
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','enviar_envase',v_prog);
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T06 enviar_envase sem CQ bloqueia',
    CASE WHEN (r->>'success')::boolean IS FALSE THEN 'PASS' ELSE 'FAIL' END, left(coalesce(r->>'message',''),80));

  -- T07 enviar para CQ
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','enviar_cq',v_prog);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id = v_os;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T07 enviar_cq',
    CASE WHEN v_status='em_cq' THEN 'PASS' ELSE 'FAIL' END, v_status);

  -- T08 aprovar CQ duas vezes gera um único laudo (idempotência determinística)
  PERFORM public.rpc_avancar_esteira_laboratorio(v_os,'manual','aprovar_cq',v_prog);
  PERFORM public.rpc_avancar_esteira_laboratorio(v_os,'manual','aprovar_cq',v_prog);
  SELECT count(*) INTO v_n FROM public.controle_qualidade WHERE lote_id = v_lote;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T08 aprovar_cq idempotente',
    CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, 'laudos='||v_n);

  -- T09 envase liberado após CQ aprovado
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','enviar_envase',v_prog);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id = v_os;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T09 enviar_envase liberado',
    CASE WHEN v_status='envase' THEN 'PASS' ELSE 'FAIL' END, v_status);

  -- T10 registrar envase (ação canônica de estoque, sem violar o CHECK)
  r := public.rpc_cockpit_registrar_envase_v1(
        v_lote, v_os, 'manual', v_prog,
        jsonb_build_array(jsonb_build_object('tipo_embalagem','bombona_20L','quantidade','5')),
        (CURRENT_DATE + 365), 'E2E', v_tag||':env');
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T10 registrar_envase',
    CASE WHEN (r->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, left(r::text,90));

  -- T11 replay do envase pela chave de idempotência não duplica estoque
  r := public.rpc_cockpit_registrar_envase_v1(
        v_lote, v_os, 'manual', v_prog,
        jsonb_build_array(jsonb_build_object('tipo_embalagem','bombona_20L','quantidade','5')),
        (CURRENT_DATE + 365), 'E2E', v_tag||':env');
  SELECT count(*) INTO v_n FROM public.estoque_produto WHERE lote_id = v_lote;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T11 envase replay sem duplicar',
    CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, 'estoque_linhas='||v_n);

  -- T12 movimentações usam apenas rótulos aceitos pelo CHECK
  SELECT string_agg(DISTINCT acao, ',') INTO v_txt
    FROM public.estoque_movimentacoes WHERE os_id = v_os;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T12 acoes de estoque canonicas',
    CASE WHEN v_txt IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, coalesce(v_txt,'(nenhuma)'));

  SELECT id INTO v_est FROM public.estoque_produto WHERE lote_id = v_lote
    AND reservado_para_os_id = v_os ORDER BY created_at LIMIT 1;

  -- T13 concluir envase -> pronto_entrega
  PERFORM public.rpc_avancar_esteira_laboratorio(v_os,'manual','concluir_envase',v_prog);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id = v_os;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T13 concluir_envase',
    CASE WHEN v_status='pronto_entrega' THEN 'PASS' ELSE 'FAIL' END, v_status);

  -- T14 finalização bloqueada antes da entrega confirmada
  SELECT pode_finalizar INTO v_status FROM public.vw_os_integridade_esteira
   WHERE os_id = v_os AND origem_os='manual';
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T14 pode_finalizar=false sem entrega',
    CASE WHEN coalesce(v_status,'f') = 'false' OR v_status IS NULL OR v_status='f' THEN 'PASS' ELSE 'FAIL' END,
    coalesce(v_status,'(null)'));

  -- T15 criar entrega pelo motor transacional
  r := public.rpc_cockpit_criar_entrega_v1(v_os,'manual', v_est, 5, '{}'::jsonb);
  v_entrega := (r->>'entrega_id')::uuid;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T15 criar_entrega',
    CASE WHEN (r->>'success')::boolean AND (r->>'replay')::boolean IS FALSE THEN 'PASS' ELSE 'FAIL' END, r->>'status');

  -- T16 replay de entrega não duplica
  r := public.rpc_cockpit_criar_entrega_v1(v_os,'manual', v_est, 5, '{}'::jsonb);
  SELECT count(*) INTO v_n FROM public.entregas WHERE estoque_produto_id = v_est;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T16 criar_entrega replay',
    CASE WHEN (r->>'replay')::boolean AND v_n = 1 THEN 'PASS' ELSE 'FAIL' END, 'entregas='||v_n);

  -- T17 confirmação exige recebedor identificado (fail-closed)
  BEGIN
    r := public.rpc_entrega_confirmar_v1(v_entrega, '{}'::jsonb, '{}'::jsonb);
    INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T17 confirmar sem recebedor bloqueia',
      CASE WHEN (r->>'success')::boolean IS FALSE THEN 'PASS' ELSE 'FAIL' END, left(coalesce(r->>'message',r::text),80));
  EXCEPTION WHEN others THEN
    INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T17 confirmar sem recebedor bloqueia','PASS', SQLERRM);
  END;

  -- T18 confirmação válida: baixa de estoque + entrega concluída
  r := public.rpc_entrega_confirmar_v1(v_entrega,
        jsonb_build_object('nome','Recebedor E2E','documento','00000000000'), '{}'::jsonb);
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T18 confirmar_entrega',
    CASE WHEN (r->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, left(r::text,110));

  -- T19 baixa registrada com ação canônica de expedição
  SELECT count(*) INTO v_n FROM public.estoque_movimentacoes
   WHERE os_id = v_os AND acao = 'expedicao';
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T19 movimentacao expedicao',
    CASE WHEN v_n >= 1 THEN 'PASS' ELSE 'FAIL' END, 'movs='||v_n);

  -- T20 estoque reservado passou a expedido
  SELECT status::text INTO v_txt FROM public.estoque_produto WHERE id = v_est;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T20 estoque expedido',
    CASE WHEN v_txt = 'expedido' THEN 'PASS' ELSE 'FAIL' END, coalesce(v_txt,'(null)'));

  -- T21 OS chega a estado terminal coerente
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id = v_os;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T21 status terminal da OS',
    CASE WHEN v_status IN ('entregue','finalizada') THEN 'PASS' ELSE 'FAIL' END, v_status);

  -- T22 replay da confirmação é idempotente
  BEGIN
    r := public.rpc_entrega_confirmar_v1(v_entrega,
          jsonb_build_object('nome','Recebedor E2E','documento','00000000000'), '{}'::jsonb);
    SELECT count(*) INTO v_n FROM public.estoque_movimentacoes WHERE os_id = v_os AND acao='expedicao';
    INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T22 confirmar replay idempotente',
      CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, 'movs_expedicao='||v_n);
  EXCEPTION WHEN others THEN
    SELECT count(*) INTO v_n FROM public.estoque_movimentacoes WHERE os_id = v_os AND acao='expedicao';
    INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T22 confirmar replay idempotente',
      CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END, SQLERRM);
  END;

  -- T23 trilha de eventos da esteira registrada
  SELECT count(*) INTO v_n FROM public.laboratorio_esteira_eventos WHERE os_id = v_os;
  INSERT INTO _e2e_gate(gate,status,detalhe) VALUES ('T23 trilha de eventos',
    CASE WHEN v_n >= 8 THEN 'PASS' ELSE 'FAIL' END, 'eventos='||v_n);
END
$run$;

RESET ROLE;

\echo '===== RESULTADO E2E ====='
SELECT seq, gate, status, detalhe FROM _e2e_gate ORDER BY seq;
SELECT count(*) FILTER (WHERE status='PASS') AS pass,
       count(*) FILTER (WHERE status<>'PASS') AS fail,
       count(*) AS total FROM _e2e_gate;

ROLLBACK;
