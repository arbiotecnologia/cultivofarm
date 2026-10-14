-- RUNTIME TEST (rollback total) — executar SOMENTE após aplicar proposed-platform-global-volumes-admin.sql, pelo Codex,
-- no canônico swzpzcwiasxmjutrmvkm. Atores EXISTENTES via psql (nunca inferidos). Nada persiste: ROLLBACK ao final.
-- Validação do SA usa SOMENTE leitores autorizados; invariantes do pai (preço/B2B/dose/código) e ledger
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

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT k, v::uuid u FROM rt_ctx LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=r.u) THEN RAISE EXCEPTION 'ator inexistente: %', r.k; END IF;
    IF r.k='sa' AND NOT (public.has_role(r.u,'superadmin') AND public.is_platform_superadmin(r.u) AND platform_private.platform_actor_access_ready(r.u)) THEN
      RAISE EXCEPTION 'sa não é superadmin ativo'; END IF;
    IF r.k<>'sa' AND (public.has_role(r.u,'superadmin') OR public.is_platform_superadmin(r.u)) THEN RAISE EXCEPTION 'ator tenant é superadmin: %', r.k; END IF;
  END LOOP;
  -- Pais reais escolhidos deterministicamente; nada é persistido.
  INSERT INTO rt_ctx SELECT 'produto', id::text FROM public.produtos ORDER BY id LIMIT 1;
  INSERT INTO rt_ctx SELECT 'micro', id::text FROM public.microrganismos ORDER BY id LIMIT 1;
  INSERT INTO rt_ctx SELECT 'produto_snapshot', to_jsonb(p)::text FROM public.produtos p WHERE id=(SELECT v::uuid FROM rt_ctx WHERE k='produto');
  INSERT INTO rt_ctx SELECT 'micro_snapshot', to_jsonb(m)::text FROM public.microrganismos m WHERE id=(SELECT v::uuid FROM rt_ctx WHERE k='micro');
  INSERT INTO rt_ctx SELECT 'ledger_antes', count(*)::text FROM public.catalog_platform_admin_audit;
  INSERT INTO rt_ctx SELECT 'volumes_antes', count(*)::text FROM public.catalogo_volumes;
END $$;

CREATE FUNCTION pg_temp.claims(p_uid uuid, p_iat_offset int DEFAULT -30, p_exp_offset int DEFAULT 600) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub',p_uid,'role','authenticated',
    'iat',extract(epoch from now())::bigint+p_iat_offset,'exp',extract(epoch from now())::bigint+p_exp_offset)::text, true);
$$;
CREATE FUNCTION pg_temp.ok(p_step text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  INSERT INTO rt_results(step,ok,detail) VALUES (p_step,COALESCE(p_ok,false),p_detail);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.claims(uuid,int,int), pg_temp.ok(text,boolean,text) TO authenticated, anon;

-- ============================================================ 1) Superadmin: fluxo funcional
SELECT pg_temp.claims((SELECT v::uuid FROM rt_ctx WHERE k='sa'));
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; d jsonb; l jsonb; k uuid:=gen_random_uuid(); v1 uuid; v2 uuid; p uuid:=(SELECT v::uuid FROM rt_ctx WHERE k='produto');
  m uuid:=(SELECT v::uuid FROM rt_ctx WHERE k='micro'); pricing0 jsonb; v_p text; st text; det text;
