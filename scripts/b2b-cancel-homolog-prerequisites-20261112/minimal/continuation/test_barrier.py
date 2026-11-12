"""Exact E source, isolated synthetic identities/parents: no hosted fiscal proof."""
import concurrent.futures,json,os,shutil,subprocess,tempfile,time,uuid
from pathlib import Path
H=Path(__file__).resolve().parent
def main():
 tmp=tempfile.mkdtemp(prefix='homolog-barrier-',dir='/tmp');shutil.chown(tmp,user='lovable')
 env={k:v for k,v in os.environ.items() if not k.startswith('PG')};pre=['setpriv','--reuid=1000','--regid=1000','--init-groups'];data=tmp+'/data';port='55523'
 def cmd(a):return subprocess.run(pre+a,env=env,capture_output=True,text=True)
 assert cmd(['initdb','-D',data,'-U','postgres','-A','trust']).returncode==0
 assert cmd(['pg_ctl','-D',data,'-o',f'-p {port} -k {tmp} -c listen_addresses=','-l',tmp+'/log','start','-w']).returncode==0
 base=['psql','-X','-h',tmp,'-p',port,'-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1']
 def sql(s):return subprocess.run(base,input=s,env=env,text=True,capture_output=True)
 def q(s):return "'"+s.replace("'","''")+"'"
 def uid(i):return f'00000000-0000-0000-0000-{i:012d}'
 actor,org,partner,order,invoice,title,grant=[uid(i) for i in range(1,8)]
 claims=f"SET request.jwt.claim.sub='{actor}';"
 rows=[]
 def check(n,c,d=None):rows.append(dict(test=n,status='PASS' if c else 'FAIL',detail=d));print(rows[-1]['status'],n,flush=True)
 def assert_sql(s):
  r=sql(s);assert r.returncode==0,r.stderr;return r
 try:
  assert_sql("CREATE SCHEMA platform_private;CREATE SCHEMA auth;CREATE SCHEMA cron;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE TYPE public.app_role AS ENUM('administrador','financeiro');CREATE TABLE cron.job(active boolean);CREATE TABLE public.fiscal_environment_marker(project_ref text,production_emission_allowed boolean);INSERT INTO public.fiscal_environment_marker VALUES('vrlcdwmlytukrjezrrnf',false);CREATE TABLE platform_private.b2b_forecast_creation_gate_v1(enabled boolean);CREATE TABLE platform_private.b2b_forecast_lifecycle_gate_v1(enabled boolean);CREATE TABLE platform_private.b2b_financial_forecasts(id uuid);CREATE TABLE public.actor_state(actor uuid PRIMARY KEY,organization uuid,active boolean);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;CREATE FUNCTION platform_private.c2p1_internal_actor(public.app_role[]) RETURNS uuid LANGUAGE sql STABLE AS $$SELECT organization FROM public.actor_state WHERE actor=auth.uid() AND active$$;")
  assert_sql(f"INSERT INTO public.actor_state VALUES('{actor}','{org}',true);CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz);INSERT INTO public.partner_accounts VALUES('{partner}','{org}',true,NULL);CREATE TABLE public.partner_orders(id uuid PRIMARY KEY,partner_id uuid);INSERT INTO public.partner_orders VALUES('{order}','{partner}');CREATE TABLE public.fiscal_invoices(id uuid PRIMARY KEY,organization_id uuid,partner_order_id uuid,debtor_partner_id uuid,environment text);INSERT INTO public.fiscal_invoices VALUES('{invoice}','{org}','{order}','{partner}','HOMOLOGATION');CREATE TABLE public.accounts_receivable(id uuid PRIMARY KEY,organization_id uuid,partner_id uuid,origin_type text,origin_id uuid,b2b_document_id uuid,created_by uuid,status text,fiscal_invoice_status text,payment_gateway text,external_payment_id text,boleto_url text,pix_qr_code text,pix_copia_cola text,total_amount numeric);CREATE TABLE public.accounts_receivable_installments(id uuid PRIMARY KEY,receivable_id uuid,organization_id uuid);CREATE TABLE public.receivable_payments(id uuid PRIMARY KEY,organization_id uuid,installment_id uuid,created_by uuid,is_reversal boolean,amount_received numeric);")
  guard=json.loads((H/'capture/statement-guard.json').read_text())
  z=assert_sql(guard['exact_definition']+";REVOKE ALL ON FUNCTION platform_private.homolog_validation_block_receivable_insert() FROM PUBLIC;CREATE TRIGGER a00_homolog_validation_no_receivable BEFORE INSERT ON public.accounts_receivable FOR EACH STATEMENT EXECUTE FUNCTION platform_private.homolog_validation_block_receivable_insert();SELECT md5(pg_get_functiondef('platform_private.homolog_validation_block_receivable_insert()'::regprocedure));")
  check('supplied actual statement body hash',z.stdout.strip()==guard['current_md5'],z.stdout)
  z=sql(claims+'INSERT INTO public.accounts_receivable SELECT * FROM public.accounts_receivable WHERE false;')
  check('actual baseline blocks every INSERT',z.returncode!=0 and 'HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED' in z.stderr)
  # Exact generated payload, not PRE/catalog stubs presented as full roundtrip.
  etext=(H/'E-install-closed.sql.review').read_text();start=etext.index('-- Source only;');end=etext.index('DO $closed$',start)
  payload=etext[start:end];z=sql('BEGIN;'+payload+'COMMIT;')
  check('exact E payload installs closed',z.returncode==0,z.stderr)
  if z.returncode:raise RuntimeError(z.stderr)
  check('statement trigger remains enabled same function OID',sql("SELECT tgenabled='O' AND tgfoid='platform_private.homolog_validation_block_receivable_insert()'::regprocedure FROM pg_trigger WHERE tgname='a00_homolog_validation_no_receivable';").stdout.strip()=='t')
  check('no grants or ticket issuer',sql("SELECT NOT has_function_privilege('authenticated','platform_private.cancel_homolog_fixture_scope_v1(text,uuid,jsonb,boolean)','EXECUTE') AND NOT has_table_privilege('authenticated','platform_private.cancel_homolog_fixture_permits_v1','INSERT');").stdout.strip()=='t')
  row=dict(id=title,organization_id=org,partner_id=partner,origin_type='B2B_ORDER',origin_id=order,b2b_document_id=invoice,created_by=actor,status='OPEN',fiscal_invoice_status='ISSUED',payment_gateway=None,external_payment_id=None,boleto_url=None,pix_qr_code=None,pix_copia_cola=None,total_amount=10)
  def insert(image):return 'INSERT INTO public.accounts_receivable SELECT * FROM jsonb_populate_record(NULL::public.accounts_receivable,'+q(json.dumps(image))+'::jsonb);'
  def ticket(image,action='TITLE',obj=title):
   return f"INSERT INTO platform_private.cancel_homolog_fixture_permits_v1(transaction_id,backend_pid,actor_id,grant_id,action,object_id,expected_row) VALUES(txid_current(),pg_backend_pid(),'{actor}','{grant}','{action}','{obj}',{q(json.dumps(image))}::jsonb);"
  assert_sql(f"INSERT INTO platform_private.cancel_homolog_fixture_grants_v1 VALUES('{grant}','{actor}','{org}','{order}','{partner}','{invoice}','{title}',true,now(),now()+interval '1 hour',NULL);")
  z=sql('BEGIN;'+claims+ticket(row)+insert(row)+'COMMIT;')
  check('gate OFF blocks even a private synthetic permit',z.returncode!=0 and 'HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED' in z.stderr)
  assert_sql('UPDATE platform_private.cancel_homolog_fixture_gate_v1 SET enabled=true;')
  z=sql(claims+"SET fixture.allow='true';"+insert(row))
  check('forged GUC never opens normal traffic',z.returncode!=0 and 'HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED' in z.stderr)
  for field,value in [('organization_id',uid(99)),('total_amount',11),('boleto_url','https://invalid.example/never-used'),('created_by',uid(99))]:
   bad={**row,field:value};z=sql('BEGIN;'+claims+ticket(row)+insert(bad)+'COMMIT;')
   check('row rejects altered '+field,z.returncode!=0 and 'HOMOLOG_FIXTURE_ROW_DENIED' in z.stderr,z.stderr)
  assert_sql(f"UPDATE platform_private.cancel_homolog_fixture_grants_v1 SET revoked_at=now() WHERE id='{grant}';")
  z=sql('BEGIN;'+claims+ticket(row)+insert(row)+'COMMIT;');check('revoked grant blocks row',z.returncode!=0 and 'HOMOLOG_FIXTURE_ROW_DENIED' in z.stderr)
  assert_sql(f"UPDATE platform_private.cancel_homolog_fixture_grants_v1 SET revoked_at=NULL,valid_from=now()-interval '2 hours',valid_until=now()-interval '1 hour' WHERE id='{grant}';")
  z=sql('BEGIN;'+claims+ticket(row)+insert(row)+'COMMIT;');check('expired grant blocks row',z.returncode!=0 and 'HOMOLOG_FIXTURE_ROW_DENIED' in z.stderr)
  assert_sql(f"UPDATE platform_private.cancel_homolog_fixture_grants_v1 SET valid_from=now(),valid_until=now()+interval '1 hour' WHERE id='{grant}';")
  z=sql('BEGIN;'+claims+ticket(row)+insert(row)+"SELECT used FROM platform_private.cancel_homolog_fixture_permits_v1;ROLLBACK;")
  check('exact synthetic row consumes one-shot permit',z.returncode==0 and z.stdout.strip().endswith('t'),z.stderr)
  check('rolled-back row not persisted',sql('SELECT count(*) FROM public.accounts_receivable;').stdout.strip()=='0')
  z=sql('BEGIN;'+claims+ticket(row)+insert(row)+insert(row)+'COMMIT;')
  check('permit cannot create twice',z.returncode!=0 and 'HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED' in z.stderr,z.stderr)
  # Multi-row statement prefilter is not sufficient: second unrelated row aborts all.
  bad={**row,'id':uid(99)}
  batch='INSERT INTO public.accounts_receivable SELECT * FROM jsonb_populate_recordset(NULL::public.accounts_receivable,'+q(json.dumps([row,bad]))+'::jsonb);'
  z=sql('BEGIN;'+claims+ticket(row)+batch+'COMMIT;')
  check('mixed multi-row INSERT aborts atomically',z.returncode!=0 and 'HOMOLOG_FIXTURE_ROW_DENIED' in z.stderr and sql('SELECT count(*) FROM public.accounts_receivable;').stdout.strip()=='0',z.stderr)
  # Deterministic wait: revoke actor while the scope waits on the exact grant row.
  holder=subprocess.Popen(base,env=env,text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  assert holder.stdin is not None and holder.stdout is not None
  holder.stdin.write(f"BEGIN;SELECT 1 FROM platform_private.cancel_homolog_fixture_grants_v1 WHERE id='{grant}' FOR UPDATE;SELECT pg_backend_pid();\n");holder.stdin.flush()
  pid=None
  while pid is None:
   line=holder.stdout.readline().strip()
   if line.isdigit() and int(line)>1:pid=int(line)
  tag='barrier_wait_'+uuid.uuid4().hex
  with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
   future=pool.submit(sql,'BEGIN;'+claims+f"SET application_name='{tag}';"+ticket(row)+insert(row)+'COMMIT;')
   seen=False
   for _ in range(100):
    if sql(f"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='{tag}' AND {pid}=ANY(pg_blocking_pids(pid)));").stdout.strip()=='t':seen=True;break
    time.sleep(.02)
   assert_sql(f"UPDATE public.actor_state SET active=false WHERE actor='{actor}';")
   holder.stdin.write('COMMIT;\n');holder.stdin.flush();holder.stdin.close();holder.wait(timeout=10)
   z=future.result(timeout=10)
  check('actor revocation rechecked after proven wait',seen and z.returncode!=0 and 'HOMOLOG_FIXTURE_ROW_DENIED' in z.stderr,z.stderr)
  assert_sql(f"UPDATE public.actor_state SET active=true WHERE actor='{actor}';")
  # Persist a synthetic title only in the reduced component harness to verify
  # payment barrier. It is not the canonical invoice/title pipeline or a hosted fixture.
  assert_sql('BEGIN;'+claims+ticket(row)+insert(row)+'COMMIT;')
  installment=uid(8);payment=uid(9)
  assert_sql(f"INSERT INTO public.accounts_receivable_installments VALUES('{installment}','{title}','{org}');")
  pay=dict(id=payment,organization_id=org,installment_id=installment,created_by=actor,is_reversal=False,amount_received=1)
  payinsert='INSERT INTO public.receivable_payments SELECT * FROM jsonb_populate_record(NULL::public.receivable_payments,'+q(json.dumps(pay))+'::jsonb);'
  z=sql(claims+payinsert);check('synthetic-title payment without exact permit denied',z.returncode!=0 and 'HOMOLOG_FIXTURE_ROW_DENIED' in z.stderr,z.stderr)
  z=sql('BEGIN;'+claims+ticket(pay,'PAYMENT',payment)+payinsert+'COMMIT;')
  check('exact synthetic payment R$1 persisted locally',z.returncode==0 and sql('SELECT amount_received FROM public.receivable_payments;').stdout.strip()=='1',z.stderr)
  before=sql('SELECT md5(row_to_json(r)::text) FROM public.accounts_receivable r;').stdout.strip()+sql('SELECT md5(row_to_json(r)::text) FROM public.receivable_payments r;').stdout.strip()
  z=sql((H/'E-rollback-deny.sql.review').read_text());check('exact E deny rollback passes with retained history',z.returncode==0,z.stderr)
  check('rollback preserves title/payment history',before==sql('SELECT md5(row_to_json(r)::text) FROM public.accounts_receivable r;').stdout.strip()+sql('SELECT md5(row_to_json(r)::text) FROM public.receivable_payments r;').stdout.strip())
  check('rollback gate false',sql('SELECT enabled FROM platform_private.cancel_homolog_fixture_gate_v1;').stdout.strip()=='f')
  z=sql(claims+'INSERT INTO public.accounts_receivable SELECT * FROM public.accounts_receivable WHERE false;')
  check('normal traffic still blocked after rollback',z.returncode!=0 and 'HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED' in z.stderr)
 finally:cmd(['pg_ctl','-D',data,'stop','-m','fast','-w'])
 out=H/'evidence'/('barrier-'+Path(tmp).name+'.json');out.write_text(json.dumps(dict(hosted=False,real_session=False,canonical_title_flow=False,seams=['synthetic identity/role resolver','reduced parent/title/payment schema without remaining homolog triggers','permits seeded by local owner for barrier unit proof, no delivered issuer'],checks=rows),indent=2)+'\n')
 assert all(r['status']=='PASS' for r in rows),str(out)
if __name__=='__main__':main()