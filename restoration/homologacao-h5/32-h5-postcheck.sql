-- =====================================================================
-- H5 — POSTCHECK COMPORTAMENTAL (reserva atômica/idempotente + ACL)
-- Transacional: BEGIN ... ROLLBACK (zero resíduo).
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq. Produção RECUSADA.
-- Uso: bash restoration/os-e2e/staging-psql.sh -f restoration/homologacao-h5/32-h5-postcheck.sql
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
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN RAISE EXCEPTION 'ENV_ABORT: PRODUCAO PROIBIDA'; END IF;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ENV_ABORT: ambiente nao autorizado';
  END IF;
END
$guard$;

CREATE TEMP TABLE _g(seq serial, gate text, status text, detalhe text);
CREATE TEMP TABLE _c(k text primary key, v text);
GRANT SELECT, INSERT ON _g TO authenticated;
GRANT SELECT, USAGE ON SEQUENCE _g_seq_seq TO authenticated;
GRANT SELECT ON _c TO authenticated;

-- Estático: anon não executa as RPCs críticas de estoque (T18).
INSERT INTO _g(gate,status,detalhe)
SELECT 'A01 anon sem EXECUTE nas RPCs de estoque',
  CASE WHEN bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) THEN 'FAIL' ELSE 'PASS' END,
  string_agg(p.proname, ',')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('rpc_estoque_reservar_v1','reservar_estoque_item','rpc_estoque_operar_v1',
                    'rpc_cockpit_cancelar_reserva_v1','rpc_cockpit_criar_entrega_v1');

INSERT INTO _g(gate,status,detalhe)
SELECT 'A02 SECDEF de estoque com search_path explicito',
  CASE WHEN count(*) FILTER (WHERE p.proconfig IS NULL) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'secdef='||count(*)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND p.proname IN ('rpc_estoque_reservar_v1','reservar_estoque_item');

-- ---------------------------------------------------------------------
-- FIXTURE: OS nova até o envase (prefixo H5-)
-- ---------------------------------------------------------------------
DO $fix$
DECLARE
  v_uid uuid; v_cliente uuid; v_produto uuid; v_micro uuid; v_os uuid; v_prog uuid;
  v_fazenda uuid; v_talhao uuid;
  v_tag text := 'H5-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
BEGIN
  SELECT ur.user_id INTO v_uid FROM public.user_roles ur
   WHERE ur.role::text IN ('administrador','gestor') LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'H5_SEM_USUARIO_OPERADOR'; END IF;

  SELECT t.id, t.fazenda_id, f.cliente_id INTO v_talhao, v_fazenda, v_cliente
    FROM public.talhoes t JOIN public.fazendas f ON f.id = t.fazenda_id
   ORDER BY t.created_at LIMIT 1;
  IF v_talhao IS NULL THEN RAISE EXCEPTION 'H5_SEM_TALHAO_FIXTURE'; END IF;

  SELECT id INTO v_produto FROM public.produtos ORDER BY created_at LIMIT 1;
  SELECT id INTO v_micro FROM public.microrganismos ORDER BY created_at LIMIT 1;

  INSERT INTO public.ordens_servico (numero_os, cliente_id, fazenda_id, talhao_id,
                                     produto_id, microrganismo_id,
                                     volume_total_ml, status, origem, tipo_item)
  VALUES (v_tag, v_cliente, v_fazenda, v_talhao, v_produto, v_micro,
          100000, 'aberta', 'agronomica', 'produto')
  RETURNING id INTO v_os;

  SELECT id INTO v_prog FROM public.programacao_producao WHERE ordem_servico_id = v_os LIMIT 1;
  IF v_prog IS NULL THEN
    INSERT INTO public.programacao_producao (ordem_servico_id, produto_id, microrganismo_id,
                                             volume_necessario, status, data_programada)
    VALUES (v_os, v_produto, v_micro, 100000, 'aguardando', CURRENT_DATE)
    RETURNING id INTO v_prog;
  END IF;

  INSERT INTO _c VALUES ('os',v_os::text),('prog',v_prog::text),('produto',v_produto::text),
    ('cliente',v_cliente::text),('tag',v_tag),('uid',v_uid::text);
END
$fix$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub',(SELECT v FROM _c WHERE k='uid'),'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $run$
DECLARE
  v_os uuid := (SELECT v FROM _c WHERE k='os')::uuid;
  v_prog uuid := (SELECT v FROM _c WHERE k='prog')::uuid;
  v_produto uuid := (SELECT v FROM _c WHERE k='produto')::uuid;
  v_cliente uuid := (SELECT v FROM _c WHERE k='cliente')::uuid;
  v_tag text := (SELECT v FROM _c WHERE k='tag');
  r jsonb; v_lote uuid; v_est uuid; v_qtd numeric;
  v_key text; v_n int; v_n2 int; v_disp numeric; v_status text; v_ok boolean;
  v_itens jsonb; v_dados jsonb; v_res uuid;
