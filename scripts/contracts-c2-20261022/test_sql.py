"""Disposable PostgreSQL: actual candidate bodies, reduced schema, synthetic Auth; never hosted JWT proof."""
from pathlib import Path
import os, subprocess, tempfile, shutil, concurrent.futures
HERE=Path(__file__).resolve().parent
root=Path(tempfile.mkdtemp(prefix='c2-pg-',dir='/tmp'));root.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base=['psql','-X','-h',str(root),'-p','55497','-U','postgres','-qAt','-v','ON_ERROR_STOP=1']
checks=[]
def sql(s,ok=True):
 r=subprocess.run(base,input=s,text=True,capture_output=True)
 if ok: assert r.returncode==0,r.stderr
 else: assert r.returncode!=0,'Expected failure'
 return r.stdout.strip() if ok else r.stderr

def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
A,B,P,Q,ADMIN,USER=map(uid,[1,2,3,4,5,6])
def check(name,s,want='t'):
 actual=sql(s);assert actual==want,(name,actual,want);checks.append(name)
def deny(name,s,code):
 assert code in sql(s,False),(name,code);checks.append(name)
def version():return sql(f"SELECT public.get_partner_user_lifecycle('{P}','{USER}')->>'version';")
def op(action,roles,key,expected=None,partner=P):
 return f"SELECT public.link_partner_user('{partner}','{USER}',ARRAY[{','.join(repr(r) for r in roles)}]::text[],'{action}','{expected or version()}','{uid(key)}','Synthetic reviewed reason');"
