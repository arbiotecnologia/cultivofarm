-- READ ONLY. Canonical ref must be independently attested: swzpzcwiasxmjutrmvkm.
BEGIN TRANSACTION READ ONLY;
WITH f(sig,oid,h,acl,cfg,owner) AS (VALUES
 ('public.enforce_cliente_id_for_produtor()','41622','ecad56badcb2120f7048fad7519f76f4','{postgres=X/postgres,service_role=X/postgres}','search_path=public','postgres'),
 ('public.fn_financial_audit()','41686','46f777c2020ff9a059a80ae6dab4bd12','{postgres=X/postgres,service_role=X/postgres}','search_path=public','postgres'),
 ('public.fn_h6_guard_ar_installment_snapshot()','41736','c3f26bc5217a5d86227c7e74f762b3ad','{postgres=X/postgres,service_role=X/postgres}','search_path=public','postgres'),
 ('public.fn_h6_guard_title_snapshot()','41737','d9cc5c95f837de9d77cec2159e24bbf9','{postgres=X/postgres,service_role=X/postgres}','search_path=public','postgres'),
 ('public.fn_h6d_block_hard_delete()','41744','5c07dd23a0c9355c3fe11811004b0381','{postgres=X/postgres,service_role=X/postgres}','search_path=public','postgres'),
 ('public.tg_recalc_risk_on_ar_change()','42131','2d38119a0bb885471ba0112c300a4144','{postgres=X/postgres,service_role=X/postgres}','search_path=public','postgres'),
 ('public.guard_profile_sensitive_fields()','61233','1c2ad8d0ef38ea66866f8b85d3acb109','{postgres=X/postgres,service_role=X/postgres}','search_path=""','postgres'),
 ('public.tg_sync_b2b_financial_status()','42136','e636fcf74c5e1c7c8037d5a17f525c27','{postgres=X/postgres,service_role=X/postgres}','search_path=public','postgres'),
 ('public.has_role(uuid,app_role)','95587','4d90e93d521a4819d9085f28d742030f','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}','search_path=""','postgres'),
 ('platform_private.has_role(uuid,app_role)','37054','c5af5b55de6d79da9b73a33948746ae2','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}','search_path=""','postgres'),
 ('public.fn_entrega_confirmar_engine_v1(uuid,uuid,text,jsonb,jsonb)','41671','6eb78ceebe90196ac5b95bfc127dd63b','{postgres=X/postgres,service_role=X/postgres}','search_path=public, pg_temp','postgres'),
 ('public.fn_entrega_valor_faturavel_v1(uuid)','41675','5ac43dc18eee407723c0d78cd97f0db4','{postgres=X/postgres,service_role=X/postgres}','search_path=public','postgres'),
 ('public.fn_mark_entrega_not_billable(uuid,text)','41748','b6bff95624825c24d10848efff03aa66','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}','search_path=pg_catalog, public, pg_temp,lock_timeout=3s','postgres'),
 ('public.is_financial_staff(uuid)','42634','6e8f2fa7b92ca7e039d092353b3ebfe2','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}','search_path=public, pg_temp','postgres'),
 ('public.h15_profile_organization_guard()','67200','43be4da16aae664a48fa4c73315b4420','{postgres=X/postgres,service_role=X/postgres}','search_path=pg_catalog, public','postgres'),
 ('public.fn_generate_receivable_installments()','41732','f632f15c9f46cb9889082fc533a27ea1','{postgres=X/postgres,service_role=X/postgres}','search_path=public','postgres'),
 ('cf_user_guards_v1.acquire_gate()','71452','b0dd9a14d5fd799a40df0975baf4c5a6','{postgres=X/postgres}','search_path=""','postgres'),
 ('cf_user_guards_v1.require_admin()','71453','ec8e7077521cdee212be924bfb400e8a','{postgres=X/postgres}','search_path=""','postgres'),
 ('cf_user_guards_v1.advance_stamp()','71454','ce295ff5799d306ad81578047cd9bff5','{postgres=X/postgres}','search_path=""','postgres'),
 ('cf_user_guards_v1.touch_related_profiles()','71455','e5911c3801be399f9de57e038b390e79','{postgres=X/postgres}','search_path=""','postgres'),
 ('cf_user_guards_v1.block_truncate()','71456','a919901eb1e045461a5bc6e4da178624','{postgres=X/postgres}','search_path=""','postgres'),
 ('public.rpc_entrega_confirmar_v1(uuid,jsonb,jsonb)','41920','cd39f9fe93514420976263d13856c17c','{postgres=X/postgres,service_role=X/postgres}','search_path=public, pg_temp','postgres'),
 ('public.guard_superadmin_role_assignment()','72698','4a59f48e25096848a79be6de9d959cef','{postgres=X/postgres,service_role=X/postgres}','search_path=""','postgres'),
 ('public._saas_trg_require_feature()','83854','13ed48832f81cbb35434688ca35fda4b','{postgres=X/postgres,service_role=X/postgres}','search_path=""','postgres'),
 ('public.fn_authz_uid_scope_ok(uuid)','42563','00a9a4d4a075d756d312d69778493b39','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}','search_path=public, pg_temp','postgres'),
 ('public.fn_entrega_guard_faturamento_v1(uuid,numeric)','41673','fe0d6a0f670787f87081fe0650102d22','{postgres=X/postgres,service_role=X/postgres}','search_path=public','postgres'),
 ('public.organizations_guard_status()','84007','1c2241052d227831f625b909eb606bda','{postgres=X/postgres,service_role=X/postgres}','search_path=""','postgres'),
 ('public.fn_generate_receivable_from_entrega(uuid,jsonb)','41730','597f726bea6d4eaeaf68cc5040d0cf44','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}','search_path=pg_catalog, public, pg_temp,lock_timeout=3s','postgres'),
 ('public.guard_profile_senha_ticket()','84540','bb9ea2f95f8f151ebd4b97c2a2e747b7','{postgres=X/postgres,service_role=X/postgres}','search_path=""','postgres'),
 ('public.guard_profile_senha_provisoria()','83979','e38505f726490b064e61d9aa4e3be5a7','{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}','search_path=""','postgres'),
 ('public.guard_profile_tenant_fields()','90519','bd6d513d936f5c5fb0490b5d1d2f9f1d','{postgres=X/postgres,service_role=X/postgres}','search_path=""','postgres'),
 ('public.guard_tenant_organization_id()','90690','d01a740c1e3e02407131d2b9228bf658','{postgres=X/postgres,service_role=X/postgres}','search_path=""','postgres'),
 ('public.d51_5_validate_financial_tenant_links()','90880','f470a25ba7e65b366c62ad3ac8aa3112','{postgres=X/postgres,service_role=X/postgres}','search_path=public, pg_temp','postgres'),
 ('public.h15_user_organization(uuid)','90967','ff3688c33c7211b6c3fe60447a7728ac','{postgres=X/postgres,service_role=X/postgres}','search_path=pg_catalog, public','postgres'),
 ('public.update_updated_at_column()','42147','b1930ed5bca3be839f783c6202ab8147','{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}','search_path=public','postgres'),
 ('platform_private.h15_actor_organization()','67184','64e10608403238a41a9baf92857ca881','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}','search_path=""','postgres'),
 ('platform_private.platform_actor_access_ready(uuid)','95577','048249c0c2106c3761e26eacb8d0de84','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}','search_path=""','postgres'))
