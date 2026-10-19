"""Offline assembler; does not connect to hosted databases."""
from pathlib import Path
import json
H=Path(__file__).resolve().parent
# Exact live READ ONLY observations, no ACL widening except the one reviewed RPC.
CONTRACTS=[
('public.has_role(uuid,public.app_role)','4d90e93d521a4819d9085f28d742030f','s',False,'search_path=""',['authenticated','postgres','service_role']),
('public.h15_actor_organization()','55edafec08bcc84a00f1526c14334a2c','s',False,'search_path=""',['authenticated','postgres','service_role']),
('public.rpc_aprovar_os_v1(uuid,text)','d65be82dbf38ec429b7377bd6873ba47','v',True,'search_path=""',['postgres']),
('private.assert_os_approval_scope(uuid,text)','8c3142a07b3f310082309ef50f8b32dd','v',True,'search_path=""',['postgres']),
('private.guard_os_separate_approval()','f00397fe862e611fbfa0eba3911d95c6','v',True,'search_path=""',['postgres']),
('private.h7n_esteira_laboratorio()','bad38b5200629cc887767e62b7a46e40','s',True,'search_path=""',['authenticated','postgres','service_role']),
('public.technical_actor_ready(uuid)','b5d0994b6eb976b14122cd2a1ec798cf','s',True,'search_path=""',['authenticated','postgres','service_role']),
('platform_private.h15_actor_organization()','64e10608403238a41a9baf92857ca881','s',True,'search_path=""',['authenticated','postgres','service_role']),
('platform_private.platform_actor_access_ready(uuid)','048249c0c2106c3761e26eacb8d0de84','s',True,'search_path=""',['authenticated','postgres','service_role']),
('public._saas_user_has_feature(uuid,text)','501dd958e117d2df8a4d38f6bcbeed04','s',True,'search_path=""',['postgres','service_role']),
('platform_private.lab_item_is_manufacturable(uuid,uuid)','853595394240e8f2a61ac2d621118271','s',True,'search_path=""',['postgres']),
('public.fn_cockpit_norm_origem(text)','701ba8da92fc3df9ea0e5270ab5e74b2','i',False,'search_path=public, pg_temp',['PUBLIC','anon','authenticated','postgres','service_role']),
('public.fn_sync_os_classica_downstream()','06e64b76968f91e19f03b24363ac610a','v',True,'search_path=public',['postgres','service_role']),
('public.check_os_status_transition()','496a214d87fc831a53b2f16d3524ddea','v',True,'search_path=public, pg_temp',['postgres','service_role']),
('public.rpc_programar_os_v1(uuid,text,date)','a42d6b07f51e6dacf41096f6cefb8163','v',True,'search_path=public, pg_temp',['postgres','service_role']),
('public.fn_avancar_etapa_esteira(text,uuid,uuid,text,uuid)','7ed490f667efcd6e50eb7a2a061899b6','v',True,'search_path=public',['postgres','service_role']),
('public._avancar_os_status(text,uuid,text)','3da8242d67462c916a2d971f5ea7bb97','v',True,'search_path=public, pg_temp',['postgres','service_role']),
('public.fn_create_programacao_on_os_classica_insert()','27b31332cebda532e2d99d9547f9b67c','v',True,'search_path=public',['postgres','service_role']),
('public.guard_tenant_organization_id()','d01a740c1e3e02407131d2b9228bf658','v',False,'search_path=""',['postgres','service_role']),
('public.can_user_access_aplicacao(uuid)','04067ba43cea3eed845a1fd3735061e0','s',True,'search_path=public',['authenticated','postgres','service_role']),
]
SCHEMA="""SELECT md5(string_agg(table_name||':'||column_name||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,''),E'\\n' ORDER BY table_name,ordinal_position)) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ordens_servico','ordens_servico_onfarm','programacao_producao','laboratorio_esteira_eventos','profiles','user_roles','organizations','clientes','fazendas','talhoes','lotes','produtos','microrganismos','production_order_link')"""
TRIGGERS="""SELECT md5(string_agg(t.tgrelid::regclass::text||':'||t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\\n' ORDER BY t.tgrelid::regclass::text,t.tgname)) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.ordens_servico'::regclass,'public.ordens_servico_onfarm'::regclass,'public.programacao_producao'::regclass)"""
POLICIES="""SELECT md5(string_agg(tablename||':'||policyname||':'||permissive||':'||roles::text||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''),E'\\n' ORDER BY tablename,policyname)) FROM pg_policies WHERE schemaname='public' AND tablename IN ('ordens_servico','ordens_servico_onfarm','programacao_producao','laboratorio_esteira_eventos')"""
INDEXES="""SELECT md5(string_agg(tablename||':'||indexname||':'||indexdef,E'\\n' ORDER BY tablename,indexname)) FROM pg_indexes WHERE schemaname='public' AND tablename IN ('ordens_servico','ordens_servico_onfarm','programacao_producao','profiles','user_roles')"""
TABLES="""SELECT md5(string_agg(c.relname||':'||c.relrowsecurity||':'||c.relforcerowsecurity||':'||coalesce(c.relacl::text,'')||':'||r.rolname,E'\\n' ORDER BY c.relname)) FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('ordens_servico','ordens_servico_onfarm','programacao_producao','laboratorio_esteira_eventos','profiles','user_roles','organizations','clientes','fazendas','talhoes','lotes')"""
def guard(post=False):
 rows=[]
 posts=json.loads((H/'post-hashes.json').read_text()) if post else {}
 for sig,md5,vol,sec,config,roles in CONTRACTS:
  if post and sig in posts: md5=posts[sig]
  if post and sig.startswith('public.rpc_aprovar_os_v1'): roles=['authenticated','postgres']
  rows.append("('%s','%s','%s',%s,'%s',ARRAY[%s]::text[])"%(sig,md5,vol,str(sec).lower(),config,','.join("'%s'"%r for r in roles)))
 checks=''
 # trigger hash includes the unchanged guard, NOT the helper/RPC bodies being replaced
 for label,expr,expected in [('schema',SCHEMA,'437b65caa297b4b7bb89500d9898d76f'),('triggers',TRIGGERS,'393b62456231e126a9cf166a75ac8292'),('policies',POLICIES,'46dd55536a5e91359cdcd6a9baa11647'),('indexes',INDEXES,'1f6dc84fe58153f1cc210d9b47b6ebb8'),('table_acl_rls',TABLES,'5a50a214ad6ffb8d758a239c175e951d')]:
  checks+=f"IF ({expr}) IS DISTINCT FROM '{expected}' THEN RAISE EXCEPTION 'OS_APPROVAL_{label}_DRIFT'; END IF;\n"
 return """DO $guard$
DECLARE c record; p record; v_executor_roles text[];
BEGIN
 IF (SELECT project_ref FROM public.fiscal_environment_marker LIMIT 1) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN RAISE EXCEPTION 'WRONG_PROJECT'; END IF;
 FOR c IN SELECT * FROM (VALUES
"""+',\n'.join(rows)+"""
 ) x(sig,hash,vol,sec,config,acl) LOOP
 SELECT *,pg_get_functiondef(oid) definition INTO p FROM pg_proc WHERE oid=to_regprocedure(c.sig);
 IF p.oid IS NULL OR md5(p.definition) IS DISTINCT FROM c.hash OR p.provolatile::text IS DISTINCT FROM c.vol OR p.prosecdef IS DISTINCT FROM c.sec OR p.proconfig IS DISTINCT FROM ARRAY[c.config] OR (SELECT rolname FROM pg_roles WHERE oid=p.proowner) IS DISTINCT FROM 'postgres' THEN RAISE EXCEPTION 'OS_APPROVAL_BODY_DRIFT:%',c.sig; END IF;
 SELECT array_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END) INTO v_executor_roles FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE a.privilege_type='EXECUTE';
 IF v_executor_roles IS DISTINCT FROM c.acl OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.is_grantable) THEN RAISE EXCEPTION 'OS_APPROVAL_ACL_DRIFT:%',c.sig; END IF;
 END LOOP;
"""+checks+'END $guard$;\n'
def main():
 baseline=guard();post=guard(True)
 header="-- REVIEW ONLY. Auditor validates ref before execution. No fixture/data writes.\nBEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='15s';\n"
 (H/'preflight-readonly.sql').write_text('BEGIN READ ONLY;\nSET LOCAL statement_timeout=\'15s\';\n'+baseline+'SELECT \'PRE PASS\' result;\nROLLBACK;\n')
 (H/'postflight-readonly.sql').write_text('BEGIN READ ONLY;\nSET LOCAL statement_timeout=\'15s\';\n'+post+'SELECT \'POST PASS\' result;\nROLLBACK;\n')
 bodies=(H/'scope.sql.review').read_text()+(H/'rpc.sql.review').read_text()
 (H/'candidate.sql.review').write_text(header+baseline+bodies+"REVOKE ALL ON FUNCTION public.rpc_aprovar_os_v1(uuid,text) FROM PUBLIC,anon,service_role;\nGRANT EXECUTE ON FUNCTION public.rpc_aprovar_os_v1(uuid,text) TO authenticated;\n"+post+'COMMIT;\n')
 (H/'rollback.sql.review').write_text(header+post+"REVOKE ALL ON FUNCTION public.rpc_aprovar_os_v1(uuid,text) FROM authenticated;\n"+(H/'rollback/scope.sql.review').read_text()+(H/'rollback/rpc.sql.review').read_text()+baseline+'COMMIT;\n')
if __name__=='__main__':main()
