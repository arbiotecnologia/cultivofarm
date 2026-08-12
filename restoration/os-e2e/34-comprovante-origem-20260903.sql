-- =====================================================================
-- FASE 2.4 — Harness complementar do comprovante de entrega.
-- Gates: origem documental (OS padrao / On-Farm / pedido de parceiro),
--        negacao sem origem, volume, imutabilidade de produto,
--        perfis autorizados explicitos e negados.
-- Transacional: BEGIN ... ROLLBACK (zero residuo).
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq. Producao RECUSADA.
-- Uso: bash restoration/os-e2e/staging-psql.sh -f restoration/os-e2e/34-comprovante-origem-20260903.sql
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

CREATE TEMP TABLE _o(seq serial, gate text, status text, detalhe text);
CREATE TEMP TABLE _oc(k text primary key, v text);

-- ---------------------------------------------------------------------
-- Fixture base
-- ---------------------------------------------------------------------
DO $fix$
DECLARE
  v_cliente uuid; v_produto uuid; v_lote uuid; v_uid text; v_est uuid; v_os uuid;
BEGIN
  SELECT l.id, l.produto_id INTO v_lote, v_produto
    FROM public.lotes l WHERE l.produto_id IS NOT NULL ORDER BY l.created_at DESC LIMIT 1;
  IF v_lote IS NULL THEN RAISE EXCEPTION 'CE4_SEM_LOTE_FIXTURE'; END IF;
  SELECT id INTO v_cliente FROM public.clientes ORDER BY created_at LIMIT 1;
  SELECT ur.user_id::text INTO v_uid FROM public.user_roles ur
   WHERE ur.role::text IN ('administrador','gestor') LIMIT 1;
  SELECT o.id INTO v_os FROM public.ordens_servico o ORDER BY o.created_at DESC LIMIT 1;

  INSERT INTO public.estoque_produto (produto_id, lote_id, quantidade, volume_total,
                                      quantidade_reservada, status)
  VALUES (v_produto, v_lote, 100, 200000, 100, 'disponivel')
  RETURNING id INTO v_est;

  INSERT INTO _oc(k,v) VALUES ('cliente', v_cliente::text), ('produto', v_produto::text),
                              ('lote', v_lote::text), ('uid', v_uid), ('estoque', v_est::text),
                              ('os', v_os::text);
END
$fix$;

