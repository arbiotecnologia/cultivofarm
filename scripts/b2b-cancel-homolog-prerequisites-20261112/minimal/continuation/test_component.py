"""Local socket only. Exact DDL/helper bytes; catalog/auth seams explicitly synthetic."""
import hashlib,json,os,shutil,subprocess,tempfile
from pathlib import Path
import generate as G
H=Path(__file__).resolve().parent
def main():
 tmp=tempfile.mkdtemp(prefix='homolog-continuation-',dir='/tmp');shutil.chown(tmp,user='lovable')
 env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
 runas=['setpriv','--reuid=1000','--regid=1000','--init-groups'];data=tmp+'/data';port='55519'
 def cmd(a):return subprocess.run(runas+a,env=env,text=True,capture_output=True)
 assert cmd(['initdb','-D',data,'-U','postgres','-A','trust']).returncode==0
 assert cmd(['pg_ctl','-D',data,'-o',f'-p {port} -k {tmp} -c listen_addresses=','-l',tmp+'/log','start','-w']).returncode==0
 def sql(s):return subprocess.run(['psql','-X','-h',tmp,'-p',port,'-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=s,env=env,text=True,capture_output=True)
 rows=[]
 def check(n,c,d=None):rows.append(dict(test=n,status='PASS' if c else 'FAIL',detail=d));print(rows[-1]['status'],n,flush=True)
 try:
  setup="CREATE SCHEMA platform_private;CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE SCHEMA cron;CREATE TABLE cron.job(active boolean);CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TYPE public.app_role AS ENUM('administrador','gestor_comercial','financeiro');CREATE TABLE public.fiscal_environment_marker(project_ref text,production_emission_allowed boolean);INSERT INTO public.fiscal_environment_marker VALUES('vrlcdwmlytukrjezrrnf',false);"
  assert sql(setup).returncode==0
  d=json.loads((H/'capture/catalog.json').read_text())
  for name in sorted({t['typname'] for t in d['types'] if t['typtype']=='e' and t['nspname']=='public' and t['typname']!='app_role'}):
   labels=[t['enumlabel'] for t in d['types'] if t['typname']==name and t['enumlabel'] is not None]
   z=sql('CREATE TYPE public.'+name+' AS ENUM('+','.join(G.quote(s) for s in labels)+');');assert z.returncode==0,z.stderr
  # Column types/NOT NULL captured exactly; constraints/defaults/guards not claimed reconstructed.
  for r in d['schema']:
   cols=','.join('"'+c['name']+'" '+c['type']+(' NOT NULL' if c['not_null'] else '') for c in r['columns'])
   z=sql('CREATE TABLE '+r['name']+'('+cols+');ALTER TABLE '+r['name']+' ADD PRIMARY KEY(id);');assert z.returncode==0,z.stderr
  z=sql("CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-0000-0000-000000000001'::uuid$$;CREATE FUNCTION platform_private.c2p1_internal_actor(public.app_role[]) RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-0000-0000-000000000002'::uuid$$;CREATE FUNCTION platform_private.c2p1_settings_allowed(uuid,boolean) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;CREATE FUNCTION public._saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;")
  assert z.returncode==0,z.stderr
  # Stage A exact extracted DDL, not replaying its synthetic event PRE as hosted proof.
  a=(H.parent/'01b-install-foundation-closed.sql.review').read_text()
  a=a[a.index('CREATE TABLE platform_private.b2b_financial_forecasts('):a.index('DO $post$')]
  z=sql(a);assert z.returncode==0,z.stderr
  for item in d['definitions']:
   z=sql('SET check_function_bodies=off;'+item['exact_definition']+';SELECT md5(pg_get_functiondef('+G.quote(item['signature'])+'::regprocedure));')
   check('exact supplied definition '+item['signature'],z.returncode==0 and z.stdout.strip()==item['current_md5'],z.stderr)
  for label in ['B','C','D']:
   text=(H/(label+'-install.sql.review')).read_text()
   start=text.index('CREATE TABLE platform_private.')
   end=text.index('DO $invariant$')
   z=sql('BEGIN;'+text[start:end]+'COMMIT;')
   check(label+' exact additive payload + closed POST',z.returncode==0,z.stderr)
   if z.returncode:raise RuntimeError(z.stderr)
  for label in ['B','C','D']:
   z=sql((H/(label+'-rollback-deny.sql.review')).read_text());check(label+' exact rollback',z.returncode==0,z.stderr)
  # Delivered PRE must stop on the real missing captured catalog, never silently skip it.
  z=sql((H/'B-pre.sql.readonly').read_text());check('full PRE refuses reduced catalog',z.returncode!=0 and 'DRIFT' in z.stderr,z.stderr)
  check('private residual command has no client grant',sql("SET ROLE authenticated;SELECT platform_private.cancel_homolog_residual_command_v1(NULL,1,'reason');").returncode!=0)
  check('capability gate OFF denies without payload',sql("SELECT platform_private.cancel_homolog_residual_capability_v1(gen_random_uuid());").stdout.strip()=='{"available": false}')
  check('fiscal helper gate OFF denies finality',sql("SELECT platform_private.b2b_cancel_confirmed_fiscal_v1(gen_random_uuid());").stdout.strip()=='{"code": "CANCEL_POLICY_DISABLED", "final": false}')
  # Concrete state contract on installed helper/DDL, no invented aprobado_previsto.
  uid="'00000000-0000-0000-0000-000000000003'"
  # Parent fixture has only identity: synthetic shape, no fake canonical order-create assertion.
  sql('ALTER TABLE platform_private.b2b_financial_forecasts DROP CONSTRAINT b2b_financial_forecasts_order_id_fkey;')
  fixture="INSERT INTO platform_private.b2b_financial_forecasts(id,order_id,organization_id,partner_id,total_amount,residual_amount,state,economic_snapshot,schedule_snapshot,items_snapshot,credit_decision_snapshot,commercial_approved_by,commercial_approved_at) VALUES("+uid+",gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),20,20,'aguardando_fiscal','{}','[]','[]','{}',gen_random_uuid(),now());"
  z=sql(fixture);assert z.returncode==0,z.stderr
  z=sql('SELECT platform_private.b2b_financial_forecast_cancel_residual_v1('+uid+",1,'motivo teste');")
  check('aguardando_fiscal 20 becomes canceled residual 0',z.returncode==0 and sql('SELECT residual_amount::text||\':\'||state FROM platform_private.b2b_financial_forecasts WHERE id='+uid).stdout.strip()=='0.00:cancelado_antes_nf',z.stderr)
  check('stale CAS cannot cancel twice',sql('SELECT platform_private.b2b_financial_forecast_cancel_residual_v1('+uid+",1,'motivo teste');").returncode!=0)
  check('one cancellation event retained',sql('SELECT count(*) FROM platform_private.b2b_financial_forecast_events WHERE forecast_id='+uid).stdout.strip()=='1')
  for st in ['emissao_em_andamento','consulta_fiscal_obrigatoria','faturado_total']:
   sql('BEGIN;UPDATE platform_private.b2b_financial_forecasts SET state='+G.quote(st)+',version=version+1 WHERE id='+uid+';COMMIT;')
   v=sql('SELECT version FROM platform_private.b2b_financial_forecasts WHERE id='+uid).stdout.strip()
   z=sql('SELECT platform_private.b2b_financial_forecast_cancel_residual_v1('+uid+','+v+",'motivo teste');")
   check(st+' stays blocked',z.returncode!=0 and 'B2B_FORECAST_STATE_CONFLICT' in z.stderr,z.stderr)
  sql("CREATE FUNCTION platform_private.local_statement_barrier() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'HOMOLOG_RECEIVABLE_BLOCKED';END$$;CREATE TRIGGER a00_homolog_validation_no_receivable BEFORE INSERT ON public.accounts_receivable FOR EACH STATEMENT EXECUTE FUNCTION platform_private.local_statement_barrier();")
  z=sql('INSERT INTO public.accounts_receivable SELECT * FROM public.accounts_receivable WHERE false;')
  check('statement barrier blocks even empty INSERT without row permit',z.returncode!=0 and 'HOMOLOG_RECEIVABLE_BLOCKED' in z.stderr)
  check('no title or payment fabricated',sql('SELECT (SELECT count(*) FROM public.accounts_receivable)+(SELECT count(*) FROM public.receivable_payments);').stdout.strip()=='0')
  sql("UPDATE public.fiscal_environment_marker SET project_ref='wrong';")
  check('wrong marker refuses rollback',sql((H/'D-rollback-deny.sql.review').read_text()).returncode!=0)
 finally:cmd(['pg_ctl','-D',data,'stop','-m','fast','-w'])
 out=H/'evidence'/('component-'+Path(tmp).name+'.json')
 out.write_text(json.dumps(dict(real_session=False,remote=False,exact_full_catalog_roundtrip=False,seams=['captured column shells without business guards/defaults','synthetic auth/role/settings/features','Stage A payload only','forecast parent FK removed only in disposable state-contract test','synthetic statement barrier, not hosted body'],checks=rows),indent=2)+'\n')
 assert all(r['status']=='PASS' for r in rows),str(out)
if __name__=='__main__':main()