SELECT 'function '||f.sig AS check_name, COALESCE(p.oid::text=f.oid AND md5(pg_get_functiondef(p.oid))=f.h
 AND p.proacl::text IS NOT DISTINCT FROM f.acl AND array_to_string(p.proconfig,',') IS NOT DISTINCT FROM f.cfg
 AND pg_get_userbyid(p.proowner)=f.owner,false) AS ok FROM f LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.sig)
UNION ALL
SELECT 'table '||v.sig, COALESCE(c.oid::text=v.oid AND md5(jsonb_build_object('acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
'triggers',(SELECT jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid),md5(pg_get_functiondef(t.tgfoid))) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
'policies',(SELECT jsonb_agg(jsonb_build_array(pol.polname,pol.polcmd,pol.polpermissive,pol.polroles::text,pg_get_expr(pol.polqual,c.oid),pg_get_expr(pol.polwithcheck,c.oid)) ORDER BY pol.polname) FROM pg_policy pol WHERE pol.polrelid=c.oid),
'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text) FROM pg_index i WHERE i.indrelid=c.oid))::text)=v.h,false)
FROM (VALUES  ('public.accounts_receivable','37795','8ef1bfc63f42329895b5cb7a3801a842'),
 ('public.accounts_receivable_installments','37815','55c9be1e28715342e3778956071c76bd'),
 ('cf_user_guards_v1.state','71446','815e1db8960fd4ab476a08e5089c785c'),
 ('public.financial_audit_log','38637','042f0ebb8ade244f1f3da24bb0004360'),
 ('public.financial_categories','38644','b1a4c869d9c726e7aa14263ff6c065e7'),
 ('public.clientes','36842','4243756843ab9a372b82cc454d81ab5f'),
 ('public.entrega_reconciliacoes','38500','ba4ab061e79f087dcf3a01c029c11b8e'),
 ('public.entregas','36863','93493593ba3be6bfafd85ef2be16170a'),
 ('public.financial_cost_centers','38655','c1071d281e851006a899493b41778866'),
 ('public.organizations','39962','582219d88412063d9606aedd2eccc494'),
 ('public.partner_accounts','36958','06763aedbd0cee5f3f9dbd0dec1a29b5'),
 ('public.partner_users','40229','efdc6a71acfec797d071d5d6b19f060a'),
 ('public.payment_methods','40252','46d8f075ba15d432fd69d581902e1216'),
 ('public.profiles','40804','25a44678e693146f0b961c32a61cfa81'),
 ('public.user_roles','40559','d4b529f73f394cfa4e9b8b807c92448e')) v(sig,oid,h)
LEFT JOIN pg_class c ON c.oid=to_regclass(v.sig)
UNION ALL SELECT 'gate singleton',count(*)=1 FROM cf_user_guards_v1.state WHERE singleton
UNION ALL SELECT 'operational scopes absent',count(*)=0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='platform_private' AND p.proname IN ('stock_envase_scope_v1','delivery_recovery_scope_v1')
UNION ALL SELECT 'delivery wrapper stays closed',NOT has_function_privilege('authenticated','public.rpc_entrega_confirmar_v1(uuid,jsonb,jsonb)','EXECUTE');
ROLLBACK;
