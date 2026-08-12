-- =====================================================================
-- FASE 5 — E2E DETERMINÍSTICO COMPLETO DA ESTEIRA LABORATÓRIO
-- OS NOVA (fixture de homologação) do nascimento à finalização.
-- Transacional: BEGIN ... ROLLBACK (zero resíduo, não apaga dado real).
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq. Produção RECUSADA.
-- Uso: bash restoration/os-e2e/staging-psql.sh -f restoration/os-e2e/31-e2e-fase5-20260831.sql
-- =====================================================================
\set ON_ERROR_STOP on
\timing off
BEGIN;

DO $guard$
DECLARE v_marker text; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ENV_ABORT: marcador de ambiente ausente';
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

-- ---------------------------------------------------------------------
-- FIXTURE IDENTIFICÁVEL DE HOMOLOGAÇÃO (prefixo E2E5-), OS NOVA 'aberta'
-- ---------------------------------------------------------------------
DO $fix$
DECLARE
  v_uid uuid; v_uid_sem_perm uuid;
  v_cliente uuid; v_produto uuid; v_micro uuid; v_os uuid; v_prog uuid;
  v_fazenda uuid; v_talhao uuid;
  v_tag text := 'E2E5-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
BEGIN
  SELECT ur.user_id INTO v_uid FROM public.user_roles ur
   WHERE ur.role::text IN ('administrador','gestor') LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'E2E_SEM_USUARIO_OPERADOR'; END IF;

  SELECT p.user_id INTO v_uid_sem_perm FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id)
   LIMIT 1;

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

  SELECT id INTO v_prog FROM public.programacao_producao WHERE ordem_servico_id = v_os LIMIT 1;
  IF v_prog IS NULL THEN
    INSERT INTO public.programacao_producao (ordem_servico_id, produto_id, microrganismo_id,
                                             volume_necessario, status, data_programada)
    VALUES (v_os, v_produto, v_micro, 100000, 'aguardando', CURRENT_DATE)
    RETURNING id INTO v_prog;
  ELSE
    UPDATE public.programacao_producao
       SET produto_id = coalesce(produto_id, v_produto),
           volume_necessario = 100000, data_programada = CURRENT_DATE
     WHERE id = v_prog;
  END IF;

  INSERT INTO _c VALUES ('os',v_os::text),('prog',v_prog::text),('produto',v_produto::text),
    ('tag',v_tag),('uid',v_uid::text),('uid_sem',coalesce(v_uid_sem_perm::text,''));

  INSERT INTO _g(gate,status,detalhe) VALUES
    ('G00 fixture OS nova', (SELECT CASE WHEN status::text='aberta' THEN 'PASS' ELSE 'FAIL' END
                             FROM public.ordens_servico WHERE id=v_os),
     v_tag || ' status=' || (SELECT status::text FROM public.ordens_servico WHERE id=v_os));
END
$fix$;

-- ---------------------------------------------------------------------
-- NEGATIVO N01 — usuário sem permissão não avança a esteira
-- ---------------------------------------------------------------------
DO $neg$
DECLARE
  v_os uuid := (SELECT v FROM _c WHERE k='os')::uuid;
  v_sem text := (SELECT v FROM _c WHERE k='uid_sem');
  v_bloqueado boolean := false; r jsonb;
BEGIN
  IF v_sem = '' THEN
    INSERT INTO _g(gate,status,detalhe) VALUES ('N01 sem permissao bloqueia','SKIP','sem usuario sem role no staging');
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_sem,'role','authenticated')::text, true);
  BEGIN
    r := public.rpc_programar_os_v1(v_os,'manual',CURRENT_DATE);
    v_bloqueado := coalesce((r->>'success')::boolean, false) IS FALSE;
  EXCEPTION WHEN others THEN v_bloqueado := true;
  END;
  INSERT INTO _g(gate,status,detalhe) VALUES ('N01 sem permissao bloqueia',
    CASE WHEN v_bloqueado THEN 'PASS' ELSE 'FAIL' END, 'bloqueado='||v_bloqueado);
END
$neg$;

