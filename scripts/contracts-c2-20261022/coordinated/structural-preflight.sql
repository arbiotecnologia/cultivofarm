-- No secrets, rows or identity export. Snapshot structural metadata only.
-- Includes transitive actor tables and invitation/first-access dependencies.
WITH targets AS (SELECT oid FROM pg_class WHERE oid IN (
 'public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,
 'public.partner_users'::regclass,'public.partner_accounts'::regclass,'public.organizations'::regclass,
 'public.clientes'::regclass,'public.fazendas'::regclass,'public.user_access_preferences'::regclass,
 'public.user_context_access_logs'::regclass,'public.partner_audit_logs'::regclass,
 'public.platform_org_admin_invites'::regclass,'platform_private.provisional_password_state'::regclass,
 'platform_private.b2b_provisioning_receipts'::regclass,'cf_user_guards_v1.state'::regclass,'auth.users'::regclass))
SELECT c.oid::regclass AS relation,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
 pg_get_userbyid(c.relowner) AS owner,
 (SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid::regtype::text,a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
 (SELECT jsonb_agg(jsonb_build_array(k.conname,k.contype,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
 (SELECT jsonb_agg(jsonb_build_array(i.indexrelid::regclass::text,pg_get_indexdef(i.indexrelid),i.indisvalid) ORDER BY i.indexrelid::regclass::text) FROM pg_index i WHERE i.indrelid=c.oid) AS indexes,
 (SELECT jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid),md5(pg_get_functiondef(t.tgfoid)),p.proacl,pg_get_userbyid(p.proowner)) ORDER BY t.tgname)
  FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS triggers,
 (SELECT jsonb_agg(jsonb_build_array(pol.polname,pol.polcmd,pol.polroles,pg_get_expr(pol.polqual,pol.polrelid),pg_get_expr(pol.polwithcheck,pol.polrelid)) ORDER BY pol.polname) FROM pg_policy pol WHERE pol.polrelid=c.oid) AS policies
FROM pg_class c JOIN targets t ON t.oid=c.oid ORDER BY c.oid::regclass::text;
-- Auditor must compare the complete rows, including absence/extra triggers,
-- against a fresh captured structural baseline before installation. No bypass.