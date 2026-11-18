"""Offline PG: captured fresh actor, synthetic dependencies/identity/schema/policies. Not hosted."""
import os,subprocess,tempfile,shutil,json,hashlib
from pathlib import Path
from assemble import assemble
H=Path(__file__).resolve().parent
os.environ['PATH']=str(Path(shutil.which('initdb')).resolve().parent)+os.pathsep+os.environ['PATH']
t=Path(tempfile.mkdtemp(prefix='product-sources-'));t.chmod(0o777);port=str(55000+os.getpid()%900)
priv=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
results=[]
def sql(s,error=None):
 r=subprocess.run(['psql','-X','-qAt','-h',str(t),'-p',port,'-U','postgres','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True)
 if error:assert r.returncode and error in r.stderr,r.stderr
 else:assert r.returncode==0,r.stderr
 return r.stdout.strip()
def check(name,s,value=None,error=None):
 r=sql(s,error)
 if value is not None:assert r==value,(name,r,value)
 results.append(name)
def actor(s,n='a',role='authenticated'):
 uid={'a':'00000000-0000-4000-8000-000000000001','b':'00000000-0000-4000-8000-000000000002','reader':'00000000-0000-4000-8000-000000000003'}.get(n,'')
 return f"SET ROLE {role}; SET test.uid='{uid}'; SET request.jwt.claims='{{\"role\":\"{role}\",\"sub\":\"{uid}\",\"exp\":9999999999}}';"+s
A='00000000-0000-4000-8000-000000000011';B='00000000-0000-4000-8000-000000000012';P='00000000-0000-4000-8000-000000000021'
try:
 subprocess.run(priv+['initdb','-D',str(t/'data'),'-U','postgres','-A','trust'],check=True,capture_output=True)
 subprocess.run(priv+['pg_ctl','-D',str(t/'data'),'-o',f'-k {t} -h "" -p {port}','-l',str(t/'log'),'-w','start'],check=True,capture_output=True)
 sql(f"""CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA platform_private;
 CREATE TYPE app_role AS ENUM ('administrador','gestor');
 CREATE TABLE organizations(id uuid PRIMARY KEY,ativo boolean,status text);INSERT INTO organizations VALUES('{A}',true,'ativa'),('{B}',true,'ativa');
 CREATE TABLE platform_private.members(id uuid PRIMARY KEY,org uuid,feature boolean,active boolean,reader boolean);
 INSERT INTO platform_private.members VALUES('00000000-0000-4000-8000-000000000001','{A}',true,true,true),('00000000-0000-4000-8000-000000000002','{B}',true,true,true),('00000000-0000-4000-8000-000000000003','{A}',true,true,true);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$SELECT org FROM platform_private.members WHERE id=auth.uid() AND active$$;
 CREATE FUNCTION is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION _saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT feature FROM platform_private.members WHERE id=$1$$;
 CREATE FUNCTION platform_private.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE FUNCTION can_view_catalog_internal(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT reader FROM platform_private.members WHERE id=$1$$;
 CREATE TABLE produtos(id uuid PRIMARY KEY,owner_organization_id uuid);INSERT INTO produtos VALUES('{P}','{A}'),('00000000-0000-4000-8000-000000000022',NULL);
 CREATE TABLE catalog_technical_sources(id int PRIMARY KEY,entidade_tipo text,entidade_id uuid,fonte_titulo text);
 INSERT INTO catalog_technical_sources VALUES(1,'produto','{P}','Product A'),(2,'microrganismo','{P}','Micro historical'),(3,'global','{P}','Global historical'),(4,'produto','00000000-0000-4000-8000-000000000022','Unowned'),(5,'produto','00000000-0000-4000-8000-000000000099','Orphan');
 ALTER TABLE catalog_technical_sources ENABLE ROW LEVEL SECURITY;ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;
 GRANT SELECT,INSERT,UPDATE,DELETE ON catalog_technical_sources TO authenticated,anon;
 CREATE POLICY legacy_role_only ON catalog_technical_sources TO authenticated,anon USING (true) WITH CHECK (true);
 """)
 captured=H.parent/'b2b-solid-packaging-order-20261106/captured/solid-pack/platform_private.recorte_a_actor_fresh.0cb006c4.live-20261106.sql'
 sql(captured.read_text()+';REVOKE ALL ON FUNCTION platform_private.recorte_a_actor_fresh(text) FROM PUBLIC,authenticated,anon,service_role;')
 check('reproduces B role-only product leak',actor("SELECT id FROM catalog_technical_sources WHERE id=1",'b'),'1')
 query=(H/'catalog.sql.review').read_text();pre=json.loads(sql(query))
 sql((H/'delta.sql.review').read_text());post=json.loads(sql(query))
 fresh=next(f['body'] for f in pre['functions'] if 'recorte_a_actor_fresh' in f['signature'])
 artifact=assemble(pre,post,fresh)
 # Restore PRE only in disposable cluster to execute exact assembled transaction.
 sql('DROP POLICY product_sources_scope_select_v1 ON catalog_technical_sources;DROP POLICY product_sources_direct_insert_closed_v1 ON catalog_technical_sources;DROP POLICY product_sources_direct_update_closed_v1 ON catalog_technical_sources;DROP POLICY product_sources_direct_delete_closed_v1 ON catalog_technical_sources;DROP FUNCTION product_source_scope_read_v1(uuid);')
 # Helper/policy OIDs are intentionally absent from POST snapshot; table/authority OIDs remain exact.
 sql(artifact)
 check('A product select',actor('SELECT id FROM catalog_technical_sources WHERE id=1'),'1')
 check('reader A select',actor('SELECT id FROM catalog_technical_sources WHERE id=1','reader'),'1')
 check('B product invisible',actor('SELECT id FROM catalog_technical_sources WHERE id=1','b'),'')
 check('anon product invisible',actor('SELECT id FROM catalog_technical_sources WHERE id=1','none','anon'),'')
 for who,role in [('a','authenticated'),('b','authenticated'),('none','anon')]:
  check(who+' nonproduct unchanged',actor("SELECT string_agg(id::text,',' ORDER BY id) FROM catalog_technical_sources WHERE entidade_tipo<>'produto'",who,role),'2,3')
  check(who+' product insert denied',actor(f"INSERT INTO catalog_technical_sources VALUES(8,'produto','{P}','X')",who,role),error='row-level security')
  check(who+' product update invisible',actor("WITH x AS (UPDATE catalog_technical_sources SET fonte_titulo='X' WHERE id=1 RETURNING id) SELECT count(*) FROM x",who,role),'0')
  check(who+' product delete invisible',actor('WITH x AS (DELETE FROM catalog_technical_sources WHERE id=1 RETURNING id) SELECT count(*) FROM x',who,role),'0')
  check(who+' nonproduct to product denied',actor(f"UPDATE catalog_technical_sources SET entidade_tipo='produto',entidade_id='{P}' WHERE id=2",who,role),error='row-level security')
 check('unowned and orphan closed',actor('SELECT count(*) FROM catalog_technical_sources WHERE id IN(4,5)'),'0')
 sql("UPDATE platform_private.members SET feature=false WHERE id='00000000-0000-4000-8000-000000000001'")
 check('feature revoked product hidden',actor('SELECT id FROM catalog_technical_sources WHERE id=1'),'')
 check('feature revoked nonproduct preserved',actor('SELECT id FROM catalog_technical_sources WHERE id=2'),'2')
 sql("UPDATE platform_private.members SET feature=true,active=false WHERE id='00000000-0000-4000-8000-000000000001'")
 check('inactive actor denied',actor('SELECT id FROM catalog_technical_sources WHERE id=1'),'')
 sql("UPDATE platform_private.members SET active=true,reader=false WHERE id='00000000-0000-4000-8000-000000000001'")
 check('role revoked hidden',actor('SELECT id FROM catalog_technical_sources WHERE id=1'),'')
 sql("UPDATE platform_private.members SET reader=true WHERE id='00000000-0000-4000-8000-000000000001'")
 check('postgres canonical writer retained',f"UPDATE catalog_technical_sources SET fonte_titulo='canonical' WHERE id=1;SELECT fonte_titulo FROM catalog_technical_sources WHERE id=1",'canonical')
 check('nonproduct direct write preserved',actor("UPDATE catalog_technical_sources SET fonte_titulo='legacy' WHERE id=2;SELECT fonte_titulo FROM catalog_technical_sources WHERE id=2"),'legacy')
 check('product preserved after blocked DML','SELECT count(*) FROM catalog_technical_sources WHERE id=1','1')
 check('no client destructive privilege grant',"SELECT has_table_privilege('authenticated','catalog_technical_sources','TRUNCATE')",'f')
 check('caller cannot execute private fresh authority',actor("SELECT platform_private.recorte_a_actor_fresh('read_catalog')"),error='permission denied')
 check('forged claims do not authorize anon',"SET ROLE anon;SET test.uid='00000000-0000-4000-8000-000000000001';SET request.jwt.claims='{\"role\":\"anon\",\"sub\":\"00000000-0000-4000-8000-000000000001\",\"exp\":9999999999}';SELECT id FROM catalog_technical_sources WHERE id=1",'')
 check('expired claims denied',"SET ROLE authenticated;SET test.uid='00000000-0000-4000-8000-000000000001';SET request.jwt.claims='{\"role\":\"authenticated\",\"sub\":\"00000000-0000-4000-8000-000000000001\",\"exp\":1}';SELECT id FROM catalog_technical_sources WHERE id=1",'')
 # More permissive policies and column grants cannot bypass a restrictive product fence.
 sql('CREATE POLICY extra_permissive ON catalog_technical_sources TO authenticated USING(true) WITH CHECK(true);GRANT UPDATE(fonte_titulo,entidade_tipo) ON catalog_technical_sources TO authenticated;')
 check('extra permissive still B invisible',actor('SELECT id FROM catalog_technical_sources WHERE id=1','b'),'')
 check('column update still denied',actor("WITH x AS(UPDATE catalog_technical_sources SET fonte_titulo='bypass' WHERE id=1 RETURNING id)SELECT count(*) FROM x"),'0')
 sql('DROP POLICY extra_permissive ON catalog_technical_sources;REVOKE UPDATE(fonte_titulo,entidade_tipo) ON catalog_technical_sources FROM authenticated;')
 # Query waits on the source table; post-wait fresh authority must see revocation.
 conn=['psql','-X','-qAt','-h',str(t),'-p',port,'-U','postgres','-v','ON_ERROR_STOP=1']
 blocker=subprocess.Popen(conn,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 blocker.stdin.write("BEGIN;LOCK TABLE catalog_technical_sources IN ACCESS EXCLUSIVE MODE;SELECT 'LOCKED';\n");blocker.stdin.flush()
 assert blocker.stdout.readline().strip()=='LOCKED'
 waiting=subprocess.Popen(conn,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 waiting.stdin.write(actor('SELECT id FROM catalog_technical_sources WHERE id=1')+'\n');waiting.stdin.close()
 import time
 for _ in range(100):
  if sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%SELECT id FROM catalog_technical_sources WHERE id=1%'")!='0':break
  time.sleep(.02)
 else:raise AssertionError('reader did not wait')
 sql("UPDATE platform_private.members SET feature=false WHERE id='00000000-0000-4000-8000-000000000001'")
 blocker.stdin.write('COMMIT;\n');blocker.stdin.close();blocker.wait(timeout=5);waiting.wait(timeout=5)
 assert waiting.returncode==0 and waiting.stdout.read().strip()=='',waiting.stderr.read()
 results.append('post-table-wait feature revocation denies SELECT')
 sql("UPDATE platform_private.members SET feature=true WHERE id='00000000-0000-4000-8000-000000000001'")
 check('assembly refuses rerun',artifact,error='PRE_catalog_drift')
 check('rollback deny-only reader closed',"CREATE OR REPLACE FUNCTION public.product_source_scope_read_v1(p_product uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT false$$;")
 check('rollback product invisible',actor('SELECT id FROM catalog_technical_sources WHERE id=1'),'')
 check('rollback nonproduct retained',actor('SELECT id FROM catalog_technical_sources WHERE id=2'),'2')
 (H/'result.json').write_text(json.dumps({'exit_code':0,'checks':results,'count':len(results),'captured_fresh_file_sha256':hashlib.sha256(captured.read_bytes()).hexdigest(),'limits':'synthetic identity/schema/legacy policies/dependencies; no hosted JWT/Realtime proof; PRE/POST local synthetic only'},indent=2)+'\n')
 print(json.dumps({'exit_code':0,'checks':len(results),'limits':'disposable synthetic only'}))
finally:
 subprocess.run(priv+['pg_ctl','-D',str(t/'data'),'-m','immediate','-w','stop'],capture_output=True)
 shutil.rmtree(t)