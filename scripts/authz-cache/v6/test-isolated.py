"""Disposable PostgreSQL: row revision/real captured guards + Storage operation.
No hosted IO. Reduced entity tables; NOT full writer/RLS/Storage HTTP proof.
No guard body is replaced; Auth identity transport uses local fixture setting.
"""
from pathlib import Path
import os, subprocess, tempfile, time
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
tmp=Path(tempfile.mkdtemp(prefix='authz-v6-',dir='/tmp'));tmp.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base=['psql','-X','-h',str(tmp),'-p','55497','-U','postgres','-qAt','-v','ON_ERROR_STOP=1']
count=0
def run(sql, failure=None):
 r=subprocess.run(base,input=sql,text=True,capture_output=True)
 if failure:
  assert r.returncode and failure in r.stderr,r.stderr
 else: assert r.returncode==0,r.stderr
 return r.stdout.strip()
def check(sql, expected='t'):
 global count
 assert run(sql)==expected,sql
 count+=1
try:
 subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55497','start'],check=True,capture_output=True)
 run('''CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE ROLE authenticator; GRANT authenticated TO authenticator;
 CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA cf_user_guards_v1;
 CREATE SCHEMA storage;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('fixture.actor',true),'')::uuid $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE TABLE profiles(user_id uuid PRIMARY KEY,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE TABLE user_roles(user_id uuid,role text);
 CREATE TABLE user_clientes(user_id uuid,cliente_id uuid,principal boolean,valid_from timestamptz NOT NULL DEFAULT now());
 CREATE UNIQUE INDEX uq_user_clientes_principal ON user_clientes(user_id) WHERE principal;
 CREATE TABLE partner_users(user_id uuid,partner_id uuid,papel text);
 CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY,revision bigint);
 INSERT INTO cf_user_guards_v1.state VALUES(true,0);
 CREATE TABLE platform_private.authz_tickets(txid bigint,scope text,target uuid,PRIMARY KEY(txid,scope,target));
 CREATE TABLE organizations(id uuid PRIMARY KEY,status text,nome text,razao_social text,nome_fantasia text,
 cnpj text,cnpj_normalizado text,email_corporativo text,fuso_horario text,onboarding_dados jsonb,
 onboarding_concluido_em timestamptz,ativada_em timestamptz);
 GRANT USAGE ON SCHEMA auth,public,storage TO authenticated,anon;
 GRANT SELECT,UPDATE ON organizations TO authenticated;
 ''')
 for table in ['clientes','partner_accounts','organization_subscriptions','organization_feature_overrides',
               'saas_plan_versions','saas_plan_version_features','saas_features','saas_modules']:
  run(f'CREATE TABLE {table}(id uuid PRIMARY KEY,value text);')
 run((HERE/'live-guards.sql.review').read_text())
 for table in ['profiles','user_roles','user_clientes','partner_users']:
  run(f'CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR UPDATE OR DELETE ON {table} FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();')
 for table in ['user_roles','user_clientes','partner_users']:
  run(f'CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();')
 run('CREATE TRIGGER z99_cf_profile_stamp BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.advance_stamp();')
 run('CREATE TRIGGER trg_organizations_guard_status BEFORE INSERT OR UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION organizations_guard_status();')
 run((HERE/'row-revision.sql.review').read_text())
 A='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222'
 run(f"INSERT INTO organizations(id,status) VALUES('{A}','ativa'),('{B}','ativa');INSERT INTO profiles(user_id) VALUES('{A}'),('{B}');")
 b=run(f"SELECT authz_incarnation||':'||authz_revision FROM organizations WHERE id='{B}'")
 gate=run('SELECT revision FROM cf_user_guards_v1.state')
 run(f"UPDATE organizations SET status='inativa' WHERE id='{A}';UPDATE organizations SET status='ativa' WHERE id='{A}';")
 check(f"SELECT authz_revision=3 AND status='ativa' FROM organizations WHERE id='{A}'")
 check(f"SELECT (authz_incarnation||':'||authz_revision)='{b}' FROM organizations WHERE id='{B}'")
 check(f'SELECT revision={gate} FROM cf_user_guards_v1.state')
 run(f"UPDATE organizations SET status='ativa' WHERE false;")
 check(f"SELECT authz_revision=3 FROM organizations WHERE id='{A}'")
 run(f"BEGIN;UPDATE organizations SET status='inativa' WHERE id='{A}';ROLLBACK;")
 check(f"SELECT authz_revision=3 FROM organizations WHERE id='{A}'")
 incarnation=run(f"SELECT authz_incarnation FROM organizations WHERE id='{A}'")
 run(f"DELETE FROM organizations WHERE id='{A}';INSERT INTO organizations(id,status) VALUES('{A}','ativa');")
 check(f"SELECT authz_incarnation<>'{incarnation}'::uuid AND authz_revision=1 FROM organizations WHERE id='{A}'")
 run(f"UPDATE organizations SET authz_revision=0,authz_incarnation='{B}' WHERE id='{A}';")
 check(f"SELECT authz_revision=2 AND authz_incarnation<>'{B}' FROM organizations WHERE id='{A}'")
 # Real authenticator/session_user guard, no false has_ticket stub.
 run(f"SET SESSION AUTHORIZATION authenticator;SET ROLE authenticated;UPDATE organizations SET status='inativa' WHERE id='{A}';",'org_forbidden')
 count+=1
 run(f"BEGIN;SELECT platform_private.issue_ticket('org_write','{A}');SET SESSION AUTHORIZATION authenticator;SET ROLE authenticated;UPDATE organizations SET status='inativa' WHERE id='{A}';ROLLBACK;")
 count+=1
 run('TRUNCATE organizations;','authz_dependency_truncate_denied');count+=1
 # Identity ABA advances actual captured monotonic stamp/gate.
 stamp=run(f"SELECT updated_at FROM profiles WHERE user_id='{A}'")
 run(f"INSERT INTO user_roles VALUES('{A}','cliente_produtor');UPDATE user_roles SET role='administrador' WHERE user_id='{A}';UPDATE user_roles SET role='cliente_produtor' WHERE user_id='{A}';")
 check(f"SELECT updated_at>'{stamp}'::timestamptz FROM profiles WHERE user_id='{A}'")
 # Two connections: A entity write holds row, B entity and profile writes finish.
 writer=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 writer.stdin.write(f"BEGIN;UPDATE organizations SET status='ativa' WHERE id='{A}';SELECT pg_sleep(1);ROLLBACK;");writer.stdin.close()
 deadline=time.monotonic()+3
 while run("SELECT count(*)>0 FROM pg_locks WHERE relation='organizations'::regclass AND mode='RowExclusiveLock' AND granted")!='t':
  assert time.monotonic()<deadline
  time.sleep(.01)
 run(f"BEGIN;SET LOCAL lock_timeout='150ms';UPDATE organizations SET status='ativa' WHERE id='{B}';UPDATE profiles SET updated_at=updated_at WHERE user_id='{B}';ROLLBACK;")
 assert writer.wait()==0;count+=1
 # Actual captured Storage operation helpers; minimal object RLS transport.
 run((HERE/'live-storage.sql.review').read_text())
 run('''CREATE TABLE storage.objects(bucket_id text,name text,tenant text);
 GRANT USAGE ON SCHEMA storage TO service_role;
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT SELECT ON storage.objects TO authenticated,anon,service_role;
 CREATE POLICY fixture_tenant_read ON storage.objects FOR SELECT TO authenticated USING (tenant=current_setting('fixture.tenant',true));
 CREATE POLICY fixture_logo_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='logos');
 CREATE POLICY v6_operation_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated,anon
 USING(bucket_id='logos' OR storage.allow_any_operation(ARRAY['object.get_authenticated']));
 INSERT INTO storage.objects VALUES('clientes-docs','A','A'),('clientes-docs','B','B'),('logos','logo','public');
 ''')
 for operation in ['object.sign','storage.object.sign','object.sign_many','render.image_sign','', 'object.get_authenticated']:
  expected='2' if operation=='object.get_authenticated' else '1'
  check(f"SET ROLE authenticated;SET fixture.tenant='A';SET storage.operation='{operation}';SELECT count(*) FROM storage.objects;",expected)
 check("SET ROLE anon;SET storage.operation='object.get_authenticated';SELECT count(*) FROM storage.objects;",'1')
 check("SET ROLE authenticated;SET fixture.tenant='OTHER';SET storage.operation='object.get_authenticated';SELECT count(*) FROM storage.objects;",'1')
 check("SET ROLE service_role;SET storage.operation='object.sign';SELECT count(*) FROM storage.objects;",'3')
 print(f'{count} local checks PASS; actual captured guards/tickets/operation bodies, reduced tables.')
 print('BYPASSRLS observed: server-role emitters need separate patches. HTTP upload/sign NOT VERIFIED.')
finally:
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'stop','-m','fast'],capture_output=True)