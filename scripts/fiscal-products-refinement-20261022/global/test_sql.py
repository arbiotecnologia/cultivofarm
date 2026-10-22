"""Actual review bodies + RLS on disposable PG; synthetic Auth, never JWT proof."""
from pathlib import Path
import os,tempfile,subprocess,shutil,concurrent.futures
H=Path(__file__).resolve().parent
root=Path(tempfile.mkdtemp(prefix='global-fiscal-',dir='/tmp'));root.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base=['psql','-X','-h',str(root),'-p','55491','-U','postgres','-qAt','-v','ON_ERROR_STOP=1'];checks=[]
def run(s):
 r=subprocess.run(base,input=s,text=True,capture_output=True);assert r.returncode==0,r.stderr;return r.stdout.strip()
def deny(s,code):
 r=subprocess.run(base,input=s,text=True,capture_output=True);assert r.returncode!=0 and code in r.stderr,r.stderr;checks.append(code)
def check(s,want='t'):
 assert run(s)==want,s;checks.append(s)
def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
def actor(n):return f"SELECT set_config('request.jwt.claim.sub','{uid(n)}',false); SET ROLE authenticated;"
try:
 subprocess.run(prefix+['initdb','-D',str(root/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'-l',str(root/'log'),'-o',f'-k {root} -h "" -p 55491','start'],check=True,capture_output=True)
 run("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA cf_user_guards_v1;
 CREATE TYPE app_role AS ENUM('superadmin','administrador','gestor','financeiro','parceiro_b2b','parceiro_b2b_tecnico');
 CREATE TABLE profiles(user_id uuid,ativo boolean,senha_provisoria boolean);
 CREATE TABLE user_roles(user_id uuid,role app_role);
 CREATE TABLE platform_org_admin_invites(user_id uuid,processing boolean);
 CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY,revision bigint NOT NULL); INSERT INTO cf_user_guards_v1.state VALUES(true,0);
 CREATE TABLE user_clientes(user_id uuid); CREATE TABLE partner_users(user_id uuid); CREATE TABLE auth.users(id uuid);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=$1 AND ativo AND senha_provisoria IS FALSE) AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites WHERE user_id=$1 AND processing)$$;
 CREATE FUNCTION platform_private.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2)$$;
 CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT platform_private.has_role($1,'superadmin')$$;
 CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2)$$;
 CREATE TABLE produtos(id uuid PRIMARY KEY,nome text,codigo text,ativo boolean,b2b_enabled boolean);
 GRANT SELECT ON produtos TO authenticated; ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
 CREATE POLICY produtos_select_internal ON produtos FOR SELECT TO authenticated USING(platform_private.has_role((SELECT auth.uid()),'administrador') OR platform_private.has_role((SELECT auth.uid()),'gestor') OR platform_private.has_role((SELECT auth.uid()),'financeiro'));
 CREATE POLICY produtos_b2b_read ON produtos FOR SELECT TO authenticated USING((platform_private.has_role((SELECT auth.uid()),'parceiro_b2b') OR platform_private.has_role((SELECT auth.uid()),'parceiro_b2b_tecnico')) AND ativo=true AND COALESCE(b2b_enabled,false)=true);
 INSERT INTO produtos VALUES('00000000-0000-4000-8000-000000000090','INS-4 sintético','INS-4',false,false),('00000000-0000-4000-8000-000000000092','B2B sintético','B2B-1',true,true);
 CREATE FUNCTION public._fiscal_rtc_assert_payload(jsonb,text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF jsonb_typeof($1)<>'object' THEN RAISE EXCEPTION 'INVALID'; END IF; END$$;
 CREATE TABLE product_fiscal_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid,is_active boolean DEFAULT true,updated_at timestamptz DEFAULT now(),ibs_cbs_configuration jsonb DEFAULT '{}');
 GRANT SELECT,INSERT,UPDATE,DELETE ON product_fiscal_profiles TO authenticated;
 ALTER TABLE product_fiscal_profiles ENABLE ROW LEVEL SECURITY;
 CREATE UNIQUE INDEX ux_product_fiscal_profiles_active ON product_fiscal_profiles(product_id) WHERE is_active=true;
 CREATE POLICY product_fiscal_profiles_read ON product_fiscal_profiles FOR SELECT TO authenticated USING(false);
 CREATE POLICY product_fiscal_profiles_insert ON product_fiscal_profiles FOR INSERT TO authenticated WITH CHECK(false);
 CREATE POLICY product_fiscal_profiles_update ON product_fiscal_profiles FOR UPDATE TO authenticated USING(false);
 CREATE POLICY product_fiscal_profiles_delete ON product_fiscal_profiles FOR DELETE TO authenticated USING(false);
 GRANT USAGE ON SCHEMA auth,platform_private TO authenticated;
 CREATE TABLE fiscal_test_audit(profile_id uuid,old_token timestamptz,new_token timestamptz);
 CREATE FUNCTION fiscal_test_audit_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN INSERT INTO public.fiscal_test_audit VALUES(NEW.id,OLD.updated_at,NEW.updated_at); RETURN NEW; END$$;
 CREATE TRIGGER fiscal_test_audit_after AFTER UPDATE ON product_fiscal_profiles FOR EACH ROW EXECUTE FUNCTION fiscal_test_audit_after();
 """)
 run((H/'live-acquire-gate.sql.review').read_text()+';')
 check("SELECT md5(pg_get_functiondef('cf_user_guards_v1.acquire_gate()'::regprocedure))='b0dd9a14d5fd799a40df0975baf4c5a6';")
 run("CREATE TRIGGER a00_user_roles_gate BEFORE INSERT OR UPDATE OR DELETE ON user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();")
 # Defect 1 (auditor): reusing acquire_gate on product_fiscal_profiles always fails.
 run("CREATE TRIGGER defect_gate BEFORE INSERT OR UPDATE ON product_fiscal_profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();")
 deny(f"INSERT INTO product_fiscal_profiles(product_id) VALUES('{uid(93)}');",'invalid_user_guard_context')
 run("DROP TRIGGER defect_gate ON product_fiscal_profiles;")
 # Reproduce the live defect before installing the candidate: AFTER-only audit
 # does not advance the token; two stale-token direct updates both succeed.
 baseline_product=uid(91)
 run(f"INSERT INTO product_fiscal_profiles(product_id) VALUES('{baseline_product}');")
 baseline_token=run(f"SELECT updated_at::text FROM product_fiscal_profiles WHERE product_id='{baseline_product}';")
 direct_baseline=f"WITH changed AS (UPDATE product_fiscal_profiles SET ibs_cbs_configuration='{{}}' WHERE product_id='{baseline_product}' AND updated_at='{baseline_token}'::timestamptz RETURNING id) SELECT count(*) FROM changed;"
 check(direct_baseline,'1');check(direct_baseline,'1')
 run(f"DELETE FROM product_fiscal_profiles WHERE product_id='{baseline_product}'; DELETE FROM fiscal_test_audit;")
 run(f"INSERT INTO profiles VALUES('{uid(1)}',true,false); INSERT INTO user_roles VALUES('{uid(1)}','superadmin');")
 assert run(actor(1)+"SELECT count(*) FROM produtos;").splitlines()[-1]=='0';checks.append('defect2: Superadmin empty produtos before candidate')
 run(f"DELETE FROM profiles; DELETE FROM user_roles;")
 candidate=(H/'migration.sql.review').read_text()
 deny(candidate,'does not exist')
 # Reduced harness cannot satisfy canonical guard: exact implementation block only.
 run('ROLLBACK;BEGIN;'+candidate[candidate.index('LOCK TABLE'):])
 for n,role in enumerate(['superadmin','administrador','gestor','financeiro','parceiro_b2b','parceiro_b2b_tecnico'],1):
  run(f"INSERT INTO profiles VALUES('{uid(n)}',true,false); INSERT INTO user_roles VALUES('{uid(n)}','{role}');")
 check("SELECT md5(pg_get_functiondef('cf_user_guards_v1.acquire_gate()'::regprocedure))='b0dd9a14d5fd799a40df0975baf4c5a6' AND position('product_fiscal' IN pg_get_functiondef('cf_user_guards_v1.acquire_gate()'::regprocedure))=0;")
 check("SELECT tgfoid='platform_private.global_product_fiscal_statement_gate()'::regprocedure FROM pg_trigger WHERE tgname='a00_global_product_fiscal_gate';")
 deny("CREATE TRIGGER misuse BEFORE INSERT ON produtos FOR EACH STATEMENT EXECUTE FUNCTION platform_private.global_product_fiscal_statement_gate(); INSERT INTO produtos VALUES(gen_random_uuid(),'x','x',true,true);",'invalid_fiscal_guard_context')
 for n,want in [(1,'2'),(2,'2'),(5,'1')]:
  assert run(actor(n)+"SELECT count(*) FROM produtos;").splitlines()[-1]==want,(n,want);checks.append(f'produtos visibility actor{n}={want}')
 assert run("GRANT USAGE ON SCHEMA auth,platform_private TO anon; SET ROLE anon; SELECT count(*) FROM produtos;").splitlines()[-1]=="0";checks.append("anon produtos hidden")
 rev0=run('SELECT revision FROM cf_user_guards_v1.state;')
 p=uid(90); insert=f"INSERT INTO product_fiscal_profiles(product_id) VALUES('{p}');"
 run(actor(1)+insert)
 assert run(actor(1)+f"SELECT count(*) FROM produtos pr JOIN product_fiscal_profiles f ON f.product_id=pr.id AND f.is_active WHERE pr.id='{p}';").splitlines()[-1]=='1';checks.append('Superadmin editor list join visible')
 check(f"SELECT revision={rev0} FROM cf_user_guards_v1.state;")
 import threading,time
 def holder():
  run(f"BEGIN; INSERT INTO user_roles VALUES('{uid(77)}','gestor'); SELECT pg_sleep(2); ROLLBACK;")
 t=threading.Thread(target=holder);t.start();time.sleep(0.6)
 deny(actor(1)+f"SET lock_timeout='300ms'; UPDATE product_fiscal_profiles SET ibs_cbs_configuration='{{}}' WHERE product_id='{p}' AND is_active;",'lock timeout')
 t.join()
 for n in [2,3,4]:
  assert run(actor(n)+"SELECT count(*) FROM product_fiscal_profiles;").splitlines()[-1]=='1';checks.append('internal read')
  deny(actor(n)+insert,'FISCAL_FORBIDDEN')
  deny(actor(n)+f"SELECT rpc_fiscal_product_ibs_cbs_save('{p}','{{}}','x');",'FISCAL_FORBIDDEN')
 for n in [5,6]:
  assert run(actor(n)+"SELECT count(*) FROM product_fiscal_profiles;").splitlines()[-1]=='0';checks.append('external hidden')
  deny(actor(n)+insert,'FISCAL_FORBIDDEN')
 run(f"UPDATE profiles SET ativo=false WHERE user_id='{uid(1)}';")
 deny(actor(1)+insert,'FISCAL_FORBIDDEN')
 assert run(actor(1)+"SELECT count(*) FROM produtos;").splitlines()[-1]=='0';checks.append('inactive Superadmin produtos hidden')
 run(f"UPDATE profiles SET ativo=true,senha_provisoria=true WHERE user_id='{uid(1)}';")
 deny(actor(1)+insert,'FISCAL_FORBIDDEN')
 run(f"UPDATE profiles SET senha_provisoria=false WHERE user_id='{uid(1)}'; INSERT INTO platform_org_admin_invites VALUES('{uid(1)}',true);")
 deny(actor(1)+insert,'FISCAL_FORBIDDEN');run('DELETE FROM platform_org_admin_invites;')
 deny(actor(1)+insert,'duplicate key')
 run(actor(1)+f"INSERT INTO product_fiscal_profiles(product_id,is_active) VALUES('{p}',false);")
 assert run(actor(1)+f"SELECT rpc_fiscal_product_ibs_cbs_get('{p}')->>'exists';").splitlines()[-1]=='true';checks.append('active history read')
 deny(actor(1)+f"UPDATE product_fiscal_profiles SET ibs_cbs_configuration='{{}}' WHERE product_id='{p}' AND NOT is_active;",'FISCAL_HISTORY_IMMUTABLE')
 # Actual PostgreSQL connections, same direct UPDATE shape as the editor,
 # no timestamp in SET. Zero rows is the editor's OptimisticConflictError.
 editor_token=run(f"SELECT updated_at::text FROM product_fiscal_profiles WHERE product_id='{p}' AND is_active;")
 direct=f"WITH changed AS (UPDATE product_fiscal_profiles SET ibs_cbs_configuration='{{}}' WHERE product_id='{p}' AND is_active AND updated_at='{editor_token}'::timestamptz RETURNING id) SELECT count(*) FROM changed;"
 def editor_writer(_):return run(actor(1)+direct).splitlines()[-1]
 with concurrent.futures.ThreadPoolExecutor(2) as pool:outcomes=list(pool.map(editor_writer,[1,2]))
 assert sorted(outcomes)==['0','1'],outcomes;checks.append('editor concurrent same token: one success, one zero-row conflict')
 assert run(actor(1)+direct).splitlines()[-1]=='0';checks.append('sequential stale editor token conflicts')
 check(f"SELECT updated_at>'{editor_token}'::timestamptz FROM product_fiscal_profiles WHERE product_id='{p}' AND is_active;")
 check('SELECT count(*)=1 AND bool_and(new_token>old_token) FROM fiscal_test_audit;')
 # Aborted write rolls back both the server token and the AFTER audit.
 before_rollback=run(f"SELECT updated_at::text FROM product_fiscal_profiles WHERE product_id='{p}' AND is_active;")
 run(actor(1)+f"BEGIN; UPDATE product_fiscal_profiles SET ibs_cbs_configuration='{{}}' WHERE product_id='{p}' AND is_active AND updated_at='{before_rollback}'::timestamptz; ROLLBACK;")
 check(f"SELECT updated_at='{before_rollback}'::timestamptz FROM product_fiscal_profiles WHERE product_id='{p}' AND is_active;")
 check('SELECT count(*)=1 FROM fiscal_test_audit;')
 old=run(f"SELECT updated_at::text FROM product_fiscal_profiles WHERE product_id='{p}' AND is_active;")
 def race(_):
  r=subprocess.run(base,input=actor(1)+f"SELECT rpc_fiscal_product_ibs_cbs_save('{p}','{{}}','{old}');",text=True,capture_output=True);return r.returncode,r.stderr
 with concurrent.futures.ThreadPoolExecutor(2) as pool:r=list(pool.map(race,[1,2]))
 assert sum(x[0]==0 for x in r)==1 and any('FISCAL_CONFLICT' in x[1] for x in r),r;checks.append('concurrent exact CAS')
 check(f"SELECT updated_at>'{old}'::timestamptz FROM product_fiscal_profiles WHERE product_id='{p}' AND is_active;")
 deny(actor(1)+f"SELECT rpc_fiscal_product_ibs_cbs_save('{p}','{{}}',NULL);",'FISCAL_CONFLICT')
 run((H/'rollback.sql.review').read_text())
 deny(actor(1)+insert,'row-level security')
 assert run(actor(1)+"SELECT count(*) FROM produtos;").splitlines()[-1]=='0';checks.append('rollback closes Superadmin produtos read')
 assert run(actor(2)+"SELECT count(*) FROM produtos;").splitlines()[-1]=='2';checks.append('rollback preserves internal produtos read')
 check("SELECT NOT has_function_privilege('authenticated','platform_private.global_product_fiscal_ibs_save(uuid,jsonb,text)','EXECUTE');")
 check('SELECT count(*)=2 FROM product_fiscal_profiles;')
 print(f'PASS {len(checks)} SQL/RLS/CAS/rollback checks; synthetic Auth and reduced schema only')
finally:
 subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(root)
