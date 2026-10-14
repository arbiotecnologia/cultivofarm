-- RUNTIME TEST (rollback total) — executar SOMENTE após aplicar proposed-platform-global-product-family.sql,
-- pela revisão independente, no canônico swzpzcwiasxmjutrmvkm. Nada persiste: ROLLBACK ao final.
-- Produto de teste é criado DENTRO da transação pelo writer auditado existente; nenhum produto real é classificado.
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
  INSERT INTO rt_ctx SELECT 'snapshot_antes', md5(string_agg(pg_catalog.to_jsonb(p)::text, ',' ORDER BY id)) FROM public.produtos p;
END $$;

-- Estrutura: colunas aditivas nullable, sem backfill, CHECKs e enum legado preservado.
INSERT INTO rt_results(step,ok) SELECT 'estrutura.colunas',
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos')=21
  AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos'
       AND column_name IN ('familia_catalogo','classe_catalogo') AND is_nullable='YES' AND column_default IS NULL)=2
  AND (SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos' AND column_name='tipo')='tipo_produto';
INSERT INTO rt_results(step,ok) SELECT 'estrutura.sem_backfill', NOT EXISTS (SELECT 1 FROM public.produtos WHERE familia_catalogo IS NOT NULL OR classe_catalogo IS NOT NULL);
INSERT INTO rt_results(step,ok) SELECT 'estrutura.sem_dml_cliente', NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='produtos' AND grantee IN ('anon','authenticated','PUBLIC') AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'));
INSERT INTO rt_results(step,ok) SELECT 'estrutura.triggers_5', (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.produtos'::regclass AND NOT tgisinternal)=5;

CREATE FUNCTION pg_temp.claims(p_uid uuid, p_iat_offset int DEFAULT -30, p_exp_offset int DEFAULT 600) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub',p_uid,'role','authenticated',
    'iat',extract(epoch from now())::bigint+p_iat_offset,'exp',extract(epoch from now())::bigint+p_exp_offset)::text, true);
