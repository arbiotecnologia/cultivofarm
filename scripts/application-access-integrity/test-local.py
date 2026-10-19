"""Disposable PG17 unix socket only; no env DB, no hosted fixtures. Real captured helpers,
reduced tables/RLS and auth claims emulators, not signed JWT/browser authentication.
Run --capture only to inspect local function canonicalization, never to bless drift.
"""
from pathlib import Path
import subprocess, tempfile, os, json, sys, hashlib
HERE=Path(__file__).resolve().parent
def main():
 t=Path(tempfile.mkdtemp(prefix='app-access-',dir='/tmp'));t.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 cmd=['psql','-X','-h',str(t),'-p','55519','-U','postgres','-v','ON_ERROR_STOP=1','-At']
 passed=0
 def run(sql=None,file=None,ok=True):
  r=subprocess.run(cmd+(['-f',str(file)] if file else []),input=sql,text=True,capture_output=True)
  if (r.returncode==0)!=ok: raise RuntimeError(r.stdout[-2000:]+r.stderr[-4000:])
  return r.stdout
 def snap():
  return run(sql="SELECT oid::regprocedure,md5(pg_get_functiondef(oid)),proacl,proconfig,proowner FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'platform_private'::regnamespace) ORDER BY oid;")
 def check(label,expr):
  nonlocal passed
  if run(sql='SELECT ('+expr+') IS TRUE;').strip()!='t': raise RuntimeError(label)
  passed+=1
 def actor(uid='11111111-1111-4111-8111-111111111111',iat='floor(extract(epoch FROM clock_timestamp()))'):
  return f"SELECT set_config('request.jwt.claims',jsonb_build_object('sub','{uid}','iat',{iat})::text,false); SET ROLE authenticated;"
 def read(id):
  return actor()+f"SELECT public.can_user_access_aplicacao('{id}');"
 try:
  subprocess.run(prefix+['initdb','-D',str(t/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'-l',str(t/'server.log'),'-o',f'-k {t} -h "" -p 55519','start'],check=True,capture_output=True)
  run(file=HERE/'local-setup.sql');run(file=HERE/'dependencies.sql.review');run(file=HERE/'baseline.sql.review')
  run(sql="DO $$DECLARE r record; BEGIN FOR r IN SELECT oid::regprocedure f FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'platform_private'::regnamespace) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',r.f); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',r.f); END LOOP; END$$; CREATE POLICY local_application_read ON public.aplicacoes FOR SELECT TO authenticated USING (public.can_user_access_aplicacao(id));")
  if '--capture' in sys.argv:
   run(file=HERE/'function.sql.review')
   print(run(sql="SELECT json_agg(json_build_object('signature',oid::regprocedure::text,'md5',md5(pg_get_functiondef(oid)),'acl',proacl::text,'config',proconfig,'definer',prosecdef,'volatility',provolatile,'owner',pg_get_userbyid(proowner))) FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'platform_private'::regnamespace);").strip());return
  for f,h in json.loads((HERE/'SHA256.json').read_text()).items(): assert hashlib.sha256((HERE/f).read_bytes()).hexdigest()==h,f
  baseline=snap()
  check('baseline exact md5',"md5(pg_get_functiondef('public.can_user_access_aplicacao(uuid)'::regprocedure))='b05590fbbc62efb107ed8b551cd08b3f'")
  A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';U='11111111-1111-4111-8111-111111111111'
  ids=lambda n:f'{n:08d}-0000-4000-8000-000000000001'
  run(sql=f"INSERT INTO organizations VALUES('{A}',true),('{B}',true); INSERT INTO profiles(user_id,organization_id) VALUES('{U}','{A}'); INSERT INTO user_roles VALUES('{U}','financeiro'); INSERT INTO clientes VALUES('{ids(1)}','{A}'),('{ids(2)}','{B}'),('{ids(3)}',NULL); INSERT INTO ordens_servico VALUES('{ids(11)}','{A}','{ids(1)}'),('{ids(12)}','{B}','{ids(2)}'),('{ids(13)}','{A}','{ids(2)}'),('{ids(14)}',NULL,'{ids(1)}'),('{ids(15)}','{A}','{ids(3)}'); INSERT INTO ordens_servico_onfarm VALUES('{ids(21)}','{ids(1)}'),('{ids(22)}','{ids(2)}');")
  fixtures=[(101,A,11,None),(102,B,12,None),(103,None,11,None),(104,A,12,None),(105,A,13,None),(106,A,14,None),(107,A,15,None),(108,A,None,21),(109,A,None,22),(110,A,11,22),(111,A,999,None),(112,A,None,999),(113,A,None,None),(114,A,11,21)]
  for n,org,osid,onid in fixtures:
   val=lambda x:'NULL' if x is None else "'"+ids(x)+"'"
   run(sql=f"INSERT INTO aplicacoes VALUES('{ids(n)}',{'NULL' if org is None else repr(org)},{val(osid)},{val(onid)});")
  assert run(sql=read(ids(999))).strip().endswith('t');passed+=1
  run(file=HERE/'candidate.sql.review');installed=snap();run(file=HERE/'postflight.sql.review');passed+=1
  for n,org,osid,onid in fixtures:
   want=n in (101,108,113,114)
   assert run(sql=read(ids(n))).strip().endswith('t' if want else 'f'),n;passed+=1
  for n in (999,): assert run(sql=read(ids(n))).strip().endswith('f');passed+=1
  assert run(sql=actor()+"SELECT public.can_user_access_aplicacao(NULL);").strip().endswith('f');passed+=1
  assert run(sql=actor()+"SELECT count(*) FROM aplicacoes;").strip().endswith('4');passed+=1
  for role in ['administrador','gestor','administrativo','consultor_tecnico','tecnico_agronomo','aplicador','producao','operador_onfarm','financeiro']:
   run(sql=f"UPDATE user_roles SET role='{role}';")
   assert run(sql=read(ids(101))).strip().endswith('t'),role;passed+=1
   assert run(sql=read(ids(102))).strip().endswith('f'),role;passed+=1
  run(sql=f"UPDATE user_roles SET role='cliente_produtor'; INSERT INTO user_clientes(user_id,cliente_id) VALUES('{U}','{ids(1)}');")
  for n in (101,108,114): assert run(sql=read(ids(n))).strip().endswith('t');passed+=1
  run(sql="UPDATE user_clientes SET revoked_at=now();")
  assert run(sql=read(ids(101))).strip().endswith('f');passed+=1
  run(sql="UPDATE user_clientes SET revoked_at=NULL,valid_until=now()-interval '1 minute';")
  assert run(sql=read(ids(101))).strip().endswith('f');passed+=1
  run(sql="UPDATE user_clientes SET valid_until=NULL,valid_from=now()+interval '1 minute';")
  assert run(sql=read(ids(101))).strip().endswith('f');passed+=1
  run(sql="UPDATE user_clientes SET valid_from=NULL,revoked_at=now(); UPDATE user_roles SET role='financeiro';")
  for mutation,undo in [("UPDATE profiles SET ativo=false","UPDATE profiles SET ativo=true"),("UPDATE profiles SET senha_provisoria=true","UPDATE profiles SET senha_provisoria=false"),("UPDATE profiles SET organization_id=NULL",f"UPDATE profiles SET organization_id='{A}'"),(f"UPDATE organizations SET ativo=false WHERE id='{A}'",f"UPDATE organizations SET ativo=true WHERE id='{A}'"),("DELETE FROM user_roles",f"INSERT INTO user_roles VALUES('{U}','financeiro')")]:
   run(sql=mutation);assert run(sql=read(ids(101))).strip().endswith('f'),mutation;passed+=1;run(sql=undo);assert run(sql=read(ids(101))).strip().endswith('t'),undo;passed+=1
  run(sql=f"INSERT INTO platform_org_admin_invites VALUES('{U}','processing',NULL);")
  assert run(sql=read(ids(101))).strip().endswith('f');passed+=1
  run(sql="UPDATE platform_org_admin_invites SET access_operation_status='done',access_valid_after=now()-interval '1 minute';")
  assert run(sql=actor(iat='0')+f"SELECT public.can_user_access_aplicacao('{ids(101)}');").strip().endswith('f');passed+=1
  assert run(sql=read(ids(101))).strip().endswith('t');passed+=1
  assert run(sql="SELECT set_config('request.jwt.claims','{}',false); SET ROLE authenticated; SELECT public.can_user_access_aplicacao('"+ids(101)+"');").strip().endswith('f');passed+=1
  run(sql="SET ROLE anon; SELECT public.can_user_access_aplicacao(NULL);",ok=False);passed+=1
  run(sql=actor()+"SELECT public.rpc_salvar_aplicacao_v1(NULL,'{}');",ok=False);passed+=1
  run(file=HERE/'candidate.sql.review',ok=False);assert snap()==installed;passed+=1
  # Refused rollback before apply, drift ACL, dependency hash and post-check failures are atomic.
  run(sql="GRANT EXECUTE ON FUNCTION public.can_user_access_aplicacao(uuid) TO anon;");drift=snap();run(file=HERE/'rollback.sql.review',ok=False);assert snap()==drift;passed+=1
  run(sql="REVOKE EXECUTE ON FUNCTION public.can_user_access_aplicacao(uuid) FROM anon;");assert snap()==installed
  run(file=HERE/'rollback.sql.review');assert snap()==baseline;passed+=1
  run(file=HERE/'rollback.sql.review',ok=False);assert snap()==baseline;passed+=1
  run(sql="ALTER FUNCTION public.h15_actor_organization() VOLATILE;");drift=snap();run(file=HERE/'candidate.sql.review',ok=False);assert snap()==drift;passed+=1
  run(sql="ALTER FUNCTION public.h15_actor_organization() STABLE;");assert snap()==baseline
  original=(HERE/'candidate.sql.review').read_text();bad=t/'bad.sql';bad.write_text(original.replace('-- POSTCHECK','DO $$BEGIN RAISE EXCEPTION \'forced_post_failure\'; END$$;\n-- POSTCHECK'))
  run(file=bad,ok=False);assert snap()==baseline;passed+=1
  run(file=HERE/'candidate.sql.review');run(file=HERE/'rollback.sql.review');assert snap()==baseline;passed+=1
  print(json.dumps({'passed':passed,'failed':0,'postgres':'17 local unix socket','limitations':'reduced schema/policy; auth claims emulators, not JWT/login/hosted','temporary_log':str(t/'server.log')},indent=2))
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'stop','-m','immediate'],capture_output=True)
if __name__=='__main__': main()