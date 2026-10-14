-- RUNTIME TEST (rollback total) — executar SOMENTE após aplicar o candidato, pelo Codex, no canônico swzpzcwiasxmjutrmvkm.
-- Usa atores EXISTENTES (sem fixtures persistidas). Nada é gravado: ROLLBACK ao final.
BEGIN;

-- 1) Superadmin ativo existente
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub',ur.user_id,'role','authenticated',
  'iat',extract(epoch from now())::bigint-30,'exp',extract(epoch from now())::bigint+600)::text
  FROM public.user_roles ur WHERE ur.role='superadmin' AND public.is_platform_superadmin(ur.user_id)
  AND platform_private.platform_actor_access_ready(ur.user_id) ORDER BY ur.user_id LIMIT 1), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; r2 jsonb; d jsonb; k uuid:=gen_random_uuid(); n int; v_id uuid; v_cid uuid; v_err text;
BEGIN
  -- criação micro: inativo, sem B2B, código servidor
  r:=public.platform_create_global_microorganism('{"nome":"RT micro rollback 0001","tipo":"bacteria","producao_on_farm":false}'::jsonb,'Teste runtime com rollback',k);
  v_id:=(r->>'id')::uuid;
  ASSERT (r->>'ativo')::boolean = false AND r->>'codigo' IS NOT NULL, 'create receipt';
  ASSERT (SELECT NOT ativo AND NOT b2b_enabled AND dose_ml_ha IS NULL AND valor_litro_brl IS NULL FROM public.microrganismos WHERE id=v_id), 'novo inativo sem preço';
  r2:=public.platform_create_global_microorganism('{"nome":"RT micro rollback 0001","tipo":"bacteria","producao_on_farm":false}'::jsonb,'Teste runtime com rollback',k);
  ASSERT (r2->>'idempotent')::boolean AND r2->>'id'=r->>'id', 'replay';
  BEGIN PERFORM public.platform_create_global_microorganism('{"nome":"outro","tipo":"bacteria","producao_on_farm":false}'::jsonb,'Teste runtime com rollback',k);
    RAISE EXCEPTION 'replay divergente aceito'; EXCEPTION WHEN serialization_failure THEN NULL; END;
  -- payload proibido
  FOREACH v_err IN ARRAY ARRAY['{"nome":"x","tipo":"bacteria","producao_on_farm":true,"b2b_enabled":true}',
    '{"nome":"x","tipo":"bacteria","producao_on_farm":true,"valor_litro_brl":1}','{"nome":"x","tipo":"bacteria","producao_on_farm":true,"codigo":"Z"}',
    '{"nome":"x","tipo":"bacteria","producao_on_farm":true,"organization_id":"00000000-0000-0000-0000-000000000000"}','[]'] LOOP
    BEGIN PERFORM public.platform_create_global_microorganism(v_err::jsonb,'Teste runtime com rollback',gen_random_uuid());
      RAISE EXCEPTION 'payload proibido aceito: %',v_err; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  -- motivo curto
  BEGIN PERFORM public.platform_create_global_microorganism('{"nome":"y","tipo":"fungo","producao_on_farm":true}'::jsonb,'curto',gen_random_uuid());
    RAISE EXCEPTION 'motivo curto aceito'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- edição CAS + tipo imutável
  d:=public.platform_read_global_microorganism_detail(v_id);
  BEGIN PERFORM public.platform_update_global_microorganism(v_id,(d->>'updated_at')::timestamptz,'{"tipo":"fungo"}','Teste runtime com rollback',gen_random_uuid());
    RAISE EXCEPTION 'tipo editável'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  r:=public.platform_update_global_microorganism(v_id,(d->>'updated_at')::timestamptz,'{"descricao":"rt"}','Teste runtime com rollback',gen_random_uuid());
  BEGIN PERFORM public.platform_update_global_microorganism(v_id,(d->>'updated_at')::timestamptz,'{"descricao":"rt2"}','Teste runtime com rollback',gen_random_uuid());
    RAISE EXCEPTION 'CAS stale aceito'; EXCEPTION WHEN serialization_failure THEN NULL; END;
  r:=public.platform_set_global_microorganism_status(v_id,(r->>'updated_at')::timestamptz,true,'Teste runtime com rollback',gen_random_uuid());
  ASSERT (r->>'ativo')::boolean, 'reativar';
  -- culturas
  r:=public.platform_create_global_culture('{"nome":"RT cultura rollback 0001"}','Teste runtime com rollback',gen_random_uuid());
  v_cid:=(r->>'id')::uuid; ASSERT (r->>'ativo')::boolean = false, 'cultura inativa';
  BEGIN PERFORM public.platform_create_global_culture('{"nome":"rt CULTURA rollback 0001"}','Teste runtime com rollback',gen_random_uuid());
    RAISE EXCEPTION 'duplicata aceita'; EXCEPTION WHEN unique_violation THEN NULL; END;
  r:=public.platform_set_global_culture_status(v_cid,(r->>'updated_at')::timestamptz,true,'Teste runtime com rollback',gen_random_uuid());
  ASSERT (SELECT ativo AND desativada_em IS NULL FROM public.culturas WHERE id=v_cid), 'cultura ativa';
  ASSERT (public.platform_read_global_cultures('',50,0)->'items') IS NOT NULL, 'list';
  SELECT count(*) INTO n FROM public.catalog_platform_admin_audit WHERE operation LIKE '%\_global\_microorganism%' OR operation LIKE '%\_global\_culture%';
  ASSERT n >= 5, 'ledger';
  -- DML direto continua negado (políticas 20261014185551 / culturas containment)
  BEGIN UPDATE public.microrganismos SET descricao='direto' WHERE id=v_id; GET DIAGNOSTICS n=ROW_COUNT;
    ASSERT n=0, 'DML direto micro'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.culturas SET descricao='direto' WHERE id=v_cid; GET DIAGNOSTICS n=ROW_COUNT;
    ASSERT n=0, 'DML direto cultura'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- ledger imutável
  BEGIN UPDATE public.catalog_platform_admin_audit SET reason='x' WHERE operation='create_global_culture'; GET DIAGNOSTICS n=ROW_COUNT;
    ASSERT n=0, 'ledger mutável'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- 2) Ator tenant existente (administrador sem superadmin): todas as RPCs negam com 42501
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub',ur.user_id,'role','authenticated',
  'iat',extract(epoch from now())::bigint-30,'exp',extract(epoch from now())::bigint+600)::text
  FROM public.user_roles ur WHERE ur.role='administrador'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles s WHERE s.user_id=ur.user_id AND s.role='superadmin') ORDER BY ur.user_id LIMIT 1), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE c uuid:=(SELECT id FROM public.culturas ORDER BY id LIMIT 1); m uuid:=(SELECT id FROM public.microrganismos ORDER BY id LIMIT 1);
BEGIN
  BEGIN PERFORM public.platform_read_global_cultures('',10,0); RAISE EXCEPTION 'tenant leu'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_read_global_microorganism_detail(m); RAISE EXCEPTION 'tenant leu detalhe'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_create_global_culture('{"nome":"t"}','Tentativa tenant negada',gen_random_uuid()); RAISE EXCEPTION 'tenant criou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_set_global_culture_status(c,now(),false,'Tentativa tenant negada',gen_random_uuid()); RAISE EXCEPTION 'tenant status'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.platform_update_global_microorganism(m,now(),'{"descricao":"x"}','Tentativa tenant negada',gen_random_uuid()); RAISE EXCEPTION 'tenant editou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ASSERT (SELECT count(*) FROM public.culturas) > 0, 'leitura tenant preexistente preservada';
END $$;
RESET ROLE;

-- 3) anon: sem EXECUTE
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.platform_read_global_cultures('',10,0); RAISE EXCEPTION 'anon executou'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
