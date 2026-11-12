"""Exact generated Stage A roundtrip; synthetic parent/marker, no business fixtures.
Tests installers, denial and catalog invariance, not real JWT/RLS fiscal flow.
"""
import json,os,shutil,subprocess,tempfile,hashlib
from pathlib import Path
H=Path(__file__).resolve().parent
def main():
 tmp=tempfile.mkdtemp(prefix='cancel-foundation-',dir='/tmp');shutil.chown(tmp,user='lovable')
 env={k:v for k,v in os.environ.items() if not k.startswith('PG')};pre=['setpriv','--reuid=1000','--regid=1000','--init-groups'];data=tmp+'/data';port='55499'
 def cmd(a):return subprocess.run(pre+a,capture_output=True,text=True,env=env)
 assert cmd(['initdb','-D',data,'-U','postgres','-A','trust']).returncode==0
 assert cmd(['pg_ctl','-D',data,'-o',f'-p {port} -k {tmp} -c listen_addresses=','-l',tmp+'/log','start','-w']).returncode==0
 base=['psql','-X','-h',tmp,'-p',port,'-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];rows=[]
 def sql(s,pin=None):return subprocess.run(base+(['-v','approved_event_trigger_md5='+pin] if pin else []),input=s,capture_output=True,text=True,env=env)
 def check(n,condition,detail=None):rows.append(dict(test=n,status='PASS' if condition else 'FAIL',detail=detail));print(rows[-1]['status'],n)
 def runfile(n,pin):return sql((H/n).read_text(),pin)
 try:
  setup="CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA platform_private;CREATE SCHEMA cron;CREATE TABLE cron.job(active boolean);CREATE TABLE public.fiscal_environment_marker(project_ref text,production_emission_allowed boolean);INSERT INTO public.fiscal_environment_marker VALUES('vrlcdwmlytukrjezrrnf',false);CREATE TABLE public.partner_orders(id uuid PRIMARY KEY);CREATE FUNCTION public.existing_writer() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;REVOKE ALL ON FUNCTION public.existing_writer() FROM PUBLIC;"
  r=sql(setup);assert r.returncode==0,r.stderr
  # Seven declared synthetic event triggers do nothing; production event bodies are not stubbed as proof.
  r=sql("CREATE FUNCTION public.local_event_marker() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;"+''.join(f"CREATE EVENT TRIGGER local_event_{i} ON ddl_command_end EXECUTE FUNCTION public.local_event_marker();" for i in range(7)))
  assert r.returncode==0,r.stderr
  pin=sql((H/'event-trigger-pin.sql.readonly').read_text()).stdout.strip()
  before=sql("SELECT md5(pg_get_functiondef('public.existing_writer()'::regprocedure));").stdout.strip()
  for n in ['01a-pre-foundation.sql.review','01b-install-foundation-closed.sql.review','01c-post-foundation.sql.readonly','01d-rollback-foundation-deny.sql.review','01c-post-foundation.sql.readonly']:
   r=runfile(n,pin);check(n,r.returncode==0,dict(sha256=hashlib.sha256((H/n).read_bytes()).hexdigest(),error=r.stderr))
   if r.returncode:raise ValueError(r.stderr)
  check('existing writer body unchanged',before==sql("SELECT md5(pg_get_functiondef('public.existing_writer()'::regprocedure));").stdout.strip())
  check('private residual core denied to authenticated',sql("SET ROLE authenticated;SELECT platform_private.b2b_financial_forecast_cancel_residual_v1(NULL,1,'test');").returncode!=0)
  check('direct forecast INSERT denied',sql("SET ROLE authenticated;INSERT INTO platform_private.b2b_financial_forecasts DEFAULT VALUES;").returncode!=0)
  check('repeat installer aborts',runfile('01b-install-foundation-closed.sql.review',pin).returncode!=0)
  check('closed creation prefilter false',sql("SELECT platform_private.b2b_forecast_creation_scope_v1(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());").stdout.strip()=='f')
  check('closed lifecycle prefilter false',sql("SELECT platform_private.b2b_forecast_lifecycle_scope_v1('forecast_cancel',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());").stdout.strip()=='f')
  check('history empty after rollback',sql("SELECT (SELECT count(*) FROM platform_private.b2b_financial_forecasts)+(SELECT count(*) FROM platform_private.b2b_financial_forecast_events);").stdout.strip()=='0')
  # reinstall here means fresh schema reinstallation only, never dropping hosted history.
  sql("DROP SCHEMA platform_private CASCADE;CREATE SCHEMA platform_private;")
  r=runfile('01b-install-foundation-closed.sql.review',pin);check('fresh disposable reinstall',r.returncode==0,r.stderr)
  r=runfile('01c-post-foundation.sql.readonly',pin);check('fresh reinstall remains closed',r.returncode==0,r.stderr)
  sql("DROP SCHEMA platform_private CASCADE;CREATE SCHEMA platform_private;UPDATE public.fiscal_environment_marker SET project_ref='swzpzcwiasxmjutrmvkm';")
  r=runfile('01b-install-foundation-closed.sql.review',pin);check('production marker refused before DDL',r.returncode!=0 and 'HOMOLOG_MARKER_REQUIRED' in r.stderr,r.stderr)
  sql("UPDATE public.fiscal_environment_marker SET project_ref='vrlcdwmlytukrjezrrnf';INSERT INTO cron.job VALUES(true);")
  r=runfile('01b-install-foundation-closed.sql.review',pin);check('active cron refused before DDL',r.returncode!=0 and 'HOMOLOG_CRON_ACTIVE' in r.stderr,r.stderr)
  sql("DELETE FROM cron.job;")
  r=runfile('01b-install-foundation-closed.sql.review','00000000000000000000000000000000');check('event drift refused before DDL',r.returncode!=0 and 'HOMOLOG_EVENT_TRIGGER_PIN_REQUIRED' in r.stderr,r.stderr)
  check('failed stages leave no forecast relation',sql("SELECT to_regclass('platform_private.b2b_financial_forecasts') IS NULL;").stdout.strip()=='t')
 finally:cmd(['pg_ctl','-D',data,'stop','-m','fast','-w'])
 (H/'evidence/foundation-roundtrip.json').write_text(json.dumps(dict(scope='GENERATED_ADDITIVE_INSTALLER_ONLY',synthetic_parent_marker_event_triggers=True,hosted=False,real_session=False,checks=rows),indent=2)+'\n')
 assert all(r['status']=='PASS' for r in rows),rows
if __name__=='__main__':main()