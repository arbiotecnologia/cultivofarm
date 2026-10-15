"""Isolated PostgreSQL RLS: real hosted core/policies, reduced Auth/visit helpers.
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
CREATE TABLE profiles(user_id uuid,organization_id uuid,ativo boolean);
CREATE TABLE user_roles(user_id uuid,role app_role);
CREATE TABLE clientes(id uuid,organization_id uuid,status_cliente text);
CREATE TABLE registros_consultor(id uuid,cliente_id uuid,status text);
CREATE TABLE registros_consultor_arquivos(id uuid DEFAULT gen_random_uuid(),registro_consultor_id uuid,arquivo_path text);
CREATE TABLE user_clientes(user_id uuid,cliente_id uuid,is_active boolean,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,owner_id text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA auth,public,storage,platform_private TO authenticated,anon,service_role;
GRANT SELECT ON profiles,user_roles TO authenticated;
GRANT ALL ON storage.objects TO authenticated,anon,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.actor',true),'')::uuid $$;
CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT organization_id FROM public.profiles WHERE user_id=auth.uid() AND ativo AND current_setting('request.ready',true)='true' $$;
CREATE FUNCTION public.get_cliente_ids_for_user(uuid) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT ARRAY(SELECT cliente_id FROM public.user_clientes WHERE user_id=$1 AND $1=auth.uid() AND is_active AND revoked_at IS NULL AND (valid_from IS NULL OR valid_from<=now()) AND (valid_until IS NULL OR valid_until>=now())) $$;
CREATE FUNCTION public.can_view_technical_visit(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT $1=auth.uid() AND public.h15_actor_organization() IS NOT NULL AND (public.has_role($1,'administrador') OR public.has_role($1,'gestor') OR ((public.has_role($1,'consultor_tecnico') OR public.has_role($1,'tecnico_agronomo')) AND current_setting('request.assigned',true)='true' AND EXISTS(SELECT 1 FROM public.registros_consultor WHERE id=$2 AND cliente_id=ANY(public.get_cliente_ids_for_user($1))))) $$;
CREATE FUNCTION public.can_manage_technical_visit(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.can_view_technical_visit($1,$2) AND current_setting('request.manage',true)='true' $$;
CREATE FUNCTION public.technical_child_read_scope(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.can_view_technical_visit(auth.uid(),$1) OR (public.h15_actor_organization() IS NOT NULL AND public.has_role(auth.uid(),'cliente_produtor') AND EXISTS(SELECT 1 FROM public.registros_consultor WHERE id=$1 AND cliente_id=ANY(public.get_cliente_ids_for_user(auth.uid())) AND status IN ('aprovado','finalizado','convertido_os'))) $$;
INSERT INTO profiles VALUES('{U}','{ORG}',true);
INSERT INTO user_roles VALUES('{U}','cliente_produtor');
INSERT INTO clientes VALUES('{C1}','{ORG}','ativo'),('{C2}','{ORG}','ativo'),('{C3}','{OTHER}','ativo');
INSERT INTO registros_consultor VALUES('{V1}','{C1}','aprovado'),('{V2}','{C2}','aprovado'),('{V3}','{C3}','aprovado');
INSERT INTO user_clientes VALUES('{U}','{C1}',true,NULL,NULL,NULL);
"""
  m=(ROOT/'supabase/migrations/20261008141326_7df733a3-5535-4203-9b23-928271394c19.sql').read_text()
  schema+=m.split('CREATE OR REPLACE FUNCTION public.storage1_delivery_allowed',1)[0]
  schema+=(ROOT/'scripts/rbac-audit/applied-20261009221311-technical-storage-release-scope.sql').read_text()+';'
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
  candidate=(ROOT/'scripts/rbac-audit/proposed-consultor-storage-client-fence.sql').read_text().split('CREATE OR REPLACE FUNCTION',1)[1].split('-- Reviewer:',1)[0]
  run('CREATE OR REPLACE FUNCTION'+candidate)
  check('SELECT count(*) FROM storage.objects;','0')
  run(f"UPDATE registros_consultor_arquivos SET registro_consultor_id='{V1}' WHERE arquivo_path='{path}';")
  check('SELECT count(*) FROM storage.objects;','1')
  for p in [sibling,cross,f'{OTHER}/{V1}/foto/a.jpg',f'{ORG}/{V3}/foto/c.jpg',f'{ORG}/00000000-0000-4000-8000-000000000000/foto/a.jpg',f'{ORG}/{V1}/foto/../a.jpg',f'{ORG}/{V1}/foto/%2e.jpg',f'{ORG}//{V1}/foto/a.jpg',f'{ORG}/{V1}/foto/a.jpg/extra']:
   for action in ['select','insert','update','delete']:
    check(f"SELECT platform_private.storage1_consultor_core('{p}','{action}');",'f')
  for action in ['insert','update','delete']:
   check(f"SELECT platform_private.storage1_consultor_core('{path}','{action}');",'f')
  run(session(f"INSERT INTO storage.objects(bucket_id,name,metadata,owner_id) VALUES('consultor-arquivos','{sibling}',jsonb_build_object('cliente_id','{C1}'),'{U}');"),fail=True);checks+=1
  check(f"WITH changed AS (UPDATE storage.objects SET metadata='{{}}' WHERE name='{path}' RETURNING 1) SELECT count(*) FROM changed;",'0')
  check(f"WITH changed AS (DELETE FROM storage.objects WHERE name='{path}' RETURNING 1) SELECT count(*) FROM changed;",'0')
  for update,undo in [("is_active=false","is_active=true"),("revoked_at=now()","revoked_at=NULL"),("valid_from=now()+interval '1 day'","valid_from=NULL"),("valid_until=now()-interval '1 day'","valid_until=NULL")]:
   run('UPDATE user_clientes SET '+update);check('SELECT count(*) FROM storage.objects;','0');run('UPDATE user_clientes SET '+undo)
  for update,undo in [("status_cliente='inativo'","status_cliente='ativo'"),(f"organization_id='{OTHER}'",f"organization_id='{ORG}'")]:
   run(f"UPDATE clientes SET {update} WHERE id='{C1}';");check('SELECT count(*) FROM storage.objects;','0');run(f"UPDATE clientes SET {undo} WHERE id='{C1}';")
  run(f"INSERT INTO registros_consultor_arquivos(registro_consultor_id,arquivo_path) VALUES('{V1}','{path}');");check('SELECT count(*) FROM storage.objects;','0')
  run(f"DELETE FROM registros_consultor_arquivos WHERE id=(SELECT id FROM registros_consultor_arquivos WHERE arquivo_path='{path}' LIMIT 1);")
  for role in ['administrador','gestor','consultor_tecnico','tecnico_agronomo']:
   run(f"UPDATE user_roles SET role='{role}'; UPDATE registros_consultor SET status='rascunho' WHERE id='{V1}';")
   check(f"SELECT platform_private.storage1_consultor_core('{path}','insert');",'t')
   check(f"SELECT platform_private.storage1_consultor_core('{sibling}','select');",'t' if role in ['administrador','gestor'] else 'f')
  # Actual RLS old row + new row: forged cross-tenant move denied for internal too.
  run(session(f"UPDATE storage.objects SET name='{OTHER}/{V1}/foto/x.jpg' WHERE name='{path}';"),fail=True);checks+=1
  check(f"WITH changed AS (UPDATE storage.objects SET metadata='{{}}' WHERE name='{path}' RETURNING 1) SELECT count(*) FROM changed;",'1')
  check(f"WITH changed AS (DELETE FROM storage.objects WHERE name='{path}' RETURNING 1) SELECT count(*) FROM changed;",'1')
  run("UPDATE profiles SET ativo=false;");check('SELECT count(*) FROM storage.objects;','0');run('UPDATE profiles SET ativo=true;')
  assert run(session('SELECT count(*) FROM storage.objects;','anon')).splitlines()[-1]=='0';checks+=1
  # Service RLS bypass cannot be cured by an authenticated policy. No API used.
  assert run(session('SELECT count(*) FROM storage.objects;','service_role')).splitlines()[-1]=='2';checks+=1
  run((ROOT/'scripts/rbac-audit/rollback-consultor-storage-client-fence.sql').read_text())
  run("UPDATE user_roles SET role='cliente_produtor';")
  check(f"SELECT platform_private.storage1_consultor_core('{path}','select');",'f')
  print(f'PASS {checks} assertions; real core/permissive policies; reduced helpers/Auth/schema; signed URL/GoTrue NOT RUN; no hosted writes')
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp)
if __name__=='__main__':main()