-- Sessão do operador autorizado (RLS + auth.uid() reais).
SELECT set_config('request.jwt.claims',
  json_build_object('sub',(SELECT v FROM _c WHERE k='uid'),'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $run$
DECLARE
  v_os uuid := (SELECT v FROM _c WHERE k='os')::uuid;
  v_prog uuid := (SELECT v FROM _c WHERE k='prog')::uuid;
  v_produto uuid := (SELECT v FROM _c WHERE k='produto')::uuid;
  v_tag text := (SELECT v FROM _c WHERE k='tag');
  r jsonb; v_lote uuid; v_est uuid; v_entrega uuid; v_entrega2 uuid;
  v_txt text; v_n int; v_n2 int; v_status text; v_pode boolean;
  v_ml numeric; v_qtd numeric; v_ok boolean;
BEGIN
  -- ================= CAMINHO FELIZ =================
  -- H01 programação: aberta -> programada
  r := public.rpc_programar_os_v1(v_os,'manual',CURRENT_DATE);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id=v_os;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H01 programar -> programada',
    CASE WHEN (r->>'success')::boolean AND v_status='programada' THEN 'PASS' ELSE 'FAIL' END, v_status);

  -- H02 assumir produção -> em_producao
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','assumir_producao',v_prog);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id=v_os;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H02 assumir -> em_producao',
    CASE WHEN v_status='em_producao' THEN 'PASS' ELSE 'FAIL' END, v_status);

  -- H03 gerar lote
  r := public.rpc_cockpit_gerar_lote_v1(v_prog, v_os, 'manual',
        jsonb_build_object('codigo_lote', v_tag, 'produto_id', v_produto::text,
                           'volume_produzido','100000'));
  v_lote := (r->>'lote_id')::uuid;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H03 gerar lote',
    CASE WHEN (r->>'success')::boolean AND v_lote IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
    'lote='||coalesce(r->>'codigo_lote','?'));

  -- H04 replay do lote (duplo clique) não duplica
  SELECT count(*) INTO v_n FROM public.lotes WHERE programacao_id=v_prog;
  r := public.rpc_cockpit_gerar_lote_v1(v_prog, v_os,'manual', jsonb_build_object('codigo_lote', v_tag||'-DUP'));
  SELECT count(*) INTO v_n2 FROM public.lotes WHERE programacao_id=v_prog;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H04 replay lote sem duplicar',
    CASE WHEN (r->>'replay')::boolean AND v_n2 = v_n AND v_n2 = 1 THEN 'PASS' ELSE 'FAIL' END,
    'antes='||v_n||' depois='||v_n2);

  -- N02 envase bloqueado sem CQ aprovado
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','enviar_envase',v_prog);
  INSERT INTO _g(gate,status,detalhe) VALUES ('N02 envase sem CQ bloqueia',
    CASE WHEN coalesce((r->>'success')::boolean,false) IS FALSE THEN 'PASS' ELSE 'FAIL' END,
    left(coalesce(r->>'message',''),70));

  -- H05 enviar CQ -> em_cq
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','enviar_cq',v_prog);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id=v_os;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H05 enviar CQ -> em_cq',
    CASE WHEN v_status='em_cq' THEN 'PASS' ELSE 'FAIL' END, v_status);

  -- N03 CQ reprovado bloqueia envase
  PERFORM public.rpc_avancar_esteira_laboratorio(v_os,'manual','reprovar_cq',v_prog);
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','enviar_envase',v_prog);
  INSERT INTO _g(gate,status,detalhe) VALUES ('N03 CQ reprovado bloqueia envase',
    CASE WHEN coalesce((r->>'success')::boolean,false) IS FALSE THEN 'PASS' ELSE 'FAIL' END,
    left(coalesce(r->>'message',''),70));

  -- H06 aprovar CQ
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','aprovar_cq',v_prog);
  SELECT status::text INTO v_txt FROM public.lotes WHERE id=v_lote;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H06 aprovar CQ',
    CASE WHEN (r->>'success')::boolean AND v_txt='aprovado' THEN 'PASS' ELSE 'FAIL' END, 'lote='||coalesce(v_txt,'?'));

  -- H07 replay CQ sem laudo duplicado
  SELECT count(*) INTO v_n FROM public.controle_qualidade WHERE lote_id=v_lote AND resultado::text='aprovado';
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','aprovar_cq',v_prog);
  SELECT count(*) INTO v_n2 FROM public.controle_qualidade WHERE lote_id=v_lote AND resultado::text='aprovado';
  INSERT INTO _g(gate,status,detalhe) VALUES ('H07 replay CQ sem laudo duplicado',
    CASE WHEN v_n2 = v_n THEN 'PASS' ELSE 'FAIL' END, 'antes='||v_n||' depois='||v_n2);

  -- H08 liberar envase -> envase
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','enviar_envase',v_prog);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id=v_os;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H08 liberar envase -> envase',
    CASE WHEN v_status='envase' THEN 'PASS' ELSE 'FAIL' END, v_status);

  -- H09 registrar envase
  r := public.rpc_cockpit_registrar_envase_v1(v_lote, v_os,'manual',v_prog,
        jsonb_build_array(jsonb_build_object('tipo_embalagem','bombona_20L','quantidade','5')),
        (CURRENT_DATE+365),'E2E5', v_tag||':env');
  INSERT INTO _g(gate,status,detalhe) VALUES ('H09 registrar envase',
    CASE WHEN (r->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, left(r::text,80));

  -- H10 replay envase sem segunda entrada de estoque
  SELECT count(*) INTO v_n FROM public.estoque_produto WHERE lote_id=v_lote;
  r := public.rpc_cockpit_registrar_envase_v1(v_lote, v_os,'manual',v_prog,
        jsonb_build_array(jsonb_build_object('tipo_embalagem','bombona_20L','quantidade','5')),
        (CURRENT_DATE+365),'E2E5', v_tag||':env');
  SELECT count(*) INTO v_n2 FROM public.estoque_produto WHERE lote_id=v_lote;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H10 replay envase sem duplicar estoque',
    CASE WHEN v_n2 = v_n AND v_n2 = 1 THEN 'PASS' ELSE 'FAIL' END, 'antes='||v_n||' depois='||v_n2);

  SELECT id, quantidade INTO v_est, v_qtd FROM public.estoque_produto
   WHERE lote_id=v_lote ORDER BY created_at LIMIT 1;

  -- H11 coerência de volume/unidade: OS(ml) x envase(5 x 20L = 100000 ml)
  SELECT volume_total_ml INTO v_ml FROM public.ordens_servico WHERE id=v_os;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H11 coerencia volume ml/L',
    CASE WHEN v_ml = 100000 AND v_qtd = 5 THEN 'PASS' ELSE 'FAIL' END,
    'os_ml='||v_ml||' unidades_envasadas='||v_qtd||' (5 x bombona_20L = 100 L = 100000 ml)');

  -- H12 concluir envase / reserva -> pronto_entrega
  PERFORM public.rpc_avancar_esteira_laboratorio(v_os,'manual','concluir_envase',v_prog);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id=v_os;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H12 concluir envase -> pronto_entrega',
    CASE WHEN v_status='pronto_entrega' THEN 'PASS' ELSE 'FAIL' END, v_status);

  -- H13 estoque reservado para a OS
  SELECT status::text, reservado_para_os_id::text INTO v_txt, v_status
    FROM public.estoque_produto WHERE id=v_est;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H13 reserva de estoque na OS',
    CASE WHEN v_status = v_os::text THEN 'PASS' ELSE 'FAIL' END, 'status='||coalesce(v_txt,'?'));

  -- H14 pode_finalizar = FALSE antes da confirmação
  SELECT pode_finalizar INTO v_pode FROM public.vw_os_integridade_esteira
   WHERE os_id=v_os AND origem_os='manual';
  INSERT INTO _g(gate,status,detalhe) VALUES ('H14 pode_finalizar=false antes da entrega',
    CASE WHEN coalesce(v_pode,false) IS FALSE THEN 'PASS' ELSE 'FAIL' END, 'pode_finalizar='||coalesce(v_pode::text,'null'));

  -- N04 entrega acima da reserva/estoque é negada
  BEGIN
    r := public.rpc_cockpit_criar_entrega_v1(v_os,'manual', v_est, v_qtd + 999, '{}'::jsonb);
    v_ok := coalesce((r->>'success')::boolean,false) IS FALSE;
    INSERT INTO _g(gate,status,detalhe) VALUES ('N04 entrega acima da reserva negada',
      CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, left(r::text,70));
  EXCEPTION WHEN others THEN
    INSERT INTO _g(gate,status,detalhe) VALUES ('N04 entrega acima da reserva negada','PASS', SQLERRM);
  END;

  -- ============ GATE CRÍTICO 4: criar entrega != entregue ============
  r := public.rpc_cockpit_criar_entrega_v1(v_os,'manual', v_est, v_qtd, '{}'::jsonb);
  v_entrega := (r->>'entrega_id')::uuid;
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id=v_os;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H15 criar entrega (status separado)',
    CASE WHEN (r->>'success')::boolean AND coalesce(r->>'status','')='separado' THEN 'PASS' ELSE 'FAIL' END,
    'entrega_status='||coalesce(r->>'status','?'));
  INSERT INTO _g(gate,status,detalhe) VALUES ('GATE4 criar_entrega NAO marca OS entregue',
    CASE WHEN v_status <> 'entregue' THEN 'PASS' ELSE 'FAIL' END, 'os_status='||v_status);

  -- GATE 4b: a etapa de esteira 'criar_entrega' tambem nao antecipa 'entregue'
  PERFORM public.rpc_avancar_esteira_laboratorio(v_os,'manual','criar_entrega',v_prog);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id=v_os;
  INSERT INTO _g(gate,status,detalhe) VALUES ('GATE4b etapa criar_entrega NAO antecipa entregue',
    CASE WHEN v_status <> 'entregue' THEN 'PASS' ELSE 'FAIL' END, 'os_status='||v_status);

  -- H16 replay da criação de entrega não duplica
  SELECT count(*) INTO v_n FROM public.entregas WHERE estoque_produto_id=v_est AND status::text<>'cancelada';
  r := public.rpc_cockpit_criar_entrega_v1(v_os,'manual', v_est, v_qtd, '{}'::jsonb);
  SELECT count(*) INTO v_n2 FROM public.entregas WHERE estoque_produto_id=v_est AND status::text<>'cancelada';
  INSERT INTO _g(gate,status,detalhe) VALUES ('H16 replay criar entrega sem duplicar',
    CASE WHEN (r->>'replay')::boolean AND v_n2=v_n AND v_n2=1 THEN 'PASS' ELSE 'FAIL' END,
    'antes='||v_n||' depois='||v_n2);

  -- N05 confirmação sem recebedor é negada (contrato do Cockpit)
  BEGIN
    r := public.rpc_cockpit_confirmar_entrega_v1(v_entrega, v_os,'manual','{}'::jsonb);
    INSERT INTO _g(gate,status,detalhe) VALUES ('N05 confirmar sem recebedor negada',
      CASE WHEN coalesce((r->>'success')::boolean,false) IS FALSE THEN 'PASS' ELSE 'FAIL' END, left(r::text,70));
  EXCEPTION WHEN others THEN
    INSERT INTO _g(gate,status,detalhe) VALUES ('N05 confirmar sem recebedor negada','PASS', SQLERRM);
  END;

  -- H17 confirmar entrega com recebedor explícito + operador em confirmado_por
  SELECT count(*) INTO v_n FROM public.estoque_movimentacoes WHERE os_id=v_os AND acao='expedicao';
  r := public.rpc_cockpit_confirmar_entrega_v1(v_entrega, v_os,'manual',
        jsonb_build_object('nome','Recebedor Fisico E2E5','documento','00000000191','cargo','Encarregado'));
  INSERT INTO _g(gate,status,detalhe) VALUES ('H17 confirmar entrega com recebedor',
    CASE WHEN (r->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, left(r::text,80));

  SELECT recebido_por_nome, confirmado_por::text INTO v_txt, v_status
    FROM public.entregas WHERE id=v_entrega;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H18 recebedor != operador registrado',
    CASE WHEN v_txt='Recebedor Fisico E2E5'
          AND v_status = (SELECT v FROM _c WHERE k='uid') THEN 'PASS' ELSE 'FAIL' END,
    'recebido_por='||coalesce(v_txt,'?')||' confirmado_por=operador:'||
    (v_status = (SELECT v FROM _c WHERE k='uid'))::text);

  -- H19 baixa de estoque canônica (expedicao) exatamente uma vez
  SELECT count(*) INTO v_n2 FROM public.estoque_movimentacoes WHERE os_id=v_os AND acao='expedicao';
  INSERT INTO _g(gate,status,detalhe) VALUES ('H19 movimentacao expedicao unica',
    CASE WHEN v_n2 = v_n + 1 THEN 'PASS' ELSE 'FAIL' END, 'antes='||v_n||' depois='||v_n2);

  -- H20 replay da confirmação sem segunda movimentação
  BEGIN
    r := public.rpc_cockpit_confirmar_entrega_v1(v_entrega, v_os,'manual',
          jsonb_build_object('nome','Recebedor Fisico E2E5','documento','00000000191'));
  EXCEPTION WHEN others THEN NULL;
  END;
  SELECT count(*) INTO v_n FROM public.estoque_movimentacoes WHERE os_id=v_os AND acao='expedicao';
  INSERT INTO _g(gate,status,detalhe) VALUES ('H20 replay confirmacao sem 2a movimentacao',
    CASE WHEN v_n = v_n2 THEN 'PASS' ELSE 'FAIL' END, 'antes='||v_n2||' depois='||v_n);

  -- H21 pode_finalizar = TRUE somente após confirmação real
  SELECT pode_finalizar INTO v_pode FROM public.vw_os_integridade_esteira
   WHERE os_id=v_os AND origem_os='manual';
  INSERT INTO _g(gate,status,detalhe) VALUES ('H21 pode_finalizar=true apos confirmacao',
    CASE WHEN coalesce(v_pode,false) THEN 'PASS' ELSE 'FAIL' END, 'pode_finalizar='||coalesce(v_pode::text,'null'));

  -- H22 finalização
  SELECT count(*) INTO v_n FROM public.laboratorio_esteira_eventos
   WHERE os_id=v_os AND etapa_nova='finalizar_os';
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','finalizar_os',v_prog);
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id=v_os;
  SELECT count(*) INTO v_n2 FROM public.laboratorio_esteira_eventos
   WHERE os_id=v_os AND etapa_nova='finalizar_os';
  INSERT INTO _g(gate,status,detalhe) VALUES ('H22 finalizar OS -> finalizada',
    CASE WHEN v_status='finalizada' AND v_n2 = v_n + 1 THEN 'PASS' ELSE 'FAIL' END,
    'status='||v_status||' eventos_finalizar='||v_n2);

  -- ============ GATE CRÍTICO 5: replay finalizar sem evento extra ============
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','finalizar_os',v_prog);
  SELECT count(*) INTO v_n FROM public.laboratorio_esteira_eventos
   WHERE os_id=v_os AND etapa_nova='finalizar_os';
  INSERT INTO _g(gate,status,detalhe) VALUES ('GATE5 replay finalizar sem evento duplicado',
    CASE WHEN v_n = v_n2 AND coalesce((r->>'replay')::boolean,false) THEN 'PASS' ELSE 'FAIL' END,
    'antes='||v_n2||' depois='||v_n||' replay='||coalesce(r->>'replay','?'));

  -- H23 status final visível em /ordens-servico
  SELECT status::text INTO v_status FROM public.ordens_servico WHERE id=v_os;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H23 OS finalizada na listagem',
    CASE WHEN v_status='finalizada' THEN 'PASS' ELSE 'FAIL' END, 'status='||v_status);

  -- N06 OS finalizada não aceita ação operacional incompatível
  r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','enviar_cq',v_prog);
  INSERT INTO _g(gate,status,detalhe) VALUES ('N06 OS finalizada recusa acao incompativel',
    CASE WHEN coalesce((r->>'success')::boolean,false) IS FALSE THEN 'PASS' ELSE 'FAIL' END,
    left(coalesce(r->>'message',''),70));

  -- N07 entrega cancelada não pode ser confirmada
  UPDATE public.entregas SET status='cancelada' WHERE id=v_entrega;
  BEGIN
    r := public.rpc_cockpit_confirmar_entrega_v1(v_entrega, v_os,'manual',
          jsonb_build_object('nome','Recebedor Fisico E2E5'));
    INSERT INTO _g(gate,status,detalhe) VALUES ('N07 entrega cancelada nao confirma',
      CASE WHEN coalesce((r->>'success')::boolean,false) IS FALSE
             OR coalesce((r->>'replay')::boolean,false) THEN 'PASS' ELSE 'FAIL' END, left(r::text,70));
  EXCEPTION WHEN others THEN
    INSERT INTO _g(gate,status,detalhe) VALUES ('N07 entrega cancelada nao confirma','PASS', SQLERRM);
  END;

  -- H24 trilha de auditoria completa
  SELECT count(*) INTO v_n FROM public.laboratorio_esteira_eventos WHERE os_id=v_os;
  INSERT INTO _g(gate,status,detalhe) VALUES ('H24 trilha de eventos da esteira',
    CASE WHEN v_n >= 8 THEN 'PASS' ELSE 'FAIL' END, 'eventos='||v_n);
END
$run$;

RESET ROLE;

\echo '===== RESULTADO E2E FASE 5 ====='
SELECT seq, gate, status, detalhe FROM _g ORDER BY seq;
SELECT count(*) FILTER (WHERE status='PASS') AS pass,
       count(*) FILTER (WHERE status='SKIP') AS skip,
       count(*) FILTER (WHERE status NOT IN ('PASS','SKIP')) AS fail,
       count(*) AS total FROM _g;

ROLLBACK;