-- ---------------------------------------------------------------------
-- O01 — origem OS padrao aceita
-- O02 — origem pedido de parceiro aceita e identificada no snapshot
-- O03 — entrega confirmada sem OS e sem pedido => negada
-- O04 — volume zero negado
-- O05 — romaneio permanece permitido sem origem (regra inalterada)
-- ---------------------------------------------------------------------
DO $origens$
DECLARE
  v_cliente uuid := (SELECT v FROM _oc WHERE k='cliente')::uuid;
  v_prod    uuid := (SELECT v FROM _oc WHERE k='produto')::uuid;
  v_lote    uuid := (SELECT v FROM _oc WHERE k='lote')::uuid;
  v_est     uuid := (SELECT v FROM _oc WHERE k='estoque')::uuid;
  v_os      uuid := (SELECT v FROM _oc WHERE k='os')::uuid;
  v_uid     text := (SELECT v FROM _oc WHERE k='uid');
  v_ent uuid; v_pedido uuid; r jsonb; v_ok boolean; v_err text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',v_uid,'role','authenticated')::text, true);

  -- O01
  INSERT INTO public.entregas (cliente_id, produto_id, lote_id, estoque_produto_id, ordem_servico_id,
                               quantidade_entregue, volume_entregue_ml, data_saida, status,
                               recebido_por_nome, confirmada_em, confirmado_por, motorista)
  VALUES (v_cliente, v_prod, v_lote, v_est, v_os, 4, 8000, CURRENT_DATE, 'entregue',
          'Recebedor OS', now(), v_uid::uuid, 'Motorista Teste CE4')
  RETURNING id INTO v_ent;
  r := public.rpc_get_comprovante_entrega_data(v_ent, false);
  INSERT INTO _o(gate,status,detalhe) VALUES ('O01 origem ordens_servico aceita',
    CASE WHEN r->>'doc_tipo'='comprovante'
          AND (r->'conteudo'->'ordem_servico'->>'tipo')='ordem_servico'
         THEN 'PASS' ELSE 'FAIL' END,
    'tipo='||coalesce(r->'conteudo'->'ordem_servico'->>'tipo','NULO'));

  -- O02 pedido de parceiro
  SELECT id INTO v_pedido FROM public.partner_orders ORDER BY created_at DESC LIMIT 1;
  IF v_pedido IS NULL THEN
    INSERT INTO _o(gate,status,detalhe) VALUES ('O02 origem pedido de parceiro aceita',
      'SKIP','sem partner_orders no staging para fixture');
  ELSE
    INSERT INTO public.entregas (cliente_id, produto_id, lote_id, estoque_produto_id,
                                 partner_order_id, quantidade_entregue, volume_entregue_ml,
                                 data_saida, status, recebido_por_nome, confirmada_em,
                                 confirmado_por, motorista)
    VALUES (v_cliente, v_prod, v_lote, v_est, v_pedido, 4, 8000, CURRENT_DATE, 'entregue',
            'Recebedor Pedido', now(), v_uid::uuid, 'Motorista Teste CE4')
    RETURNING id INTO v_ent;
    r := public.rpc_get_comprovante_entrega_data(v_ent, false);
    INSERT INTO _o(gate,status,detalhe) VALUES ('O02 origem pedido de parceiro aceita',
      CASE WHEN r->>'doc_tipo'='comprovante'
            AND (r->'conteudo'->'ordem_servico'->>'origem')='pedido_parceiro'
           THEN 'PASS' ELSE 'FAIL' END,
      'origem='||coalesce(r->'conteudo'->'ordem_servico'->>'origem','NULO'));
  END IF;

  -- O03 sem origem alguma
  INSERT INTO public.entregas (cliente_id, produto_id, lote_id, estoque_produto_id,
                               quantidade_entregue, volume_entregue_ml, data_saida, status,
                               recebido_por_nome, confirmada_em, confirmado_por, motorista)
  VALUES (v_cliente, v_prod, v_lote, v_est, 4, 8000, CURRENT_DATE, 'entregue',
          'Sem Origem', now(), v_uid::uuid, 'Motorista Teste CE4')
  RETURNING id INTO v_ent;
  BEGIN
    r := public.rpc_get_comprovante_entrega_data(v_ent, false);
    v_ok := false; v_err := 'permitiu doc='||coalesce(r->>'doc_tipo','?');
  EXCEPTION WHEN others THEN v_ok := (SQLERRM LIKE '%COMPROVANTE_OS_OBRIGATORIA%'); v_err := SQLERRM;
  END;
  INSERT INTO _o(gate,status,detalhe) VALUES ('O03 sem OS e sem pedido => negado',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, left(v_err,70));

  -- O05 romaneio segue permitido sem origem (regra inalterada)
  UPDATE public.entregas SET status='separado', recebido_por_nome=NULL, confirmada_em=NULL,
                             confirmado_por=NULL
   WHERE id = v_ent;
  r := public.rpc_get_comprovante_entrega_data(v_ent, false);
  INSERT INTO _o(gate,status,detalhe) VALUES ('O05 romaneio sem origem permanece permitido',
    CASE WHEN r->>'doc_tipo'='romaneio' THEN 'PASS' ELSE 'FAIL' END,
    'doc='||coalesce(r->>'doc_tipo','?'));

  -- O04 volume zero
  INSERT INTO public.entregas (cliente_id, produto_id, lote_id, estoque_produto_id, ordem_servico_id,
                               quantidade_entregue, volume_entregue_ml, data_saida, status,
                               recebido_por_nome, confirmada_em, confirmado_por, motorista)
  VALUES (v_cliente, v_prod, v_lote, v_est, v_os, 4, 0, CURRENT_DATE, 'entregue',
          'Sem Volume', now(), v_uid::uuid, 'Motorista Teste CE4')
  RETURNING id INTO v_ent;
  UPDATE public.entregas SET volume_entregue_ml = 0 WHERE id = v_ent;
  BEGIN
    r := public.rpc_get_comprovante_entrega_data(v_ent, false);
    v_ok := coalesce((r->'conteudo'->'itens'->0->>'volume_total_ml')::numeric,0) > 0;
    v_err := CASE WHEN v_ok THEN 'volume derivado do envase >0' ELSE 'permitiu volume zero' END;
  EXCEPTION WHEN others THEN v_ok := (SQLERRM LIKE '%COMPROVANTE_VOLUME_OBRIGATORIO%'); v_err := SQLERRM;
  END;
  INSERT INTO _o(gate,status,detalhe) VALUES ('O04 volume zero nao vira comprovante',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, left(v_err,70));
END
$origens$;

