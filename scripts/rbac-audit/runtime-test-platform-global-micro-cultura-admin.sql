-- RUNTIME TEST (rollback total) — executar SOMENTE após aplicar o candidato, pelo Codex, no canônico swzpzcwiasxmjutrmvkm.
-- Atores EXISTENTES informados explicitamente via psql (nunca inferidos). Nada persiste: ROLLBACK ao final.
-- Validação funcional do SA usa SOMENTE leitores autorizados; invariantes protegidas (preço/dose/B2B/ledger)
-- são conferidas em bloco como postgres. RLS NÃO é ampliada para o teste.
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

-- Pré-condições fail-closed dos atores (postgres)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT k, v::uuid u FROM rt_ctx LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=r.u) THEN RAISE EXCEPTION 'ator inexistente: %', r.k; END IF;
    IF r.k='sa' AND NOT (public.has_role(r.u,'superadmin') AND public.is_platform_superadmin(r.u) AND platform_private.platform_actor_access_ready(r.u)) THEN
      RAISE EXCEPTION 'sa não é superadmin ativo'; END IF;
    IF r.k<>'sa' AND (public.has_role(r.u,'superadmin') OR public.is_platform_superadmin(r.u)) THEN RAISE EXCEPTION 'ator tenant é superadmin: %', r.k; END IF;
  END LOOP;
  INSERT INTO rt_ctx SELECT 'micro_existente', id::text FROM public.microrganismos ORDER BY id LIMIT 1;
  INSERT INTO rt_ctx SELECT 'cultura_existente', id::text FROM public.culturas ORDER BY id LIMIT 1;
  INSERT INTO rt_ctx SELECT 'ledger_antes', count(*)::text FROM public.catalog_platform_admin_audit;
END $$;

CREATE FUNCTION pg_temp.claims(p_uid uuid, p_iat_offset int DEFAULT -30, p_exp_offset int DEFAULT 600) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub',p_uid,'role','authenticated',
    'iat',extract(epoch from now())::bigint+p_iat_offset,'exp',extract(epoch from now())::bigint+p_exp_offset)::text, true);
