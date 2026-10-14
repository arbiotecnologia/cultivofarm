-- RUNTIME TEST (rollback total) — executar SOMENTE após aplicar proposed-platform-global-b2b-enabled.sql,
-- pela revisão independente, no canônico swzpzcwiasxmjutrmvkm. Nada persiste: ROLLBACK ao final.
-- Itens de teste são criados DENTRO da transação pelos writers auditados; nenhum produto real é alterado.
-- Bombarbio (se existir) só é usado em caso NEGATIVO (liberar inativo) — sem efeito.
-- Resultado NULL conta como FAIL.
--
-- psql -v sa_uid=... -v admin_ar_uid=... -v admin_fsf_uid=... -v financeiro_ar_uid=... -v consultor_ar_uid=... -f este_arquivo.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE rt_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;
CREATE TEMP TABLE rt_results (n serial, step text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON rt_ctx, rt_results TO authenticated, anon;
GRANT USAGE ON SEQUENCE rt_results_n_seq TO authenticated, anon;
INSERT INTO rt_ctx VALUES ('sa',:'sa_uid'),('admin_ar',:'admin_ar_uid'),('admin_fsf',:'admin_fsf_uid'),
  ('financeiro_ar',:'financeiro_ar_uid'),('consultor_ar',:'consultor_ar_uid');

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT rt_ctx.k, rt_ctx.v::uuid u FROM rt_ctx LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=r.u) THEN RAISE EXCEPTION 'ator inexistente: %', r.k; END IF;
    IF r.k='sa' AND NOT (public.has_role(r.u,'superadmin') AND public.is_platform_superadmin(r.u) AND platform_private.platform_actor_access_ready(r.u)) THEN
      RAISE EXCEPTION 'sa não é superadmin ativo'; END IF;
    IF r.k<>'sa' AND (public.has_role(r.u,'superadmin') OR public.is_platform_superadmin(r.u)) THEN RAISE EXCEPTION 'ator tenant é superadmin: %', r.k; END IF;
  END LOOP;
  INSERT INTO rt_ctx SELECT 'ledger_antes', count(*)::text FROM public.catalog_platform_admin_audit;
  INSERT INTO rt_ctx SELECT 'b2b_snapshot_antes', md5(string_agg(id::text||b2b_enabled::text||coalesce(ativo::text,'n'),',' ORDER BY id)) FROM public.produtos;
  INSERT INTO rt_ctx SELECT 'b2b_micro_snapshot_antes', md5(string_agg(id::text||b2b_enabled::text||ativo::text,',' ORDER BY id)) FROM public.microrganismos;
END $$;

CREATE FUNCTION pg_temp.claims(p_uid uuid, p_iat_offset int DEFAULT -30, p_exp_offset int DEFAULT 600) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub',p_uid,'role','authenticated',
    'iat',extract(epoch from now())::bigint+p_iat_offset,'exp',extract(epoch from now())::bigint+p_exp_offset)::text, true);
