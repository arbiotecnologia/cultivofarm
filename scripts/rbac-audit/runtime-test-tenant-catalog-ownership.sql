-- RUNTIME (rollback) do candidato de ownership — executar SOMENTE após aplicação revisada, como owner,
-- dentro de transação que termina em ROLLBACK. Nada persiste. Atores reais por psql vars (UUIDs, nunca PII):
--   \set ar_admin '...'  \set fsf_admin '...'  \set sa '...'  \set financeiro '...'  \set consultor '...'
--   \set ar_org '...'    \set fsf_org '...'
-- Gate é aberto APENAS dentro desta transação para exercitar o CRUD; o ROLLBACK final o devolve a OFF.
BEGIN;
CREATE TEMP TABLE _r(caso text, ok boolean, obs text);
CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', jsonb_build_object('sub',u,'role','authenticated',
    'exp', extract(epoch FROM now()+interval '5 min')::bigint)::text, true),
         set_config('role','authenticated',true) $$;

-- 0. gate OFF: CRUD rejeitado mesmo para Admin AR.
SELECT pg_temp.as_user(:'ar_admin');
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('produto','create',NULL,NULL,'{"nome":"Teste Gate","tipo":"fungicida"}','motivo de teste gate',gen_random_uuid());
  INSERT INTO _r VALUES('gate_off',false,'aceitou'); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('gate_off',SQLERRM='catalog_ownership_disabled',SQLERRM); END $$;
RESET role; SELECT set_config('request.jwt.claims','',true);
UPDATE platform_private.catalog_ownership_gate SET enabled=true, readers_certified_at=now();

-- 1. anon: sem EXECUTE; só global visível.
SET LOCAL role anon;
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"x"}','motivo anon teste',gen_random_uuid());
  INSERT INTO _r VALUES('anon_exec',false,''); EXCEPTION WHEN insufficient_privilege THEN INSERT INTO _r VALUES('anon_exec',true,''); END $$;
RESET role;

