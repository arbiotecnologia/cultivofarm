-- Read-only. Ref canônico swzpzcwiasxmjutrmvkm comprovado fora do SQL, não pelo nome postgres.
-- Captura de drift antes de qualquer candidato de principal; hashes live de 16/10/2026.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       md5(pg_get_functiondef(p.oid)) AS def_md5, p.prosecdef, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
  ('sync_user_cliente_principal','enforce_cliente_id_for_produtor',
   'get_cliente_ids_for_user','get_cliente_id_for_user','has_active_user_cliente_access')
ORDER BY p.proname;
-- Esperado live:
-- sync_user_cliente_principal      50392a57c5908c67c709c4e84f0e932e  definer, ACL {postgres,service_role}
-- enforce_cliente_id_for_produtor  ecad56badcb2120f7048fad7519f76f4  definer, ACL {postgres,service_role}
-- get_cliente_ids_for_user         c80d5900692d960f649d0a9f7850fe2c  definer, +authenticated
-- get_cliente_id_for_user          c841d35d2c1381d98f7fbd512c2b3e51  definer, +authenticated
-- has_active_user_cliente_access   e099f51d128620e5a68cc3e9001dd976  definer, +authenticated (V0 instalado)
SELECT c.relname, t.tgname, t.tgtype, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE NOT t.tgisinternal AND c.oid IN
  ('public.user_clientes'::regclass,'public.profiles'::regclass,'public.user_roles'::regclass)
ORDER BY c.relname, t.tgname;
SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
WHERE conrelid IN ('public.user_clientes'::regclass,'public.profiles'::regclass)
ORDER BY conrelid::regclass::text, conname;
SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS def_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='cf_user_guards_v1' AND p.proname IN
  ('acquire_gate','require_admin','touch_related_profiles','advance_stamp')
ORDER BY p.proname;
SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS def_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
  ('guard_profile_sensitive_fields','guard_profile_tenant_fields','h15_profile_organization_guard')
ORDER BY p.proname;
