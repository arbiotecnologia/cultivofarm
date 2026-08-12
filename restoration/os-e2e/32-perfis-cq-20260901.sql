-- =====================================================================
-- FASE 6 — Harness complementar: perfis/ACL + determinismo canônico do CQ.
-- Transacional: BEGIN ... ROLLBACK (zero resíduo).
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq. Produção RECUSADA.
-- Uso: bash restoration/os-e2e/staging-psql.sh -f restoration/os-e2e/32-perfis-cq-20260901.sql
-- =====================================================================
\set ON_ERROR_STOP on
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

CREATE TEMP TABLE _p(seq serial, gate text, status text, detalhe text);

-- ---------------------------------------------------------------------
-- P01..P05 — ACL por perfil de banco (anon nunca executa motor sensível)
-- ---------------------------------------------------------------------
DO $acl$
DECLARE
  r record; v_anon int := 0; v_pub int := 0; v_lista text := '';
BEGIN
  FOR r IN
    SELECT p.proname, p.proacl
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('rpc_programar_os_v1','rpc_avancar_esteira_laboratorio',
         '_rpc_avancar_esteira_laboratorio_internal','_avancar_os_status',
         'rpc_cockpit_gerar_lote_v1','rpc_cockpit_registrar_envase_v1',
         'rpc_cockpit_criar_entrega_v1','rpc_cockpit_confirmar_entrega_v1',
         'rpc_entrega_confirmar_v1','fn_entrega_confirmar_engine_v1',
         'rpc_cockpit_cancelar_reserva_v1','rpc_validar_integridade_esteira',
         'fn_cq_ultimo_resultado')
  LOOP
    IF r.proacl IS NULL THEN
      v_pub := v_pub + 1; v_lista := v_lista || r.proname || '(default) ';
    ELSE
      IF EXISTS (SELECT 1 FROM aclexplode(r.proacl) a
                  WHERE a.grantee = 'anon'::regrole::oid) THEN
        v_anon := v_anon + 1; v_lista := v_lista || r.proname || '(anon) ';
      END IF;
      IF EXISTS (SELECT 1 FROM aclexplode(r.proacl) a WHERE a.grantee = 0) THEN
        v_pub := v_pub + 1; v_lista := v_lista || r.proname || '(PUBLIC) ';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO _p(gate,status,detalhe) VALUES ('P01 anon sem EXECUTE em motor sensivel',
    CASE WHEN v_anon = 0 THEN 'PASS' ELSE 'FAIL' END, 'anon='||v_anon||' '||v_lista);
  INSERT INTO _p(gate,status,detalhe) VALUES ('P02 PUBLIC sem EXECUTE em motor sensivel',
    CASE WHEN v_pub = 0 THEN 'PASS' ELSE 'FAIL' END, 'public='||v_pub);
END
$acl$;

DO $view$
DECLARE v_anon boolean; v_auth text;
BEGIN
  v_anon := has_table_privilege('anon','public.vw_os_integridade_esteira','SELECT');
  SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) INTO v_auth
    FROM aclexplode((SELECT relacl FROM pg_class WHERE oid='public.vw_os_integridade_esteira'::regclass)) a
   WHERE a.grantee = 'authenticated'::regrole::oid;
  INSERT INTO _p(gate,status,detalhe) VALUES ('P03 view integridade sem anon',
    CASE WHEN v_anon THEN 'FAIL' ELSE 'PASS' END, 'anon_select='||v_anon);
  INSERT INTO _p(gate,status,detalhe) VALUES ('P04 view integridade authenticated somente SELECT',
    CASE WHEN v_auth = 'SELECT' THEN 'PASS' ELSE 'FAIL' END, coalesce(v_auth,'<nenhum>'));
END
$view$;

DO $sp$
DECLARE v_falta int; v_lista text;
BEGIN
  SELECT count(*), coalesce(string_agg(p.proname,', '),'') INTO v_falta, v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND p.proname IN ('rpc_programar_os_v1','rpc_avancar_esteira_laboratorio',
       '_rpc_avancar_esteira_laboratorio_internal','_avancar_os_status',
       'rpc_cockpit_gerar_lote_v1','rpc_cockpit_registrar_envase_v1',
       'rpc_cockpit_criar_entrega_v1','rpc_cockpit_confirmar_entrega_v1',
       'rpc_entrega_confirmar_v1','fn_entrega_confirmar_engine_v1',
       'rpc_cockpit_cancelar_reserva_v1','fn_cq_ultimo_resultado')
     AND NOT (coalesce(array_to_string(p.proconfig,','),'') LIKE '%pg_temp%');
  INSERT INTO _p(gate,status,detalhe) VALUES ('P05 SECURITY DEFINER com pg_temp',
    CASE WHEN v_falta=0 THEN 'PASS' ELSE 'FAIL' END, 'sem_pg_temp='||v_falta||' '||v_lista);
