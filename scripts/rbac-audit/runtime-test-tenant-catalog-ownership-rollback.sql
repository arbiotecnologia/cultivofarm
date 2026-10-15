\set ON_ERROR_STOP on
-- PROVA EXECUTÁVEL do rollback operacional. Executar somente após os candidatos revisados, via psql.
-- Requer duas identidades reais de empresas distintas; cria fixtures apenas dentro desta transação.
-- Exemplo: psql -v ar_admin=... -v fsf_admin=... -f este.sql
BEGIN;
CREATE TEMP TABLE _rollback_result(caso text PRIMARY KEY, ok boolean NOT NULL, obs text);
CREATE TEMP TABLE _rollback_ctx(k text PRIMARY KEY, v text);
GRANT SELECT, INSERT, UPDATE ON _rollback_result, _rollback_ctx TO authenticated;

CREATE FUNCTION pg_temp.rollback_as_user(u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', jsonb_build_object('sub',u::text,'role','authenticated',
    'iat',extract(epoch FROM now())::bigint-5,'exp',extract(epoch FROM now()+interval '5 min')::bigint)::text,true),
    set_config('role','authenticated',true) $$;
CREATE FUNCTION pg_temp.rollback_as_owner() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('role',current_user,true),set_config('request.jwt.claims','',true) $$;
GRANT EXECUTE ON FUNCTION pg_temp.rollback_as_user(uuid),pg_temp.rollback_as_owner() TO authenticated;

UPDATE platform_private.catalog_ownership_gate SET enabled=true, readers_certified_at=now() WHERE singleton;
SELECT pg_temp.rollback_as_user(:'ar_admin');
DO $$ DECLARE p jsonb;
BEGIN
  p:=public.tenant_catalog_owned_mutate('produto','create',NULL,NULL,
    '{"nome":"Rollback privado isolado","tipo":"fungicida","familia_catalogo":"quimico","classe_catalogo":"fungicida"}',
    'fixture rollback privado',gen_random_uuid());
  p:=public.tenant_catalog_owned_mutate('produto','composition',(p->>'id')::uuid,(p->>'updated_at')::timestamptz,
    '{"status":"completo","itens":[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"Componente privado","quantidade":1,"unidade":"g/L","base":"por_volume_produto","natureza":"concentracao_declarada"}]}',
    'fixture declaração privada',gen_random_uuid());
  INSERT INTO _rollback_ctx VALUES('produto',p->>'id');
END $$;

SELECT pg_temp.rollback_as_owner();
\ir rollback-tenant-catalog-ownership.sql

-- O rollback deve ter fechado escrita, preservado guards/policies e mantido leitura própria.
SELECT pg_temp.rollback_as_user(:'ar_admin');
INSERT INTO _rollback_result
SELECT 'owner_le_produto_e_declaracao',
  EXISTS(SELECT 1 FROM public.produtos WHERE id=(SELECT v::uuid FROM _rollback_ctx WHERE k='produto'))
  AND EXISTS(SELECT 1 FROM public.produto_composicao_declaracoes WHERE produto_id=(SELECT v::uuid FROM _rollback_ctx WHERE k='produto')),
  'empresa dona após rollback';
DO $$ BEGIN
  PERFORM public.tenant_catalog_owned_mutate('cultura','create',NULL,NULL,'{"nome":"não pode"}',
    'gate fechado após rollback',gen_random_uuid());
  INSERT INTO _rollback_result VALUES('mutacao_revogada',false,'aceitou');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO _rollback_result VALUES('mutacao_revogada',true,SQLSTATE);
END $$;

SELECT pg_temp.rollback_as_owner(); SELECT pg_temp.rollback_as_user(:'fsf_admin');
INSERT INTO _rollback_result
SELECT 'outra_empresa_nao_le_produto',
  NOT EXISTS(SELECT 1 FROM public.produtos WHERE id=(SELECT v::uuid FROM _rollback_ctx WHERE k='produto')),
  'produto privado AR';
INSERT INTO _rollback_result
SELECT 'outra_empresa_nao_le_declaracao',
  NOT EXISTS(SELECT 1 FROM public.produto_composicao_declaracoes WHERE produto_id=(SELECT v::uuid FROM _rollback_ctx WHERE k='produto')),
  'declaração privada AR';

SELECT pg_temp.rollback_as_owner();
INSERT INTO _rollback_result
SELECT 'protecoes_preservadas',
  EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='produto_composicao_conjuntos' AND policyname='catalog_composition_parent_scope')
  AND EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='produto_composicao_declaracoes' AND policyname='catalog_composition_declaration_parent_scope')
  AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_catalog_owner_micro_product' AND NOT tgisinternal)
  AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_catalog_composition_owner_guard' AND NOT tgisinternal),
  'policies e guards após rollback';
INSERT INTO _rollback_result
SELECT 'gate_off', NOT platform_private.catalog_ownership_enabled(), 'estado final';

SELECT caso,ok,obs FROM _rollback_result ORDER BY caso;
SELECT count(*) FILTER(WHERE ok) AS pass,count(*) FILTER(WHERE NOT ok) AS fail FROM _rollback_result;
ROLLBACK;