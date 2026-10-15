"""Disposable PostgreSQL: real candidate RPC bodies, reduced tables/Auth. No hosted calls."""
from pathlib import Path
import os,subprocess,tempfile,shutil,re
ROOT=Path(__file__).resolve().parents[2]
def main():
 tmp=Path(tempfile.mkdtemp(prefix='producer-read-',dir='/tmp'));tmp.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 try:
  subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55491','start'],check=True,capture_output=True)
  candidate=(ROOT/'scripts/rbac-audit/proposed-producer-commercial-read-closed.sql').read_text()
  sql="CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE TYPE public.app_role AS ENUM('administrador','gestor','cliente_produtor','consultor_tecnico');"
  sql+="CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; CREATE TABLE profiles(user_id uuid,organization_id uuid,ativo boolean DEFAULT true,senha_provisoria boolean DEFAULT false);CREATE TABLE organizations(id uuid,ativo boolean DEFAULT true);CREATE TABLE clientes(id uuid,organization_id uuid,status_cliente text DEFAULT 'ativo');CREATE TABLE user_roles(user_id uuid,role app_role);CREATE TABLE user_clientes(user_id uuid,cliente_id uuid,is_active boolean DEFAULT true,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz);"
  sql+="CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$; CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=$1 AND ativo AND NOT senha_provisoria) $$; CREATE FUNCTION public.get_cliente_ids_for_user(uuid) RETURNS uuid[] LANGUAGE sql AS $$ SELECT ARRAY(SELECT cliente_id FROM public.user_clientes WHERE user_id=$1 AND is_active AND revoked_at IS NULL AND (valid_from IS NULL OR valid_from<=now()) AND (valid_until IS NULL OR valid_until>=now())) $$;"
  aliases={'partner_accounts':['pa'],'partner_orders':['po','v_order'],'partner_simulations':['ps','v_sim'],'partner_order_items':['it'],'partner_simulation_items':['si'],'produtos':['p'],'microrganismos':['m','mf'],'formulacoes':['f']}
  fields={}
  for table,names in aliases.items():
   columns={'id'}
   for alias in names: columns.update(re.findall(r'\b'+alias+r'\.([a-z_]+)',candidate))
   if table=='partner_accounts':columns.update(['commercial_owner_organization_id','ativo','deleted_at'])
   if table in ['partner_orders','partner_simulations']:columns.update(['cliente_id','partner_id'])
   fields[table]=columns
   types=lambda c: 'uuid' if c=='id' or c.endswith('_id') else 'boolean' if c=='ativo' else 'numeric' if c in ['total','total_cheio','area_total_ha'] else 'timestamptz' if c.endswith('_at') else 'date' if c in ['requested_delivery_date','estimated_delivery_date'] else 'text'
   sql+='CREATE TABLE '+table+'('+','.join(c+' '+types(c) for c in sorted(columns))+');'
  # Local schema has no hosted baselines: replace only the preflight DO, never RPC bodies.
  runtime=re.sub(r'DO \$baseline\$.*?END \$baseline\$;', '', candidate, count=1, flags=re.S)
  sql+=runtime
  sql+="CREATE FUNCTION pg_temp.assert_true(label text,result boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END $$;"
  a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';u='44444444-4444-4444-8444-444444444444';c='11111111-1111-4111-8111-111111111111';s='22222222-2222-4222-8222-222222222222';f='33333333-3333-4333-8333-333333333333';pa='55555555-5555-4555-8555-555555555555';order='66666666-6666-4666-8666-666666666666';sim='77777777-7777-4777-8777-777777777777'
  sql+=f"INSERT INTO organizations(id) VALUES('{a}'),('{b}');INSERT INTO profiles(user_id,organization_id) VALUES('{u}','{a}');INSERT INTO user_roles VALUES('{u}','cliente_produtor');INSERT INTO clientes(id,organization_id) VALUES('{c}','{a}'),('{s}','{a}'),('{f}','{b}');INSERT INTO user_clientes(user_id,cliente_id) VALUES('{u}','{c}');INSERT INTO partner_accounts(id,commercial_owner_organization_id,ativo) VALUES('{pa}','{a}',true);INSERT INTO partner_orders(id,partner_id,cliente_id,status,total) VALUES('{order}','{pa}','{c}','pendente',100);INSERT INTO partner_simulations(id,partner_id,cliente_id,status,total_cheio) VALUES('{sim}','{pa}','{c}','enviada_gestor',100);SELECT set_config('request.jwt.claim.sub','{u}',false);"
  sql+="SELECT pg_temp.assert_true('ACL closed',NOT has_function_privilege('authenticated','public.get_portal_cliente_b2b_orders_secure(uuid)','EXECUTE'));"
  sql+=f"SELECT pg_temp.assert_true('own scope',platform_private.producer_commercial_client_scope('{c}'));SELECT pg_temp.assert_true('sibling denied',NOT platform_private.producer_commercial_client_scope('{s}'));SELECT pg_temp.assert_true('foreign denied',NOT platform_private.producer_commercial_client_scope('{f}'));SELECT pg_temp.assert_true('NULL denied',NOT platform_private.producer_commercial_client_scope(NULL));"
  for name,param in [('get_portal_cliente_b2b_orders_secure',c),('get_portal_cliente_b2b_simulations_secure',c)]:sql+=f"SELECT pg_temp.assert_true('{name} own', (SELECT count(*) FROM public.{name}('{param}'))=1);"
  sql+=f"SELECT pg_temp.assert_true('real order detail',public.get_portal_cliente_b2b_order_detail_secure('{order}')->'header'->>'id'='{order}');SELECT pg_temp.assert_true('real simulation detail',public.get_portal_cliente_b2b_simulation_detail_secure('{sim}')->'header'->>'id'='{sim}');"
  sql+=f"UPDATE user_clientes SET is_active=false;SELECT pg_temp.assert_true('revoked denied',NOT platform_private.producer_commercial_client_scope('{c}'));UPDATE user_clientes SET is_active=true,revoked_at=now();SELECT pg_temp.assert_true('revoked timestamp denied',NOT platform_private.producer_commercial_client_scope('{c}'));UPDATE user_clientes SET revoked_at=NULL,valid_until=now()-interval '1 day';SELECT pg_temp.assert_true('expired denied',NOT platform_private.producer_commercial_client_scope('{c}'));UPDATE user_clientes SET valid_until=NULL;UPDATE profiles SET ativo=false;SELECT pg_temp.assert_true('inactive denied',NOT platform_private.producer_commercial_client_scope('{c}'));UPDATE profiles SET ativo=true;UPDATE user_roles SET role='consultor_tecnico';SELECT pg_temp.assert_true('technical link no portal',NOT platform_private.producer_commercial_client_scope('{c}'));UPDATE user_roles SET role='cliente_produtor';UPDATE partner_accounts SET commercial_owner_organization_id='{b}';SELECT pg_temp.assert_true('crossed partner chain excludes list',(SELECT count(*) FROM public.get_portal_cliente_b2b_orders_secure('{c}'))=0);"
  sql+=f"DO $$BEGIN BEGIN PERFORM public.get_portal_cliente_b2b_order_detail_secure('{order}');EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS crossed detail denied';RETURN;END;RAISE EXCEPTION 'FAIL crossed detail';END $$;SELECT set_config('request.jwt.claim.sub','',false);SELECT pg_temp.assert_true('anonymous denied',NOT platform_private.producer_commercial_client_scope('{c}'));"
  run=subprocess.run(['psql','-X','-h',str(tmp),'-p','55491','-U','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True);print(run.stderr);assert run.returncode==0
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp)
if __name__=='__main__':main()
