-- =====================================================================
-- FASE 2 — Harness do documento de entrega (Romaneio x Comprovante).
-- Transacional: BEGIN ... ROLLBACK (zero residuo).
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq. Producao RECUSADA.
-- Uso: bash restoration/os-e2e/staging-psql.sh -f restoration/os-e2e/33-comprovante-20260903.sql
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

CREATE TEMP TABLE _d(seq serial, gate text, status text, detalhe text);
CREATE TEMP TABLE _dc(k text primary key, v text);

-- ---------------------------------------------------------------------
-- D01..D04 — ACL / search_path
-- ---------------------------------------------------------------------
DO $acl$
DECLARE
  v_anon int := 0; v_pub int := 0; v_auth int := 0; v_sp int := 0; r record;
BEGIN
  FOR r IN
    SELECT p.proname, p.proacl, array_to_string(p.proconfig, ',') AS cfg
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('rpc_get_comprovante_entrega_data','fn_comprovante_entrega_montar_v1')
  LOOP
    IF r.proacl IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM aclexplode(r.proacl) a WHERE a.grantee = 'anon'::regrole::oid)
        THEN v_anon := v_anon + 1; END IF;
      IF EXISTS (SELECT 1 FROM aclexplode(r.proacl) a WHERE a.grantee = 0)
        THEN v_pub := v_pub + 1; END IF;
      IF r.proname = 'rpc_get_comprovante_entrega_data'
         AND EXISTS (SELECT 1 FROM aclexplode(r.proacl) a
                      WHERE a.grantee = 'authenticated'::regrole::oid AND a.privilege_type = 'EXECUTE')
        THEN v_auth := v_auth + 1; END IF;
    END IF;
    IF r.cfg LIKE '%pg_temp%' THEN v_sp := v_sp + 1; END IF;
  END LOOP;

  INSERT INTO _d(gate,status,detalhe) VALUES
    ('D01 anon sem EXECUTE no motor documental',
     CASE WHEN v_anon = 0 THEN 'PASS' ELSE 'FAIL' END, 'anon='||v_anon),
    ('D02 PUBLIC sem EXECUTE no motor documental',
     CASE WHEN v_pub = 0 THEN 'PASS' ELSE 'FAIL' END, 'public='||v_pub),
    ('D03 authenticated executa a RPC canonica',
     CASE WHEN v_auth = 1 THEN 'PASS' ELSE 'FAIL' END, 'auth='||v_auth),
    ('D04 search_path com pg_temp nas 2 funcoes',
     CASE WHEN v_sp = 2 THEN 'PASS' ELSE 'FAIL' END, 'com_pg_temp='||v_sp);
END
$acl$;

DO $grants$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name IN ('entrega_comprovantes','entrega_termos')
     AND grantee='anon';
  INSERT INTO _d(gate,status,detalhe) VALUES ('D05 anon sem grants em documentos de entrega',
    CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END, 'grants_anon='||v_n);
END
$grants$;

-- ---------------------------------------------------------------------
-- Fixture: entrega vinculada a produto + lote reais
-- ---------------------------------------------------------------------
DO $fix$
DECLARE
  v_ent uuid; v_cliente uuid; v_produto uuid; v_lote uuid; v_uid text; v_est uuid; v_os uuid;
  v_tag text := 'CE2-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
