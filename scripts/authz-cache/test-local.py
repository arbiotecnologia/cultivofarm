"""Candidato exato em PostgreSQL descartável. Auth/tabelas reduzidos, NÃO hosted.
Preflight por hashes hospedados não pode passar em stubs: removido explicitamente,
nunca interpretado como PASS. Corpos de scopes Produtor/B2B reutilizados do repo.
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
 CREATE FUNCTION public.get_cliente_ids_for_user(uuid) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT ARRAY(SELECT cliente_id FROM public.user_clientes WHERE user_id=$1 AND $1=auth.uid() AND is_active AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>=now()) ORDER BY cliente_id) $$;
 CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT feature_key FROM public.fixture_entitlements WHERE user_id=$1 $$;
 CREATE FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
 ''')
 prod=(ROOT/'scripts/rbac-audit/proposed-producer-commercial-read-closed.sql').read_text()
 run(re.search(r'CREATE FUNCTION platform_private.producer_commercial_client_scope.*?\$scope\$;',prod,re.S).group())
 b2b=(ROOT/'supabase/migrations/20261008212043_b3b02dba-c8f9-4dbb-beb4-52d77aae3f62.sql').read_text()
 run(b2b[:b2b.index('REVOKE ALL')])
 candidate=(ROOT/'scripts/authz-cache/candidate.sql.review').read_text()
 run(re.sub(r'DO \$preflight\$.*?END \$preflight\$;', '',candidate,count=1,flags=re.S))
 print(run((ROOT/'scripts/authz-cache/tests.sql.review').read_text()))
 run((ROOT/'scripts/authz-cache/rollback.sql.review').read_text())
 assert run("SELECT to_regprocedure('public.get_my_authz_fingerprint()') IS NULL AND to_regnamespace('authz_cache_private') IS NULL")=='t'
 print('Rollback local PASS; hosted preflight/hashes/RLS/GoTrue/UI autenticada UNVERIFIED.')
finally:
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'stop','-m','fast'],capture_output=True)
