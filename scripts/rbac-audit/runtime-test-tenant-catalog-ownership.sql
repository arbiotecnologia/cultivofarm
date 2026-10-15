-- RUNTIME (rollback) dos candidatos 01+02 — executar SOMENTE após aplicação revisada, como owner, via psql.
-- Tudo dentro de UMA transação que termina em ROLLBACK: o gate é aberto só aqui dentro e volta a OFF.
-- Atores reais por variáveis (UUIDs; nunca imprimir e-mail/token):
--   psql -v ar_admin=... -v fsf_admin=... -v sa=... -v financeiro=... -v consultor=... -v ar_org=... -f este.sql
-- Relatório final: tabela caso/ok/obs + contagem. Concorrência de 2 conexões NÃO coberta (ver final).
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE _r(caso text PRIMARY KEY, ok boolean NOT NULL, obs text);
CREATE TEMP TABLE _ctx(k text PRIMARY KEY, v text);
GRANT SELECT, INSERT, UPDATE ON _r, _ctx TO authenticated, anon;
INSERT INTO _ctx VALUES ('ar_org', :'ar_org');
-- Claims completas (sub/role/exp/iat), exigidas por catalog_tenant_actor.
CREATE FUNCTION pg_temp.as_user(u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', jsonb_build_object('sub',u::text,'role','authenticated',
    'iat', extract(epoch FROM now())::bigint - 5, 'exp', extract(epoch FROM now()+interval '5 min')::bigint)::text, true),
         set_config('role','authenticated',true) $$;
CREATE FUNCTION pg_temp.as_owner() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('role', current_user, true), set_config('request.jwt.claims','',true) $$;
GRANT EXECUTE ON FUNCTION pg_temp.as_user(uuid), pg_temp.as_owner() TO authenticated, anon;
CREATE FUNCTION pg_temp.ctx(k text) RETURNS text LANGUAGE sql AS $$ SELECT v FROM _ctx WHERE _ctx.k=$1 $$;
GRANT EXECUTE ON FUNCTION pg_temp.ctx(text) TO authenticated, anon;

-- 0. Gate OFF: CRUD rejeitado mesmo para Admin AR.
SELECT pg_temp.as_user(:'ar_admin');
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('produto','create',NULL,NULL,'{"nome":"Teste Gate","tipo":"fungicida"}','motivo de teste gate',gen_random_uuid());
  INSERT INTO _r VALUES('gate_off',false,'aceitou'); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('gate_off',SQLERRM='catalog_ownership_disabled',SQLERRM); END $$;
RESET role;
UPDATE platform_private.catalog_ownership_gate SET enabled=true, readers_certified_at=now();  -- só nesta transação

-- 1. anon
SET LOCAL role anon;
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"x"}','motivo anon teste',gen_random_uuid());
  INSERT INTO _r VALUES('anon_exec',false,''); EXCEPTION WHEN insufficient_privilege THEN INSERT INTO _r VALUES('anon_exec',true,''); END $$;
RESET role;