$$;
CREATE FUNCTION pg_temp.ok(p_step text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  INSERT INTO rt_results(step,ok,detail) VALUES (p_step,COALESCE(p_ok,false),p_detail);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.claims(uuid,int,int), pg_temp.ok(text,boolean,text) TO authenticated, anon;

-- ============================================================ 1) SA: fluxo funcional
SELECT pg_temp.claims((SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='sa'));
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; r2 jsonb; k uuid; v_pid uuid; v_ver timestamptz; v_before jsonb; v_after jsonb; pg jsonb; t record;
BEGIN
  r:=public.platform_create_global_product('{"nome":"RT familia produto rollback 0001","tipo":"fungicida"}','Teste runtime familia rollback',gen_random_uuid());
  v_pid:=(r->>'id')::uuid; INSERT INTO rt_ctx VALUES ('produto_novo',v_pid::text);
  -- Leitor: novo produto aparece como pendente em TODAS as famílias (legado nunca oculto).
  FOR t IN SELECT * FROM (VALUES ('biologico'),('quimico'),('fertilizante_adubo')) x(f) LOOP
    pg:=public.platform_read_global_product_catalog_by_family(t.f,'pendentes','RT familia produto rollback 0001',50,0);
    PERFORM pg_temp.ok('sa.read.pendente.'||t.f, jsonb_array_length(pg->'items')=1 AND pg->'items'->0->>'familia_catalogo' IS NULL);
  END LOOP;
  pg:=public.platform_read_global_product_catalog_by_family('quimico','todos','',50,0);
  PERFORM pg_temp.ok('sa.read.projecao_minima', (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(pg->'items'->0) x)
    = ARRAY['ativo','b2b_enabled','classe_catalogo','codigo','familia_catalogo','id','nome','tipo','updated_at']);
  PERFORM pg_temp.ok('sa.read.legados_visiveis', (SELECT count(*) FROM jsonb_array_elements(
    public.platform_read_global_product_catalog_by_family('biologico','todos','',50,0)->'items'))
    = LEAST(50,(SELECT count(*) FROM public.produtos WHERE familia_catalogo IS NULL OR familia_catalogo='biologico')));

  SELECT to_jsonb(p) INTO v_before FROM public.produtos p WHERE id=v_pid; v_ver:=(v_before->>'updated_at')::timestamptz;
  k:=gen_random_uuid();
  r:=public.platform_set_global_product_family(v_pid,v_ver,'biologico','biofungicida','Teste runtime familia rollback',k);
  SELECT to_jsonb(p) INTO v_after FROM public.produtos p WHERE id=v_pid;
  PERFORM pg_temp.ok('sa.classificar', r->>'familia_catalogo'='biologico' AND r->>'classe_catalogo'='biofungicida'
    AND (r->>'updated_at')::timestamptz > v_ver AND (r->>'idempotent')::boolean=false);
  PERFORM pg_temp.ok('sa.invariante_demais_colunas', (v_before - ARRAY['familia_catalogo','classe_catalogo','updated_at'])
    = (v_after - ARRAY['familia_catalogo','classe_catalogo','updated_at']));
  -- Filtros: aparece em biológico/todos, some de pendentes e de químico.
  PERFORM pg_temp.ok('sa.filtro.biologico', jsonb_array_length(public.platform_read_global_product_catalog_by_family('biologico','todos','RT familia produto rollback 0001',50,0)->'items')=1);
  PERFORM pg_temp.ok('sa.filtro.fora_pendentes', jsonb_array_length(public.platform_read_global_product_catalog_by_family('biologico','pendentes','RT familia produto rollback 0001',50,0)->'items')=0);
  PERFORM pg_temp.ok('sa.filtro.fora_quimico', jsonb_array_length(public.platform_read_global_product_catalog_by_family('quimico','todos','RT familia produto rollback 0001',50,0)->'items')=0);
  -- Replay idêntico.
  r2:=public.platform_set_global_product_family(v_pid,v_ver,'biologico','biofungicida','Teste runtime familia rollback',k);
  PERFORM pg_temp.ok('sa.replay', (r2->>'idempotent')::boolean AND r2->>'audit_id'=r->>'audit_id');
  -- Replay divergente.
  BEGIN PERFORM public.platform_set_global_product_family(v_pid,v_ver,'quimico','fungicida','Teste runtime familia rollback',k);
    PERFORM pg_temp.ok('sa.replay_divergente',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.replay_divergente',true); END;
  -- CAS stale.
  BEGIN PERFORM public.platform_set_global_product_family(v_pid,v_ver,'quimico','fungicida','Teste runtime familia rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.cas_stale',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.cas_stale',SQLERRM='catalog_family_conflict'); END;
  -- Sem mudança.
  BEGIN PERFORM public.platform_set_global_product_family(v_pid,(r->>'updated_at')::timestamptz,'biologico','biofungicida','Teste runtime familia rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.sem_mudanca',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.sem_mudanca',SQLERRM='catalog_family_no_change'); END;
  -- Reclassificação explícita para químico/fungicida (permitida, auditada).
  r2:=public.platform_set_global_product_family(v_pid,(r->>'updated_at')::timestamptz,'quimico','fungicida','Teste runtime familia rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.reclassificar', r2->>'familia_catalogo'='quimico' AND (r2->>'updated_at')::timestamptz > (r->>'updated_at')::timestamptz);
  v_ver:=(r2->>'updated_at')::timestamptz;
  -- Mistura de classes negada (servidor), família inválida, limpar família, motivo, nulos.
  FOR t IN SELECT * FROM (VALUES
      ('mistura.quimico_biofungicida','quimico','biofungicida','Motivo valido de teste'),
      ('mistura.biologico_herbicida','biologico','herbicida','Motivo valido de teste'),
      ('mistura.fertilizante_classe','fertilizante_adubo','fungicida','Motivo valido de teste'),
      ('familia.invalida','semente','','Motivo valido de teste'),
      ('familia.nula',NULL,NULL,'Motivo valido de teste')) x(nome,f,c,m) LOOP
    BEGIN PERFORM public.platform_set_global_product_family(v_pid,v_ver,t.f,t.c,t.m,gen_random_uuid());
      PERFORM pg_temp.ok('sa.valida.'||t.nome,false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.valida.'||t.nome,true); END;
  END LOOP;
  FOR t IN SELECT * FROM (VALUES ('motivo.curto','curto'),('motivo.longo',repeat('x',501))) x(nome,m) LOOP
    BEGIN PERFORM public.platform_set_global_product_family(v_pid,v_ver,'fertilizante_adubo',NULL,t.m,gen_random_uuid());
      PERFORM pg_temp.ok('sa.valida.'||t.nome,false); EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.ok('sa.valida.'||t.nome,SQLSTATE IN ('22023','23514')); END;
  END LOOP;
  BEGIN PERFORM public.platform_set_global_product_family(gen_random_uuid(),v_ver,'quimico',NULL,'Motivo valido de teste',gen_random_uuid());
    PERFORM pg_temp.ok('sa.valida.id_inexistente',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('sa.valida.id_inexistente',true); END;
  -- Leitor: parâmetros inválidos.
  FOR t IN SELECT * FROM (VALUES ('semente','todos',50,0),('quimico','x',50,0),('quimico','todos',51,0),('quimico','todos',50,-1)) x(f,rv,l,o) LOOP
    BEGIN PERFORM public.platform_read_global_product_catalog_by_family(t.f,t.rv,'',t.l,t.o);
      PERFORM pg_temp.ok('sa.read.invalido.'||t.f||'.'||t.rv||'.'||t.l||'.'||t.o,false);
      EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.read.invalido.'||t.f||'.'||t.rv||'.'||t.l||'.'||t.o,true); END;
  END LOOP;
  -- Writers anteriores continuam funcionando com a coluna nova (status/B2B preservam família).
  r:=public.platform_set_global_product_status(v_pid,v_ver,true,'Teste runtime familia rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.regressao.status_preserva_familia', (SELECT familia_catalogo='quimico' AND classe_catalogo='fungicida' AND ativo FROM public.produtos WHERE id=v_pid));
  r2:=public.platform_set_global_b2b_enabled('produto',v_pid,(r->>'updated_at')::timestamptz,
    NOT (SELECT b2b_enabled FROM public.produtos WHERE id=v_pid),'Teste runtime familia rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.regressao.b2b_preserva_familia', (SELECT familia_catalogo='quimico' FROM public.produtos WHERE id=v_pid));
  -- Ledger.
  PERFORM pg_temp.ok('sa.ledger', (SELECT count(*) FROM public.catalog_platform_admin_audit WHERE operation='set_global_product_family'
    AND counts_after->'after'->>'id'=v_pid::text)=2);
END $$;
RESET ROLE;

-- Ledger imutável (mesmo para owner via trigger).
DO $$ BEGIN
  BEGIN UPDATE public.catalog_platform_admin_audit SET reason='x' WHERE operation='set_global_product_family';
    PERFORM pg_temp.ok('ledger.imutavel_update',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('ledger.imutavel_update',true); END;
END $$;

-- ============================================================ 2) Atores tenant: leitor/writer/DML negados
DO $$
DECLARE r record; v_pid uuid:=(SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='produto_novo');
BEGIN
  FOR r IN SELECT rt_ctx.k, rt_ctx.v::uuid u FROM rt_ctx WHERE rt_ctx.k IN ('admin_ar','admin_fsf','financeiro_ar','consultor_ar') LOOP
    PERFORM pg_temp.claims(r.u); SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.platform_read_global_product_catalog_by_family('quimico','todos','',50,0); PERFORM pg_temp.ok(r.k||'.reader',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(r.k||'.reader',true); END;
    BEGIN PERFORM public.platform_set_global_product_family(v_pid,now(),'quimico',NULL,'Tentativa tenant negada',gen_random_uuid()); PERFORM pg_temp.ok(r.k||'.writer',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(r.k||'.writer',true); END;
    BEGIN UPDATE public.produtos SET familia_catalogo='quimico' WHERE id=v_pid; PERFORM pg_temp.ok(r.k||'.dml_direto',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(r.k||'.dml_direto',true); END;
    BEGIN PERFORM platform_private.set_global_product_family_core(v_pid,now(),'quimico',NULL,'Tentativa tenant negada',gen_random_uuid()); PERFORM pg_temp.ok(r.k||'.core',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(r.k||'.core',true); END;
    RESET ROLE;
  END LOOP;
END $$;

-- ============================================================ 3) Claims inválidas (SA) e anon
DO $$
DECLARE sa uuid:=(SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='sa'); v_pid uuid:=(SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='produto_novo'); t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES ('expirada',-1200,-60),('iat_futuro',600,1200)) x(nome,iat,exp) LOOP
    PERFORM pg_temp.claims(sa,t.iat,t.exp); SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.platform_set_global_product_family(v_pid,now(),'quimico',NULL,'Claims inválidas teste',gen_random_uuid());
      PERFORM pg_temp.ok('claims.'||t.nome,false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('claims.'||t.nome,true); END;
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.platform_set_global_product_family(v_pid,now(),'quimico',NULL,'Tentativa anon negada',gen_random_uuid());
    PERFORM pg_temp.ok('anon.writer',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('anon.writer',true); END;
  BEGIN PERFORM public.platform_read_global_product_catalog_by_family('quimico','todos','',50,0); PERFORM pg_temp.ok('anon.reader',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('anon.reader',true); END;
  RESET ROLE;
END $$;

-- Invariante: nenhum produto pré-existente mudou.
INSERT INTO rt_results(step,ok) SELECT 'invariante.produtos_existentes',
  md5(string_agg(to_jsonb(p)::text, ',' ORDER BY id)) = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='snapshot_antes')
  FROM public.produtos p WHERE id <> (SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='produto_novo')
  -- snapshot_antes inclui as colunas novas (NULL) pois roda após a migration.
  ;

SELECT n, step, ok, detail FROM rt_results ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail, count(*) AS total FROM rt_results;
ROLLBACK;
