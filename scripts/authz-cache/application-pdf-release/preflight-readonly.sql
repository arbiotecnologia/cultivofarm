-- SELECT-only inventory. Establish exact destination swzpzcwiasxmjutrmvkm
-- independently BEFORE executing. Missing/unproven/Cloud binding => STOP.
-- No business rows, JWTs, credentials or writes. This is not HTTP/login proof.
SELECT c.oid::regclass,c.relowner::regrole,c.relacl,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='public' AND c.relname IN ('aplicacoes','aplicacao_evidencias','aplicacao_evidencias_vinculos','configuracoes_sistema','profiles','user_roles','ordens_servico','ordens_servico_onfarm','clientes'))
 OR (n.nspname='storage' AND c.relname='objects') ORDER BY 1;
SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('aplicacoes','aplicacao_evidencias','aplicacao_evidencias_vinculos') ORDER BY table_name,ordinal_position;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check,
 md5(concat_ws('|',schemaname,tablename,policyname,permissive,roles::text,cmd,qual,with_check)) AS checksum
FROM pg_policies WHERE (schemaname='storage' AND tablename='objects') OR
 (schemaname='public' AND tablename IN ('aplicacoes','aplicacao_evidencias','aplicacao_evidencias_vinculos','configuracoes_sistema','profiles','user_roles'))
ORDER BY schemaname,tablename,policyname;
SELECT n.nspname,p.oid::regprocedure,p.proowner::regrole,p.proacl,p.proconfig,p.prosecdef,p.provolatile,
 md5(pg_get_functiondef(p.oid)),pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','platform_private','storage') AND p.proname IN
 ('storage1_application_allowed','storage1_path_strict','aplicacao_storage_path_permitido','can_user_access_aplicacao','can_user_access_cliente','h15_actor_organization','has_role','operation','allow_any_operation')
ORDER BY n.nspname,p.oid::regprocedure::text;
SELECT t.tgrelid::regclass,t.tgname,t.tgenabled,t.tgfoid::regprocedure,pg_get_triggerdef(t.oid),md5(pg_get_triggerdef(t.oid)),md5(pg_get_functiondef(t.tgfoid))
FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN
 ('public.aplicacoes'::regclass,'public.aplicacao_evidencias'::regclass,'public.aplicacao_evidencias_vinculos'::regclass) ORDER BY 1,2;
SELECT conrelid::regclass,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN
 ('public.aplicacao_evidencias'::regclass,'public.aplicacao_evidencias_vinculos'::regclass) ORDER BY 1,2;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id IN ('aplicacao-evidencias','logos') ORDER BY id;
-- Require actual application organization_id and evidence aplicacao_id/origin columns,
-- protected parent/link policies and private application bucket. Logos are public branding.
-- Independently confirm authenticated Storage download HTTP and the closed deployed
-- enviar-pdf-aplicacao contract. A source/hash inventory alone is NOT a PASS.