BEGIN
  PERFORM public.rpc_programar_os_v1(v_os,'manual',CURRENT_DATE);
  PERFORM public.rpc_avancar_esteira_laboratorio(v_os,'manual','assumir_producao',v_prog);
  r := public.rpc_cockpit_gerar_lote_v1(v_prog, v_os, 'manual',
        jsonb_build_object('codigo_lote', v_tag, 'produto_id', v_produto::text,
                           'volume_produzido','100000'));
  v_lote := (r->>'lote_id')::uuid;
  PERFORM public.rpc_avancar_esteira_laboratorio(v_os,'manual','enviar_cq',v_prog);
  PERFORM public.rpc_avancar_esteira_laboratorio(v_os,'manual','aprovar_cq',v_prog);
  PERFORM public.rpc_avancar_esteira_laboratorio(v_os,'manual','enviar_envase',v_prog);
  r := public.rpc_cockpit_registrar_envase_v1(v_lote, v_os,'manual',v_prog,
        jsonb_build_array(jsonb_build_object('tipo_embalagem','bombona_20L','quantidade','5')),
        (CURRENT_DATE+365),'H5', v_tag||':env');

  SELECT id, quantidade, status::text INTO v_est, v_qtd, v_status
    FROM public.estoque_produto WHERE lote_id = v_lote ORDER BY created_at LIMIT 1;

  INSERT INTO _g(gate,status,detalhe) VALUES ('F00 fixture ate envase',
    CASE WHEN v_est IS NOT NULL AND v_qtd = 5 THEN 'PASS' ELSE 'FAIL' END,
    'estoque='||coalesce(v_est::text,'null')||' qtd='||coalesce(v_qtd::text,'?')||' status='||coalesce(v_status,'?'));

  v_dados := jsonb_build_object('cliente_id', v_cliente::text, 'observacao', v_tag||' reserva H5');
  v_key := v_tag || ':reserva-lote';

  -- T-A: chave de idempotência obrigatória
  BEGIN
    r := public.rpc_estoque_reservar_v1(v_os,'manual',
          jsonb_build_array(jsonb_build_object('item_id',v_est::text,'quantidade','1')), 'curta', v_dados);
    v_ok := false;
  EXCEPTION WHEN others THEN v_ok := SQLERRM LIKE '%ESTQ_IDEMPOTENCY_OBRIGATORIA%';
  END;
  INSERT INTO _g(gate,status,detalhe) VALUES ('T-A chave de idempotencia obrigatoria',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, 'rejeitado='||v_ok);

  -- T-B: reserva acima do disponível é negada (sem saldo negativo)
  BEGIN
    r := public.rpc_estoque_reservar_v1(v_os,'manual',
          jsonb_build_array(jsonb_build_object('item_id',v_est::text,'quantidade', (v_qtd+10)::text)),
          v_key||':over', v_dados);
    v_ok := false;
  EXCEPTION WHEN others THEN v_ok := true;
  END;
  SELECT quantidade INTO v_disp FROM public.estoque_produto WHERE id=v_est;
  INSERT INTO _g(gate,status,detalhe) VALUES ('T-B reserva acima do disponivel negada',
    CASE WHEN v_ok AND v_disp = v_qtd THEN 'PASS' ELSE 'FAIL' END, 'saldo='||v_disp);

  -- T-C: reserva parcial atômica (2 de 5) em uma única transação
  SELECT count(*) INTO v_n FROM public.estoque_movimentacoes WHERE estoque_produto_id = v_est;
  r := public.rpc_estoque_reservar_v1(v_os,'manual',
        jsonb_build_array(jsonb_build_object('item_id',v_est::text,'quantidade','2')), v_key, v_dados);
  v_res := ((r->'itens')->>0)::uuid;
  SELECT quantidade INTO v_disp FROM public.estoque_produto WHERE id=v_est;
  INSERT INTO _g(gate,status,detalhe) VALUES ('T-C reserva parcial atomica',
    CASE WHEN (r->>'ok')::boolean AND (r->>'replay')::boolean IS FALSE AND v_disp = v_qtd-2
         THEN 'PASS' ELSE 'FAIL' END,
    'saldo_restante='||v_disp||' reservado_id='||coalesce(v_res::text,'null'));

  -- T-D: replay com a MESMA chave não duplica movimento nem reserva (H1-013 / T9)
  SELECT count(*) INTO v_n FROM public.estoque_movimentacoes
   WHERE idempotency_key = v_key OR idempotency_key LIKE v_key||'#%';
  r := public.rpc_estoque_reservar_v1(v_os,'manual',
        jsonb_build_array(jsonb_build_object('item_id',v_est::text,'quantidade','2')), v_key, v_dados);
  SELECT count(*) INTO v_n2 FROM public.estoque_movimentacoes
   WHERE idempotency_key = v_key OR idempotency_key LIKE v_key||'#%';
  SELECT quantidade INTO v_disp FROM public.estoque_produto WHERE id=v_est;
  INSERT INTO _g(gate,status,detalhe) VALUES ('T-D replay idempotente sem duplicar',
    CASE WHEN (r->>'replay')::boolean AND v_n2 = v_n AND v_disp = v_qtd-2 THEN 'PASS' ELSE 'FAIL' END,
    'mov_antes='||v_n||' mov_depois='||v_n2||' saldo='||v_disp);

  -- T-E: rastreabilidade causal da movimentação (referência, autoria, ledger)
  SELECT count(*) INTO v_n FROM public.estoque_movimentacoes
   WHERE (idempotency_key = v_key OR idempotency_key LIKE v_key||'#%')
     AND acao = 'reserva' AND usuario_id IS NOT NULL
     AND referencia_tipo = 'ordem_servico' AND referencia_id = v_os;
  INSERT INTO _g(gate,status,detalhe) VALUES ('T-E movimentacao com referencia causal e autoria',
    CASE WHEN v_n >= 1 THEN 'PASS' ELSE 'FAIL' END, 'lancamentos='||v_n);

  -- T-F: cancelamento de reserva libera saldo exatamente uma vez
  SELECT quantidade INTO v_disp FROM public.estoque_produto WHERE id=v_est;
  BEGIN
    r := public.rpc_cockpit_cancelar_reserva_v1(v_res, v_os, 'manual', v_tag||' cancelamento H5');
    v_ok := coalesce((r->>'success')::boolean, true);
  EXCEPTION WHEN others THEN v_ok := false; r := jsonb_build_object('erro', SQLERRM);
  END;
  SELECT count(*) INTO v_n FROM public.estoque_movimentacoes
   WHERE estoque_produto_id IN (v_est, v_res) AND acao = 'cancelamento_reserva';
  INSERT INTO _g(gate,status,detalhe) VALUES ('T-F cancelamento reverte reserva',
    CASE WHEN v_ok AND v_n = 1 THEN 'PASS' ELSE 'FAIL' END,
    'estornos='||v_n||' ret='||left(r::text,60));

  -- T-G: replay do cancelamento não estorna duas vezes
  BEGIN
    r := public.rpc_cockpit_cancelar_reserva_v1(v_res, v_os, 'manual', v_tag||' cancelamento H5');
  EXCEPTION WHEN others THEN r := jsonb_build_object('erro', SQLERRM);
  END;
  SELECT count(*) INTO v_n2 FROM public.estoque_movimentacoes
   WHERE estoque_produto_id IN (v_est, v_res) AND acao = 'cancelamento_reserva';
  INSERT INTO _g(gate,status,detalhe) VALUES ('T-G replay cancelamento sem duplo estorno',
    CASE WHEN v_n2 = v_n THEN 'PASS' ELSE 'FAIL' END, 'antes='||v_n||' depois='||v_n2);

  -- T-H: nenhum saldo negativo na fixture
  SELECT count(*) INTO v_n FROM public.estoque_produto
   WHERE lote_id = v_lote AND (coalesce(quantidade,0) < 0 OR coalesce(quantidade_reservada,0) < 0);
  INSERT INTO _g(gate,status,detalhe) VALUES ('T-H sem saldo negativo',
    CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, 'linhas_negativas='||v_n);

  INSERT INTO _c VALUES ('lote', v_lote::text), ('est', v_est::text);