-- 2. AR cria cultura própria; replay; conflito de chave; forge de owner.
SELECT pg_temp.as_user(:'ar_admin');
CREATE TEMP TABLE _k AS SELECT gen_random_uuid() k;
DO $$ DECLARE r1 jsonb; r2 jsonb; k uuid := (SELECT k FROM _k);
BEGIN
  r1 := public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"Cultura Própria RT"}','criação runtime ar',k);
  r2 := public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"Cultura Própria RT"}','criação runtime ar',k);
  INSERT INTO _r VALUES('replay', r2->>'id'=r1->>'id' AND (r2->>'replayed')::boolean, '');
  BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"Outra"}','criação runtime ar',k);
    INSERT INTO _r VALUES('key_conflict',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('key_conflict',SQLERRM='catalog_owned_idempotency_conflict',SQLERRM); END;
  BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"F","owner_organization_id":"00000000-0000-0000-0000-000000000000"}','forge runtime ar',gen_random_uuid());
    INSERT INTO _r VALUES('forge_payload',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('forge_payload',SQLERRM='catalog_owned_invalid_payload',SQLERRM); END;
  -- duplicata própria com acento/case/espaço
  BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"  cultura   PROPRIA rt "}','dup runtime ar ok',gen_random_uuid());
    INSERT INTO _r VALUES('dup_own_norm',false,''); EXCEPTION WHEN unique_violation THEN INSERT INTO _r VALUES('dup_own_norm',SQLERRM='catalog_owned_duplicate_own',SQLERRM); END;
  -- duplicata global ativa (Bombarbio) -> mensagem orientando Exibir; nada ativado
  BEGIN PERFORM public.tenant_catalog_owned_mutate('produto','create',NULL,NULL,'{"nome":"BOMBARBIO","tipo":"fungicida"}','dup global runtime',gen_random_uuid());
    INSERT INTO _r VALUES('dup_global_active',false,''); EXCEPTION WHEN unique_violation THEN INSERT INTO _r VALUES('dup_global_active',SQLERRM='catalog_owned_duplicate_global_active',SQLERRM); END;
  -- global: editar/arquivar rejeitado como não encontrado
  BEGIN PERFORM public.tenant_catalog_owned_mutate('produto','archive','1875527c-a65a-483b-a6c2-9122d5ec2a51',now(),'{}','arquivar global runtime',gen_random_uuid());
    INSERT INTO _r VALUES('global_write',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('global_write',SQLERRM='catalog_owned_not_found',SQLERRM); END;
  -- CAS stale
  BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','update',(r1->>'id')::uuid,'2000-01-01','{"descricao":"x"}','cas runtime ar ok',gen_random_uuid());
    INSERT INTO _r VALUES('cas_stale',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('cas_stale',SQLSTATE='40001',SQLERRM); END;
  PERFORM set_config('rt.cultura', r1->>'id', true);
END $$;
-- DML direto de ownership (forge/ownershipchange)
DO $$ BEGIN UPDATE public.culturas SET owner_organization_id=NULL WHERE id=current_setting('rt.cultura')::uuid;
  INSERT INTO _r VALUES('owner_change_direct', NOT FOUND, 'sem linha afetada/sem grant'); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('owner_change_direct',true,SQLERRM); END $$;
RESET role;
DO $$ BEGIN UPDATE public.culturas SET owner_organization_id=NULL WHERE id=current_setting('rt.cultura')::uuid;
  INSERT INTO _r VALUES('owner_change_owner',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('owner_change_owner',SQLERRM='catalog_owner_immutable',SQLERRM); END $$;

-- 3. Outra empresa (FSF), SA, Financeiro, Consultor: não veem o privado de AR.
SELECT pg_temp.as_user(:'fsf_admin');
INSERT INTO _r SELECT 'fsf_nao_ve', NOT EXISTS (SELECT 1 FROM public.culturas WHERE id=current_setting('rt.cultura')::uuid), '';
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','archive',current_setting('rt.cultura')::uuid,now(),'{}','fsf tenta arquivar',gen_random_uuid());
  INSERT INTO _r VALUES('fsf_write',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('fsf_write',SQLERRM='catalog_owned_not_found',SQLERRM); END $$;
RESET role; SELECT pg_temp.as_user(:'sa');
INSERT INTO _r SELECT 'sa_nao_ve', NOT EXISTS (SELECT 1 FROM public.culturas WHERE id=current_setting('rt.cultura')::uuid), '';
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"SA X"}','sa tenta criar',gen_random_uuid());
  INSERT INTO _r VALUES('sa_write',false,''); EXCEPTION WHEN insufficient_privilege THEN INSERT INTO _r VALUES('sa_write',true,SQLERRM); END $$;
RESET role; SELECT pg_temp.as_user(:'financeiro');
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"Fin X"}','financeiro tenta',gen_random_uuid());
  INSERT INTO _r VALUES('financeiro_write',false,''); EXCEPTION WHEN insufficient_privilege THEN INSERT INTO _r VALUES('financeiro_write',true,SQLERRM); END $$;
RESET role; SELECT pg_temp.as_user(:'consultor');
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"Cons X"}','consultor tenta',gen_random_uuid());
  INSERT INTO _r VALUES('consultor_write',false,''); EXCEPTION WHEN insufficient_privilege THEN INSERT INTO _r VALUES('consultor_write',true,SQLERRM); END $$;
RESET role;

-- 4. Cross-ref: formulação de produto global apontando para micro privado de AR é rejeitada.
--    (owner cria micro privado AR via núcleo; depois tenta vincular ao Bombarbio global)
SELECT pg_temp.as_user(:'ar_admin');
DO $$ DECLARE m jsonb; p jsonb;
BEGIN
  m := public.tenant_catalog_owned_mutate('microrganismo','create',NULL,NULL,'{"nome":"Micro Proprio RT","tipo":"bacteria"}','micro runtime ar',gen_random_uuid());
  p := public.tenant_catalog_owned_mutate('produto','create',NULL,NULL,'{"nome":"Produto Proprio RT","tipo":"inoculante"}','produto runtime ar',gen_random_uuid());
  PERFORM public.tenant_catalog_owned_mutate('produto','composition',(p->>'id')::uuid,(p->>'updated_at')::timestamptz,
    jsonb_build_object('itens',jsonb_build_array(jsonb_build_object('microrganismo_id',m->>'id','volume_ml',500))),'composição runtime',gen_random_uuid());
  INSERT INTO _r VALUES('composition_own', true, '');
  PERFORM set_config('rt.micro', m->>'id', true);
  -- arquivar preserva histórico (linha existe, ativo=false)
  p := public.tenant_catalog_owned_mutate('produto','archive',(p->>'id')::uuid,
        (SELECT updated_at FROM public.produtos WHERE id=(p->>'id')::uuid),'{}','arquivar runtime ar',gen_random_uuid());
  INSERT INTO _r SELECT 'archived_history', EXISTS (SELECT 1 FROM public.produtos WHERE id=(p->>'id')::uuid AND NOT ativo AND archived_at IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.formulacoes WHERE produto_id=(p->>'id')::uuid), '';
END $$;
RESET role;
DO $$ BEGIN INSERT INTO public.formulacoes(produto_id, microrganismo_id, volume_ml)
  VALUES ('1875527c-a65a-483b-a6c2-9122d5ec2a51', current_setting('rt.micro')::uuid, 1);
  INSERT INTO _r VALUES('crossref',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('crossref',SQLERRM='catalog_cross_owner_reference',SQLERRM); END $$;

-- 5. Global inativo: duplicata orienta solicitar ativação (requer fixture inativo temporário).
DO $$ DECLARE n text; BEGIN
  UPDATE public.culturas SET ativo=false WHERE id=(SELECT id FROM public.culturas WHERE owner_organization_id IS NULL AND ativo ORDER BY nome LIMIT 1)
   RETURNING nome INTO n; PERFORM set_config('rt.inativa', n, true); END $$;
SELECT pg_temp.as_user(:'ar_admin');
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,jsonb_build_object('nome',upper(current_setting('rt.inativa'))),'dup inativa runtime',gen_random_uuid());
  INSERT INTO _r VALUES('dup_global_inactive',false,''); EXCEPTION WHEN unique_violation THEN INSERT INTO _r VALUES('dup_global_inactive',SQLERRM='catalog_owned_duplicate_global_inactive',SQLERRM); END $$;
RESET role;

-- 6. Invariantes intactos.
INSERT INTO _r SELECT 'bombarbio', ativo AND b2b_enabled AND owner_organization_id IS NULL, '' FROM public.produtos WHERE id='1875527c-a65a-483b-a6c2-9122d5ec2a51';
INSERT INTO _r SELECT 'visibilidade_ar', hidden=false AND version=4, '' FROM public.catalog_tenant_visibility
  WHERE organization_id=:'ar_org' AND produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51';
INSERT INTO _r SELECT 'ledger_visibilidade', count(*)>=4, count(*)::text FROM public.catalog_tenant_visibility_ledger
  WHERE produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51';
-- Concorrência real (2 conexões) NÃO é coberta aqui: executar dois psql com a mesma chave/nome e conferir
-- que um vence e o outro recebe replay ou catalog_owned_duplicate_own. Registrar como UNVERIFIED até lá.

SELECT caso, ok, obs FROM _r ORDER BY caso;
SELECT count(*) FILTER (WHERE ok) pass, count(*) FILTER (WHERE NOT ok) fail FROM _r;
ROLLBACK;
