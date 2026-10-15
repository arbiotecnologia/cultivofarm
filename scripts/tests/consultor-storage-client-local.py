"""Isolated PostgreSQL RLS: existing core/policies and versioned transitive technical helpers.
Auth/readiness boundary and schema reduced; no replacement candidate.
Never contacts hosted services; service_role bypass probe is a limitation, not authority.
"""
from pathlib import Path
import os, subprocess, tempfile, shutil
ROOT=Path(__file__).resolve().parents[2]
ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
C1='11111111-1111-4111-8111-111111111111'; C2='22222222-2222-4222-8222-222222222222'; C3='33333333-3333-4333-8333-333333333333'
V1='11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; V2='22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; V3='33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
U='44444444-4444-4444-8444-444444444444'
def main():
 tmp=Path(tempfile.mkdtemp(prefix='storage-client-',dir='/tmp'));tmp.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 checks=0
 try:
  subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55490','start'],check=True,capture_output=True)
  def run(sql,fail=False):
   nonlocal checks
   r=subprocess.run(['psql','-X','-h',str(tmp),'-p','55490','-U','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
   if fail:
    assert r.returncode!=0 and 'row-level security' in r.stderr,r.stderr
   else: assert r.returncode==0,r.stderr
   return r.stdout.strip()
  schema=f"""
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA platform_private;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','consultor_tecnico','tecnico_agronomo','aplicador','cliente_produtor');
CREATE TABLE profiles(id uuid DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,ativo boolean,cliente_id uuid);
CREATE TABLE user_roles(user_id uuid,role app_role);
CREATE TABLE clientes(id uuid,organization_id uuid,status_cliente text);
CREATE TABLE registros_consultor(id uuid,cliente_id uuid,status text,fazenda_id uuid,talhao_id uuid,consultor_responsavel uuid,created_by uuid,consultor_profile_id uuid);
CREATE TABLE fazendas(id uuid,cliente_id uuid,organization_id uuid); CREATE TABLE talhoes(id uuid,fazenda_id uuid,organization_id uuid);
CREATE TABLE technical_visit_assignments(registro_consultor_id uuid,user_id uuid,is_active boolean,removed_at timestamptz);
CREATE TABLE registros_consultor_arquivos(id uuid DEFAULT gen_random_uuid(),registro_consultor_id uuid,arquivo_path text);
CREATE TABLE user_clientes(user_id uuid,cliente_id uuid,is_active boolean,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz,access_level text);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,owner_id text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA auth,public,storage,platform_private TO authenticated,anon,service_role;
GRANT SELECT ON profiles,user_roles TO authenticated;
GRANT ALL ON storage.objects TO authenticated,anon,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.actor',true),'')::uuid $$;
CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT organization_id FROM public.profiles WHERE user_id=auth.uid() AND ativo AND current_setting('request.ready',true)='true' $$;
CREATE FUNCTION public.fn_authz_uid_scope_ok(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1=auth.uid() AND public.h15_actor_organization() IS NOT NULL $$;
-- Hosted c80d5900692d960f649d0a9f7850fe2c; only fn_authz boundary reduced.
CREATE OR REPLACE FUNCTION public.get_cliente_ids_for_user(_user_id uuid)
 RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT CASE WHEN public.fn_authz_uid_scope_ok(_user_id) THEN ARRAY(
 SELECT uc.cliente_id FROM public.user_clientes uc WHERE uc.user_id=_user_id
 AND uc.is_active=true AND uc.revoked_at IS NULL
 AND (uc.valid_from IS NULL OR uc.valid_from<=now()) AND (uc.valid_until IS NULL OR uc.valid_until>=now())
 UNION SELECT pr.cliente_id FROM public.profiles pr WHERE pr.user_id=_user_id AND pr.cliente_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.user_clientes uc2 WHERE uc2.user_id=pr.user_id AND uc2.cliente_id=pr.cliente_id
 AND uc2.is_active=true AND uc2.revoked_at IS NULL AND (uc2.valid_from IS NULL OR uc2.valid_from<=now())
 AND (uc2.valid_until IS NULL OR uc2.valid_until>=now()))
 ) ELSE ARRAY[]::uuid[] END;
$function$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('iat',extract(epoch from now())::bigint) $$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT public.h15_actor_organization() $$;
CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1=auth.uid() AND public.h15_actor_organization() IS NOT NULL $$;
INSERT INTO profiles(user_id,organization_id,ativo) VALUES('{U}','{ORG}',true);
INSERT INTO user_roles VALUES('{U}','cliente_produtor');
INSERT INTO clientes VALUES('{C1}','{ORG}','ativo'),('{C2}','{ORG}','ativo'),('{C3}','{OTHER}','ativo');
INSERT INTO registros_consultor(id,cliente_id,status,consultor_responsavel) VALUES('{V1}','{C1}','aprovado','{U}'),('{V2}','{C2}','aprovado',NULL),('{V3}','{C3}','aprovado',NULL);
INSERT INTO user_clientes VALUES('{U}','{C1}',true,NULL,NULL,NULL,'manage');
"""
  # Execute versioned technical helper bodies, not mocks for each authorization hop.
  technical=(ROOT/'scripts/rbac-audit/technical-tenant-containment.sql').read_text()
  import re
  names=['technical_actor_ready','technical_refs_in_actor_tenant','technical_client_link','is_visit_responsible','is_active_visit_participant','can_view_technical_visit','can_manage_technical_visit']
  for name in names:
   match=re.search(r'CREATE OR REPLACE FUNCTION public\.'+name+r'\(.*?\$\$;',technical,re.S)
   assert match,name
   schema+=match.group(0)
  child=(ROOT/'scripts/rbac-audit/20261009212351_technical_child_tenant_scope.sql').read_text()
  schema+=child[child.index('CREATE OR REPLACE FUNCTION'):child.index('REVOKE ALL')]
  m=(ROOT/'supabase/migrations/20261008141326_7df733a3-5535-4203-9b23-928271394c19.sql').read_text()
  schema+=m.split('CREATE OR REPLACE FUNCTION public.storage1_delivery_allowed',1)[0]
  schema+=(ROOT/'scripts/rbac-audit/applied-20261009221311-technical-storage-release-scope.sql').read_text()+';'
  # Match hosted core ACL (historical body archive intentionally omits grants).
  schema+='REVOKE ALL ON FUNCTION platform_private.storage1_consultor_core(text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION platform_private.storage1_consultor_core(text,text) TO authenticated,service_role;'
  permissive=(ROOT/'supabase/migrations/20261005221945_5a892019-9ef5-4ffb-abf7-2984e58c3ede.sql').read_text().split('REVOKE ALL ON FUNCTION public.consultor_storage_path_allowed')[0]
  schema+=permissive
  for cmd in ['SELECT','INSERT','UPDATE','DELETE']:
   expr=f"(bucket_id<>'consultor-arquivos' OR platform_private.storage1_consultor_core(name,'{cmd.lower()}'))"
   clause=(f'WITH CHECK {expr}' if cmd=='INSERT' else f'USING {expr}'+(f' WITH CHECK {expr}' if cmd=='UPDATE' else ''))
   schema+=f'CREATE POLICY storage1_{cmd.lower()} ON storage.objects AS RESTRICTIVE FOR {cmd} TO anon,authenticated {clause};'
  run(schema)
  def session(sql,role='authenticated'):
   return f"SELECT set_config('request.actor','{U}',false); SELECT set_config('request.ready','true',false); SELECT set_config('request.manage','true',false); SELECT set_config('request.assigned','true',false); SET ROLE {role};"+sql
  def check(sql,expected):
   nonlocal checks
   actual=run(session(sql)).splitlines()[-1];assert actual==expected,(sql,actual,expected);checks+=1
  path=f'{ORG}/{V1}/foto/a.jpg'; sibling=f'{ORG}/{V2}/foto/b.jpg'; cross=f'{OTHER}/{V3}/foto/c.jpg'
  run(f"INSERT INTO storage.objects(bucket_id,name) VALUES('consultor-arquivos','{path}'),('consultor-arquivos','{sibling}'),('consultor-arquivos','{cross}'); INSERT INTO registros_consultor_arquivos(registro_consultor_id,arquivo_path) VALUES('{V1}','{path}'),('{V2}','{sibling}'),('{V3}','{cross}');")
  # Existing restrictive policies already deny sibling and cross-tenant: no false P1 claim.
  check('SELECT count(*) FROM storage.objects;','1')
  run(f"UPDATE registros_consultor_arquivos SET registro_consultor_id='{V2}' WHERE arquivo_path='{path}';")
  check('SELECT count(*) FROM storage.objects;','1') # Concrete path/reference mismatch accepted before.
  run(f"UPDATE registros_consultor_arquivos SET registro_consultor_id='{V1}' WHERE arquivo_path='{path}';")
  for action in ['NULL',"'unknown'"]:
   check(f"SELECT platform_private.storage1_consultor_core('{path}',{action});",'f')
  run(f"UPDATE registros_consultor_arquivos SET arquivo_path=NULL WHERE arquivo_path='{path}';")
  check('SELECT count(*) FROM storage.objects;','1') # metadata does not authorize; path/visit do
  run(f"UPDATE registros_consultor_arquivos SET arquivo_path='{path}' WHERE registro_consultor_id='{V1}';")
  run(f"UPDATE registros_consultor SET status='rascunho' WHERE id='{V1}';")
  check('SELECT count(*) FROM storage.objects;','0')
  run(f"UPDATE registros_consultor SET status='aprovado' WHERE id='{V1}';")
  for p in [sibling,cross,f'{OTHER}/{V1}/foto/a.jpg',f'{ORG}/{V3}/foto/c.jpg',f'{ORG}/00000000-0000-4000-8000-000000000000/foto/a.jpg',f'{ORG}/{V1}/foto/../a.jpg',f'{ORG}/{V1}/foto/%2e.jpg',f'{ORG}//{V1}/foto/a.jpg',f'{ORG}/{V1}/foto/a.jpg/extra']:
   for action in ['select','insert','update','delete']:
    check(f"SELECT platform_private.storage1_consultor_core('{p}','{action}');",'f')
  for action in ['insert','update','delete']:
   check(f"SELECT platform_private.storage1_consultor_core('{path}','{action}');",'f')
  run(session(f"INSERT INTO storage.objects(bucket_id,name,metadata,owner_id) VALUES('consultor-arquivos','{sibling}',jsonb_build_object('cliente_id','{C1}'),'{U}');"),fail=True);checks+=1
  check(f"WITH changed AS (UPDATE storage.objects SET metadata='{{}}' WHERE name='{path}' RETURNING 1) SELECT count(*) FROM changed;",'0')
  check(f"WITH changed AS (DELETE FROM storage.objects WHERE name='{path}' RETURNING 1) SELECT count(*) FROM changed;",'0')
  for update,undo in [("is_active=false","is_active=true"),("revoked_at=now()","revoked_at=NULL"),("valid_from=now()+interval '1 day'","valid_from=NULL"),("valid_until=now()-interval '1 day'","valid_until=NULL")]:
   run(f"UPDATE user_clientes SET {update} WHERE cliente_id='{C1}'");check('SELECT count(*) FROM storage.objects;','0');run(f"UPDATE user_clientes SET {undo} WHERE cliente_id='{C1}'")
  for update,undo in [(f"organization_id='{OTHER}'",f"organization_id='{ORG}'")]:
   run(f"UPDATE clientes SET {update} WHERE id='{C1}';");check('SELECT count(*) FROM storage.objects;','0');run(f"UPDATE clientes SET {undo} WHERE id='{C1}';")
  run(f"INSERT INTO registros_consultor_arquivos(registro_consultor_id,arquivo_path) VALUES('{V1}','{path}');");check('SELECT count(*) FROM storage.objects;','1')
  run(f"DELETE FROM registros_consultor_arquivos WHERE id=(SELECT id FROM registros_consultor_arquivos WHERE arquivo_path='{path}' LIMIT 1);")
  # Profile fallback cannot restore revoked client membership.
  run(f"UPDATE profiles SET cliente_id='{C2}' WHERE user_id='{U}';")
  check(f"SELECT platform_private.storage1_consultor_core('{sibling}','select');",'f')
  run(f"INSERT INTO user_clientes VALUES('{U}','{C2}',false,now(),NULL,NULL,'read');")
  check(f"SELECT platform_private.storage1_consultor_core('{sibling}','select');",'f')
  run(f"UPDATE profiles SET cliente_id=NULL WHERE user_id='{U}';")
  run(f"INSERT INTO fazendas VALUES('{V3}','{C3}','{OTHER}'); UPDATE registros_consultor SET fazenda_id='{V3}' WHERE id='{V1}';")
  check('SELECT count(*) FROM storage.objects;','0')
  run(f"UPDATE registros_consultor SET fazenda_id=NULL WHERE id='{V1}';")
  for status in ['finalizado','convertido_os','aprovado']:
   run(f"UPDATE registros_consultor SET status='{status}' WHERE id='{V1}';")
   check(f"SELECT platform_private.storage1_consultor_core('{path}','select');",'t')
  for role in ['administrador','gestor','consultor_tecnico','tecnico_agronomo']:
   run(f"UPDATE user_roles SET role='{role}'; UPDATE registros_consultor SET status='rascunho' WHERE id='{V1}';")
   check(f"SELECT platform_private.storage1_consultor_core('{path}','insert');",'t')
   check(f"SELECT platform_private.storage1_consultor_core('{sibling}','select');",'t' if role in ['administrador','gestor'] else 'f')
  # Actual RLS old row + new row: forged cross-tenant move denied for internal too.
  run(session(f"UPDATE storage.objects SET name='{OTHER}/{V1}/foto/x.jpg' WHERE name='{path}';"),fail=True);checks+=1
  check(f"WITH changed AS (UPDATE storage.objects SET metadata='{{}}' WHERE name='{path}' RETURNING 1) SELECT count(*) FROM changed;",'1')
  run(f"UPDATE registros_consultor SET consultor_responsavel=NULL WHERE id='{V1}';")
  check(f"SELECT platform_private.storage1_consultor_core('{path}','select');",'f')
  run(f"INSERT INTO technical_visit_assignments VALUES('{V1}','{U}',true,NULL);")
  check(f"SELECT platform_private.storage1_consultor_core('{path}','select');",'t')
  check(f"SELECT platform_private.storage1_consultor_core('{path}','update');",'f')
  run('UPDATE technical_visit_assignments SET is_active=false,removed_at=now();')
  check(f"SELECT platform_private.storage1_consultor_core('{path}','select');",'f')
  run(f"UPDATE registros_consultor SET consultor_responsavel='{U}' WHERE id='{V1}';")
  run("UPDATE user_clientes SET access_level='read';")
  check(f"SELECT platform_private.storage1_consultor_core('{path}','select');",'t')
  check(f"SELECT platform_private.storage1_consultor_core('{path}','update');",'f')
  run("UPDATE user_clientes SET access_level='manage';")
  check(f"SELECT set_config('request.ready','false',false); SELECT platform_private.storage1_consultor_core('{path}','select');",'f')
  run(session(f"INSERT INTO storage.objects(bucket_id,name) VALUES('consultor-arquivos','{ORG}/{V1}/foto/new.jpg');"));checks+=1
  run(session(f"DELETE FROM storage.objects WHERE name='{ORG}/{V1}/foto/new.jpg';"))
  check(f"WITH changed AS (DELETE FROM storage.objects WHERE name='{path}' RETURNING 1) SELECT count(*) FROM changed;",'1')
  run("UPDATE profiles SET ativo=false;");check('SELECT count(*) FROM storage.objects;','0');run('UPDATE profiles SET ativo=true;')
  assert run(session('SELECT count(*) FROM storage.objects;','anon')).splitlines()[-1]=='0';checks+=1
  # Service RLS bypass cannot be cured by an authenticated policy. No API used.
  assert run(session('SELECT count(*) FROM storage.objects;','service_role')).splitlines()[-1]=='2';checks+=1
  print(f'PASS {checks} assertions on EXISTING rules; PostgreSQL RLS/transitive technical helpers real; Auth/readiness/schema reduced; signed URL NOT RUN; no hosted writes')
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp)
if __name__=='__main__':main()
