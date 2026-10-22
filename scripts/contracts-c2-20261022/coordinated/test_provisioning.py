"""Actual claim/finish/compensation on disposable PG with captured Auth triggers."""
from pathlib import Path
import subprocess, tempfile, os, shutil, json, concurrent.futures
ROOT=Path(__file__).resolve().parents[3]; H=Path(__file__).resolve().parent
source=(ROOT/'scripts/tests/external-user-ab-local.py').read_text()
setup=source[source.index('  runner='):source.index('  setup=sql')]
tmp=Path(tempfile.mkdtemp(prefix='c2-provision-',dir='/tmp'));tmp.chmod(0o777)
prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
base=['psql','-X','-h',str(tmp),'-p','55489','-U','postgres','-v','ON_ERROR_STOP=1','-qAt']
checks=[]
def run(statement,fail=None):
 r=subprocess.run(base,input=statement,text=True,capture_output=True)
 if fail is not None:
  assert r.returncode!=0 and fail in r.stderr,r.stderr;checks.append(fail);return
 assert r.returncode==0,r.stderr
 return r.stdout.strip()
def check(label,statement,expected='t'):
 assert run(statement)==expected,label;checks.append(label)
try:
 subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55489','start'],check=True,capture_output=True)
 # Existing test schema + actual canonical Auth/profile/gate/principal triggers.
 local={**globals()};exec('if True:\n'+setup,local);sql=local['sql']
 sql+="""
 ALTER TABLE platform_private.b2b_provisioning_receipts ADD COLUMN external_roles public.app_role[];
 ALTER TABLE public.user_clientes ADD COLUMN valid_from timestamptz DEFAULT now(), ADD COLUMN valid_until timestamptz;
 ALTER TABLE public.partner_users ADD COLUMN tenant_id uuid, ADD COLUMN valid_from timestamptz DEFAULT now(), ADD COLUMN revoked_at timestamptz, ADD COLUMN version int DEFAULT 1;
 CREATE TABLE public.fazendas(id uuid PRIMARY KEY,cliente_id uuid,organization_id uuid,ativo boolean);
 """
 # Current partner derive/bump bodies captured read-only in C2 inventory.
 import re
 capture=(H.parent/'triggers-live.txt').read_text()
 for name in ['partner_users_derive_tenant','partner_users_bump_version']:
  body=re.search(r'CREATE OR REPLACE FUNCTION public\.'+name+r'\(\).*?AS \$function\$.*?\$function\$',capture,re.S)
  assert body is not None
  sql+=body.group()+';'
 sql+="CREATE TRIGGER a10_partner_users_derive_tenant BEFORE INSERT OR UPDATE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION public.partner_users_derive_tenant(); CREATE TRIGGER a20_partner_users_bump_version BEFORE UPDATE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION public.partner_users_bump_version();"
 sql+=(H/'provisioning.sql.review').read_text()
 sql+="""
 REVOKE ALL ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid),public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid),public.b2b_complete_provisioning_compensation(uuid,uuid,uuid),public.admin_provision_user_profile_v1(uuid,text,text,public.app_role[],uuid[],uuid,uuid,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid),public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid),public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) TO service_role;
 GRANT USAGE ON SCHEMA platform_private,auth TO authenticated,service_role;
 COMMIT;
 """
 run(sql)
 actor='44444444-4444-4444-8444-444444444444';partner='11111111-1111-4111-8111-111111111111';org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 # Setup's initial actor belongs to owner and must be admin for scoped claim.
 run(f"UPDATE public.profiles SET organization_id='{org}'; UPDATE public.user_roles SET role='administrador';")
 issued=run('SELECT extract(epoch FROM clock_timestamp())::bigint;')
 auth=f"SELECT set_config('request.jwt.claim.sub','{actor}',false); SELECT set_config('request.jwt.claim.iat','{issued}',false); SET ROLE authenticated;"
 client='cccccccc-cccc-4ccc-8ccc-cccccccccccc';farm='ffffffff-ffff-4fff-8fff-ffffffffffff'
 run(f"INSERT INTO public.clientes(id,organization_id) VALUES('{client}','{org}'); INSERT INTO public.fazendas VALUES('{farm}','{client}','{org}',true);")
 roles="ARRAY['cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico']::public.app_role[]"
 def claim(n,rs=roles,clients=f"ARRAY['{client}']::uuid[]",primary=f"'{client}'::uuid"):
  return f"SELECT public.b2b_claim_provisioning('{partner}','00000000-0000-4000-8000-{n:012d}','c{n}@example.invalid','Synthetic',{rs},{clients},{primary});"
 def getclaim(n):return json.loads(run(auth+claim(n)).splitlines()[-1])
 def args(r):return ','.join("'"+r[k]+"'::uuid" for k in ['claim_id','fence','user_id'])
 def finish(r):return 'SET ROLE service_role; SELECT public.b2b_finish_provisioning('+args(r)+');'
 # Independent real connections must converge to one reserved UUID.
 with concurrent.futures.ThreadPoolExecutor(2) as pool: receipts=list(pool.map(lambda _:getclaim(1),range(2)))
 a,b=receipts;assert a['user_id']==b['user_id'] and sum(r['acquired'] for r in receipts)==1;checks.append('concurrent claim single UUID')
 run(auth+claim(1,"ARRAY['parceiro_b2b']::public.app_role[]","ARRAY[]::uuid[]","NULL::uuid"),'b2b_provisioning_conflict')
 run(f"INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES('{a['user_id']}','c1@example.invalid',jsonb_build_object('b2b_provisioning_receipt','{a['claim_id']}'));")
 r=json.loads(run(finish(a)).splitlines()[-1]);assert r['success'];checks.append('finish actual Auth trigger cumulative')
 check('three exact roles',f"SELECT count(*)=3 FROM public.user_roles WHERE user_id='{a['user_id']}';")
 check('tenant and unique partner',f"SELECT count(*)=1 AND bool_and(tenant_id='{org}' AND papel='gestor') FROM public.partner_users WHERE user_id='{a['user_id']}';")
 check('producer real principal synced',f"SELECT cliente_id='{client}' AND senha_provisoria FROM public.profiles WHERE user_id='{a['user_id']}';")
 run(f"DELETE FROM public.user_roles WHERE user_id='{a['user_id']}' AND role='parceiro_b2b';")
 assert json.loads(run(finish(a)).splitlines()[-1])['replay'];checks.append('completed replay after partial revoke')
 check('replay does not restore manager',f"SELECT NOT public.has_role('{a['user_id']}','parceiro_b2b');")
 check('completed compensation no deletion',"SET ROLE service_role; SELECT public.b2b_prepare_provisioning_compensation("+args(a)+");",'completed')
 run(f"UPDATE public.fazendas SET ativo=false WHERE id='{farm}';")
 run(auth+claim(2),'c2_producer_farm_required')
 run(f"UPDATE public.fazendas SET ativo=true WHERE id='{farm}';")
 c=getclaim(3)
 run(f"INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES('{c['user_id']}','c3@example.invalid',jsonb_build_object('b2b_provisioning_receipt','{c['claim_id']}')); CREATE FUNCTION public.c2_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected_c2'; END $$; CREATE TRIGGER c2_injected BEFORE INSERT ON platform_private.provisional_password_state FOR EACH ROW EXECUTE FUNCTION public.c2_test_fail();")
 run(finish(c),'injected_c2')
 check('last write rollback no roles or tenant',f"SELECT organization_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id='{c['user_id']}') FROM public.profiles WHERE user_id='{c['user_id']}';")
 run('DROP TRIGGER c2_injected ON platform_private.provisional_password_state;')
 check('prepare fences finish',"SET ROLE service_role; SELECT public.b2b_prepare_provisioning_compensation("+args(c)+");",'compensating')
 run(finish(c),'b2b_provisioning_stale')
 run('SET ROLE service_role; SELECT public.b2b_complete_provisioning_compensation('+args(c)+');','b2b_compensation_pending')
 run(f"DELETE FROM auth.users WHERE id='{c['user_id']}';")
 check('compensation only after Auth absence','SET ROLE service_role; SELECT public.b2b_complete_provisioning_compensation('+args(c)+');')
 # Technical-only profile uses same receipt/provisioner; no financial manager.
 t=json.loads(run(auth+claim(4,"ARRAY['parceiro_b2b_tecnico']::public.app_role[]","ARRAY[]::uuid[]","NULL::uuid")).splitlines()[-1])
 run(f"INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES('{t['user_id']}','c4@example.invalid',jsonb_build_object('b2b_provisioning_receipt','{t['claim_id']}'));")
 assert json.loads(run(finish(t)).splitlines()[-1])['success']
 check('technical-only no finance',f"SELECT count(*)=1 AND bool_and(role='parceiro_b2b_tecnico') FROM public.user_roles WHERE user_id='{t['user_id']}';")
 check('anonymous no array claim',"SELECT NOT has_function_privilege('anon','public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role[],uuid[],uuid)','EXECUTE');")
 check('authenticated no finish',"SELECT NOT has_function_privilege('authenticated','public.b2b_finish_provisioning(uuid,uuid,uuid)','EXECUTE');")
 print(f'PASS {len(checks)} actual provisioning checks with captured trigger chain; synthetic Auth only')
 for c in checks:print('PASS '+c)
finally:
 subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp)