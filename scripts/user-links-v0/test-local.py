"""PostgreSQL descartável via socket /tmp; nunca conecta ao hosted."""
from pathlib import Path
import os, subprocess, tempfile, shutil
ROOT=Path(__file__).resolve().parents[2]
tmp=Path(tempfile.mkdtemp(prefix='links-v0-',dir='/tmp'));tmp.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base=['psql','-X','-h',str(tmp),'-p','55496','-U','postgres','-v','ON_ERROR_STOP=1','-qAt']
def run(sql):
 r=subprocess.run(base,input=sql,text=True,capture_output=True)
 if r.returncode:raise AssertionError(r.stderr)
 return r.stdout.strip()
checks=0
def check(sql,want):
 global checks
 got=run(sql);assert got==want,(got,want);checks+=1
try:
 subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55496','start'],check=True,capture_output=True)
 run('''CREATE ROLE authenticated; CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TYPE public.app_role AS ENUM('administrador','cliente_produtor');
 CREATE TABLE public.user_clientes(user_id uuid,cliente_id uuid,is_active boolean,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz,access_level text);
 CREATE TABLE public.clientes(id uuid,organization_id uuid);
 CREATE TABLE public.commercial_campaigns(id uuid,ativa boolean,tipo_publico text);
 CREATE TABLE public.commercial_campaign_clientes(campaign_id uuid,cliente_id uuid);
 GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated; GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE FUNCTION public.fn_authz_uid_scope_ok(u uuid) RETURNS boolean LANGUAGE sql AS $$SELECT u=auth.uid()$$;
 CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-4000-8000-000000000010'::uuid$$;
 CREATE FUNCTION public.get_cliente_ids_for_user(u uuid) RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$SELECT ARRAY(SELECT cliente_id FROM user_clientes WHERE user_id=u AND public.fn_authz_uid_scope_ok(u) AND is_active AND revoked_at IS NULL AND (valid_from IS NULL OR valid_from<=now()) AND (valid_until IS NULL OR valid_until>=now()))$$;
 CREATE FUNCTION public.has_active_user_cliente_access(_user_id uuid,_cliente_id uuid,_levels text[] DEFAULT ARRAY['read','execute','manage']) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$BEGIN
 IF _user_id IS NULL OR _cliente_id IS NULL THEN RETURN false; END IF;
 IF NOT public.fn_authz_uid_scope_ok(_user_id) THEN RETURN false; END IF;
 IF public.has_role(_user_id,'administrador'::public.app_role) THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.user_clientes uc WHERE uc.user_id=_user_id AND uc.cliente_id=_cliente_id
 AND uc.is_active = true AND (uc.valid_from IS NULL OR uc.valid_from<=now()) AND (uc.valid_until IS NULL OR uc.valid_until>=now()) AND uc.access_level::text = ANY(_levels)); END$$;
 REVOKE ALL ON FUNCTION public.has_active_user_cliente_access(uuid,uuid,text[]) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.has_active_user_cliente_access(uuid,uuid,text[]) TO authenticated;
 ALTER TABLE public.commercial_campaigns ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.commercial_campaign_clientes ENABLE ROW LEVEL SECURITY;
 CREATE POLICY campanhas_cliente_select ON public.commercial_campaigns TO authenticated USING(true);
 CREATE POLICY camp_clientes_admin_all ON public.commercial_campaign_clientes TO authenticated USING(false);
 INSERT INTO public.user_clientes VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',true,NULL,now()-interval '1 day',NULL,'read');
 INSERT INTO public.clientes VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010');
 INSERT INTO public.commercial_campaigns VALUES('00000000-0000-4000-8000-000000000003',true,'comercial');
 INSERT INTO public.commercial_campaign_clientes VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002');''')
 candidate=(ROOT/'scripts/user-links-v0/candidate.sql.review').read_text()
 # Baseline hash preflight isn't full live schema: exercise exact operational statements only.
 candidate=candidate[candidate.index('-- Conserva JOIN'):]
 run(candidate)
 actor="BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';"
 def scoped(sql):return actor+sql+';ROLLBACK;'
 helper="SELECT public.has_active_user_cliente_access(auth.uid(),'00000000-0000-4000-8000-000000000002')"
 check(scoped(helper),'t')
 check(scoped('SELECT count(*) FROM commercial_campaigns'),'0') # live-equivalent dependent RLS denies even valid membership
 # Explicit disposable-only permissive child fixture tests the campaign predicate, not hosted exposure.
 run('CREATE POLICY fixture_child_read ON commercial_campaign_clientes TO authenticated USING(true)')
 check(scoped('SELECT count(*) FROM commercial_campaigns'),'1')
 for change in ['is_active=false','revoked_at=now()','valid_from=now()+interval \'1 day\'','valid_until=now()-interval \'1 day\'']:
  run('UPDATE user_clientes SET is_active=true,revoked_at=NULL,valid_from=now()-interval \'1 day\',valid_until=NULL')
  run('UPDATE user_clientes SET '+change)
  check(scoped(helper),'f');check(scoped('SELECT count(*) FROM commercial_campaigns'),'0')
 run("BEGIN;UPDATE user_clientes SET is_active=true,revoked_at=NULL,valid_from=now(),valid_until=now();SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';SELECT public.has_active_user_cliente_access(auth.uid(),'00000000-0000-4000-8000-000000000002');ROLLBACK;")
 run("UPDATE user_clientes SET valid_from=NULL,valid_until=NULL")
 check(scoped(helper),'t')
 check(scoped(helper.replace('auth.uid()',"'00000000-0000-4000-8000-000000000099'")),'f')
 run("UPDATE clientes SET organization_id='00000000-0000-4000-8000-000000000011'")
 check(scoped('SELECT count(*) FROM commercial_campaigns'),'0')
 run((ROOT/'scripts/user-links-v0/rollback.sql.review').read_text())
 check(scoped('SELECT count(*) FROM commercial_campaigns'),'0')
 check("SELECT has_function_privilege('anon','public.has_active_user_cliente_access(uuid,uuid,text[])','EXECUTE')",'f')
 print(f'{checks} checks PASS — PostgreSQL isolado; Auth/tenant reduzidos; não hosted')
finally:
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True)
 shutil.rmtree(tmp,ignore_errors=True)