$$;
CREATE FUNCTION pg_temp.ok(p_step text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  INSERT INTO rt_results(step,ok,detail) VALUES (p_step,p_ok,p_detail);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.claims(uuid,int,int), pg_temp.ok(text,boolean,text) TO authenticated, anon;

-- ============================================================ 1) Superadmin: fluxo funcional por leitores autorizados
SELECT pg_temp.claims((SELECT v::uuid FROM rt_ctx WHERE k='sa'));
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; d jsonb; k uuid:=gen_random_uuid(); v_id uuid; v_cid uuid; v_p text; st text;
BEGIN
  r:=public.platform_create_global_microorganism('{"nome":"RT micro rollback 0001","tipo":"bacteria","producao_on_farm":false}','Teste runtime com rollback',k);
  v_id:=(r->>'id')::uuid; INSERT INTO rt_ctx VALUES ('micro_novo',v_id::text);
  d:=public.platform_read_global_microorganism_detail(v_id);
  PERFORM pg_temp.ok('sa.micro.create.inativo_codigo', (d->>'ativo')::boolean=false AND d->>'codigo' IS NOT NULL AND d->>'codigo'=r->>'codigo');
  r:=public.platform_create_global_microorganism('{"nome":"RT micro rollback 0001","tipo":"bacteria","producao_on_farm":false}','Teste runtime com rollback',k);
  PERFORM pg_temp.ok('sa.micro.create.replay_identico', (r->>'idempotent')::boolean AND (r->>'id')::uuid=v_id);
  BEGIN PERFORM public.platform_create_global_microorganism('{"nome":"outro","tipo":"bacteria","producao_on_farm":false}','Teste runtime com rollback',k);
    PERFORM pg_temp.ok('sa.micro.create.replay_divergente',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.micro.create.replay_divergente',true); END;
  FOREACH v_p IN ARRAY ARRAY['{"nome":"x","tipo":"bacteria","producao_on_farm":true,"b2b_enabled":true}',
    '{"nome":"x","tipo":"bacteria","producao_on_farm":true,"valor_litro_brl":1}','{"nome":"x","tipo":"bacteria","producao_on_farm":true,"dose_ml_ha":100}',
    '{"nome":"x","tipo":"bacteria","producao_on_farm":true,"codigo":"Z"}','{"nome":"x","tipo":"bacteria","producao_on_farm":true,"product_id":null}',
    '{"nome":"x","tipo":"bacteria","producao_on_farm":true,"organization_id":"00000000-0000-0000-0000-000000000000"}',
    '{"nome":"x","tipo":"bacteria","producao_on_farm":true,"concentracao_ufc_ml":1.234}',
    '{"nome":"x","tipo":"bacteria","producao_on_farm":true,"concentracao_ufc_ml":9007199254740992}','[]','{"nome":"x","tipo":"bacteria"}'] LOOP
    BEGIN PERFORM public.platform_create_global_microorganism(v_p::jsonb,'Teste runtime com rollback',gen_random_uuid());
      PERFORM pg_temp.ok('sa.micro.payload_proibido',false,v_p); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.micro.payload_proibido',true,v_p); END;
  END LOOP;
  BEGIN PERFORM public.platform_create_global_microorganism('{"nome":"y","tipo":"fungo","producao_on_farm":true}','curto',gen_random_uuid());
    PERFORM pg_temp.ok('sa.motivo_curto',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.motivo_curto',true); END;
  d:=public.platform_read_global_microorganism_detail(v_id);
  BEGIN PERFORM public.platform_update_global_microorganism(v_id,(d->>'updated_at')::timestamptz,'{"tipo":"fungo"}','Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.micro.tipo_imutavel',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.micro.tipo_imutavel',true); END;
  r:=public.platform_update_global_microorganism(v_id,(d->>'updated_at')::timestamptz,'{"descricao":"rt"}','Teste runtime com rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.micro.update', public.platform_read_global_microorganism_detail(v_id)->>'descricao'='rt' AND r->>'updated_at'<>d->>'updated_at');
  BEGIN PERFORM public.platform_update_global_microorganism(v_id,(d->>'updated_at')::timestamptz,'{"descricao":"rt2"}','Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.micro.cas_stale',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.micro.cas_stale',true); END;
  r:=public.platform_set_global_microorganism_status(v_id,(r->>'updated_at')::timestamptz,true,'Teste runtime com rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.micro.reativar', (public.platform_read_global_microorganism_detail(v_id)->>'ativo')::boolean);
  BEGIN PERFORM public.platform_set_global_microorganism_status(v_id,(r->>'updated_at')::timestamptz,true,'Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.micro.status_sem_mudanca',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.micro.status_sem_mudanca',true); END;
  -- culturas
  r:=public.platform_create_global_culture('{"nome":"RT cultura rollback 0001"}','Teste runtime com rollback',gen_random_uuid());
  v_cid:=(r->>'id')::uuid; INSERT INTO rt_ctx VALUES ('cultura_nova',v_cid::text);
  PERFORM pg_temp.ok('sa.cultura.create.inativa', (public.platform_read_global_culture_detail(v_cid)->>'ativo')::boolean=false AND NOT r ? 'codigo');
  BEGIN PERFORM public.platform_create_global_culture('{"nome":"rt CULTURA rollback 0001"}','Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.cultura.duplicata_ci',false); EXCEPTION WHEN unique_violation THEN PERFORM pg_temp.ok('sa.cultura.duplicata_ci',true); END;
  d:=public.platform_read_global_culture_detail(v_cid);
  r:=public.platform_update_global_culture(v_cid,(d->>'updated_at')::timestamptz,'{"descricao":"rt"}','Teste runtime com rollback',gen_random_uuid());
  BEGIN PERFORM public.platform_update_global_culture(v_cid,(d->>'updated_at')::timestamptz,'{"descricao":"rt2"}','Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.cultura.cas_stale',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.cultura.cas_stale',true); END;
  r:=public.platform_set_global_culture_status(v_cid,(r->>'updated_at')::timestamptz,true,'Teste runtime com rollback',gen_random_uuid());
  d:=public.platform_read_global_culture_detail(v_cid);
  PERFORM pg_temp.ok('sa.cultura.reativar', (d->>'ativo')::boolean AND d->>'desativada_em' IS NULL);
  PERFORM pg_temp.ok('sa.cultura.lista', jsonb_typeof(public.platform_read_global_cultures('',50,0)->'items')='array');
  BEGIN PERFORM public.platform_read_global_cultures('',51,0); PERFORM pg_temp.ok('sa.lista.limite',false);
    EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.lista.limite',true); END;
  -- DML direto continua negado mesmo para SA (políticas 20261014185551 / contenção de culturas)
  BEGIN UPDATE public.microrganismos SET descricao='direto' WHERE id=v_id; GET DIAGNOSTICS st=ROW_COUNT;
    PERFORM pg_temp.ok('sa.dml_direto.micro', st='0', st); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('sa.dml_direto.micro',true,'42501'); END;
  BEGIN UPDATE public.culturas SET descricao='direto' WHERE id=v_cid; GET DIAGNOSTICS st=ROW_COUNT;
    PERFORM pg_temp.ok('sa.dml_direto.cultura', st='0', st); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('sa.dml_direto.cultura',true,'42501'); END;
  BEGIN UPDATE public.catalog_platform_admin_audit SET reason='x' WHERE operation='create_global_culture'; GET DIAGNOSTICS st=ROW_COUNT;
    PERFORM pg_temp.ok('sa.ledger_imutavel', st='0', st); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('sa.ledger_imutavel',true,'42501'); END;
END $$;
RESET ROLE;

-- ============================================================ 2) Invariantes protegidas (postgres; sem ampliar RLS)
DO $$
DECLARE v_id uuid:=(SELECT v::uuid FROM rt_ctx WHERE k='micro_novo'); v_cid uuid:=(SELECT v::uuid FROM rt_ctx WHERE k='cultura_nova'); m record;
BEGIN
  SELECT * INTO m FROM public.microrganismos WHERE id=v_id;
  PERFORM pg_temp.ok('pg.micro.sem_preco_dose_b2b', m.b2b_enabled=false AND m.valor_dose_brl IS NULL AND m.valor_litro_brl IS NULL
    AND m.preco_tabela IS NULL AND m.dose_ml_ha IS NULL AND m.safra_referencia IS NULL AND m.product_id IS NULL);
  PERFORM pg_temp.ok('pg.micro.descricao_nao_direta', m.descricao='rt');
  PERFORM pg_temp.ok('pg.cultura.descricao_nao_direta', (SELECT descricao FROM public.culturas WHERE id=v_cid)='rt');
  PERFORM pg_temp.ok('pg.ledger.novos_recibos', (SELECT count(*) FROM public.catalog_platform_admin_audit) - (SELECT v::int FROM rt_ctx WHERE k='ledger_antes') = 6);
  PERFORM pg_temp.ok('pg.ledger.before_after_versionados', NOT EXISTS (SELECT 1 FROM public.catalog_platform_admin_audit
    WHERE operation IN ('update_global_microorganism','update_global_culture','set_global_microorganism_status','set_global_culture_status')
      AND correlation_id IS NOT NULL AND created_at >= now() AND (counts_before->>'updated_at' IS NULL OR counts_after->'after'->>'updated_at' IS NULL)));
END $$;

-- ============================================================ 3) Atores tenant existentes: as 9 RPCs negam 42501 e sem efeito
DO $$
DECLARE a record; c uuid:=(SELECT v::uuid FROM rt_ctx WHERE k='cultura_existente'); m uuid:=(SELECT v::uuid FROM rt_ctx WHERE k='micro_existente');
  calls text[]:=ARRAY['read_micro_detail','read_cultures','read_culture_detail','create_micro','update_micro','status_micro','create_culture','update_culture','status_culture'];
  f text;
BEGIN
  FOR a IN SELECT k, v::uuid u FROM rt_ctx WHERE k IN ('admin_ar','admin_fsf','financeiro_ar','consultor_ar') LOOP
    PERFORM pg_temp.claims(a.u);
    SET LOCAL ROLE authenticated;
    FOREACH f IN ARRAY calls LOOP
      BEGIN
        CASE f
          WHEN 'read_micro_detail' THEN PERFORM public.platform_read_global_microorganism_detail(m);
          WHEN 'read_cultures' THEN PERFORM public.platform_read_global_cultures('',10,0);
          WHEN 'read_culture_detail' THEN PERFORM public.platform_read_global_culture_detail(c);
          WHEN 'create_micro' THEN PERFORM public.platform_create_global_microorganism('{"nome":"t","tipo":"fungo","producao_on_farm":true}','Tentativa tenant negada',gen_random_uuid());
          WHEN 'update_micro' THEN PERFORM public.platform_update_global_microorganism(m,now(),'{"descricao":"x"}','Tentativa tenant negada',gen_random_uuid());
          WHEN 'status_micro' THEN PERFORM public.platform_set_global_microorganism_status(m,now(),false,'Tentativa tenant negada',gen_random_uuid());
          WHEN 'create_culture' THEN PERFORM public.platform_create_global_culture('{"nome":"t"}','Tentativa tenant negada',gen_random_uuid());
          WHEN 'update_culture' THEN PERFORM public.platform_update_global_culture(c,now(),'{"descricao":"x"}','Tentativa tenant negada',gen_random_uuid());
          WHEN 'status_culture' THEN PERFORM public.platform_set_global_culture_status(c,now(),false,'Tentativa tenant negada',gen_random_uuid());
        END CASE;
        PERFORM pg_temp.ok(a.k||'.'||f,false,'executou');
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(a.k||'.'||f,true);
      END;
    END LOOP;
    -- leitura tenant preexistente preservada (sem nova permissão)
    PERFORM pg_temp.ok(a.k||'.leitura_preexistente', (SELECT count(*) FROM public.culturas) > 0);
    RESET ROLE;
  END LOOP;
END $$;

-- ============================================================ 4) Claims inválidas/expiradas/futuras (SA) e anon
DO $$
DECLARE sa uuid:=(SELECT v::uuid FROM rt_ctx WHERE k='sa'); t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES ('expirada',-1200,-60),('iat_futuro',600,1200)) x(nome,iat,exp) LOOP
    PERFORM pg_temp.claims(sa,t.iat,t.exp); SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.platform_read_global_cultures('',10,0); PERFORM pg_temp.ok('claims.'||t.nome,false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('claims.'||t.nome,true); END;
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',sa,'role','authenticated','iat','x','exp','y')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.platform_create_global_culture('{"nome":"t"}','Claims inválidas teste',gen_random_uuid()); PERFORM pg_temp.ok('claims.malformadas',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('claims.malformadas',true); END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.platform_read_global_cultures('',10,0); PERFORM pg_temp.ok('anon.sem_execute',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('anon.sem_execute',true); END;
  RESET ROLE;
END $$;

-- ============================================================ Resultado explícito
SELECT n, step, ok, detail FROM rt_results ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail, count(*) AS total FROM rt_results;
ROLLBACK;
