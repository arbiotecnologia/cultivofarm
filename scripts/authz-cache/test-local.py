"""Candidato exato em PostgreSQL descartável. Auth/tabelas reduzidos, NÃO hosted.
Preflight usa hashes dos stubs locais, explicitamente distintos do hosted.
Volatilidade individual real v/s/s; corpos Produtor/B2B reutilizados do repo.
"""
from pathlib import Path
import subprocess, tempfile, os, re
ROOT = Path(__file__).resolve().parents[2]
tmp = Path(tempfile.mkdtemp(prefix='authz-v3-', dir='/tmp')); tmp.chmod(0o777)
prefix = ['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base = ['psql','-X','-h',str(tmp),'-p','55499','-U','postgres','-v','ON_ERROR_STOP=1','-qAt']
def run(sql):
 r = subprocess.run(base, input=sql, text=True, capture_output=True)
 if r.returncode: raise RuntimeError(r.stderr)
 if 'NOTICE:  PASS ' in r.stderr:
  print(f"{r.stderr.count('NOTICE:  PASS ')} assertions SQL executadas PASS.")
 return r.stdout.strip()
try:
 subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55499','start'],check=True,capture_output=True)
 run('''CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA platform_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
 CREATE TYPE public.app_role AS ENUM('administrador','gestor','cliente_produtor','consultor_tecnico','parceiro_b2b','parceiro_b2b_tecnico');
 CREATE TABLE profiles(user_id uuid PRIMARY KEY,ativo boolean DEFAULT true,senha_provisoria boolean DEFAULT false,organization_id uuid,updated_at timestamptz DEFAULT now());
 CREATE TABLE organizations(id uuid PRIMARY KEY,ativo boolean DEFAULT true,status text DEFAULT 'ativa',partner_account_id uuid,updated_at timestamptz DEFAULT now());
 CREATE TABLE user_roles(user_id uuid,role app_role);
 CREATE TABLE clientes(id uuid PRIMARY KEY,organization_id uuid,status_cliente text DEFAULT 'ativo');
 CREATE TABLE user_clientes(id uuid DEFAULT gen_random_uuid(),user_id uuid,cliente_id uuid,is_active boolean DEFAULT true,revoked_at timestamptz,valid_from timestamptz NOT NULL DEFAULT now(),valid_until timestamptz,principal boolean DEFAULT false);
 CREATE UNIQUE INDEX uq_user_clientes_principal ON user_clientes(user_id) WHERE principal;
 CREATE TABLE partner_accounts(id uuid PRIMARY KEY,ativo boolean DEFAULT true,deleted_at timestamptz,commercial_owner_organization_id uuid,updated_at timestamptz DEFAULT now());
 CREATE TABLE partner_users(id uuid DEFAULT gen_random_uuid(),partner_id uuid,user_id uuid,created_at timestamptz DEFAULT now(),papel text);
 CREATE TABLE fixture_entitlements(user_id uuid,feature_key text);
 CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
 CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=$1 AND ativo AND senha_provisoria=false) $$;
 CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT organization_id FROM public.profiles WHERE user_id=auth.uid() $$;
 CREATE FUNCTION public.get_cliente_ids_for_user(uuid) RETURNS uuid[] LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$ SELECT ARRAY(SELECT cliente_id FROM public.user_clientes WHERE user_id=$1 AND $1=auth.uid() AND is_active AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>=now()) ORDER BY cliente_id) $$;
 CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT feature_key FROM public.fixture_entitlements WHERE user_id=$1 $$;
 CREATE FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
 ''')
 prod=(ROOT/'scripts/rbac-audit/proposed-producer-commercial-read-closed.sql').read_text()
 run(re.search(r'CREATE FUNCTION platform_private.producer_commercial_client_scope.*?\$scope\$;',prod,re.S).group())
 b2b=(ROOT/'supabase/migrations/20261008212043_b3b02dba-c8f9-4dbb-beb4-52d77aae3f62.sql').read_text()
 run(b2b[:b2b.index('REVOKE ALL')])
 candidate=(ROOT/'scripts/authz-cache/candidate.sql.review').read_text()
 # Execute exact individual preflight contracts with fixture definition hashes.
 # Hosted hashes remain immutable in the candidate; local bodies are reduced.
 local_candidate=candidate
 for signature, hosted in [
  ('public.get_cliente_ids_for_user(uuid)','c80d5900692d960f649d0a9f7850fe2c'),
  ('platform_private.producer_commercial_client_scope(uuid)','49b8329ce232670c1560f0683b913a26'),
  ('platform_private.b2b_commercial_context()','02158d4204dea67308558f649113ba6d')]:
  local_candidate=local_candidate.replace(hosted,run(f"SELECT md5(pg_get_functiondef('{signature}'::regprocedure))"))
 run(local_candidate)
 print(run((ROOT/'scripts/authz-cache/tests.sql.review').read_text()))
 # Scoped extension (v5): reuses live-like z90/z99 stamp triggers; NO global
 # singleton in fingerprints (design rejected in review a36514db).
 run('''CREATE SCHEMA cf_user_guards_v1;
 CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY,revision bigint NOT NULL);
 INSERT INTO cf_user_guards_v1.state VALUES(true,0);
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 ''')
 captured=(ROOT/'scripts/tests/b2b-provisioning-real-triggers.sql').read_text()
 gate=re.search(r'CREATE FUNCTION cf_user_guards_v1.acquire_gate\(\).*?END \$\$;',captured,re.S).group()
 touch=re.search(r'CREATE FUNCTION cf_user_guards_v1.touch_related_profiles\(\).*?\$\$;',captured,re.S).group()
 stamp=re.search(r'CREATE FUNCTION cf_user_guards_v1.advance_stamp\(\).*?\$\$;',captured,re.S).group()
 run(gate); run(touch); run(stamp)
 for tbl in ['auth.users','public.profiles','public.user_roles','public.user_clientes','public.partner_users']:
  run(f'CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR UPDATE OR DELETE ON {tbl} FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();')
 for tbl in ['public.user_roles','public.user_clientes','public.partner_users']:
  run(f'CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR UPDATE OR DELETE ON {tbl} FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();')
 run('CREATE TRIGGER z99_cf_profile_stamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.advance_stamp();')
 run((ROOT/'scripts/authz-cache/scoped.sql.review').read_text())
 # Reuse committed producer fixture from temporal test, now restore validity.
 run('''UPDATE user_clientes SET valid_until=NULL, revoked_at=NULL, is_active=true;
 UPDATE profiles SET ativo=true, senha_provisoria=false;
 INSERT INTO partner_accounts(id) VALUES('00000000-0000-4000-8000-000000000031');
 INSERT INTO partner_users(user_id,partner_id,papel) VALUES('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000031','gestor');
 ''')
 run((ROOT/'scripts/authz-cache/scoped-tests.sql.review').read_text())
 # Two actual local connections: writer on tenant A holds open transaction;
 # fingerprint read of tenant B completes WITHOUT waiting (no global lock)
 # and returns unchanged.
 import time
 fp_b_before=run("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',false);") # noop guard
 writer=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 writer.stdin.write("BEGIN;UPDATE user_clientes SET revoked_at=now() WHERE user_id='00000000-0000-4000-8000-000000000011';SELECT pg_sleep(0.6);ROLLBACK;");writer.stdin.close()
 time.sleep(0.15)
 started=time.monotonic()
 fp_b=run("BEGIN; SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true); SELECT public.get_my_authz_fingerprint()->>'fingerprint'; ROLLBACK;").splitlines()[-2]
 elapsed=time.monotonic()-started
 assert elapsed<0.5,f'tenant B fingerprint blocked by tenant A writer ({elapsed:.2f}s)'
 assert fp_b,'tenant B fingerprint empty during tenant A write'
 assert writer.wait()==0
 print('1 teste duas conexões/sem lock global PASS.')
 run((ROOT/'scripts/authz-cache/scoped-rollback.sql.review').read_text())
 assert run("SELECT to_regprocedure('authz_cache_private.get_my_revisioned_fingerprint()') IS NULL")=='t'
 print('Rollback scoped PASS (carimbos de perfil preservados, sem reset).')
 run((ROOT/'scripts/authz-cache/rollback.sql.review').read_text())
 assert run("SELECT to_regprocedure('public.get_my_authz_fingerprint()') IS NULL AND to_regnamespace('authz_cache_private') IS NULL")=='t'
 print('Rollback local PASS; hosted preflight/hashes/RLS/GoTrue/UI autenticada UNVERIFIED.')
finally:
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'stop','-m','fast'],capture_output=True)
