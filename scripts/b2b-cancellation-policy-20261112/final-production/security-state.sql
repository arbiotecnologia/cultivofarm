SELECT jsonb_build_object(
 'relations',(SELECT jsonb_object_agg(name,state ORDER BY name) FROM (
  SELECT n.nspname||'.'||c.relname AS name,jsonb_build_object(
   'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
   'acl',(SELECT coalesce(jsonb_agg(x::text ORDER BY x::text),'[]'::jsonb) FROM unnest(c.relacl)x),
   'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
   'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_array(x.conname,pg_get_constraintdef(x.oid),x.convalidated) ORDER BY x.conname),'[]'::jsonb) FROM pg_constraint x WHERE x.conrelid=c.oid),
   'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_array(x.relname,pg_get_indexdef(x.oid),i.indisvalid) ORDER BY x.relname),'[]'::jsonb) FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid WHERE i.indrelid=c.oid),
   'policies',(SELECT coalesce(jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,(SELECT array_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY r) FROM unnest(p.polroles)r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid),
   'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),t.tgenabled,md5(pg_get_functiondef(t.tgfoid))) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
  ) state FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE (n.nspname,c.relname) IN (
   ('public','partner_orders'),('public','partner_accounts'),('public','fiscal_invoices'),('public','fiscal_events'),
   ('public','fiscal_sefaz_transmissions'),('public','accounts_receivable'),('public','accounts_receivable_installments'),
   ('public','receivable_payments'),('public','financial_audit_log'),('public','profiles'),('public','user_roles'),
   ('platform_private','b2b_financial_forecasts'),('platform_private','b2b_financial_forecast_events'),
   ('platform_private','b2b_forecast_lifecycle_gate_v1'),('platform_private','b2b_forecast_lifecycle_allowlist_v1'),
   ('platform_private','b2b_fiscal_invoice_snapshots'),('platform_private','b2b_document_allocations'),
   ('platform_private','b2b_allocation_reversals'),('platform_private','b2b_fiscal_service_permits'),
   ('platform_private','fiscal_close_pending'))
 ) v),
 'order_enum',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid='public.partner_order_status'::regtype),
 'downstream',(SELECT jsonb_build_array(md5(pg_get_functiondef(p.oid)),pg_get_userbyid(p.proowner),(SELECT array_agg(x::text ORDER BY x::text) FROM unnest(p.proacl)x),p.proconfig) FROM pg_proc p WHERE p.oid='platform_private.delivery_no_downstream_20261030()'::regprocedure)
);