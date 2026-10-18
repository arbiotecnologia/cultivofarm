-- SELECT-only. Auditor deve comprovar ref canônico externamente antes de rodar; sem PII.
SELECT p.oid::regprocedure signature,p.proowner::regrole,p.prosecdef,p.provolatile,p.proconfig,p.proacl,
 md5(pg_get_functiondef(p.oid)) digest,pg_get_functiondef(p.oid) definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind='f'
AND (p.prosrc ~ '\m(partner_user_clients|partner_technician_clients)\M'
 OR p.proname IN ('validate_partner_user_client_fn','cliente_storage_object_permitted')) ORDER BY 1;
SELECT c.oid::regclass relation,c.relacl,c.relrowsecurity,c.relforcerowsecurity,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) ddl
FROM pg_class c LEFT JOIN pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal
WHERE c.oid IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass,'public.partner_users'::regclass);
SELECT * FROM pg_policies WHERE tablename IN ('partner_user_clients','partner_technician_clients');
SELECT conrelid::regclass,conname,pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass);
SELECT (SELECT count(*) FROM public.partner_user_clients) puc_total,(SELECT count(*) FROM public.partner_technician_clients) ptc_total;
-- Não inferir origem PUC pela chave compartilhada ou assigned_by.
SELECT count(*) AS active_ptc_without_active_technical_puc FROM public.partner_technician_clients ptc
WHERE ptc.active AND NOT EXISTS(SELECT 1 FROM public.partner_user_clients puc
WHERE puc.partner_id=ptc.partner_id AND puc.user_id=ptc.technician_user_id AND puc.cliente_id=ptc.cliente_id
AND puc.active AND puc.assignment_type='tecnico');