-- 2. AR: create/replay/conflito/forge/whitelist/NULL/duplicatas/CAS/no-op/arquivado/restore
SELECT pg_temp.as_user(:'ar_admin');
DO $$ DECLARE r1 jsonb; r2 jsonb; k uuid := gen_random_uuid(); c text;
BEGIN
  r1 := public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"Cultura Própria RT"}','criação runtime ar',k);
  INSERT INTO _ctx VALUES('cultura', r1->>'id');
  r2 := public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"Cultura Própria RT"}','criação runtime ar',k);
  INSERT INTO _r VALUES('replay', r2->>'id'=r1->>'id' AND (r2->>'replayed')::boolean, '');
  INSERT INTO _r SELECT 'ar_le_propria', EXISTS (SELECT 1 FROM public.culturas WHERE id=(r1->>'id')::uuid), 'achado 1';
  FOREACH c IN ARRAY ARRAY[
    'key_conflict|cultura|create|{"nome":"Outra"}|catalog_owned_idempotency_conflict|same',
    'forge_owner|cultura|create|{"nome":"F","owner_organization_id":"00000000-0000-0000-0000-000000000000"}|catalog_owned_invalid_payload|new',
    'unknown_key|cultura|create|{"nome":"F2","cor":"azul"}|catalog_owned_invalid_payload|new',
    'tipo_number|produto|create|{"nome":"F3","tipo":1}|catalog_owned_invalid_payload|new',
    'tipo_null|produto|create|{"nome":"F4","tipo":null}|catalog_owned_invalid_payload|new',
    'tipo_invalido|produto|create|{"nome":"F5","tipo":"semente"}|catalog_owned_invalid_payload|new',
    'familia_incoerente|produto|create|{"nome":"F6","tipo":"fungicida","familia_catalogo":"quimico","classe_catalogo":"inoculante"}|catalog_owned_invalid_payload|new',
    'nome_vazio|cultura|create|{"nome":"   "}|catalog_owned_invalid_payload|new',
    'dup_own_norm|cultura|create|{"nome":"  cultura   PROPRIA rt "}|catalog_owned_duplicate_own|new',
    'dup_own_combinado|cultura|create|{"nome":"Cultura Propri\u0061\u0301 RT"}|catalog_owned_duplicate_own|new',
    'dup_global_active|produto|create|{"nome":"BOMBARBIO","tipo":"fungicida"}|catalog_owned_duplicate_global_active|new'] LOOP
    BEGIN
      PERFORM public.tenant_catalog_owned_mutate(split_part(c,'|',2),split_part(c,'|',3),NULL,NULL,split_part(c,'|',4)::jsonb,
        'motivo runtime caso', CASE split_part(c,'|',6) WHEN 'same' THEN k ELSE gen_random_uuid() END);
      INSERT INTO _r VALUES(split_part(c,'|',1),false,'aceitou');
    EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES(split_part(c,'|',1), SQLERRM=split_part(c,'|',5), SQLERRM); END;
  END LOOP;
  BEGIN PERFORM public.tenant_catalog_owned_mutate(NULL,'create',NULL,NULL,'{"nome":"N"}','motivo runtime null',gen_random_uuid());
    INSERT INTO _r VALUES('entity_null',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('entity_null',SQLERRM='catalog_owned_invalid_payload',SQLERRM); END;
  BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura',NULL,NULL,NULL,'{"nome":"N"}','motivo runtime null',gen_random_uuid());
    INSERT INTO _r VALUES('operation_null',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('operation_null',SQLERRM='catalog_owned_invalid_payload',SQLERRM); END;
  BEGIN PERFORM public.tenant_catalog_owned_mutate('produto','archive','1875527c-a65a-483b-a6c2-9122d5ec2a51',now(),'{}','arquivar global runtime',gen_random_uuid());
    INSERT INTO _r VALUES('global_write',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('global_write',SQLERRM='catalog_owned_not_found',SQLERRM); END;
  BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','update',(r1->>'id')::uuid,'2000-01-01','{"descricao":"x"}','cas runtime ar ok',gen_random_uuid());
    INSERT INTO _r VALUES('cas_stale',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('cas_stale',SQLSTATE='40001',SQLERRM); END;
  BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','update',(r1->>'id')::uuid,(r1->>'updated_at')::timestamptz,'{"nome":"Cultura Própria RT"}','noop runtime ar',gen_random_uuid());
    INSERT INTO _r VALUES('noop',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('noop',SQLERRM='catalog_owned_noop',SQLERRM); END;
  r2 := public.tenant_catalog_owned_mutate('cultura','archive',(r1->>'id')::uuid,(r1->>'updated_at')::timestamptz,'{}','arquivar runtime ar',gen_random_uuid());
  BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','update',(r1->>'id')::uuid,(r2->>'updated_at')::timestamptz,'{"descricao":"y"}','editar arquivado',gen_random_uuid());
    INSERT INTO _r VALUES('archived_edit',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('archived_edit',SQLERRM='catalog_owned_archived',SQLERRM); END;
  r2 := public.tenant_catalog_owned_mutate('cultura','restore',(r1->>'id')::uuid,(r2->>'updated_at')::timestamptz,'{}','restaurar runtime ar',gen_random_uuid());
  INSERT INTO _r SELECT 'restore', EXISTS (SELECT 1 FROM public.culturas WHERE id=(r1->>'id')::uuid AND ativo AND archived_at IS NULL), '';
END $$;
-- DML direto/ownership change como authenticated
DO $$ BEGIN UPDATE public.culturas SET owner_organization_id=NULL WHERE id=pg_temp.ctx('cultura')::uuid;
  INSERT INTO _r VALUES('owner_change_direct', false, 'UPDATE aceito sem erro');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO _r VALUES('owner_change_direct', SQLSTATE='42501', SQLERRM);
  WHEN OTHERS THEN INSERT INTO _r VALUES('owner_change_direct', false, 'erro inesperado: '||SQLSTATE||' '||SQLERRM); END $$;
SELECT pg_temp.as_owner();
DO $$ BEGIN UPDATE public.culturas SET owner_organization_id=NULL WHERE id=pg_temp.ctx('cultura')::uuid;
  INSERT INTO _r VALUES('owner_change_owner',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('owner_change_owner',SQLERRM='catalog_owner_immutable',SQLERRM); END $$;
DO $$ BEGIN DELETE FROM public.culturas WHERE id=pg_temp.ctx('cultura')::uuid;
  INSERT INTO _r VALUES('physical_delete_owner',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('physical_delete_owner',SQLERRM='catalog_owned_physical_delete_forbidden',SQLERRM); END $$;
-- service_role/owner sem auth.uid tentando criar privado direto (forge sem GUC)
DO $$ BEGIN INSERT INTO public.culturas(nome, ativo, owner_organization_id) VALUES ('Forge Owner', true, pg_temp.ctx('ar_org')::uuid);
  INSERT INTO _r VALUES('forge_insert_owner',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('forge_insert_owner',SQLSTATE='42501',SQLERRM); END $$;

-- 3. FSF / SA / Financeiro / Consultor
SELECT pg_temp.as_user(:'fsf_admin');
INSERT INTO _r SELECT 'fsf_nao_ve', NOT EXISTS (SELECT 1 FROM public.culturas WHERE id=pg_temp.ctx('cultura')::uuid), '';
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','archive',pg_temp.ctx('cultura')::uuid,now(),'{}','fsf tenta arquivar',gen_random_uuid());
  INSERT INTO _r VALUES('fsf_write',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('fsf_write',SQLERRM='catalog_owned_not_found',SQLERRM); END $$;
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"Cultura Própria RT"}','fsf mesmo nome que AR',gen_random_uuid());
  INSERT INTO _r SELECT 'fsf_mesmo_nome_permitido', count(*)=2, 'AR e FSF com mesmo nome normalizado' FROM public.culturas
    WHERE owner_organization_id IS NOT NULL AND platform_private.catalog_norm_name(nome)='cultura propria rt';
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('fsf_mesmo_nome_permitido',false,SQLERRM); END $$;
SELECT pg_temp.as_owner(); SELECT pg_temp.as_user(:'sa');
INSERT INTO _r SELECT 'sa_nao_ve', NOT EXISTS (SELECT 1 FROM public.culturas WHERE id=pg_temp.ctx('cultura')::uuid), '';
DO $$ BEGIN PERFORM platform_private.read_global_culture_detail_core(pg_temp.ctx('cultura')::uuid);
  INSERT INTO _r VALUES('sa_core_privado',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('sa_core_privado',SQLERRM='catalog_entity_unavailable',SQLERRM); END $$;
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"SA X"}','sa tenta criar',gen_random_uuid());
  INSERT INTO _r VALUES('sa_write',false,''); EXCEPTION WHEN insufficient_privilege THEN INSERT INTO _r VALUES('sa_write',true,SQLERRM); END $$;
SELECT pg_temp.as_owner(); SELECT pg_temp.as_user(:'financeiro');
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"Fin X"}','financeiro tenta',gen_random_uuid());
  INSERT INTO _r VALUES('financeiro_write',false,''); EXCEPTION WHEN insufficient_privilege THEN INSERT INTO _r VALUES('financeiro_write',true,SQLERRM); END $$;
SELECT pg_temp.as_owner(); SELECT pg_temp.as_user(:'consultor');
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"Cons X"}','consultor tenta',gen_random_uuid());
  INSERT INTO _r VALUES('consultor_write',false,''); EXCEPTION WHEN insufficient_privilege THEN INSERT INTO _r VALUES('consultor_write',true,SQLERRM); END $$;
SELECT pg_temp.as_owner();

-- 4. Composição própria + crossref + arquivado preserva histórico
SELECT pg_temp.as_user(:'ar_admin');
DO $$ DECLARE m jsonb; p jsonb;
BEGIN
  m := public.tenant_catalog_owned_mutate('microrganismo','create',NULL,NULL,'{"nome":"Micro Proprio RT","tipo":"bacteria"}','micro runtime ar',gen_random_uuid());
  p := public.tenant_catalog_owned_mutate('produto','create',NULL,NULL,'{"nome":"Produto Proprio RT","tipo":"inoculante","familia_catalogo":"biologico","classe_catalogo":"inoculante"}','produto runtime ar',gen_random_uuid());
  BEGIN PERFORM public.tenant_catalog_owned_mutate('produto','composition',(p->>'id')::uuid,(p->>'updated_at')::timestamptz,'{}','composição ausente',gen_random_uuid());
    INSERT INTO _r VALUES('composition_missing',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('composition_missing',SQLERRM='catalog_owned_invalid_payload',SQLERRM); END;
  p := public.tenant_catalog_owned_mutate('produto','composition',(p->>'id')::uuid,(p->>'updated_at')::timestamptz,
    jsonb_build_object('itens',jsonb_build_array(jsonb_build_object('microrganismo_id',m->>'id','volume_ml',500))),'composição runtime',gen_random_uuid());
  INSERT INTO _r VALUES('composition_own', true, '');
  INSERT INTO _ctx VALUES('micro', m->>'id'), ('produto', p->>'id');
  p := public.tenant_catalog_owned_mutate('produto','archive',(p->>'id')::uuid,(p->>'updated_at')::timestamptz,'{}','arquivar runtime ar',gen_random_uuid());
  INSERT INTO _r SELECT 'archived_history', EXISTS (SELECT 1 FROM public.produtos WHERE id=(p->>'id')::uuid AND NOT ativo AND archived_at IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.formulacoes WHERE produto_id=(p->>'id')::uuid), '';
END $$;
SELECT pg_temp.as_owner();
DO $$ BEGIN INSERT INTO public.formulacoes(produto_id, microrganismo_id, volume_ml)
  VALUES ('1875527c-a65a-483b-a6c2-9122d5ec2a51', pg_temp.ctx('micro')::uuid, 1);
  INSERT INTO _r VALUES('crossref',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('crossref',SQLERRM='catalog_cross_owner_reference',SQLERRM); END $$;
DO $$ BEGIN UPDATE public.formulacoes SET produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51' WHERE produto_id=pg_temp.ctx('produto')::uuid;
  INSERT INTO _r VALUES('parent_change',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('parent_change',SQLERRM IN ('catalog_parent_immutable','catalog_owner_forged','catalog_ownership_disabled'),SQLERRM); END $$;
DO $$ BEGIN INSERT INTO public.catalog_tenant_visibility(organization_id, entity_type, produto_id, hidden, version, reason, updated_by)
  VALUES (pg_temp.ctx('ar_org')::uuid,'produto',pg_temp.ctx('produto')::uuid,true,1,'ocultar privado',gen_random_uuid());
  INSERT INTO _r VALUES('visibility_private_rejected',false,''); EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('visibility_private_rejected',SQLERRM='catalog_visibility_item_not_found',SQLERRM); END $$;

-- 5. Global inativo (fixture temporária dentro da transação)
DO $$ DECLARE n text; BEGIN
  UPDATE public.culturas SET ativo=false WHERE id=(SELECT id FROM public.culturas WHERE owner_organization_id IS NULL AND ativo ORDER BY nome LIMIT 1)
   RETURNING nome INTO n; INSERT INTO _ctx VALUES('inativa', n); END $$;
SELECT pg_temp.as_user(:'ar_admin');
DO $$ BEGIN PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,jsonb_build_object('nome',upper(pg_temp.ctx('inativa'))),'dup inativa runtime',gen_random_uuid());
  INSERT INTO _r VALUES('dup_global_inactive',false,''); EXCEPTION WHEN unique_violation THEN INSERT INTO _r VALUES('dup_global_inactive',SQLERRM='catalog_owned_duplicate_global_inactive',SQLERRM); END $$;
SELECT pg_temp.as_owner();

SELECT pg_temp.as_user(:'fsf_admin');
INSERT INTO _r SELECT 'fsf_preco_privado_null', public.fn_catalogo_preco_canonico(pg_temp.ctx('produto')::uuid, NULL, 'litro') IS NULL
  AND NOT platform_private.catalog_item_in_reader_scope(pg_temp.ctx('produto')::uuid, NULL), 'escopo de preço' WHERE pg_temp.ctx('produto') IS NOT NULL;
SELECT pg_temp.as_owner();

-- 5b. Normalização: expressão EXATA do DDL
INSERT INTO _r SELECT 'norm_'||k, platform_private.catalog_norm_name(x)=y, x FROM (VALUES
  ('acucar','Açúcar','acucar'),('unico','Único','unico'),('combinado',E'U\u0301nico','unico'),
  ('maiusc','ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ','aaaaaaeeeeiiiiooooouuuucny'),
  ('minusc','áàâãäåéèêëíìîïóòôõöúùûüçñýÿ','aaaaaaeeeeiiiiooooouuuucnyy')) t(k,x,y);
-- 5c. Proporção: limites (composição própria com 101/-1/0 rejeitada; 100 aceita)
SELECT pg_temp.as_user(:'ar_admin');
DO $$ DECLARE p jsonb; v numeric;
BEGIN
  p := public.tenant_catalog_owned_mutate('produto','create',NULL,NULL,'{"nome":"Produto Prop RT","tipo":"inoculante"}','produto proporcao rt',gen_random_uuid());
  FOREACH v IN ARRAY ARRAY[101,-1,0]::numeric[] LOOP
    BEGIN
      PERFORM public.tenant_catalog_owned_mutate('produto','composition',(p->>'id')::uuid,(p->>'updated_at')::timestamptz,
        jsonb_build_object('itens',jsonb_build_array(jsonb_build_object('microrganismo_id',pg_temp.ctx('micro'),'volume_ml',10,'proporcao',v))),'proporcao rt invalida',gen_random_uuid());
      INSERT INTO _r VALUES('proporcao_'||v,false,'aceitou');
    EXCEPTION WHEN invalid_parameter_value THEN INSERT INTO _r VALUES('proporcao_'||v, SQLERRM='catalog_owned_invalid_payload', SQLERRM); END;
  END LOOP;
  p := public.tenant_catalog_owned_mutate('produto','composition',(p->>'id')::uuid,(p->>'updated_at')::timestamptz,
    jsonb_build_object('itens',jsonb_build_array(jsonb_build_object('microrganismo_id',pg_temp.ctx('micro'),'volume_ml',10,'proporcao',100))),'proporcao rt valida',gen_random_uuid());
  INSERT INTO _r VALUES('proporcao_100', p->>'id' IS NOT NULL, '');
END $$;
SELECT pg_temp.as_owner();
-- 5d. UPDATE de linhas GLOBAIS existentes nas duas tabelas descendentes (produção atual) continua funcionando
DO $$ BEGIN
  UPDATE public.formulacoes SET volume_ml=volume_ml WHERE produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51';
  UPDATE public.catalogo_volumes SET ordem=ordem WHERE produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51';
  INSERT INTO _r VALUES('global_child_update', true, '');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('global_child_update', false, SQLSTATE||' '||SQLERRM); END $$;

-- 6. Invariantes
INSERT INTO _r SELECT 'bombarbio', ativo AND b2b_enabled AND owner_organization_id IS NULL, '' FROM public.produtos WHERE id='1875527c-a65a-483b-a6c2-9122d5ec2a51';
INSERT INTO _r SELECT 'bombarbio_1000_180', EXISTS (SELECT 1 FROM public.catalogo_volumes WHERE produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51' AND volume_ml=1000 AND preco_brl=180), '';
INSERT INTO _r SELECT 'visibilidade_ar_v4', EXISTS (SELECT 1 FROM public.catalog_tenant_visibility
  WHERE organization_id=pg_temp.ctx('ar_org')::uuid AND produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51' AND hidden=false AND version=4), '';
INSERT INTO _r SELECT 'ledger_visibilidade_4', count(*)=4, count(*)::text FROM public.catalog_tenant_visibility_ledger
  WHERE entity_type='produto' AND entity_id='1875527c-a65a-483b-a6c2-9122d5ec2a51';
-- Concorrência real (2 conexões): fora deste script; registrar UNVERIFIED até execução separada.

SELECT caso, ok, obs FROM _r ORDER BY caso;
SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail FROM _r;
ROLLBACK;
