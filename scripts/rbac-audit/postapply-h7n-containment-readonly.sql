-- SOMENTE LEITURA APÓS APLICAÇÃO PELO REVISOR. NÃO executado pelo agente.
-- Executar psql com variáveis ar_actor/fsf_actor/sa_actor/inactive_actor/revoked_actor
-- UUIDs de contas existentes validadas pelo revisor, sem criar/alterar Auth/vínculos.
-- FSF relatado: cbdc4ef3-005a-4674-8ea3-4410c7d7d212. Não inferir os demais IDs.
BEGIN;
DO $meta$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261015173622' AND md5(array_to_string(statements,E'\n;\n'))='23baa516fcc2f9b7e7f1a985be25eeb3') THEN RAISE EXCEPTION 'CONTAINMENT_LEDGER_DRIFT'; END IF;
 IF has_function_privilege('authenticated','private.h7n_esteira_laboratorio()','EXECUTE') OR has_function_privilege('anon','private.h7n_esteira_laboratorio()','EXECUTE') OR has_table_privilege('authenticated','public.vw_esteira_laboratorio','SELECT') OR has_table_privilege('anon','public.vw_esteira_laboratorio','SELECT') OR has_table_privilege('authenticated','public.mv_esteira_laboratorio','SELECT') THEN RAISE EXCEPTION 'CONTAINMENT_LOST'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='private.h7n_esteira_laboratorio()'::regprocedure) IS DISTINCT FROM '6dc6de9ce046847310973b5666249177' THEN RAISE EXCEPTION 'AFTER_BODY_DRIFT'; END IF;
 IF has_function_privilege('authenticated','public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'RPC_MUST_STAY_CLOSED'; END IF;
 IF md5(pg_get_functiondef('public.rpc_converter_visita_em_os(uuid,text)'::regprocedure)) IS DISTINCT FROM 'b112888e28d8a5727df713e0ae7bcd1b' THEN RAISE EXCEPTION 'CONVERTER_DRIFT'; END IF;
END $meta$;
-- Somente claims explícitas com iat/exp; não imprime claims/UUIDs/linhas.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub', :'fsf_actor', 'role','authenticated','iat',extract(epoch from now())::bigint,'exp',extract(epoch from now())::bigint+3600)::text,true) IS NOT NULL AS claims_installed;
SET LOCAL ROLE authenticated;
DO $probe$
DECLARE n bigint;
BEGIN
 BEGIN
  SELECT count(*) INTO n FROM public.vw_esteira_laboratorio;
  RAISE EXCEPTION 'FSF_EXPECTED_42501_CONTAINMENT_LOST';
 EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'FSF ACL contained; tenant fence NOT exercised, no regrant permitted';
 END;
END $probe$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub', :'ar_actor','role','authenticated','iat',extract(epoch from now())::bigint,'exp',extract(epoch from now())::bigint+3600)::text,true) IS NOT NULL AS claims_installed;
SET LOCAL ROLE authenticated;
DO $ar$
DECLARE n bigint;
BEGIN
 BEGIN
  SELECT count(*) INTO n FROM private.h7n_esteira_laboratorio() m
  WHERE m.cliente_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=m.cliente_id AND c.organization_id=platform_private.h15_actor_organization());
  RAISE EXCEPTION 'AR_EXPECTED_42501_CONTAINMENT_LOST';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'AR ACL contained; positive control UNVERIFIED'; END;
END $ar$;
RESET ROLE;
-- Casos negativos: contas SEM papéis administrativos para revoked_actor;
-- SA exclusivo sem papel tenant; inactive_actor deve estar realmente inativo (não alterar).
SELECT set_config('test.negative_ids',jsonb_build_array(:'sa_actor', :'inactive_actor', :'revoked_actor')::text,true) IS NOT NULL AS cases_installed;
SET LOCAL ROLE authenticated;
DO $negative$
DECLARE actor text; n bigint;
BEGIN
 FOR actor IN SELECT jsonb_array_elements_text(current_setting('test.negative_ids')::jsonb) LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','iat',extract(epoch from now())::bigint,'exp',extract(epoch from now())::bigint+3600)::text,true);
  BEGIN SELECT count(*) INTO n FROM public.vw_esteira_laboratorio; RAISE EXCEPTION 'NEGATIVE_EXPECTED_42501';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'Negative actor ACL denied; fence UNVERIFIED'; END;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN SELECT count(*) INTO n FROM public.vw_esteira_laboratorio; RAISE EXCEPTION 'NULL_EXPECTED_42501';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'NULL actor ACL denied'; END;
END $negative$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
 BEGIN PERFORM count(*) FROM public.vw_esteira_laboratorio; RAISE EXCEPTION 'ANON_NOT_ACL_DENIED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'anon denied'; END;
END $anon$;
ROLLBACK;
-- ACL bloqueada é contenção, NÃO PASS de filtro tenant. Não usar service_role para simular usuário.
