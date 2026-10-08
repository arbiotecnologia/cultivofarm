-- Authorized canonical target swzpzcwiasxmjutrmvkm only. NOT JWT/browser proof.
-- Never run against an unknown binding. No writes, fixtures, Auth, or exports.
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE r record; u text; args text; total int:=0; mode int;
BEGIN
 FOREACH u IN ARRAY ARRAY['a7d45277-6dec-413d-bf6b-86620c1ef39f','cbdc4ef3-005a-4674-8ea3-4410c7d7d212'] LOOP
 FOR mode IN 1..3 LOOP
 PERFORM set_config('request.jwt.claims',CASE mode WHEN 1 THEN jsonb_build_object('sub',u,'role','authenticated','iat',extract(epoch FROM now())::bigint,'organization_id','00000000-0000-0000-0000-000000000000')::text WHEN 2 THEN jsonb_build_object('sub',u,'role','authenticated')::text ELSE jsonb_build_object('sub',u,'role','authenticated','iat',1)::text END,true);
 FOR r IN SELECT p.oid,p.proname,p.proargtypes FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'rpc_executivo_%' AND p.proname NOT IN ('rpc_executivo_resumo_geral','rpc_executivo_gargalos','rpc_executivo_timeline_operacional') LOOP
 SELECT string_agg(CASE t::regtype::text WHEN 'uuid' THEN '''00000000-0000-0000-0000-000000000001''::uuid' WHEN 'jsonb' THEN '''{"tenant_id":"00000000-0000-0000-0000-000000000002","cliente_id":"00000000-0000-0000-0000-000000000001"}''::jsonb' WHEN 'integer' THEN '2147483647::integer' ELSE '''completo''::text' END,',' ORDER BY ord) INTO args FROM unnest(r.proargtypes::oid[]) WITH ORDINALITY a(t,ord);
 BEGIN EXECUTE format('SELECT public.%I(%s)',r.proname,args); RAISE EXCEPTION 'EXECUTIVO_BLOCK_FAILED'; EXCEPTION WHEN insufficient_privilege THEN total:=total+1; END;
 END LOOP;
 END LOOP;
 END LOOP;
 IF total<>96 THEN RAISE EXCEPTION 'EXECUTIVO_NEGATIVE_COUNT:%',total; END IF;
END $test$;
SELECT 'PASS 96 ACL negatives; A/B simulated claims; no body writes executed' result;
ROLLBACK;