END
$sp$;

-- ---------------------------------------------------------------------
-- P06..P08 — perfis de aplicação sobre a mesma OS de fixture
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _cx(k text primary key, v text);

DO $fix$
DECLARE
  v_os uuid; v_talhao uuid; v_fazenda uuid; v_cliente uuid;
  v_produto uuid; v_micro uuid;
  v_tag text := 'E2E6-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
BEGIN
  SELECT t.id, t.fazenda_id, f.cliente_id INTO v_talhao, v_fazenda, v_cliente
    FROM public.talhoes t JOIN public.fazendas f ON f.id=t.fazenda_id ORDER BY t.created_at LIMIT 1;
  SELECT id INTO v_produto FROM public.produtos ORDER BY created_at LIMIT 1;
  SELECT id INTO v_micro FROM public.microrganismos ORDER BY created_at LIMIT 1;

  INSERT INTO public.ordens_servico (numero_os, cliente_id, fazenda_id, talhao_id,
                                     produto_id, microrganismo_id, volume_total_ml,
                                     status, origem, tipo_item)
  VALUES (v_tag, v_cliente, v_fazenda, v_talhao, v_produto, v_micro, 100000,
          'aberta','agronomica','produto')
  RETURNING id INTO v_os;

  INSERT INTO _cx(k,v) VALUES ('os', v_os::text), ('tag', v_tag);
END
$fix$;

DO $perfis$
DECLARE
  v_os uuid := (SELECT v FROM _cx WHERE k='os')::uuid;
  v_uid text; v_ok boolean; r jsonb;
BEGIN
  -- P06: gestor/administrador autorizado consegue programar
  SELECT ur.user_id::text INTO v_uid FROM public.user_roles ur
   WHERE ur.role::text IN ('administrador','gestor') LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated')::text, true);
  BEGIN
    r := public.rpc_programar_os_v1(v_os,'manual',CURRENT_DATE);
    v_ok := coalesce((r->>'success')::boolean, true);
  EXCEPTION WHEN others THEN v_ok := false;
  END;
  INSERT INTO _p(gate,status,detalhe) VALUES ('P06 gestor autorizado programa OS',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, 'ok='||v_ok);

  -- P07: operador_onfarm não opera OS de origem manual (não cruza origem)
  SELECT ur.user_id::text INTO v_uid FROM public.user_roles ur WHERE ur.role::text='operador_onfarm' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated')::text, true);
  BEGIN
    r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','assumir_producao',NULL);
    v_ok := coalesce((r->>'success')::boolean, false) IS FALSE;
  EXCEPTION WHEN others THEN v_ok := true;
  END;
  INSERT INTO _p(gate,status,detalhe) VALUES ('P07 operador_onfarm nao cruza origem manual',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, 'bloqueado='||v_ok);

  -- P08: usuário sem role algum é negado
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gen_random_uuid()::text,'role','authenticated')::text, true);
  BEGIN
    r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','assumir_producao',NULL);
    v_ok := coalesce((r->>'success')::boolean, false) IS FALSE;
  EXCEPTION WHEN others THEN v_ok := true;
  END;
  INSERT INTO _p(gate,status,detalhe) VALUES ('P08 usuario sem role negado',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, 'bloqueado='||v_ok);

  -- P09: perfil producao opera dentro do escopo previsto da esteira
  SELECT ur.user_id::text INTO v_uid FROM public.user_roles ur WHERE ur.role::text='producao' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated')::text, true);
  BEGIN
    r := public.rpc_avancar_esteira_laboratorio(v_os,'manual','assumir_producao',NULL);
    v_ok := coalesce((r->>'success')::boolean, true);
  EXCEPTION WHEN others THEN v_ok := false;
  END;
  INSERT INTO _p(gate,status,detalhe) VALUES ('P09 perfil producao opera a esteira',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, 'ok='||v_ok);
