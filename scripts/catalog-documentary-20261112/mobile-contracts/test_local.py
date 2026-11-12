"""Component PG mirror; exact captured authority, synthetic auth dependencies. No hosted IO."""
import os, json, hashlib, subprocess, tempfile, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; HERE=Path(__file__).parent
TMP=Path(tempfile.mkdtemp(prefix='catalog-mobile-pg-'));os.chown(TMP,1000,1000)
priv=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
port=str(59000+os.getpid()%500); checks=[]
def sql(s,ok=True):
 r=subprocess.run(['psql','-X','-q','-At','-h',str(TMP),'-p',port,'-U','postgres','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True)
 if ok and r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip() if not r.returncode else 'ERR:'+r.stderr
U=lambda n:f'00000000-0000-4000-8000-{n:012d}'
def actor(n,stmt):return f"SET ROLE authenticated; SET test.uid='{U(n)}'; SET request.jwt.claims='{{\"role\":\"authenticated\",\"sub\":\"{U(n)}\",\"exp\":9999999999}}';"+stmt
try:
 subprocess.run(priv+['initdb','-D',str(TMP/'data'),'-U','postgres','-A','trust'],check=True,capture_output=True)
 subprocess.run(priv+['pg_ctl','-D',str(TMP/'data'),'-o',f"-p {port} -k {TMP} -c listen_addresses=''",'-l',str(TMP/'log'),'-w','start'],check=True,capture_output=True)
 sql('''CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA platform_private;
 CREATE TYPE public.app_role AS ENUM('administrador','gestor','consultor_tecnico');
 CREATE TABLE public.organizations(id uuid PRIMARY KEY,ativo boolean,status text);
 CREATE TABLE platform_private.members(id uuid PRIMARY KEY,org uuid,editor boolean);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT current_setting('test.uid',true)::uuid$$;
 CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT org FROM platform_private.members WHERE id=auth.uid()$$;
 CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION public._saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE FUNCTION platform_private.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT editor FROM platform_private.members WHERE id=$1$$;
 CREATE FUNCTION public.can_view_catalog_internal(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM platform_private.members WHERE id=$1)$$;
 CREATE TABLE public.produtos(id uuid PRIMARY KEY,owner_organization_id uuid);CREATE TABLE public.microrganismos(id uuid PRIMARY KEY,owner_organization_id uuid);CREATE TABLE public.culturas(id uuid PRIMARY KEY,owner_organization_id uuid);
 GRANT USAGE ON SCHEMA auth TO authenticated;''')
 cap=json.loads((ROOT/'docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/consolidado-20261101-1534/consolidado-catalogo-20261101.json').read_text())['files']['catalogo-exclusivo-input.json']['functions']
 f=next(x for x in cap if x['signature']=='platform_private.catalog_tenant_actor(text)');assert hashlib.md5(f['definition'].encode()).hexdigest()==f['definition_md5'];sql(f['definition'])
 src=(ROOT/'scripts/tenant-exclusive-catalog-20261101/crud_section.py').read_text();a=src.index('CREATE FUNCTION platform_private.tenant_catalog_ref_owner');b=src.index('CREATE FUNCTION platform_private.tenant_catalog_receipt');sql(src[a:b])
 sql(f"INSERT INTO public.organizations VALUES('{U(11)}',true,'ativa'),('{U(12)}',true,'ativa');INSERT INTO platform_private.members VALUES('{U(1)}','{U(11)}',true),('{U(2)}','{U(11)}',false),('{U(3)}','{U(12)}',true);INSERT INTO public.produtos VALUES('{U(21)}','{U(11)}'),('{U(22)}','{U(12)}');INSERT INTO public.culturas VALUES('{U(31)}','{U(11)}'),('{U(32)}','{U(12)}');")
 sql((HERE/'install.sql').read_text())
 def check(name,val):checks.append({'name':name,'pass':bool(val)});assert val,name
 check('install closed ACL',sql("SELECT has_function_privilege('authenticated','public.tenant_catalog_extensions_save_v1(text,text,uuid,uuid,timestamptz,jsonb,uuid)','EXECUTE')")=='f')
 check('gate OFF',sql('SELECT enabled FROM platform_private.catalog_extensions_gate_v1')=='f')
 sql("SET catalog.test.disposable='true';"+(HERE/'activate-local.sql').read_text())
 save=lambda payload,key,id='NULL',expected='NULL',kind='problems',parent='NULL':f"SELECT public.tenant_catalog_extensions_save_v1('{kind}','produto',{parent},{id},{expected},'{json.dumps(payload)}'::jsonb,'{U(key)}');"
 r=json.loads(sql(actor(1,save({'nome':'AR Bio fictícia','categoria':'outro'},101))));pid=r['id'];version=r['updated_at']
 check('problem own roundtrip',len(json.loads(sql(actor(1,"SELECT public.tenant_catalog_extensions_read_v1('problems','produto',NULL)"))))==1)
 check('reader denied save','role_denied' in sql(actor(2,save({'nome':'Negado','categoria':'outro'},102)),False))
 check('other tenant empty',sql(actor(3,"SELECT public.tenant_catalog_extensions_read_v1('problems','produto',NULL)"))=='[]')
 replay=json.loads(sql(actor(1,save({'nome':'AR Bio fictícia','categoria':'outro'},101))));check('idempotent same id',replay['replayed'] and replay['id']==pid)
 check('idempotency changed blocked','idempotency_conflict' in sql(actor(1,save({'nome':'Mudou','categoria':'outro'},101)),False))
 link=json.loads(sql(actor(1,save({'culture_id':U(31),'problem_id':pid,'observacao':'Ficha preservada'},103,kind='links',parent=f"'{U(21)}'"))))
 check('link roundtrip',len(json.loads(sql(actor(1,f"SELECT public.tenant_catalog_extensions_read_v1('links','produto','{U(21)}')"))))==1)
 check('foreign culture denied','culture_foreign' in sql(actor(1,save({'culture_id':U(32)},104,kind='links',parent=f"'{U(21)}'")),False))
 check('foreign parent denied','parent_foreign' in sql(actor(1,save({'culture_id':U(31)},105,kind='links',parent=f"'{U(22)}'")),False))
 check('foreign problem denied','problem_foreign' in sql(actor(3,save({'problem_id':pid},106,kind='links',parent=f"'{U(22)}'")),False))
 check('CAS blocked','catalog_stale' in sql(actor(1,save({'nome':'Atual','categoria':'outro'},107,id=f"'{pid}'",expected="'2000-01-01'")),False))
 check('owner payload blocked','field_forbidden' in sql(actor(1,save({'nome':'Atual','categoria':'outro','organization_id':U(12)},108)),False))
 check('direct DML denied','permission denied' in sql(actor(1,'INSERT INTO platform_private.catalog_own_problems_v1(nome,categoria,organization_id) VALUES(\'x\',\'x\',\''+U(11)+'\')'),False))
 before=sql('SELECT count(*) FROM platform_private.catalog_own_problems_v1');sql(actor(1,'BEGIN;'+save({'nome':'Rollback','categoria':'outro'},109)+'ROLLBACK;'));check('transaction rollback',sql('SELECT count(*) FROM platform_private.catalog_own_problems_v1')==before)
 check('families includes empty',len(json.loads(sql(actor(2,'SELECT public.tenant_catalog_active_families_v1()'))))==3)
 sql((HERE/'rollback.sql').read_text());check('deny rollback keeps rows',sql('SELECT count(*) FROM platform_private.catalog_own_problems_v1')==before)
 check('rollback closed ACL',sql("SELECT has_function_privilege('authenticated','public.tenant_catalog_extensions_save_v1(text,text,uuid,uuid,timestamptz,jsonb,uuid)','EXECUTE')")=='f')
 print(json.dumps({'checks':checks,'count':len(checks),'authority_md5':f['definition_md5'],'limits':'component mirror, synthetic Auth dependencies; no hosted JWT or full original mirror'},ensure_ascii=False))
finally:
 subprocess.run(priv+['pg_ctl','-D',str(TMP/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(TMP,ignore_errors=True)
