-- RUNTIME TEST (rollback total) — SQL proposto JÁ APLICADO externamente (Codex, a partir de 5c78f665) como
-- migration 20261014215550 platform_global_product_family: NÃO REAPLICAR o proposto. Este runtime só valida, no
-- canônico swzpzcwiasxmjutrmvkm. Nada persiste: ROLLBACK ao final.
-- Harness (revisão 2026-10-14): RPCs sob teste SEMPRE como `authenticated` com claims do ator; SELECT direto em
-- produtos como SA retorna 0 pela RLS (por design, NÃO ampliar), então snapshots/invariantes são lidos pelo owner
-- (RESET ROLE) apenas como oráculo de teste. Execução independente do harness corrigido: 87 PASS / 0 FAIL (externo).
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
  INSERT INTO rt_ctx SELECT 'volumes_antes', md5(coalesce(string_agg(to_jsonb(v)::text, ',' ORDER BY id),'')) FROM public.catalogo_volumes v;
  INSERT INTO rt_ctx SELECT 'formulacoes_antes', md5(coalesce(string_agg(to_jsonb(f)::text, ',' ORDER BY id),'')) FROM public.formulacoes f;
  INSERT INTO rt_ctx SELECT 'product_count', count(*)::text FROM public.produtos;
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
DECLARE r jsonb; r2 jsonb; v_key uuid; v_pid uuid; v_ver timestamptz; v_before jsonb; v_after jsonb; pg jsonb; t record;
BEGIN
  r:=public.platform_create_global_product('{"nome":"RT familia produto rollback 0001","tipo":"fungicida"}','Teste runtime familia rollback',gen_random_uuid());
  v_pid:=(r->>'id')::uuid; INSERT INTO rt_ctx VALUES ('produto_novo',v_pid::text);
  -- Leitor: padrão 'familia' NUNCA traz NULL; pendente só aparece em revisão 'pendentes'/'todos'.
  FOR t IN SELECT * FROM (VALUES ('biologico'),('quimico'),('fertilizante_adubo')) x(f) LOOP
    pg:=public.platform_read_global_product_catalog_by_family(t.f,'familia','RT familia produto rollback 0001',50,0);
    PERFORM pg_temp.ok('sa.read.familia_sem_pendente.'||t.f, jsonb_array_length(pg->'items')=0);
    pg:=public.platform_read_global_product_catalog_by_family(t.f,'familia','',50,0);
    PERFORM pg_temp.ok('sa.read.familia_exclusiva.'||t.f, NOT EXISTS (SELECT 1 FROM jsonb_array_elements(pg->'items') e
      WHERE e->>'familia_catalogo' IS DISTINCT FROM t.f));
  END LOOP;
  pg:=public.platform_read_global_product_catalog_by_family(NULL,'pendentes','RT familia produto rollback 0001',50,0);
  PERFORM pg_temp.ok('sa.read.pendentes', jsonb_array_length(pg->'items')=1 AND pg->'items'->0->>'familia_catalogo' IS NULL);
  pg:=public.platform_read_global_product_catalog_by_family(NULL,'pendentes','',50,0);
  PERFORM pg_temp.ok('sa.read.pendentes_somente_null', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(pg->'items') e WHERE e->>'familia_catalogo' IS NOT NULL));
  pg:=public.platform_read_global_product_catalog_by_family(NULL,'todos','',50,0);
  PERFORM pg_temp.ok('sa.read.projecao_minima', (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(pg->'items'->0) x)
    = ARRAY['ativo','b2b_enabled','classe_catalogo','codigo','familia_catalogo','id','nome','tipo','updated_at']);
  PERFORM pg_temp.ok('sa.read.todos_inclui_null', jsonb_array_length(pg->'items') = LEAST(50,(SELECT rt_ctx.v::int+1 FROM rt_ctx WHERE rt_ctx.k='product_count')));

  RESET ROLE; SELECT to_jsonb(p) INTO v_before FROM public.produtos p WHERE p.id=v_pid; SET LOCAL ROLE authenticated;
  PERFORM pg_temp.ok('harness.owner_snapshot', v_before IS NOT NULL);
  v_ver:=(v_before->>'updated_at')::timestamptz;
  v_key:=gen_random_uuid();
  r:=public.platform_set_global_product_family(v_pid,v_ver,'biologico','biofungicida','Teste runtime familia rollback',v_key);
  RESET ROLE; SELECT to_jsonb(p) INTO v_after FROM public.produtos p WHERE p.id=v_pid; SET LOCAL ROLE authenticated;
  PERFORM pg_temp.ok('sa.classificar', r->>'familia_catalogo'='biologico' AND r->>'classe_catalogo'='biofungicida'
    AND (r->>'updated_at')::timestamptz > v_ver AND (r->>'idempotent')::boolean=false);
  PERFORM pg_temp.ok('sa.invariante_demais_colunas', (v_before - ARRAY['familia_catalogo','classe_catalogo','updated_at'])
    = (v_after - ARRAY['familia_catalogo','classe_catalogo','updated_at']));
  -- Isolamento: aparece só em biológico/familia e em todos; some de pendentes e das outras famílias.
  PERFORM pg_temp.ok('sa.filtro.biologico', jsonb_array_length(public.platform_read_global_product_catalog_by_family('biologico','familia','RT familia produto rollback 0001',50,0)->'items')=1);
  PERFORM pg_temp.ok('sa.filtro.todos', jsonb_array_length(public.platform_read_global_product_catalog_by_family(NULL,'todos','RT familia produto rollback 0001',50,0)->'items')=1);
  PERFORM pg_temp.ok('sa.filtro.fora_pendentes', jsonb_array_length(public.platform_read_global_product_catalog_by_family(NULL,'pendentes','RT familia produto rollback 0001',50,0)->'items')=0);
  PERFORM pg_temp.ok('sa.filtro.fora_quimico', jsonb_array_length(public.platform_read_global_product_catalog_by_family('quimico','familia','RT familia produto rollback 0001',50,0)->'items')=0);
  PERFORM pg_temp.ok('sa.filtro.fora_fertilizante', jsonb_array_length(public.platform_read_global_product_catalog_by_family('fertilizante_adubo','familia','RT familia produto rollback 0001',50,0)->'items')=0);
  -- Versão não finita rejeitada antes do CAS.
  FOR t IN SELECT * FROM (VALUES ('infinity'::timestamptz),('-infinity'::timestamptz)) x(v) LOOP
    BEGIN PERFORM public.platform_set_global_product_family(v_pid,t.v,'quimico',NULL,'Motivo valido de teste',gen_random_uuid());
      PERFORM pg_temp.ok('sa.valida.versao_'||t.v::text,false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.valida.versao_'||t.v::text,SQLERRM='catalog_family_invalid'); END;
  END LOOP;
  -- Replay idêntico.
  r2:=public.platform_set_global_product_family(v_pid,v_ver,'biologico','biofungicida','Teste runtime familia rollback',v_key);
  PERFORM pg_temp.ok('sa.replay', (r2->>'idempotent')::boolean AND r2->>'audit_id'=r->>'audit_id');
  -- Replay divergente.
  BEGIN PERFORM public.platform_set_global_product_family(v_pid,v_ver,'quimico','fungicida','Teste runtime familia rollback',v_key);
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
  FOR t IN SELECT * FROM (VALUES ('semente','familia',50,0),(NULL,'familia',50,0),('quimico','todos',50,0),('quimico','pendentes',50,0),
      ('quimico','x',50,0),('quimico','familia',51,0),('quimico','familia',50,-1)) x(f,rv,l,o) LOOP
    BEGIN PERFORM public.platform_read_global_product_catalog_by_family(t.f,t.rv,'',t.l,t.o);
      PERFORM pg_temp.ok('sa.read.invalido.'||coalesce(t.f,'null')||'.'||t.rv||'.'||t.l||'.'||t.o,false);
      EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.read.invalido.'||coalesce(t.f,'null')||'.'||t.rv||'.'||t.l||'.'||t.o,true); END;
  END LOOP;
  -- Writers anteriores continuam funcionando com a coluna nova (status/B2B preservam família).
  r:=public.platform_set_global_product_status(v_pid,v_ver,true,'Teste runtime familia rollback',gen_random_uuid());
  RESET ROLE;
  PERFORM pg_temp.ok('sa.regressao.status_preserva_familia', (SELECT p.familia_catalogo='quimico' AND p.classe_catalogo='fungicida' AND p.ativo FROM public.produtos p WHERE p.id=v_pid));
  SET LOCAL ROLE authenticated;
  -- Produto novo nasce b2b_enabled=false; writer B2B sob authenticated com true literal.
  r2:=public.platform_set_global_b2b_enabled('produto',v_pid,(r->>'updated_at')::timestamptz,
    true,'Teste runtime familia rollback',gen_random_uuid());
  RESET ROLE;
  PERFORM pg_temp.ok('sa.regressao.b2b_preserva_familia', (SELECT p.familia_catalogo='quimico' AND p.classe_catalogo='fungicida' AND p.b2b_enabled FROM public.produtos p WHERE p.id=v_pid));
  SET LOCAL ROLE authenticated;
  -- Ledger (lido como SA authenticated).
  PERFORM pg_temp.ok('sa.ledger', (SELECT count(*) FROM public.catalog_platform_admin_audit WHERE operation='set_global_product_family'
    AND counts_after->'after'->>'id'=v_pid::text)=2);
END $$;
RESET ROLE;

-- Ledger imutável (mesmo para owner via trigger).
DO $$ BEGIN
  BEGIN UPDATE public.catalog_platform_admin_audit SET reason='x' WHERE operation='set_global_product_family';
    PERFORM pg_temp.ok('ledger.imutavel_update',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('ledger.imutavel_update',true); END;
END $$;

-- ============================================================ 1b) CHECKs diretamente (owner, dentro do ROLLBACK; cada caso em subtransação)
DO $$
DECLARE v_pid uuid:=(SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='produto_novo'); t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('null_familia_com_classe',NULL,'biofungicida'), ('null_familia_classe_quimica',NULL,'herbicida'),
      ('null_familia_classe_arbitraria',NULL,'xyz'),
      ('quimico_biofungicida','quimico','biofungicida'), ('quimico_inoculante','quimico','inoculante'),
      ('biologico_fungicida','biologico','fungicida'), ('biologico_herbicida','biologico','herbicida'),
      ('fertilizante_fungicida','fertilizante_adubo','fungicida'), ('fertilizante_biofungicida','fertilizante_adubo','biofungicida'),
      ('familia_invalida','semente',NULL), ('classe_vazia','quimico','')) x(nome,f,c) LOOP
    BEGIN UPDATE public.produtos SET familia_catalogo=t.f, classe_catalogo=t.c WHERE id=v_pid;
      PERFORM pg_temp.ok('check.nega.'||t.nome,false);
      EXCEPTION WHEN check_violation THEN PERFORM pg_temp.ok('check.nega.'||t.nome,true); END;
  END LOOP;
  FOR t IN SELECT * FROM (VALUES ('nulos',NULL,NULL),('quimico_sem_classe','quimico',NULL),('biologico_biofungicida','biologico','biofungicida'),
      ('quimico_herbicida','quimico','herbicida'),('fertilizante_sem_classe','fertilizante_adubo',NULL)) x(nome,f,c) LOOP
    BEGIN UPDATE public.produtos SET familia_catalogo=t.f, classe_catalogo=t.c WHERE id=v_pid;
      PERFORM pg_temp.ok('check.aceita.'||t.nome,true);
      EXCEPTION WHEN check_violation THEN PERFORM pg_temp.ok('check.aceita.'||t.nome,false); END;
  END LOOP;
