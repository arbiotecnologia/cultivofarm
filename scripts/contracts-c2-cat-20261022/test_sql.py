"""Actual candidate projection + captured context/validator bodies; synthetic Auth/scope. No hosted operations."""
from pathlib import Path
import subprocess,tempfile,shutil,os,re
HERE=Path(__file__).resolve().parent
root=Path(tempfile.mkdtemp(prefix='c2cat-pg-',dir='/tmp'));root.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base=['psql','-X','-h',str(root),'-p','55498','-U','postgres','-qAt','-v','ON_ERROR_STOP=1']
checks=[];started=False
def sql(s):
 r=subprocess.run(base,input=s,text=True,capture_output=True);assert r.returncode==0,r.stderr;return r.stdout.strip()
def check(name,s,want='t'):
 result=sql(s);assert result==want,(name,result,want);checks.append(name)
def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
A,B,P,U,V=map(uid,range(1,6))
def cap(k):return f"SELECT COALESCE((public.get_my_commercial_partner_projection()->'capabilities'->>'{k}')::boolean,false);"
try:
 subprocess.run(prefix+['initdb','-D',str(root/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'-l',str(root/'server.log'),'-o',f'-k {root} -h "" -p 55498','start'],check=True,capture_output=True);started=True
 sql(f"""
 CREATE SCHEMA auth;CREATE SCHEMA platform_private;
 CREATE TYPE app_role AS ENUM('parceiro_b2b','parceiro_b2b_tecnico','administrador');
 CREATE TABLE profiles(user_id uuid,organization_id uuid,ativo boolean);
 CREATE TABLE organizations(id uuid,ativo boolean,status text,partner_account_id uuid);
 CREATE TABLE partner_accounts(id uuid,codigo text,razao_social text,nome_fantasia text,ativo boolean,deleted_at timestamptz,commercial_owner_organization_id uuid);
 CREATE TABLE partner_users(user_id uuid,partner_id uuid,papel text,tenant_id uuid,revoked_at timestamptz,valid_from timestamptz);
 CREATE TABLE user_roles(user_id uuid,role app_role);
 CREATE TABLE features(user_id uuid,feature_key text);
 CREATE TABLE session_actor(id uuid);INSERT INTO session_actor VALUES('{U}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT id FROM public.session_actor$$;
 CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2)$$;
 CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=$1 AND ativo)$$;
 CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT organization_id FROM public.profiles WHERE user_id=auth.uid() AND ativo$$;
 CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE AS $$SELECT feature_key FROM public.features WHERE user_id=$1$$;
 -- Synthetic scope substitute: production scope is guarded byte-exact, NOT replaced in candidate.
 CREATE FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.partner_users pu ON pu.user_id=p.user_id
 JOIN public.partner_accounts pa ON pa.id=pu.partner_id JOIN public.organizations o ON o.id=pa.commercial_owner_organization_id
 WHERE p.user_id=auth.uid() AND p.ativo AND p.organization_id=pu.tenant_id AND pu.tenant_id=o.id
 AND pu.partner_id=$1 AND pu.revoked_at IS NULL AND pu.valid_from<=now() AND pa.ativo AND pa.deleted_at IS NULL AND o.ativo AND o.status='ativa')$$;
 INSERT INTO profiles VALUES('{U}','{A}',true),('{V}','{B}',true);
 INSERT INTO organizations VALUES('{A}',true,'ativa',NULL),('{B}',true,'ativa',NULL);
 INSERT INTO partner_accounts VALUES('{P}','P1','Synthetic',NULL,true,NULL,'{A}');
 INSERT INTO partner_users VALUES('{U}','{P}','gestor','{A}',NULL,now()-interval '1 day');
 INSERT INTO user_roles VALUES('{U}','parceiro_b2b'),('{V}','parceiro_b2b');
 INSERT INTO features VALUES('{U}','catalogo_precos'),('{U}','fichas_tecnicas'),('{V}','catalogo_precos');
 """)
 snapshot=HERE.parent.joinpath('contracts-c2-20261022/functions-live.txt').read_text()
 for name in ['public.is_valid_b2b_partner_user','platform_private.b2b_commercial_context']:
  start=snapshot.index('CREATE OR REPLACE FUNCTION '+name+'(');end=snapshot.index('$function$',snapshot.index('AS $function$',start)+len('AS $function$'))+len('$function$')
  sql(snapshot[start:end]+';')
 candidate=HERE.joinpath('candidate.sql.review').read_text();start=candidate.index('CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_partner_projection')
 sql('BEGIN;'+candidate[start:])
 name='public.get_my_commercial_partner_projection';start=snapshot.index('CREATE OR REPLACE FUNCTION '+name+'(');end=snapshot.index('$function$',snapshot.index('AS $function$',start)+len('AS $function$'))+len('$function$')
 sql(snapshot[start:end]+';')
 check('manager owner catalogue permitted',cap('catalog_read'))
 check('sheets independently entitled',cap('sheets_read'))
 sql(f"DELETE FROM features WHERE feature_key='fichas_tecnicas';")
 check('no sheets entitlement denies sheets',cap('sheets_read'),'f');check('catalog remains',cap('catalog_read'))
 sql("DELETE FROM features;");check('no entitlement denies catalogue',cap('catalog_read'),'f')
 sql(f"INSERT INTO features VALUES('{U}','catalogo_precos'),('{U}','fichas_tecnicas');UPDATE partner_users SET valid_from=now()+interval '1 day';")
 check('future link denied',cap('catalog_read'),'f')
 sql("UPDATE partner_users SET valid_from=now()-interval '1 day',revoked_at=now();")
 check('revoked link denied',cap('catalog_read'),'f')
 sql(f"UPDATE partner_users SET revoked_at=NULL;UPDATE profiles SET organization_id='{B}' WHERE user_id='{U}';")
 check('moved profile B old link A denied',cap('catalog_read'),'f')
 sql(f"UPDATE profiles SET organization_id='{A}',ativo=false WHERE user_id='{U}';")
 check('inactive profile denied',cap('catalog_read'),'f')
 sql(f"UPDATE profiles SET ativo=true;UPDATE organizations SET ativo=false WHERE id='{A}';")
 check('inactive owner denied',cap('catalog_read'),'f')
 sql("UPDATE organizations SET ativo=true;UPDATE partner_accounts SET ativo=false;")
 check('inactive partner denied',cap('catalog_read'),'f')
 sql(f"UPDATE partner_accounts SET ativo=true;UPDATE session_actor SET id='{V}';")
 check('other tenant caller no link denied',cap('catalog_read'),'f')
 sql(f"UPDATE session_actor SET id='{U}';UPDATE user_roles SET role='parceiro_b2b_tecnico' WHERE user_id='{U}';UPDATE partner_users SET papel='tecnico';")
 check('technical role no manager catalog',cap('catalog_read'),'f');check('technical sheets permitted',cap('sheets_read'))
 sql("DELETE FROM partner_users;");check('commercial client without partner denied',cap('sheets_read'),'f')
 print(f'PASS {len(checks)} local projection checks; synthetic scope/Auth, NOT hosted JWT/RLS')
 for c in checks:print('PASS '+c)
finally:
 if started:subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'-m','immediate','stop'],capture_output=True)
 shutil.rmtree(root)