BEGIN
  l:=public.platform_read_global_item_volumes('produto',p,20,0);
  pricing0:=l->'item'->'pricing';
  PERFORM pg_temp.ok('sa.read.produto', l ? 'items' AND l->'item'->>'id'=p::text);
  -- criar inativa: derivados no DB e pai intacto
  r:=public.platform_create_global_volume('produto',p,'{"volume_ml":"1000","preco_brl":"123.45","rotulo":"RT 1 L"}','Teste runtime com rollback',k);
  v1:=(r->>'id')::uuid; INSERT INTO rt_ctx VALUES ('v1',v1::text);
  d:=public.platform_read_global_volume_detail(v1);
  PERFORM pg_temp.ok('sa.create.inativa_derivados', (d->>'ativo')::boolean=false AND d->>'moeda'='BRL'
    AND (d->>'preco_litro_brl')::numeric=123.45 AND (d->>'valor_dose_100ml_brl')::numeric=12.35 AND (d->>'doses_por_volume')::numeric=10);
  PERFORM pg_temp.ok('sa.create.pai_intacto', public.platform_read_global_item_volumes('produto',p,20,0)->'item'->'pricing'=pricing0);
  r:=public.platform_create_global_volume('produto',p,'{"volume_ml":"1000","preco_brl":"123.45","rotulo":"RT 1 L"}','Teste runtime com rollback',k);
  PERFORM pg_temp.ok('sa.create.replay_identico', (r->>'idempotent')::boolean AND (r->>'id')::uuid=v1);
  BEGIN PERFORM public.platform_create_global_volume('produto',p,'{"volume_ml":"500","preco_brl":"1"}','Teste runtime com rollback',k);
    PERFORM pg_temp.ok('sa.create.replay_divergente',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.create.replay_divergente',true); END;
  FOREACH v_p IN ARRAY ARRAY['{"volume_ml":1000,"preco_brl":"1"}','{"volume_ml":"1000","preco_brl":1.1}','{"volume_ml":"1000","preco_brl":"0"}',
    '{"volume_ml":"0","preco_brl":"1"}','{"volume_ml":"1000.0001","preco_brl":"1"}','{"volume_ml":"1000","preco_brl":"1.001"}',
    '{"volume_ml":"1e3","preco_brl":"1"}','{"volume_ml":"1000","preco_brl":"1","moeda":"USD"}','{"volume_ml":"1000","preco_brl":"1","ativo":true}',
    '{"volume_ml":"1000","preco_brl":"1","produto_id":null}','{"volume_ml":"1000","preco_brl":"1","preco_litro_brl":"9"}',
    '{"volume_ml":"1000","preco_brl":"1","ordem":1.5}','{"volume_ml":"1000"}','[]'] LOOP
    BEGIN PERFORM public.platform_create_global_volume('produto',p,v_p::jsonb,'Teste runtime com rollback',gen_random_uuid());
      PERFORM pg_temp.ok('sa.payload_proibido',false,v_p); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.payload_proibido',true,v_p); END;
  END LOOP;
  BEGIN PERFORM public.platform_create_global_volume('produto',p,'{"volume_ml":"1","preco_brl":"1"}','curto',gen_random_uuid());
    PERFORM pg_temp.ok('sa.motivo_curto',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.motivo_curto',true); END;
  BEGIN PERFORM public.platform_create_global_volume('produto',gen_random_uuid(),'{"volume_ml":"1","preco_brl":"1"}','Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.pai_inexistente',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('sa.pai_inexistente',true); END;
  -- edição inativa sem confirmação: permitida e sem efeito no pai
  d:=public.platform_read_global_volume_detail(v1);
  r:=public.platform_update_global_volume(v1,(d->>'updated_at')::timestamptz,'{"rotulo":"RT 1 litro"}',false,'Teste runtime com rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.update.inativa', (r->>'repriced')::boolean=false AND r->>'updated_at'>d->>'updated_at');
  BEGIN PERFORM public.platform_update_global_volume(v1,(d->>'updated_at')::timestamptz,'{"rotulo":"x"}',false,'Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.update.cas',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.update.cas',true); END;
  BEGIN PERFORM public.platform_update_global_volume(v1,(r->>'updated_at')::timestamptz,'{"item_tipo":"microrganismo"}',false,'Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.update.vinculo_imutavel',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.update.vinculo_imutavel',true); END;
  -- ativar sem confirmação => 55000 com projeção; nada persiste
  d:=public.platform_read_global_volume_detail(v1);
  BEGIN PERFORM public.platform_set_global_volume_status(v1,(d->>'updated_at')::timestamptz,true,false,'Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.ativar.sem_confirmacao',false);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN GET STACKED DIAGNOSTICS det = PG_EXCEPTION_DETAIL;
    PERFORM pg_temp.ok('sa.ativar.sem_confirmacao', (det::jsonb->>'repriced')::boolean AND det::jsonb->'parent_after'->>'valor_litro_brl'='123.45', det); END;
  PERFORM pg_temp.ok('sa.ativar.sem_confirmacao_rollback', (public.platform_read_global_volume_detail(v1)->>'ativo')::boolean=false
    AND public.platform_read_global_item_volumes('produto',p,20,0)->'item'->'pricing'=pricing0);
  r:=public.platform_set_global_volume_status(v1,(d->>'updated_at')::timestamptz,true,true,'Teste runtime com rollback',gen_random_uuid());
  l:=public.platform_read_global_item_volumes('produto',p,20,0);
  PERFORM pg_temp.ok('sa.ativar.confirmado_reprecifica', (r->>'repriced')::boolean AND (l->'item'->'pricing'->>'valor_litro_brl')::numeric=123.45
    AND (l->'item'->'pricing'->>'valor_dose_brl')::numeric=12.35);
  -- segunda apresentação inativa com preço/L diferente; ativar sem confirmação bloqueia anulação do pai
  r:=public.platform_create_global_volume('produto',p,'{"volume_ml":"5000","preco_brl":"500"}','Teste runtime com rollback',gen_random_uuid());
  v2:=(r->>'id')::uuid; d:=public.platform_read_global_volume_detail(v2);
  BEGIN PERFORM public.platform_set_global_volume_status(v2,(d->>'updated_at')::timestamptz,true,false,'Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.anulacao_exige_confirmacao',false);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN GET STACKED DIAGNOSTICS det = PG_EXCEPTION_DETAIL;
    PERFORM pg_temp.ok('sa.anulacao_exige_confirmacao', det::jsonb->'parent_after'->>'valor_litro_brl' IS NULL, det); END;
  -- duplicidade ativa de mesmo volume
  r:=public.platform_create_global_volume('produto',p,'{"volume_ml":"1000","preco_brl":"123.45","rotulo":"dup"}','Teste runtime com rollback',gen_random_uuid());
  d:=public.platform_read_global_volume_detail((r->>'id')::uuid);
  BEGIN PERFORM public.platform_set_global_volume_status((r->>'id')::uuid,(d->>'updated_at')::timestamptz,true,true,'Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.duplicidade_ativa',false); EXCEPTION WHEN unique_violation THEN PERFORM pg_temp.ok('sa.duplicidade_ativa',true); END;
  -- status igual = conflito
  d:=public.platform_read_global_volume_detail(v1);
  BEGIN PERFORM public.platform_set_global_volume_status(v1,(d->>'updated_at')::timestamptz,true,true,'Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.status_igual',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.status_igual',true); END;
  -- arquivar a última ativa: exige confirmação; pai preserva último preço (contrato canônico)
  r:=public.platform_set_global_volume_status(v1,(d->>'updated_at')::timestamptz,false,true,'Teste runtime com rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.arquivar_ultima_preserva', (r->>'ativo')::boolean=false
    AND (public.platform_read_global_item_volumes('produto',p,20,0)->'item'->'pricing'->>'valor_litro_brl')::numeric=123.45);
  -- microrganismo: criação inativa e leitura
  r:=public.platform_create_global_volume('microrganismo',m,'{"volume_ml":"1000","preco_brl":"10"}','Teste runtime com rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.micro.create', public.platform_read_global_volume_detail((r->>'id')::uuid)->>'item_tipo'='microrganismo');
  BEGIN PERFORM public.platform_read_global_item_volumes('produto',p,51,0); PERFORM pg_temp.ok('sa.read.limite',false);
    EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.read.limite',true); END;
END $$;
RESET ROLE;

-- ============================================================ 2) Invariantes protegidas (postgres)
DO $$
DECLARE b jsonb:=(SELECT v::jsonb FROM rt_ctx WHERE k='produto_snapshot'); a jsonb; s text[]:=ARRAY['valor_litro_brl','valor_dose_brl','valor_ha_brl','updated_at'];
BEGIN
  SELECT to_jsonb(p) INTO a FROM public.produtos p WHERE id=(b->>'id')::uuid;
  PERFORM pg_temp.ok('pg.produto.protegidos_intactos', (a - s) = (b - s));
  SELECT to_jsonb(m) INTO a FROM public.microrganismos m WHERE id=(SELECT v::uuid FROM rt_ctx WHERE k='micro');
  b:=(SELECT v::jsonb FROM rt_ctx WHERE k='micro_snapshot');
  PERFORM pg_temp.ok('pg.micro.intacto_criacao_inativa', (a - s) = (b - s) AND a->'valor_litro_brl' IS NOT DISTINCT FROM b->'valor_litro_brl');
  PERFORM pg_temp.ok('pg.ledger.registrou', (SELECT count(*) FROM public.catalog_platform_admin_audit WHERE operation LIKE '%\_global\_volume')
    >= 7 AND NOT EXISTS (SELECT 1 FROM public.catalog_platform_admin_audit WHERE operation LIKE '%\_global\_volume'
      AND (counts_before ? 'parent') IS NOT TRUE));
  BEGIN UPDATE public.catalog_platform_admin_audit SET reason='x' WHERE operation='create_global_volume';
    PERFORM pg_temp.ok('pg.ledger.imutavel',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('pg.ledger.imutavel',true); END;
END $$;

-- ============================================================ 3) Negativas: 4 tenants, anon, claims inválidas
DO $$
DECLARE a text; v1 uuid:=(SELECT v::uuid FROM rt_ctx WHERE k='v1'); p uuid:=(SELECT v::uuid FROM rt_ctx WHERE k='produto'); fn text; n int;
BEGIN
  FOREACH a IN ARRAY ARRAY['admin_ar','admin_fsf','financeiro_ar','consultor_ar'] LOOP
    PERFORM pg_temp.claims((SELECT v::uuid FROM rt_ctx WHERE k=a));
    SET LOCAL ROLE authenticated;
    FOREACH fn IN ARRAY ARRAY['read','detail','create','update','status'] LOOP
      BEGIN
        IF fn='read' THEN PERFORM public.platform_read_global_item_volumes('produto',p,20,0);
        ELSIF fn='detail' THEN PERFORM public.platform_read_global_volume_detail(v1);
        ELSIF fn='create' THEN PERFORM public.platform_create_global_volume('produto',p,'{"volume_ml":"1","preco_brl":"1"}','Teste runtime com rollback',gen_random_uuid());
        ELSIF fn='update' THEN PERFORM public.platform_update_global_volume(v1,now(),'{"rotulo":"x"}',true,'Teste runtime com rollback',gen_random_uuid());
        ELSE PERFORM public.platform_set_global_volume_status(v1,now(),true,true,'Teste runtime com rollback',gen_random_uuid()); END IF;
        PERFORM pg_temp.ok('tenant.negado.'||a||'.'||fn,false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('tenant.negado.'||a||'.'||fn,true); END;
    END LOOP;
    -- leitura tenant preservada (políticas existentes); DML direto negado
    SELECT count(*) INTO n FROM public.catalogo_volumes;
    PERFORM pg_temp.ok('tenant.leitura_preservada.'||a, n >= 0);
    BEGIN INSERT INTO public.catalogo_volumes(item_tipo,produto_id,volume_ml,preco_brl) VALUES ('produto',p,1,1);
      PERFORM pg_temp.ok('tenant.dml_negado.'||a,false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('tenant.dml_negado.'||a,true); END;
    RESET ROLE;
  END LOOP;
  -- SA com claims expiradas / futuras
  PERFORM pg_temp.claims((SELECT v::uuid FROM rt_ctx WHERE k='sa'),-7200,-3600);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.platform_read_global_item_volumes('produto',p,20,0); PERFORM pg_temp.ok('sa.claims_expiradas',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('sa.claims_expiradas',true); END;
  RESET ROLE;
  PERFORM pg_temp.claims((SELECT v::uuid FROM rt_ctx WHERE k='sa'),3600,7200);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.platform_create_global_volume('produto',p,'{"volume_ml":"1","preco_brl":"1"}','Teste runtime com rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.claims_futuras',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('sa.claims_futuras',true); END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.platform_read_global_item_volumes('produto',p,20,0); PERFORM pg_temp.ok('anon.negado',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('anon.negado',true); END;
  RESET ROLE;
END $$;

SELECT n, step, ok, detail FROM rt_results ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail FROM rt_results;
ROLLBACK;