END $$;

-- ============================================================ 2) Atores tenant: leitor/writer/DML negados
DO $$
DECLARE r record; v_pid uuid:=(SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='produto_novo');
BEGIN
  FOR r IN SELECT rt_ctx.k, rt_ctx.v::uuid u FROM rt_ctx WHERE rt_ctx.k IN ('admin_ar','admin_fsf','financeiro_ar','consultor_ar') LOOP
    PERFORM pg_temp.claims(r.u); SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.platform_read_global_product_catalog_by_family('quimico','familia','',50,0); PERFORM pg_temp.ok(r.k||'.reader',false);
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
  BEGIN PERFORM public.platform_read_global_product_catalog_by_family('quimico','familia','',50,0); PERFORM pg_temp.ok('anon.reader',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('anon.reader',true); END;
  RESET ROLE;
END $$;

-- Invariante: nenhum produto pré-existente mudou.
INSERT INTO rt_results(step,ok) SELECT 'invariante.produtos_existentes',
  md5(string_agg(to_jsonb(p)::text, ',' ORDER BY id)) = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='snapshot_antes')
  FROM public.produtos p WHERE id <> (SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='produto_novo')
  -- snapshot_antes inclui as colunas novas (NULL) pois roda após a migration.
  ;

-- Invariantes: apresentações (ex.: Bombarbio 1000 mL/R$180) e composições (ex.: 334/333/333) intactas; sem backfill.
INSERT INTO rt_results(step,ok) SELECT 'invariante.volumes', md5(coalesce(string_agg(to_jsonb(v)::text, ',' ORDER BY id),''))
  = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='volumes_antes') FROM public.catalogo_volumes v;
INSERT INTO rt_results(step,ok) SELECT 'invariante.formulacoes', md5(coalesce(string_agg(to_jsonb(f)::text, ',' ORDER BY id),''))
  = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='formulacoes_antes') FROM public.formulacoes f
  WHERE f.produto_id IS DISTINCT FROM (SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='produto_novo');
INSERT INTO rt_results(step,ok) SELECT 'invariante.bombarbio_sem_familia', (SELECT familia_catalogo IS NULL AND classe_catalogo IS NULL
  FROM public.produtos WHERE id='1875527c-a65a-483b-a6c2-9122d5ec2a51');

SELECT n, step, ok, detail FROM rt_results ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail, count(*) AS total FROM rt_results;
ROLLBACK;
