"""Disposable PostgreSQL only; Auth/helpers/schema reduced, no hosted access."""
from pathlib import Path
import os, subprocess, tempfile, shutil, re
ROOT=Path(__file__).resolve().parents[2]
def main():
 tmp=Path(tempfile.mkdtemp(prefix='external-ab-',dir='/tmp'));tmp.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 try:
  subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55489','start'],check=True,capture_output=True)
  runner=(ROOT/'scripts/tests/b2b-partner-real-rls-local.py').read_text()
  sql=runner.split('sql = r"""',1)[1].split('"""',1)[0]
  sql+="CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql AS $$ SELECT 'catalogo_precos'::text $$;"
  sql+='UPDATE public.user_roles SET role=\'administrador\'; DELETE FROM public.partner_users;'
  sql+=(ROOT/'scripts/tests/b2b-provisioning-lifecycle-local.sql').read_text()
  sql+=(ROOT/'scripts/tests/b2b-provisioning-real-triggers.sql').read_text()
  sql+=(ROOT/'scripts/tests/b2b-provisioning-auth-dependencies.sql').read_text()
  sql+="ALTER TABLE public.profiles ADD COLUMN crea text, ADD COLUMN especialidade text; ALTER TABLE public.clientes ADD COLUMN status_cliente text DEFAULT 'ativo', ADD COLUMN updated_at timestamptz DEFAULT now(); ALTER TABLE public.partner_accounts ADD COLUMN updated_at timestamptz DEFAULT now(); ALTER TABLE public.user_clientes ADD COLUMN principal boolean DEFAULT false, ADD COLUMN is_active boolean DEFAULT true, ADD COLUMN assigned_by uuid, ADD COLUMN revoked_at timestamptz;"
  m=(ROOT/'supabase/migrations/20260922160218_b19bd8e6-cb90-4d27-805e-c97272039918.sql').read_text()
  sql+='CREATE OR REPLACE FUNCTION public.admin_provision_user_profile_v1'+m.split('CREATE OR REPLACE FUNCTION public.admin_provision_user_profile_v1',1)[1].split('$function$;',1)[0]+'$function$;'
  sql+=(ROOT/'scripts/rbac-audit/proposed-external-user-ab-closed.sql').read_text()
  setup=sql
  sql+=(ROOT/'scripts/tests/external-user-ab-assertions.sql').read_text()
  sql+='ROLLBACK;'
  r=subprocess.run(['psql','-X','-h',str(tmp),'-p','55489','-U','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
  print(r.stderr);assert r.returncode==0,'candidate failed'
  base=['psql','-X','-h',str(tmp),'-p','55489','-U','postgres','-v','ON_ERROR_STOP=1','-qAt']
  def run(statement):
   result=subprocess.run(base,input=statement,text=True,capture_output=True)
   assert result.returncode==0,result.stderr
   return result.stdout.strip()
  run(setup+'COMMIT;')
  # Separate sessions; poll pg_stat_activity to prove blocking, never timing-only.
  import json,time
  actor="SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false); SET ROLE authenticated;"
  claim="SELECT public.b2b_claim_provisioning('11111111-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111','race@example.invalid','Race');"
  run('GRANT EXECUTE ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text),platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid) TO service_role;')
  first=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  first.stdin.write("BEGIN; UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton; SELECT 'READY';\n");first.stdin.flush()
  assert first.stdout.readline().strip()=='READY'
  second=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  second.stdin.write("SET application_name='ab_same_receipt';"+actor+claim);second.stdin.close()
  def wait_blocked(name):
   for _ in range(100):
    if run("SELECT count(*) FROM pg_stat_activity WHERE application_name='"+name+"' AND wait_event_type='Lock';")=='1':return
    time.sleep(.02)
   raise AssertionError('session did not block')
  wait_blocked('ab_same_receipt')
  first.stdin.write(actor+claim+"COMMIT;\n");first.stdin.close();a=first.stdout.read();first.wait();assert first.returncode==0,first.stderr.read()
  b=second.stdout.read();second.wait();assert second.returncode==0,second.stderr.read()
  receipt=json.loads(next(x for x in a.splitlines() if x.startswith('{')));other=json.loads(next(x for x in b.splitlines() if x.startswith('{')))
  assert receipt['user_id']==other['user_id'] and receipt['acquired'] and not other['acquired']
  print('PASS concurrent claim same UUID one acquired')
  uid=receipt['user_id'];rid=receipt['claim_id'];fence=receipt['fence']
  run("INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES('"+uid+"','race@example.invalid',jsonb_build_object('b2b_provisioning_receipt','"+rid+"')); UPDATE platform_private.b2b_provisioning_receipts SET lease_until=clock_timestamp()-interval '1 day';")
  finish="SET ROLE service_role; SELECT public.b2b_finish_provisioning('"+rid+"','"+fence+"','"+uid+"');"
  result=json.loads(run(finish).splitlines()[-1]);assert result['success'];assert run("SELECT count(*) FROM public.user_roles WHERE user_id='"+uid+"';")=='1'
  print('PASS expired receipt reconciles Auth hook exact UUID without new Auth')
  # Revoker holds organization row; scope must see new revoked state after wait.
  revoker=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  revoker.stdin.write("BEGIN; UPDATE public.organizations SET ativo=false WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; SELECT 'READY';\n");revoker.stdin.flush();assert revoker.stdout.readline().strip()=='READY'
  waiter=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  waiter.stdin.write("SET application_name='ab_revoke';"+actor+claim);waiter.stdin.close();wait_blocked('ab_revoke')
  revoker.stdin.write('COMMIT;\n');revoker.stdin.close();revoker.wait()
  waiter.stdout.read();waiter.wait();assert waiter.returncode!=0 and 'external_provisioning_forbidden' in waiter.stderr.read()
  print('PASS concurrent organization revocation denies after lock')
  run("DELETE FROM auth.users WHERE id='"+uid+"';")
  assert run("SELECT (SELECT count(*) FROM public.profiles WHERE user_id='"+uid+"')+(SELECT count(*) FROM public.user_roles WHERE user_id='"+uid+"')+(SELECT count(*) FROM public.partner_users WHERE user_id='"+uid+"')+(SELECT count(*) FROM public.user_clientes WHERE user_id='"+uid+"');")=='0'
  print('PASS Auth hook and cascades in disposable existing fixture schema')
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp)
if __name__=='__main__': main()
