"""Disposable PostgreSQL; captured scope/validator + candidate core. Synthetic Auth/entitlements, not JWT/RLS certification."""
from pathlib import Path
import subprocess,tempfile,shutil,os,json
p=Path(__file__).resolve().parent
root=Path(tempfile.mkdtemp(prefix='own-finance-pg-',dir='/tmp'));root.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
cmd=['psql','-X','-h',str(root),'-p','55497','-U','postgres','-qAt','-v','ON_ERROR_STOP=1']
started=False;checks=[]
def sql(s):
 r=subprocess.run(cmd,input=s,text=True,capture_output=True);assert r.returncode==0,r.stderr;return r.stdout.strip()
def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
U,A,B,P,Q,O,R,I=map(uid,range(1,9))
def read(partner=P):return f"public.rpc_portal_partner_financial('{partner}',true,NULL,NULL)"
def check(name,s,want='t'):
 actual=sql(s);assert actual==want,(name,actual,want);checks.append(name)
def deny(name):
 check(name,f"DO $$BEGIN PERFORM {read()}; RAISE EXCEPTION 'unexpected_allow'; EXCEPTION WHEN insufficient_privilege THEN NULL; END$$;SELECT true;")
try:
 subprocess.run(prefix+['initdb','-D',str(root/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'-l',str(root/'server.log'),'-o',f'-k {root} -h "" -p 55497','start'],check=True,capture_output=True);started=True
 sql(f"""
 CREATE SCHEMA auth;CREATE SCHEMA platform_private;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TYPE app_role AS ENUM('parceiro_b2b','parceiro_b2b_tecnico','administrador');
 CREATE TABLE profiles(user_id uuid,organization_id uuid,ativo boolean);
 CREATE TABLE organizations(id uuid,ativo boolean,status text,partner_account_id uuid);
 CREATE TABLE partner_accounts(id uuid,ativo boolean,deleted_at timestamptz,commercial_owner_organization_id uuid,codigo text,razao_social text,nome_fantasia text);
 CREATE TABLE partner_users(user_id uuid,partner_id uuid,papel text,tenant_id uuid,revoked_at timestamptz,valid_from timestamptz);
 CREATE TABLE user_roles(user_id uuid,role app_role);CREATE TABLE features(user_id uuid,feature_key text);
 CREATE TABLE partner_orders(id uuid,partner_id uuid,numero text);
 CREATE TABLE partner_order_financial_links(partner_order_id uuid,partner_id uuid,receivable_id uuid);
 CREATE TABLE accounts_receivable(id uuid,partner_id uuid,organization_id uuid,origin_type text,origin_id uuid,created_at timestamptz,total_amount numeric,status text);
 CREATE TABLE accounts_receivable_installments(id uuid,receivable_id uuid,organization_id uuid,installment_number integer,due_date date,original_amount numeric,received_amount numeric,status text);
 CREATE TABLE session_actor(id uuid);INSERT INTO session_actor VALUES('{U}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT id FROM public.session_actor$$;
 CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2)$$;
 CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=$1 AND ativo)$$;
 CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT organization_id FROM public.profiles WHERE user_id=auth.uid() AND ativo$$;
 CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE AS $$SELECT feature_key FROM public.features WHERE user_id=$1$$;
 INSERT INTO profiles VALUES('{U}','{A}',true);INSERT INTO organizations VALUES('{A}',true,'ativa',NULL),('{B}',true,'ativa',NULL);
 INSERT INTO partner_accounts(id,ativo,deleted_at,commercial_owner_organization_id) VALUES('{P}',true,NULL,'{A}'),('{Q}',true,NULL,'{B}');
 INSERT INTO partner_users VALUES('{U}','{P}','gestor','{A}',NULL,now()-interval '1 day');
 INSERT INTO user_roles VALUES('{U}','parceiro_b2b');INSERT INTO features VALUES('{U}','pedidos_b2b'),('{U}','contas_receber');
 INSERT INTO partner_orders VALUES('{O}','{P}','OWN');INSERT INTO partner_order_financial_links VALUES('{O}','{P}','{R}');
 INSERT INTO accounts_receivable VALUES('{R}','{P}','{A}','B2B_ORDER','{O}','2026-10-22T00:00:00Z',100,'PARTIAL');
 INSERT INTO accounts_receivable_installments VALUES('{I}','{R}','{A}',1,'2026-11-01',100,25,'PARTIAL');
 """)
 for i in json.loads((p/'baseline.json').read_text()):
  if i['signature'] in ['is_valid_b2b_partner_user(uuid,uuid)','platform_private.b2b_actor_scope(uuid)']:sql(i['definition']+';')
 sql((p/'core.sql.review').read_text())
 sql(f"""CREATE FUNCTION platform_private.b2b_commercial_context() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('partner_id','{P}','commercial_owner_organization_id','{A}','papel','gestor','mode','commercial_owner')$$;
 CREATE FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
 INSERT INTO features VALUES('{U}','catalogo_precos'),('{U}','fichas_tecnicas');""")
 sql((p/'projection.sql.review').read_text())
 check('projection explicit finance plus preserved catalogue',"SELECT platform_private.b2b_commercial_partner_projection()->'finance_capabilities'->>'obligations_read'='true' AND platform_private.b2b_commercial_partner_projection()->'capabilities'->>'contract'='C2_CAT_V1';")
 check('projection missing entitlement denies only finance',"BEGIN;DELETE FROM features WHERE feature_key='contas_receber';SELECT platform_private.b2b_commercial_partner_projection()->'finance_capabilities'->>'obligations_read'='false' AND platform_private.b2b_commercial_partner_projection()->'capabilities'->>'catalog_read'='true';ROLLBACK;")
 check('own obligations, recorded payment only',f"SELECT ({read()}->'rows'->0->>'total')::numeric=100 AND ({read()}->'rows'->0->'installments'->0->>'recebido')::numeric=25;")
 check('documents closed, no global balances',f"SELECT {read()}->>'documents_enabled'='false' AND NOT ({read()} ?| ARRAY['saldo','revenue','storage_path','notes']);")
 check('cross partner denied',f"DO $$BEGIN PERFORM {read(Q)};RAISE EXCEPTION 'unexpected_allow';EXCEPTION WHEN insufficient_privilege THEN NULL;END$$;SELECT true;")
 for name,mutation in [
 ('technical role',"UPDATE user_roles SET role='parceiro_b2b_tecnico';UPDATE partner_users SET papel='tecnico';"),
 ('revoked link',"UPDATE partner_users SET revoked_at=now();"),
 ('future link',"UPDATE partner_users SET valid_from=now()+interval '1 day';"),
 ('inactive profile',"UPDATE profiles SET ativo=false;"),
 ('profileB old linkA',f"UPDATE profiles SET organization_id='{B}';"),
 ('inactive owner',f"UPDATE organizations SET ativo=false WHERE id='{A}';"),
 ('owner status',f"UPDATE organizations SET status='suspensa' WHERE id='{A}';"),
 ('inactive partner',"UPDATE partner_accounts SET ativo=false;"),
 ('missing entitlement',"DELETE FROM features WHERE feature_key='contas_receber';"),
 ('no link',"DELETE FROM partner_users;"),
 ('multipapel stays closed',f"INSERT INTO user_roles VALUES('{U}','administrador');"),
 ('explicit mismatch',f"UPDATE organizations SET partner_account_id='{Q}' WHERE id='{A}';")]:
  check(name,'BEGIN;'+mutation+f"DO $$BEGIN PERFORM {read()}; RAISE EXCEPTION 'unexpected_allow'; EXCEPTION WHEN insufficient_privilege THEN NULL; END$$;SELECT true;ROLLBACK;")
 for name,mutation in [
 ('foreign title tenant',f"UPDATE accounts_receivable SET organization_id='{B}';"),
 ('unowned title',"UPDATE accounts_receivable SET organization_id=NULL;"),
 ('foreign partner title',f"UPDATE accounts_receivable SET partner_id='{Q}';"),
 ('wrong origin',"UPDATE accounts_receivable SET origin_type='MANUAL';"),
 ('wrong origin id',f"UPDATE accounts_receivable SET origin_id='{Q}';"),
 ('foreign installment',f"UPDATE accounts_receivable_installments SET organization_id='{B}';"),
 ('unowned installment',"UPDATE accounts_receivable_installments SET organization_id=NULL;"),
 ('NaN amount',"UPDATE accounts_receivable SET total_amount='NaN';"),
 ('ambiguous link',f"INSERT INTO partner_order_financial_links VALUES('{O}','{P}','{R}');")]:
  check(name,'BEGIN;'+mutation+f"SELECT jsonb_array_length({read()}->'rows')=0;ROLLBACK;")
 check('anon no execute',"SELECT NOT has_function_privilege('anon','public.rpc_portal_partner_financial(uuid,boolean,timestamptz,uuid)','EXECUTE');")
 check('wrapper invoker',"SELECT NOT prosecdef FROM pg_proc WHERE oid='public.rpc_portal_partner_financial(uuid,boolean,timestamptz,uuid)'::regprocedure;")
 check('cursor rejects partial',f"DO $$BEGIN PERFORM public.rpc_portal_partner_financial('{P}',true,now(),NULL);RAISE EXCEPTION 'unexpected_allow';EXCEPTION WHEN invalid_parameter_value THEN NULL;END$$;SELECT true;")
 # Create 51 older valid titles to test the cap and keyset without total queries.
 for n in range(100,151):
  o,r=uid(n),uid(n+1000)
  sql(f"INSERT INTO partner_orders VALUES('{o}','{P}','PAGE{n}');INSERT INTO partner_order_financial_links VALUES('{o}','{P}','{r}');INSERT INTO accounts_receivable VALUES('{r}','{P}','{A}','B2B_ORDER','{o}','2026-10-21T00:00:00Z',1,'OPEN');")
 check('bounded page50',f"SELECT jsonb_array_length({read()}->'rows')=50;")
 check('keyset next page exact',f"WITH d AS(SELECT {read()}->'rows'->49 last) SELECT jsonb_array_length(public.rpc_portal_partner_financial('{P}',true,(last->>'created_at')::timestamptz,(last->>'id')::uuid)->'rows')=2 FROM d;")
 sql((p/'rollback.sql.review').read_text());check('deny rollback',"SELECT NOT has_function_privilege('authenticated','public.rpc_portal_partner_financial(uuid,boolean,timestamptz,uuid)','EXECUTE');")
 check('rollback projection no advertised finance',"SELECT platform_private.b2b_commercial_partner_projection()->'finance_capabilities'->>'obligations_read'='false';")
 print(f'{len(checks)}/{len(checks)} synthetic PostgreSQL PASS');print('\n'.join(checks))
finally:
 if started:subprocess.run(prefix+['pg_ctl','-D',str(root/'data'),'-m','immediate','stop'],capture_output=True)
 shutil.rmtree(root,ignore_errors=True)