END
$perfis$;

-- ---------------------------------------------------------------------
-- C01..C04 — determinismo canônico do CQ (created_at empatado)
-- ---------------------------------------------------------------------
DO $cq$
DECLARE
  v_os uuid := (SELECT v FROM _cx WHERE k='os')::uuid;
  v_prog uuid; v_lote uuid; v_ts timestamptz := now();
  v_seq_apr bigint; v_seq_rep bigint; v_ult text; v_ok boolean;
BEGIN
  SELECT id INTO v_prog FROM public.programacao_producao WHERE ordem_servico_id=v_os LIMIT 1;
  -- lote pelo motor canônico (respeita constraints de item da OS)
  PERFORM public.rpc_cockpit_gerar_lote_v1(
    v_prog, v_os, 'manual',
    jsonb_build_object('codigo_lote', (SELECT v FROM _cx WHERE k='tag')||'-L'));
  SELECT id INTO v_lote FROM public.lotes WHERE programacao_id = v_prog LIMIT 1;
  IF v_lote IS NULL THEN RAISE EXCEPTION 'E2E6_LOTE_NAO_GERADO'; END IF;

  -- Dois laudos com EXATAMENTE o mesmo created_at: só a seq desempata.
  INSERT INTO public.controle_qualidade (lote_id, resultado, data_analise, created_at)
  VALUES (v_lote,'aprovado'::resultado_cq, CURRENT_DATE, v_ts) RETURNING seq INTO v_seq_apr;
  INSERT INTO public.controle_qualidade (lote_id, resultado, data_analise, created_at)
  VALUES (v_lote,'reprovado'::resultado_cq, CURRENT_DATE, v_ts) RETURNING seq INTO v_seq_rep;

  INSERT INTO _p(gate,status,detalhe) VALUES ('C01 seq monotonica persistente',
    CASE WHEN v_seq_rep > v_seq_apr THEN 'PASS' ELSE 'FAIL' END,
    'apr='||v_seq_apr||' rep='||v_seq_rep);

  v_ult := public.fn_cq_ultimo_resultado(v_lote);
  INSERT INTO _p(gate,status,detalhe) VALUES ('C02 ultimo CQ canonico com empate de created_at',
    CASE WHEN v_ult='reprovado' THEN 'PASS' ELSE 'FAIL' END, coalesce(v_ult,'<nulo>'));

  -- C03: o desempate sobrevive a rewrite físico (ctid muda, seq não)
  UPDATE public.controle_qualidade SET observacoes_gerais = observacoes_gerais
   WHERE lote_id = v_lote;
  v_ult := public.fn_cq_ultimo_resultado(v_lote);
  INSERT INTO _p(gate,status,detalhe) VALUES ('C03 desempate estavel apos UPDATE (ctid muda)',
    CASE WHEN v_ult='reprovado' THEN 'PASS' ELSE 'FAIL' END, coalesce(v_ult,'<nulo>'));

  -- C04: CQ reprovado mais recente bloqueia o envase
  BEGIN
    PERFORM public.rpc_cockpit_registrar_envase_v1(
      v_lote, v_os, 'manual', v_prog,
      '[{"tipo_embalagem":"bombona_20L","quantidade":"1"}]'::jsonb,
      (CURRENT_DATE + 365), 'E2E6', 'E2E6-envase');
    v_ok := false;
  EXCEPTION WHEN others THEN v_ok := true;
  END;
  INSERT INTO _p(gate,status,detalhe) VALUES ('C04 CQ reprovado recente bloqueia envase',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, 'bloqueado='||v_ok);
END
$cq$;

SELECT seq, rpad(gate,52) AS gate, status, detalhe FROM _p ORDER BY seq;
SELECT count(*) FILTER (WHERE status='PASS') AS pass,
       count(*) FILTER (WHERE status='FAIL') AS fail,
       count(*) AS total FROM _p;

DO $final$
DECLARE v_fail int;
BEGIN
  SELECT count(*) INTO v_fail FROM _p WHERE status='FAIL';
  IF v_fail > 0 THEN RAISE WARNING 'FASE6_HARNESS_COM_FALHAS: %', v_fail; END IF;
END
$final$;

ROLLBACK;