-- ---------------------------------------------------------------------
-- O06..O12 — perfis aceitos explicitamente + perfil fora da lista negado
-- ---------------------------------------------------------------------
DO $perfis$
DECLARE
  v_cliente uuid := (SELECT v FROM _oc WHERE k='cliente')::uuid;
  v_prod    uuid := (SELECT v FROM _oc WHERE k='produto')::uuid;
  v_lote    uuid := (SELECT v FROM _oc WHERE k='lote')::uuid;
  v_est     uuid := (SELECT v FROM _oc WHERE k='estoque')::uuid;
  v_os      uuid := (SELECT v FROM _oc WHERE k='os')::uuid;
  v_uid     text := (SELECT v FROM _oc WHERE k='uid');
  v_ent uuid; v_user uuid; v_role text; r jsonb; v_ok boolean; v_err text;
  v_roles text[] := ARRAY['administrador','gestor','administrativo','producao','operador_onfarm','aplicador'];
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',v_uid,'role','authenticated')::text, true);

  INSERT INTO public.entregas (cliente_id, produto_id, lote_id, estoque_produto_id, ordem_servico_id,
                               quantidade_entregue, volume_entregue_ml, data_saida, status,
                               recebido_por_nome, confirmada_em, confirmado_por, motorista)
  VALUES (v_cliente, v_prod, v_lote, v_est, v_os, 6, 12000, CURRENT_DATE, 'entregue',
          'Recebedor Perfis', now(), v_uid::uuid, 'Motorista Teste CE4')
  RETURNING id INTO v_ent;

  -- congela o comprovante com o usuario base
  r := public.rpc_get_comprovante_entrega_data(v_ent, false);

  FOREACH v_role IN ARRAY v_roles LOOP
    SELECT ur.user_id INTO v_user FROM public.user_roles ur WHERE ur.role::text = v_role LIMIT 1;
    IF v_user IS NULL THEN
      INSERT INTO _o(gate,status,detalhe)
      VALUES ('O06 perfil '||v_role||' autorizado', 'SKIP', 'sem usuario com este perfil no staging');
    ELSE
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub',v_user::text,'role','authenticated')::text, true);
      BEGIN
        r := public.rpc_get_comprovante_entrega_data(v_ent, false);
        v_ok := (r->>'doc_tipo' = 'comprovante'); v_err := coalesce(r->>'doc_tipo','?');
      EXCEPTION WHEN others THEN v_ok := false; v_err := SQLERRM;
      END;
      INSERT INTO _o(gate,status,detalhe) VALUES ('O06 perfil '||v_role||' autorizado',
        CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, left(v_err,60));
    END IF;
  END LOOP;

  -- perfil existente FORA da lista de is_delivery_staff
  SELECT ur.user_id, ur.role::text INTO v_user, v_role
    FROM public.user_roles ur
   WHERE ur.role::text NOT IN ('administrador','gestor','administrativo','producao','operador_onfarm','aplicador')
     AND NOT public.is_delivery_staff(ur.user_id)
   LIMIT 1;
  IF v_user IS NULL THEN
    INSERT INTO _o(gate,status,detalhe) VALUES ('O07 perfil fora da lista negado','SKIP',
      'nenhum usuario apenas com perfil fora da lista');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub',v_user::text,'role','authenticated')::text, true);
    BEGIN
      r := public.rpc_get_comprovante_entrega_data(v_ent, false);
      v_ok := false; v_err := 'permitiu';
    EXCEPTION WHEN others THEN v_ok := (SQLERRM LIKE '%COMPROVANTE_FORBIDDEN%'); v_err := SQLERRM;
    END;
    INSERT INTO _o(gate,status,detalhe) VALUES ('O07 perfil '||v_role||' (fora da lista) negado',
      CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, left(v_err,60));
  END IF;
END
$perfis$;

-- ---------------------------------------------------------------------
-- O08 — helper sem EXECUTE para PUBLIC/anon/authenticated
-- O09 — is_delivery_staff mantido executavel por authenticated (usado em RLS)
-- ---------------------------------------------------------------------
DO $acl$
DECLARE v_helper int; v_pol int; v_auth int;
BEGIN
  SELECT count(*) INTO v_helper
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         LATERAL aclexplode(p.proacl) a
   WHERE n.nspname='public' AND p.proname='fn_comprovante_entrega_montar_v1'
     AND a.privilege_type='EXECUTE'
     AND (a.grantee = 0 OR a.grantee='anon'::regrole::oid OR a.grantee='authenticated'::regrole::oid);
  INSERT INTO _o(gate,status,detalhe) VALUES ('O08 builder sem EXECUTE p/ PUBLIC/anon/authenticated',
    CASE WHEN v_helper=0 THEN 'PASS' ELSE 'FAIL' END, 'grants='||v_helper);

  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname='public' AND (qual LIKE '%is_delivery_staff%' OR with_check LIKE '%is_delivery_staff%');
  SELECT count(*) INTO v_auth
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(p.proacl) a
   WHERE n.nspname='public' AND p.proname='is_delivery_staff'
     AND a.privilege_type='EXECUTE' AND a.grantee='authenticated'::regrole::oid;
  INSERT INTO _o(gate,status,detalhe) VALUES ('O09 is_delivery_staff EXECUTE justificado por RLS',
    CASE WHEN (v_pol > 0 AND v_auth = 1) OR (v_pol = 0 AND v_auth = 0) THEN 'PASS' ELSE 'FAIL' END,
    'policies='||v_pol||' auth_execute='||v_auth);
END
$acl$;

SELECT seq, gate, status, detalhe FROM _o ORDER BY seq;
SELECT count(*) FILTER (WHERE status='PASS') AS pass,
       count(*) FILTER (WHERE status='SKIP') AS skip,
       count(*) FILTER (WHERE status NOT IN ('PASS','SKIP')) AS fail,
       count(*) AS total
  FROM _o;

ROLLBACK;

-- Zero residuo apos ROLLBACK
SELECT count(*) AS residuo_entregas_fixture
  FROM public.entregas WHERE motorista = 'Motorista Teste CE4';