BEGIN
  SELECT l.id, l.produto_id INTO v_lote, v_produto
    FROM public.lotes l WHERE l.produto_id IS NOT NULL ORDER BY l.created_at DESC LIMIT 1;
  IF v_lote IS NULL THEN RAISE EXCEPTION 'CE2_SEM_LOTE_FIXTURE'; END IF;
  SELECT id INTO v_cliente FROM public.clientes ORDER BY created_at LIMIT 1;
  SELECT ur.user_id::text INTO v_uid FROM public.user_roles ur
   WHERE ur.role::text IN ('administrador','gestor') LIMIT 1;
  SELECT o.id INTO v_os FROM public.ordens_servico o ORDER BY o.created_at DESC LIMIT 1;
  IF v_os IS NULL THEN RAISE EXCEPTION 'CE2_SEM_OS_FIXTURE'; END IF;

  INSERT INTO public.estoque_produto (produto_id, lote_id, quantidade, volume_total,
                                      quantidade_reservada, status)
  VALUES (v_produto, v_lote, 100, 200000, 100, 'disponivel')
  RETURNING id INTO v_est;

  INSERT INTO public.entregas (cliente_id, produto_id, lote_id, estoque_produto_id,
                               ordem_servico_id,
                               quantidade_entregue, volume_entregue_ml, data_saida,
                               status, motorista, veiculo)
  VALUES (v_cliente, v_produto, v_lote, v_est, v_os, 10, 20000, CURRENT_DATE,
          'separado', 'Motorista Teste CE2', 'Fiorino')
  RETURNING id INTO v_ent;

  INSERT INTO _dc(k,v) VALUES ('entrega', v_ent::text), ('uid', v_uid),
                              ('cliente', v_cliente::text), ('tag', v_tag),
                              ('estoque', v_est::text), ('os', v_os::text),
                              ('produto', v_produto::text);
END
$fix$;


-- ---------------------------------------------------------------------
-- D06..D08 — regra documental antes da confirmacao
-- ---------------------------------------------------------------------
DO $romaneio$
DECLARE
  v_ent uuid := (SELECT v FROM _dc WHERE k='entrega')::uuid;
  v_uid text := (SELECT v FROM _dc WHERE k='uid');
  r jsonb; v_snap int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated')::text, true);

  r := public.rpc_get_comprovante_entrega_data(v_ent, false);
  INSERT INTO _d(gate,status,detalhe) VALUES ('D06 entrega separado => romaneio',
    CASE WHEN r->>'doc_tipo' = 'romaneio' AND (r->>'definitivo')::boolean IS FALSE
         THEN 'PASS' ELSE 'FAIL' END, 'doc='||coalesce(r->>'doc_tipo','?'));

  INSERT INTO _d(gate,status,detalhe) VALUES ('D07 romaneio traz produto/lote reais',
    CASE WHEN (r->'conteudo'->'itens'->0->>'produto') IS NOT NULL
          AND (r->'conteudo'->'itens'->0->>'lote') IS NOT NULL
         THEN 'PASS' ELSE 'FAIL' END,
    'produto='||coalesce(r->'conteudo'->'itens'->0->>'produto','NULO'));

  SELECT count(*) INTO v_snap FROM public.entrega_comprovantes
   WHERE entrega_id = v_ent AND metadata ? 'comprovante_snapshot_v1';
  INSERT INTO _d(gate,status,detalhe) VALUES ('D08 separado nao congela comprovante',
    CASE WHEN v_snap = 0 THEN 'PASS' ELSE 'FAIL' END, 'snapshots='||v_snap);
END
$romaneio$;

-- ---------------------------------------------------------------------
-- D09 — 'entregue' SEM recebedor ainda nao vira comprovante
-- ---------------------------------------------------------------------
DO $sem_receb$
DECLARE
  v_ent uuid := (SELECT v FROM _dc WHERE k='entrega')::uuid;
  v_ok boolean; v_err text;
BEGIN
  -- O banco nao aceita 'entregue' sem identificacao do recebedor
  BEGIN
    UPDATE public.entregas SET status = 'entregue', confirmada_em = now() WHERE id = v_ent;
    v_ok := false; v_err := 'permitiu';
  EXCEPTION WHEN others THEN v_ok := true; v_err := SQLERRM;
  END;
  INSERT INTO _d(gate,status,detalhe) VALUES ('D09 entregue sem recebedor e bloqueado',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, left(v_err, 60));
END
$sem_receb$;