END
$run$;

RESET ROLE;

-- T-I: usuário sem papel operacional não reserva (fail-closed)
DO $neg$
DECLARE
  v_os uuid := (SELECT v FROM _c WHERE k='os')::uuid;
  v_est uuid := (SELECT v FROM _c WHERE k='est')::uuid;
  v_sub text := gen_random_uuid()::text;
  v_a boolean := false; v_b boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_sub,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.rpc_estoque_reservar_v1(v_os,'manual',
      jsonb_build_array(jsonb_build_object('item_id',v_est::text,'quantidade','1')),
      'H5-negativo-sem-papel', '{}'::jsonb);
  EXCEPTION WHEN others THEN v_a := SQLERRM LIKE '%ESTQ_SEM_PERMISSAO%';
  END;
  BEGIN
    PERFORM public.reservar_estoque_item(v_est, 1, v_os, 'manual', NULL, NULL, NULL, NULL);
  EXCEPTION WHEN others THEN v_b := SQLERRM LIKE '%ESTQ_SEM_PERMISSAO%';
  END;
  INSERT INTO _g(gate,status,detalhe) VALUES ('T-I sem papel nao reserva (lote e item)',
    CASE WHEN v_a AND v_b THEN 'PASS' ELSE 'FAIL' END, 'lote='||v_a||' item='||v_b);
END
$neg$;

SELECT lpad(seq::text,2,'0') AS "#", gate, status, left(detalhe,72) AS detalhe FROM _g ORDER BY seq;
SELECT count(*) FILTER (WHERE status='PASS') AS pass,
       count(*) FILTER (WHERE status<>'PASS') AS fail,
       CASE WHEN count(*) FILTER (WHERE status<>'PASS') = 0
            THEN 'PASS_H5_POSTCHECK' ELSE 'FAIL_H5_POSTCHECK' END AS veredito
  FROM _g;

ROLLBACK;