roles=['parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor']
started=False
try:
 subprocess.run(prefix+['initdb','-D',str(root/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'-l',str(root/'server.log'),'-o',f'-k {root} -h "" -p 55497','start'],check=True,capture_output=True);started=True
 sql(f"""
 CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA auth;CREATE SCHEMA platform_private;CREATE SCHEMA cf_user_guards_v1;
 CREATE TYPE public.app_role AS ENUM('administrador','gestor','consultor_tecnico','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor','superadmin');
 CREATE TABLE profiles(user_id uuid PRIMARY KEY,organization_id uuid,ativo boolean,senha_provisoria boolean,updated_at timestamptz DEFAULT now());
 CREATE TABLE organizations(id uuid PRIMARY KEY,ativo boolean,status text,partner_account_id uuid);
 CREATE TABLE partner_accounts(id uuid PRIMARY KEY,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz);
 CREATE TABLE user_roles(id uuid DEFAULT gen_random_uuid(),user_id uuid,role app_role,CONSTRAINT user_roles_user_id_role_key UNIQUE(user_id,role));
 CREATE TABLE partner_users(id uuid DEFAULT gen_random_uuid(),user_id uuid,partner_id uuid,papel text,tenant_id uuid,valid_from timestamptz DEFAULT now(),revoked_at timestamptz,revoked_by uuid,revoke_reason text,version int DEFAULT 1,created_at timestamptz DEFAULT now(),CONSTRAINT partner_users_user_id_key UNIQUE(user_id));
 CREATE TABLE partner_audit_logs(id uuid DEFAULT gen_random_uuid(),partner_id uuid,usuario_id uuid,acao text,dados_anteriores jsonb,dados_novos jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE user_clientes(id uuid DEFAULT gen_random_uuid(),user_id uuid,cliente_id uuid,is_active boolean,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz);
 CREATE TABLE clientes(id uuid,organization_id uuid,status_cliente text);
 CREATE TABLE fazendas(id uuid,cliente_id uuid,organization_id uuid,ativo boolean);
 CREATE TABLE cf_user_guards_v1.state(singleton boolean,revision bigint);INSERT INTO cf_user_guards_v1.state VALUES(true,1);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '{ADMIN}'::uuid $$;
 CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
 CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT public.has_role($1,'superadmin') $$;
 CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=$1 AND ativo AND NOT senha_provisoria) $$;
 CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$ SELECT organization_id FROM public.profiles WHERE user_id=auth.uid() AND ativo $$;
 CREATE FUNCTION platform_private.b2b_actor_scope(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION public.is_valid_b2b_partner_user(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION cf_user_guards_v1.acquire_gate() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;
 INSERT INTO organizations VALUES('{A}',true,'ativa',NULL),('{B}',true,'ativa',NULL);
 INSERT INTO profiles(user_id,organization_id,ativo,senha_provisoria) VALUES('{ADMIN}','{A}',true,false),('{USER}','{A}',true,false);
 INSERT INTO user_roles(user_id,role) VALUES('{ADMIN}','administrador');
 INSERT INTO partner_accounts VALUES('{P}','{A}',true,NULL),('{Q}','{B}',true,NULL);
 """)
 candidate=HERE.joinpath('candidate.sql.review').read_text()
 deny('full baseline guard rejects reduced noncanonical schema',candidate,'c2_scope_drift')
 # Exact function SQL, no rewriting security predicates. Full baseline covered above.
 bodies=candidate[candidate.index('CREATE FUNCTION platform_private.c2_partner_lifecycle'):]
 sql('BEGIN;'+bodies)
 deny('producer needs real client/property',op('assign',roles,10),'c2_producer_link_required')
 sql(f"INSERT INTO user_clientes(user_id,cliente_id,is_active,valid_from) VALUES('{USER}','{uid(20)}',true,now()-interval '1 day');INSERT INTO clientes VALUES('{uid(20)}','{A}','ativo');")
 deny('client alone is not farm proof',op('assign',roles,11),'c2_producer_link_required')
 sql(f"INSERT INTO fazendas VALUES('{uid(21)}','{uid(20)}','{A}',true);")
 first_expected=version();first=sql(op('assign',roles,12,first_expected));checks.append('assign three cumulative capabilities')
 check('three roles stored once',f"SELECT count(*)=3 FROM user_roles WHERE user_id='{USER}';")
 check('exact replay receipt',op('assign',roles,12,first_expected),first)
 deny('key with modified payload conflicts',op('revoke_roles',roles[:1],12,first_expected),'c2_replay_conflict')
 deny('CAS stale no effects',op('revoke_roles',roles[:1],13,'0'*32),'c2_version_conflict')
 deny('cross tenant partner',op('assign',roles,14,'0'*32,partner=Q),'c2_forbidden')
 sql(f"UPDATE profiles SET organization_id='{B}' WHERE user_id='{ADMIN}';")
 deny('admin tenant B cannot mutate target A',op('assign',roles,40,'0'*32),'c2_forbidden')
 deny('admin tenant B cannot read target A history',f"SELECT public.get_partner_user_lifecycle('{P}','{USER}');",'c2_forbidden')
 sql(f"UPDATE profiles SET organization_id='{A}' WHERE user_id='{ADMIN}';UPDATE partner_accounts SET ativo=false WHERE id='{P}';")
 deny('inactive partner denies mutation',op('assign',roles,41,'0'*32),'c2_forbidden')
 sql(f"UPDATE partner_accounts SET ativo=true WHERE id='{P}';")
 deny('internal manager not granted',op('assign',['gestor'],15),'c2_invalid_input')
 # Negative scope/profile/owner and validity evidence for producer assignments.
 sql(f"UPDATE profiles SET organization_id='{B}' WHERE user_id='{USER}';")
 deny('profile B link A denied',op('assign',roles,16,'0'*32),'c2_forbidden')
 sql(f"UPDATE profiles SET organization_id='{A}',ativo=false WHERE user_id='{USER}';")
 deny('inactive profile denied',op('assign',roles,17,'0'*32),'c2_forbidden')
 sql(f"UPDATE profiles SET ativo=true WHERE user_id='{USER}';UPDATE organizations SET ativo=false WHERE id='{A}';")
 deny('inactive owner org denied',op('assign',roles,18,'0'*32),'c2_forbidden')
 sql(f"UPDATE organizations SET ativo=true WHERE id='{A}';UPDATE user_clientes SET valid_from=now()+interval '1 day';")
 deny('future producer binding denied',op('assign',roles,19),'c2_producer_link_required')
 sql("UPDATE user_clientes SET valid_from=now()-interval '2 days',valid_until=now()-interval '1 day';")
 deny('expired producer binding denied',op('assign',roles,22),'c2_producer_link_required')
 sql("UPDATE user_clientes SET valid_until=NULL;")
 sql("UPDATE user_clientes SET revoked_at=now();")
 deny('revoked producer link cannot assign',op('assign',roles,42),'c2_producer_link_required')
 sql("UPDATE user_clientes SET revoked_at=NULL;")
 before_revoke=version();sql(op('revoke_roles',['parceiro_b2b_tecnico','cliente_produtor'],23,before_revoke))
 check('partial revoke preserves technician producer',f"SELECT array_agg(role::text ORDER BY role::text)=ARRAY['cliente_produtor','parceiro_b2b_tecnico'] FROM user_roles WHERE user_id='{USER}';")
 check('manager financial role not present',f"SELECT NOT public.has_role('{USER}','parceiro_b2b');")
 deny('revocation cannot grant manager',op('revoke_roles',roles,43),'c2_revocation_cannot_grant')
 check('old assign replay never resurrects revoked manager',op('assign',roles,12,first_expected),first)
 check('manager still absent after old replay',f"SELECT NOT public.has_role('{USER}','parceiro_b2b');")
 remaining=['parceiro_b2b_tecnico','cliente_produtor']
 sql(op('unlink',remaining,24))
 check('unlink revokes link but not independent producer',f"SELECT revoked_at IS NOT NULL AND public.has_role('{USER}','cliente_produtor') FROM partner_users WHERE user_id='{USER}';")
 deny('assign cannot implicitly reactivate',op('assign',remaining,25),'c2_explicit_reactivation_required')
 sql(op('reactivate',remaining,26))
 check('reactivate link explicit preserves revoked manager',f"SELECT revoked_at IS NULL AND NOT public.has_role('{USER}','parceiro_b2b') FROM partner_users WHERE user_id='{USER}';")
 check('history has only confirmed mutations',f"SELECT jsonb_array_length(public.get_partner_user_lifecycle('{P}','{USER}')->'history')=4;")
 check('history projects responsible actor',f"SELECT bool_and(h->>'actor_id'='{ADMIN}') FROM jsonb_array_elements(public.get_partner_user_lifecycle('{P}','{USER}')->'history') h;")
 check('audit before and after show concrete role revocation',f"SELECT (h->'before'->'roles') ? 'parceiro_b2b' AND NOT ((h->'after'->'roles') ? 'parceiro_b2b') FROM jsonb_array_elements(public.get_partner_user_lifecycle('{P}','{USER}')->'history') h WHERE h->>'action'='revoke_roles';")
 check('audit payload whitelist excludes receipt keys and raw state',f"SELECT bool_and(NOT (h ?| ARRAY['key','fingerprint','receipt','state','profile_stamp'])) FROM jsonb_array_elements(public.get_partner_user_lifecycle('{P}','{USER}')->'history') h;")
 # Force timestamp ties to exercise the stable (created_at,id) cursor.
 sql("UPDATE partner_audit_logs SET created_at='2026-10-22T00:00:00Z';")
 page=f"public.get_partner_user_lifecycle('{P}','{USER}',2,NULL::timestamptz,NULL::uuid)"
 check('history page is bounded to two',f"SELECT jsonb_array_length({page}->'history')=2;")
 check('equal timestamps paginate without loss or duplication',f"WITH first AS (SELECT {page} j), second AS (SELECT public.get_partner_user_lifecycle('{P}','{USER}',2,(j->'next_cursor'->>'at')::timestamptz,(j->'next_cursor'->>'id')::uuid) j FROM first) SELECT count(DISTINCT h->>'id')=4 FROM (SELECT j FROM first UNION ALL SELECT j FROM second) pages CROSS JOIN LATERAL jsonb_array_elements(j->'history') h;")
 deny('page zero rejected',f"SELECT public.get_partner_user_lifecycle('{P}','{USER}',0,NULL,NULL);",'c2_invalid_page')
 deny('page above fifty rejected',f"SELECT public.get_partner_user_lifecycle('{P}','{USER}',51,NULL,NULL);",'c2_invalid_page')
 deny('partial cursor rejected',f"SELECT public.get_partner_user_lifecycle('{P}','{USER}',20,now(),NULL);",'c2_invalid_page')
 sql(f"INSERT INTO partner_audit_logs(partner_id,usuario_id,acao,dados_anteriores,dados_novos) SELECT partner_id,usuario_id,acao,jsonb_set(dados_anteriores,'{{org}}',to_jsonb('{B}'::text)),dados_novos FROM partner_audit_logs LIMIT 1;")
 check('other tenant log hidden even for same partner target',f"SELECT jsonb_array_length(public.get_partner_user_lifecycle('{P}','{USER}')->'history')=4;")
 sql(f"INSERT INTO partner_audit_logs(partner_id,usuario_id,acao,dados_anteriores,dados_novos) SELECT partner_id,usuario_id,acao,dados_anteriores,jsonb_set(dados_novos,'{{state,user}}',to_jsonb('{uid(99)}'::text)) FROM partner_audit_logs LIMIT 1;")
 check('mismatched after target excluded',f"SELECT jsonb_array_length(public.get_partner_user_lifecycle('{P}','{USER}')->'history')=4;")
 check('legacy validator unchanged',"SELECT public.is_valid_b2b_partner_user(NULL,NULL);",'f')
 # Two transactions race same CAS; existing gate serializes, second cannot overwrite.
 expected=version()
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  def race(i):
   r=subprocess.run(base,input=op('revoke_roles',['cliente_produtor'],30+i,expected),text=True,capture_output=True)
   return r.returncode,r.stderr
  outcomes=list(pool.map(race,[0,1]))
 assert sum(x[0]==0 for x in outcomes)==1,outcomes
 assert any('c2_version_conflict' in x[1] for x in outcomes),outcomes
 checks.append('two real transactions serialize CAS')
 print(f'PASS {len(checks)} isolated PostgreSQL checks')
 for c in checks:print('PASS '+c)
finally:
 if started:subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'-m','immediate','stop'],capture_output=True)
 shutil.rmtree(root)