$$;
CREATE FUNCTION pg_temp.ok(p_step text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  INSERT INTO rt_results(step,ok,detail) VALUES (p_step,COALESCE(p_ok,false),p_detail);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.claims(uuid,int,int), pg_temp.ok(text,boolean,text) TO authenticated, anon;

-- ============================================================ 1) SA: fluxo funcional (itens criados na transação)
SELECT pg_temp.claims((SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='sa'));
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; s jsonb; st jsonb; k uuid; v_pid uuid; v_mid uuid; v_ver timestamptz; v_bomb uuid:='1875527c-a65a-483b-a6c2-9122d5ec2a51';
BEGIN
  -- Produto novo nasce inativo e sem B2B? (create_global_product preserva default da coluna; registramos o estado real)
  r:=public.platform_create_global_product('{"nome":"RT b2b produto rollback 0001","tipo":"fungicida"}','Teste runtime b2b com rollback',gen_random_uuid());
  v_pid:=(r->>'id')::uuid; INSERT INTO rt_ctx VALUES ('produto_novo',v_pid::text);
  s:=public.platform_read_global_b2b_state('produto',v_pid);
  PERFORM pg_temp.ok('sa.read.projecao_minima', (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(s) x)
    = ARRAY['ativo','b2b_enabled','codigo','id','item_tipo','nome','updated_at']);
  -- Se o default deixou b2b=true, retirar primeiro (permitido mesmo inativo).
  IF (s->>'b2b_enabled')::boolean THEN
    r:=public.platform_set_global_b2b_enabled('produto',v_pid,(s->>'updated_at')::timestamptz,false,'Teste runtime b2b com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.produto.retirar_inativo', (r->>'b2b_enabled')::boolean=false AND (r->>'ativo')::boolean=false);
    s:=public.platform_read_global_b2b_state('produto',v_pid);
  END IF;
  -- Liberar inativo: negado.
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,(s->>'updated_at')::timestamptz,true,'Teste runtime b2b com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.produto.liberar_inativo_negado',false);
    EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.produto.liberar_inativo_negado',SQLERRM='catalog_b2b_requires_active'); END;
  -- Ativar via writer auditado existente e liberar.
  st:=public.platform_set_global_product_status(v_pid,(s->>'updated_at')::timestamptz,true,'Teste runtime b2b com rollback',gen_random_uuid());
  k:=gen_random_uuid();
  r:=public.platform_set_global_b2b_enabled('produto',v_pid,(st->>'updated_at')::timestamptz,true,'Teste runtime b2b com rollback',k);
  s:=public.platform_read_global_b2b_state('produto',v_pid);
  PERFORM pg_temp.ok('sa.produto.liberar', (s->>'b2b_enabled')::boolean AND (s->>'ativo')::boolean
    AND (r->>'updated_at')::timestamptz > (st->>'updated_at')::timestamptz AND r->>'item_tipo'='produto' AND (r->>'idempotent')::boolean=false);
  -- Replay idêntico devolve o mesmo recibo, sem novo efeito.
  st:=public.platform_set_global_b2b_enabled('produto',v_pid,(st->>'updated_at')::timestamptz,true,'Teste runtime b2b com rollback',k);
  PERFORM pg_temp.ok('sa.produto.replay', (st->>'idempotent')::boolean AND st->>'audit_id'=r->>'audit_id'
    AND public.platform_read_global_b2b_state('produto',v_pid)->>'updated_at'=s->>'updated_at');
  -- Replay divergente (mesma chave, payload diferente).
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,(s->>'updated_at')::timestamptz,false,'Teste runtime b2b com rollback',k);
    PERFORM pg_temp.ok('sa.produto.replay_divergente',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.produto.replay_divergente',true); END;
  -- CAS stale.
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,(r->>'updated_at')::timestamptz - interval '1 second',false,'Teste runtime b2b com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.produto.cas_stale',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.produto.cas_stale',SQLERRM='catalog_b2b_conflict'); END;
  -- Sem mudança.
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,(s->>'updated_at')::timestamptz,true,'Teste runtime b2b com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.produto.sem_mudanca',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.produto.sem_mudanca',SQLERRM='catalog_b2b_no_change'); END;
  -- Validações: motivo curto/longo, tipo inválido, nulos, versão infinita, id inexistente.
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,(s->>'updated_at')::timestamptz,false,'curto',gen_random_uuid());
    PERFORM pg_temp.ok('sa.motivo_curto',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.motivo_curto',true); END;
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,(s->>'updated_at')::timestamptz,false,repeat('x',501),gen_random_uuid());
    PERFORM pg_temp.ok('sa.motivo_longo',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.motivo_longo',true); END;
  BEGIN PERFORM public.platform_set_global_b2b_enabled('cultura',v_pid,(s->>'updated_at')::timestamptz,false,'Teste runtime b2b com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.tipo_invalido',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.tipo_invalido',true); END;
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,'infinity',false,'Teste runtime b2b com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.versao_infinita',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.versao_infinita',true); END;
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,(s->>'updated_at')::timestamptz,NULL,'Teste runtime b2b com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.alvo_nulo',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.alvo_nulo',true); END;
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,(s->>'updated_at')::timestamptz,false,'Teste runtime b2b com rollback',NULL);
    PERFORM pg_temp.ok('sa.chave_nula',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.chave_nula',true); END;
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',gen_random_uuid(),now(),false,'Teste runtime b2b com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.inexistente',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('sa.inexistente',true); END;
  -- Retirar ativo: permitido, ativo preservado.
  r:=public.platform_set_global_b2b_enabled('produto',v_pid,(s->>'updated_at')::timestamptz,false,'Teste runtime b2b com rollback',gen_random_uuid());
  s:=public.platform_read_global_b2b_state('produto',v_pid);
  PERFORM pg_temp.ok('sa.produto.retirar_ativo', (s->>'b2b_enabled')::boolean=false AND (s->>'ativo')::boolean);

  -- Microrganismo novo (inativo) -> ativar -> liberar -> retirar.
  r:=public.platform_create_global_microorganism('{"nome":"RT b2b micro rollback 0001","tipo":"bacteria","producao_on_farm":false}','Teste runtime b2b com rollback',gen_random_uuid());
  v_mid:=(r->>'id')::uuid; INSERT INTO rt_ctx VALUES ('micro_novo',v_mid::text);
  s:=public.platform_read_global_b2b_state('microrganismo',v_mid);
  PERFORM pg_temp.ok('sa.micro.nasce_sem_b2b', (s->>'b2b_enabled')::boolean=false AND (s->>'ativo')::boolean=false);
  BEGIN PERFORM public.platform_set_global_b2b_enabled('microrganismo',v_mid,(s->>'updated_at')::timestamptz,true,'Teste runtime b2b com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.micro.liberar_inativo_negado',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.micro.liberar_inativo_negado',true); END;
  st:=public.platform_set_global_microorganism_status(v_mid,(s->>'updated_at')::timestamptz,true,'Teste runtime b2b com rollback',gen_random_uuid());
  r:=public.platform_set_global_b2b_enabled('microrganismo',v_mid,(st->>'updated_at')::timestamptz,true,'Teste runtime b2b com rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.micro.liberar', (public.platform_read_global_b2b_state('microrganismo',v_mid)->>'b2b_enabled')::boolean
    AND (r->>'updated_at')::timestamptz > (st->>'updated_at')::timestamptz);
  -- Tipo trocado (id de micro como produto) -> indisponível.
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_mid,(r->>'updated_at')::timestamptz,false,'Teste runtime b2b com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.tipo_trocado',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('sa.tipo_trocado',true); END;
  r:=public.platform_set_global_b2b_enabled('microrganismo',v_mid,(r->>'updated_at')::timestamptz,false,'Teste runtime b2b com rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.micro.retirar', (r->>'b2b_enabled')::boolean=false);

  -- Caso real negativo: Bombarbio inativo não pode ser liberado (nenhum efeito).
  IF EXISTS (SELECT 1 FROM public.platform_read_global_b2b_state('produto',v_bomb) x WHERE (x->>'ativo')::boolean=false) THEN
    s:=public.platform_read_global_b2b_state('produto',v_bomb);
    BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_bomb,(s->>'updated_at')::timestamptz,true,'Teste runtime b2b com rollback',gen_random_uuid());
      PERFORM pg_temp.ok('sa.bombarbio.inativo_negado',false);
      EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.bombarbio.inativo_negado',
        public.platform_read_global_b2b_state('produto',v_bomb)->>'updated_at'=s->>'updated_at'); END;
  END IF;
END $$;
RESET ROLE;

-- ============================================================ 2) Invariantes (postgres)
DO $$
DECLARE v_pid uuid:=(SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='produto_novo'); v_mid uuid:=(SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='micro_novo');
BEGIN
  PERFORM pg_temp.ok('inv.ledger_b2b_count', (SELECT count(*) FROM public.catalog_platform_admin_audit
    WHERE operation='set_global_b2b_enabled' AND created_at >= now() - interval '1 hour'
      AND (counts_after->'receipt'->>'id')::uuid IN (v_pid,v_mid)) >= 4);
  PERFORM pg_temp.ok('inv.ledger_before_after', NOT EXISTS (SELECT 1 FROM public.catalog_platform_admin_audit
    WHERE operation='set_global_b2b_enabled' AND (counts_before->>'b2b_enabled' IS NULL OR counts_after->'after'->>'b2b_enabled' IS NULL
      OR counts_before->>'b2b_enabled' = counts_after->'after'->>'b2b_enabled')));
  PERFORM pg_temp.ok('inv.precos_intactos', (SELECT valor_litro_brl IS NULL AND valor_dose_brl IS NULL AND valor_ha_brl IS NULL AND dose_ml_ha IS NULL
    FROM public.produtos WHERE id=v_pid));
  PERFORM pg_temp.ok('inv.micro_precos_intactos', (SELECT valor_litro_brl IS NULL AND valor_dose_brl IS NULL FROM public.microrganismos WHERE id=v_mid));
  -- Nenhum item preexistente teve b2b/ativo alterado.
  PERFORM pg_temp.ok('inv.preexistentes_produtos', (SELECT md5(string_agg(id::text||b2b_enabled::text||coalesce(ativo::text,'n'),',' ORDER BY id))
    FROM public.produtos WHERE id<>v_pid) = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='b2b_snapshot_antes'));
  PERFORM pg_temp.ok('inv.preexistentes_micros', (SELECT md5(string_agg(id::text||b2b_enabled::text||ativo::text,',' ORDER BY id))
    FROM public.microrganismos WHERE id<>v_mid) = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='b2b_micro_snapshot_antes'));
  PERFORM pg_temp.ok('inv.sem_dml_cliente', NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public'
    AND table_name IN ('produtos','microrganismos') AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')));
  PERFORM pg_temp.ok('inv.anon_sem_execute', NOT has_function_privilege('anon','public.platform_set_global_b2b_enabled(text,uuid,timestamptz,boolean,text,uuid)','EXECUTE')
    AND NOT has_function_privilege('anon','public.platform_read_global_b2b_state(text,uuid)','EXECUTE'));
  PERFORM pg_temp.ok('inv.core_definer_search_path', (SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=""']) FROM pg_proc
    WHERE oid IN ('platform_private.set_global_b2b_enabled_core(text,uuid,timestamptz,boolean,text,uuid)'::regprocedure,
                  'platform_private.read_global_b2b_state_core(text,uuid)'::regprocedure)));
  PERFORM pg_temp.ok('inv.wrapper_invoker', (SELECT bool_and(NOT prosecdef) FROM pg_proc
    WHERE oid IN ('public.platform_set_global_b2b_enabled(text,uuid,timestamptz,boolean,text,uuid)'::regprocedure,
                  'public.platform_read_global_b2b_state(text,uuid)'::regprocedure)));
END $$;

-- Ledger imutável
DO $$
BEGIN
  BEGIN UPDATE public.catalog_platform_admin_audit SET reason='x' WHERE operation='set_global_b2b_enabled';
    PERFORM pg_temp.ok('inv.ledger_imutavel', NOT EXISTS (SELECT 1 FROM public.catalog_platform_admin_audit WHERE operation='set_global_b2b_enabled'));
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('inv.ledger_imutavel',true); END;
END $$;

-- ============================================================ 3) Atores tenant: negados (RPC e DML direto)
DO $$
DECLARE a record; v_pid uuid:=(SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='produto_novo'); n int;
BEGIN
  FOR a IN SELECT rt_ctx.k, rt_ctx.v::uuid u FROM rt_ctx WHERE rt_ctx.k IN ('admin_ar','admin_fsf','financeiro_ar','consultor_ar') LOOP
    PERFORM pg_temp.claims(a.u); SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,now(),true,'Tentativa tenant negada',gen_random_uuid());
      PERFORM pg_temp.ok(a.k||'.writer',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(a.k||'.writer',true); END;
    BEGIN PERFORM public.platform_read_global_b2b_state('produto',v_pid);
      PERFORM pg_temp.ok(a.k||'.reader',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(a.k||'.reader',true); END;
    BEGIN PERFORM platform_private.set_global_b2b_enabled_core('produto',v_pid,now(),true,'Tentativa tenant negada',gen_random_uuid());
      PERFORM pg_temp.ok(a.k||'.core_direto',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(a.k||'.core_direto',true); END;
    BEGIN UPDATE public.produtos SET b2b_enabled=NOT b2b_enabled WHERE id=v_pid; GET DIAGNOSTICS n=ROW_COUNT;
      PERFORM pg_temp.ok(a.k||'.dml_produto', n=0); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(a.k||'.dml_produto',true); END;
    BEGIN UPDATE public.microrganismos SET b2b_enabled=NOT b2b_enabled; GET DIAGNOSTICS n=ROW_COUNT;
      PERFORM pg_temp.ok(a.k||'.dml_micro', n=0); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(a.k||'.dml_micro',true); END;
    PERFORM pg_temp.ok(a.k||'.ledger_b2b_invisivel', (SELECT count(*) FROM public.catalog_platform_admin_audit WHERE operation='set_global_b2b_enabled')=0);
    RESET ROLE;
  END LOOP;
END $$;

-- ============================================================ 4) Claims inválidas (SA) e anon
DO $$
DECLARE sa uuid:=(SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='sa'); v_pid uuid:=(SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='produto_novo'); t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES ('expirada',-1200,-60),('iat_futuro',600,1200)) x(nome,iat,exp) LOOP
    PERFORM pg_temp.claims(sa,t.iat,t.exp); SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,now(),true,'Claims inválidas teste',gen_random_uuid());
      PERFORM pg_temp.ok('claims.'||t.nome,false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('claims.'||t.nome,true); END;
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',sa,'role','authenticated','iat','x','exp','y')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.platform_read_global_b2b_state('produto',v_pid); PERFORM pg_temp.ok('claims.malformadas',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('claims.malformadas',true); END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.platform_set_global_b2b_enabled('produto',v_pid,now(),true,'Tentativa anon negada',gen_random_uuid());
    PERFORM pg_temp.ok('anon.writer',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('anon.writer',true); END;
  BEGIN PERFORM public.platform_read_global_b2b_state('produto',v_pid); PERFORM pg_temp.ok('anon.reader',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('anon.reader',true); END;
  RESET ROLE;
END $$;

SELECT n, step, ok, detail FROM rt_results ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail, count(*) AS total FROM rt_results;
ROLLBACK;
