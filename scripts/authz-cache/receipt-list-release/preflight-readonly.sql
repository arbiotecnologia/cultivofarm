-- SELECT-only. Operator must establish EXACT ref swzpzcwiasxmjutrmvkm
-- before running. This file cannot identify its remote connection: NO-GO
-- on absent/mismatching destination. Never execute through Cloud binding.
-- No business rows/credentials output; compare full inventories independently.
SELECT c.oid::regclass AS relation,c.relowner::regrole,c.relacl,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c WHERE c.oid IN ('public.financial_receipts'::regclass,
 'public.profiles'::regclass,'public.user_roles'::regclass,'storage.objects'::regclass);
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check,
 md5(concat_ws('|',schemaname,tablename,policyname,permissive,roles::text,cmd,qual,with_check)) AS checksum
FROM pg_policies WHERE (schemaname='storage' AND tablename='objects') OR
 (schemaname='public' AND tablename IN ('financial_receipts','profiles','user_roles'))
ORDER BY schemaname,tablename,policyname;
SELECT p.oid::regprocedure AS signature,p.proowner::regrole,p.proacl,p.proconfig,p.prosecdef,
 md5(pg_get_functiondef(p.oid)) AS md5,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('cancel_financial_receipt',
 'financial_storage_object_permitted','h15_actor_organization','is_financial_staff','has_role')
ORDER BY signature::text;
SELECT t.tgrelid::regclass,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid),
 md5(pg_get_triggerdef(t.oid)),t.tgfoid::regprocedure,md5(pg_get_functiondef(t.tgfoid))
FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid='public.financial_receipts'::regclass
ORDER BY t.tgname;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='financial-receipts';
-- Missing contract/bucket, public bucket or unreviewed RLS/ACL/body => NO-GO.
-- This is inventory, not a live-hash assertion nor HTTP/JWT proof.
-- Deployed generate-financial-receipt must independently match its local
-- reviewed source: actor bearer/h15/tenant receipt, canonical path response.