-- ---------------------------------------------------------------------
-- D10..D13 — comprovante definitivo, numeracao, congelamento, idempotencia
-- ---------------------------------------------------------------------
DO $comprovante$
DECLARE
  v_ent uuid := (SELECT v FROM _dc WHERE k='entrega')::uuid;
  r1 jsonb; r2 jsonb; v_snap int;
BEGIN
  UPDATE public.entregas
     SET status = 'entregue',
         recebido_por_nome = 'Joao Recebedor',
         recebido_por_documento = '123456789',
         recebido_por_cargo = 'Encarregado',
         confirmada_em = now(),
         confirmado_por = (SELECT v FROM _dc WHERE k='uid')::uuid
   WHERE id = v_ent;

  r1 := public.rpc_get_comprovante_entrega_data(v_ent, false);
  INSERT INTO _dc(k,v) VALUES ('hash1', coalesce(r1->>'snapshot_hash','')),
                              ('num1', coalesce(r1->>'numero_documento',''));

  INSERT INTO _d(gate,status,detalhe) VALUES ('D10 entregue com recebedor => comprovante',
    CASE WHEN r1->>'doc_tipo' = 'comprovante' AND (r1->>'definitivo')::boolean
         THEN 'PASS' ELSE 'FAIL' END, 'doc='||coalesce(r1->>'doc_tipo','?'));

  INSERT INTO _d(gate,status,detalhe) VALUES ('D11 numeracao legivel CE-YYYY-NNNNNN',
    CASE WHEN r1->>'numero_documento' ~ ('^CE-' || to_char(now(),'YYYY') || '-[0-9]{6}$')
         THEN 'PASS' ELSE 'FAIL' END, coalesce(r1->>'numero_documento','?'));

  INSERT INTO _d(gate,status,detalhe) VALUES ('D12 recebedor separado de confirmado_por',
    CASE WHEN (r1->'conteudo'->'recebimento'->>'recebido_por_nome') = 'Joao Recebedor'
          AND (r1->'conteudo'->'recebimento'->>'confirmado_por') IS NOT NULL
          AND (r1->'conteudo'->'recebimento'->>'confirmado_em') IS NOT NULL
         THEN 'PASS' ELSE 'FAIL' END,
    'receb='||coalesce(r1->'conteudo'->'recebimento'->>'recebido_por_nome','NULO'));

  -- idempotencia / duplo clique
  r2 := public.rpc_get_comprovante_entrega_data(v_ent, false);
  SELECT count(*) INTO v_snap FROM public.entrega_comprovantes
   WHERE entrega_id = v_ent AND metadata ? 'comprovante_snapshot_v1';
  INSERT INTO _d(gate,status,detalhe) VALUES ('D13 duplo clique nao duplica snapshot',
    CASE WHEN v_snap = 1 AND r2->>'snapshot_hash' = r1->>'snapshot_hash'
          AND r2->>'numero_documento' = r1->>'numero_documento'
         THEN 'PASS' ELSE 'FAIL' END, 'snapshots='||v_snap);
END
$comprovante$;

-- ---------------------------------------------------------------------
-- D14..D15 — imutabilidade do snapshot e reemissao
-- ---------------------------------------------------------------------
DO $imutavel$
DECLARE
  v_ent uuid := (SELECT v FROM _dc WHERE k='entrega')::uuid;
  v_cli uuid := (SELECT v FROM _dc WHERE k='cliente')::uuid;
  v_h1 text := (SELECT v FROM _dc WHERE k='hash1');
  v_n1 text := (SELECT v FROM _dc WHERE k='num1');
  v_nome_orig text; r jsonb; v_reem int;
