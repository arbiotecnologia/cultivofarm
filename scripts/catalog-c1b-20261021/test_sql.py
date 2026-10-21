from pathlib import Path
import os,subprocess,tempfile,json
HERE=Path('/dev-server/scripts/catalog-c1b-20261021')
root=Path(tempfile.mkdtemp(prefix='c1b-pg-',dir='/tmp'));root.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base=['psql','-X','-h',str(root),'-p','55497','-U','postgres','-qAt','-v','ON_ERROR_STOP=1']
checks=[]
active_actor=None
def sql(s,deny=None):
 r=subprocess.run(base,input=(f"SET test.actor='{active_actor}';\n" if active_actor else "")+s,text=True,capture_output=True)
 if deny: assert r.returncode!=0 and deny in r.stderr,r.stderr
 else: assert r.returncode==0,r.stderr
 return r.stdout.strip()
def check(name,s,want):
 actual=sql(s);assert actual==want,(name,actual,want);checks.append(name)
def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
SCHEMA="""
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE TYPE public.app_role AS ENUM('administrador','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','superadmin');
CREATE TABLE profiles(user_id uuid,organization_id uuid,ativo boolean);
CREATE TABLE organizations(id uuid,partner_account_id uuid,ativo boolean,status text);
CREATE TABLE partner_accounts(id uuid,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz);
CREATE TABLE user_roles(user_id uuid,role app_role);
CREATE TABLE partner_users(user_id uuid,partner_id uuid,revoked_at timestamptz);
CREATE TABLE produtos(id uuid,nome text,codigo text,ativo boolean,b2b_enabled boolean,tipo text,familia_catalogo text,funcao_completa text,dose_ml_ha numeric,descricao text);
CREATE TABLE microrganismos(id uuid,nome text,codigo text,ativo boolean,b2b_enabled boolean,tipo text,nome_cientifico text,funcao_agronomica text,dose_ml_ha numeric,descricao text);
CREATE TABLE product_technical_profiles(produto_id uuid,status_validacao text,resumo_curto text,explicacao_b2b text,beneficio_combinado text);
CREATE TABLE microorganism_technical_profiles(microrganismo_id uuid,status_validacao text,resumo_curto text,explicacao_b2b text,beneficios_agronomicos text);
CREATE TABLE catalog_tenant_visibility(organization_id uuid,entity_type text,produto_id uuid,microrganismo_id uuid,hidden boolean);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path TO public AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE FUNCTION public.has_role(u uuid,r app_role) RETURNS boolean LANGUAGE sql STABLE SET search_path TO public AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role=r)$$;
CREATE FUNCTION public.is_platform_superadmin(u uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path TO public AS $$SELECT public.has_role(u,'superadmin')$$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SET search_path TO public AS $$SELECT p.organization_id FROM profiles p JOIN organizations o ON o.id=p.organization_id AND o.ativo WHERE p.user_id=auth.uid() AND p.ativo$$;
CREATE FUNCTION platform_private.b2b_actor_scope(u uuid)
RETURNS TABLE(profile_ok boolean,org_partner uuid,user_partner uuid,user_partner_count integer,partner_valid boolean,has_catalog boolean)
LANGUAGE sql STABLE SET search_path TO public AS $$SELECT EXISTS(SELECT 1 FROM profiles p JOIN organizations o ON o.id=p.organization_id AND o.ativo WHERE p.user_id=u AND p.ativo),
 (SELECT o.partner_account_id FROM organizations o JOIN profiles p ON p.organization_id=o.id WHERE p.user_id=u),
 (SELECT min(partner_id::text)::uuid FROM partner_users WHERE user_id=u AND revoked_at IS NULL),
 (SELECT count(*)::int FROM partner_users WHERE user_id=u AND revoked_at IS NULL),
 EXISTS(SELECT 1 FROM partner_accounts pa JOIN partner_users pu ON pu.partner_id=pa.id WHERE pu.user_id=u AND pu.revoked_at IS NULL AND pa.ativo AND pa.deleted_at IS NULL),true$$;
CREATE FUNCTION fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date) RETURNS jsonb LANGUAGE sql SET search_path TO public AS $$SELECT '{"ok":true,"base_price":12}'::jsonb$$;
CREATE FUNCTION fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date) RETURNS jsonb LANGUAGE sql SET search_path TO public AS $$SELECT '{"ok":true,"final_unit_price":9}'::jsonb$$;
"""
try:
 r=subprocess.run(prefix+['initdb','-D',str(root/'data'),'-A','trust','-U','postgres'],capture_output=True,text=True);assert r.returncode==0,r.stderr
 r=subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'-l',str(root/'log'),'-o',f'-k {root} -p 55497 -h ""','start'],capture_output=True,text=True);assert r.returncode==0,r.stderr
 sql(SCHEMA)
 live=json.loads((HERE/'live-snapshot.json').read_text())
 for row in live:
  sql(row['definition']);sig=row['identity'];sql(f'REVOKE ALL ON FUNCTION public.{sig} FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.{sig} TO service_role,authenticated;')
  check('exact baseline '+sig,f"SELECT md5(pg_get_functiondef('public.{sig}'::regprocedure))",row['md5'])
 sql((HERE/'candidate.sql.review').read_text())
 for n in [100,200,300,400]:sql(f"INSERT INTO organizations VALUES('{uid(n)}',NULL,true,'ativa');")
 for partner,owner,org,user,role in [(10,100,300,1,'parceiro_b2b'),(20,200,400,2,'parceiro_b2b_tecnico')]:
  sql(f"INSERT INTO partner_accounts VALUES('{uid(partner)}','{uid(owner)}',true,NULL); UPDATE organizations SET partner_account_id='{uid(partner)}' WHERE id='{uid(org)}'; INSERT INTO profiles VALUES('{uid(user)}','{uid(org)}',true); INSERT INTO user_roles VALUES('{uid(user)}','{role}'); INSERT INTO partner_users VALUES('{uid(user)}','{uid(partner)}',NULL);")
 for n,fam in [(51,'biologico'),(52,'quimico'),(53,'fertilizante_adubo'),(54,None),(55,'quimico')]:
  family="NULL" if fam is None else f"'{fam}'"
  sql(f"INSERT INTO produtos VALUES('{uid(n)}','P{n}','P{n}',{str(n!=55).lower()},true,'fungicida',{family},NULL,NULL,NULL); INSERT INTO product_technical_profiles VALUES('{uid(n)}','aprovado','resumo','b2b','beneficio');")
 sql(f"INSERT INTO microrganismos VALUES('{uid(60)}','M','M',true,true,'bacteria',NULL,NULL,NULL,NULL); INSERT INTO microorganism_technical_profiles VALUES('{uid(60)}','aprovado','R','B','B'); INSERT INTO catalog_tenant_visibility VALUES('{uid(100)}','produto','{uid(52)}',NULL,true),('{uid(400)}','produto','{uid(53)}',NULL,true);")
 def actor(n):
  global active_actor
  active_actor=uid(n)
 actor(1)
 check('A owner hides chemical; inactive omitted; legacy preserved',f"SELECT string_agg(familia_catalogo,',' ORDER BY item_id) FROM get_partner_catalog_secure('{uid(10)}',true)", 'biologico,fertilizante_adubo,biologico')
 check('legacy has NULL family',f"SELECT familia_catalogo IS NULL FROM get_partner_catalog_secure('{uid(10)}',true) WHERE item_id='{uid(54)}'",'t')
 check('canonical price unchanged',f"SELECT preco_parceiro FROM get_partner_catalog_secure('{uid(10)}',true) LIMIT 1",'12.00')
 sql(f"SELECT * FROM get_partner_catalog_secure('{uid(20)}',true)", 'forbidden_partner');checks.append('cross-partner denied')
 actor(2)
 check('B hides fertilizer by actor; A hidden not applied',"SELECT string_agg(familia_catalogo,',' ORDER BY item_id) FROM get_partner_catalog_tecnico_secure(true)",'biologico,quimico,biologico')
 check('technical finance NULL',"SELECT bool_and(valor_dose_brl IS NULL AND valor_litro_brl IS NULL AND valor_ha_brl IS NULL) FROM get_partner_catalog_tecnico_secure(true)",'t')
 sql(f"SELECT * FROM get_partner_catalog_secure('{uid(20)}',true)",'forbidden_financial_terms');checks.append('technical financial denial preserved')
 sql("SELECT * FROM get_partner_catalog_tecnico_secure(false)",'catalog_contract_required');checks.append('wrong contract denied')
 sql(f"UPDATE partner_accounts SET commercial_owner_organization_id=NULL WHERE id='{uid(20)}';")
 sql("SELECT * FROM get_partner_catalog_tecnico_secure(true)",'catalog_commercial_owner_unavailable');checks.append('missing owner denied')
 sql(f"UPDATE partner_accounts SET commercial_owner_organization_id='{uid(200)}' WHERE id='{uid(20)}'; UPDATE partner_users SET revoked_at=now() WHERE user_id='{uid(2)}';")
 sql("SELECT * FROM get_partner_catalog_tecnico_secure(true)",'forbidden_partner');checks.append('revoked link denied')
 check('anon overload ACL',"SELECT has_function_privilege('anon','get_partner_catalog_tecnico_secure(boolean)','EXECUTE')",'f')
 check('private helper ACL',"SELECT has_function_privilege('authenticated','platform_private.c1b_catalog_visibility_scope(uuid)','EXECUTE')",'f')
 # No DML exists in production candidate; all fixtures/stubs above are confined to this socket.
 sql((HERE/'rollback.sql.review').read_text())
 for row in live:check('rollback exact '+row['identity'],f"SELECT md5(pg_get_functiondef('public.{row['identity']}'::regprocedure))",row['md5'])
 print(json.dumps({'status':'PASS','synthetic':True,'total':len(checks),'checks':checks},indent=2))
finally:
 subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'stop','-m','immediate'],capture_output=True)