BEGIN
  SELECT coalesce(nullif(btrim(razao_social),''), nome) INTO v_nome_orig
    FROM public.clientes WHERE id = v_cli;

  -- cadastro do cliente muda DEPOIS da confirmacao
  UPDATE public.clientes SET razao_social = 'RAZAO ALTERADA POS ENTREGA' WHERE id = v_cli;

  r := public.rpc_get_comprovante_entrega_data(v_ent, true);
  INSERT INTO _d(gate,status,detalhe) VALUES ('D14 snapshot imune a alteracao de cadastro',
    CASE WHEN r->>'snapshot_hash' = v_h1
          AND (r->'conteudo'->'destinatario'->>'nome') = v_nome_orig
          AND (r->'conteudo'->'destinatario'->>'nome') <> 'RAZAO ALTERADA POS ENTREGA'
         THEN 'PASS' ELSE 'FAIL' END,
    'nome_doc='||coalesce(r->'conteudo'->'destinatario'->>'nome','NULO'));

  SELECT coalesce((metadata->>'comprovante_reemissoes')::int, -1) INTO v_reem
    FROM public.entrega_comprovantes
   WHERE entrega_id = v_ent AND metadata ? 'comprovante_snapshot_v1' LIMIT 1;

  INSERT INTO _d(gate,status,detalhe) VALUES ('D15 reemissao audita sem divergir conteudo',
    CASE WHEN v_reem = 1 AND r->>'numero_documento' = v_n1 THEN 'PASS' ELSE 'FAIL' END,
    'reemissoes='||v_reem||' num='||coalesce(r->>'numero_documento','?'));
END
$imutavel$;

-- ---------------------------------------------------------------------
-- D16..D18 — obrigatoriedade de produto/lote e negacao por perfil
-- ---------------------------------------------------------------------
DO $negacoes$
DECLARE
  v_ent2 uuid; v_cliente uuid := (SELECT v FROM _dc WHERE k='cliente')::uuid;
  v_uid text := (SELECT v FROM _dc WHERE k='uid');
  v_ok boolean; v_err text; r jsonb;
BEGIN
  -- entrega confirmada porem sem produto/lote => comprovante negado
  INSERT INTO public.entregas (cliente_id, estoque_produto_id, quantidade_entregue, data_saida,
                               status, recebido_por_nome, confirmada_em, confirmado_por)
  VALUES (v_cliente, (SELECT v FROM _dc WHERE k='estoque')::uuid, 5, CURRENT_DATE,
          'entregue', 'Maria Recebedora', now(), v_uid::uuid)
  RETURNING id INTO v_ent2;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated')::text, true);
  BEGIN
    r := public.rpc_get_comprovante_entrega_data(v_ent2, false);
    v_ok := false; v_err := coalesce(r->>'doc_tipo','?');
  EXCEPTION WHEN others THEN v_ok := true; v_err := SQLERRM;
  END;
  INSERT INTO _d(gate,status,detalhe) VALUES ('D16 comprovante exige produto/lote',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, left(v_err, 60));

  -- usuario autenticado sem role algum
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',gen_random_uuid()::text,'role','authenticated')::text, true);
  BEGIN
    r := public.rpc_get_comprovante_entrega_data((SELECT v FROM _dc WHERE k='entrega')::uuid, false);
    v_ok := false; v_err := 'permitiu';
  EXCEPTION WHEN others THEN v_ok := true; v_err := SQLERRM;
  END;
  INSERT INTO _d(gate,status,detalhe) VALUES ('D17 usuario sem role negado',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, left(v_err, 60));

  -- sessao anonima (sem sub)
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    r := public.rpc_get_comprovante_entrega_data((SELECT v FROM _dc WHERE k='entrega')::uuid, false);
    v_ok := false; v_err := 'permitiu';
  EXCEPTION WHEN others THEN v_ok := true; v_err := SQLERRM;
  END;
  INSERT INTO _d(gate,status,detalhe) VALUES ('D18 anon/sem sessao negado',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, left(v_err, 60));
END
$negacoes$;

-- ---------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------
SELECT seq, gate, status, detalhe FROM _d ORDER BY seq;
SELECT count(*) FILTER (WHERE status='PASS') AS pass,
       count(*) FILTER (WHERE status<>'PASS') AS fail,
       count(*) AS total
  FROM _d;

ROLLBACK;
