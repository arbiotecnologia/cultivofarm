"""Disposable PostgreSQL only. Captured financial bodies/triggers/policies;
Auth/readiness/SaaS/audit/unrelated title guards and reduced schema explicitly synthetic.
No hosted connection, JWT, browser login or accounting validation.
"""
from pathlib import Path
import subprocess, tempfile, os, json, re, hashlib, importlib.util
H=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('assembly',H/'assemble.py'); a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
D=a.D
A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
U='11111111-1111-4111-8111-111111111111'; V='22222222-2222-4222-8222-222222222222'
C='33333333-3333-4333-8333-333333333333'; E='44444444-4444-4444-8444-444444444444'; K='55555555-5555-4555-8555-555555555555'
def setup():
 s="""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA finance_private;
 GRANT USAGE ON SCHEMA public,auth,platform_private TO authenticated,anon,service_role;
 CREATE TYPE app_role AS ENUM ('administrador','gestor','financeiro','consultor_tecnico');
 CREATE TABLE organizations(id uuid PRIMARY KEY,ativo boolean DEFAULT true);
 CREATE TABLE profiles(user_id uuid PRIMARY KEY,organization_id uuid,ativo boolean DEFAULT true);
 CREATE TABLE user_roles(user_id uuid,role app_role);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
 CREATE FUNCTION fn_authz_uid_scope_ok(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1=auth.uid()$$;
 CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2)$$;
 CREATE TABLE clientes(id uuid PRIMARY KEY,organization_id uuid);
 CREATE TABLE financial_categories(id uuid PRIMARY KEY,active boolean,type text);
 CREATE TABLE financial_cost_centers(id uuid PRIMARY KEY,active boolean);
 CREATE TABLE financial_audit_log(entity_type text,entity_id uuid,action text,old_data jsonb,new_data jsonb,performed_by uuid);
 """
 for kind in ['receivable','payable']:
  s+=f"""CREATE TABLE accounts_{kind}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid,customer_id uuid,supplier_id uuid,supplier_name text,description text,category_id uuid,cost_center_id uuid,total_amount numeric(14,2),issue_date date,first_due_date date,installment_count int,notes text,created_by uuid,origin_type text,status text DEFAULT 'OPEN',fiscal_invoice_required boolean,fiscal_invoice_status text,payment_method_id uuid,supplier_invoice_date date,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE accounts_{kind}_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,{kind}_id uuid REFERENCES accounts_{kind}(id),installment_number int,due_date date,original_amount numeric(14,2),net_amount numeric(14,2),status text,created_at timestamptz DEFAULT now(),UNIQUE({kind}_id,installment_number));
 """
 # Exact captured functions (including authorization wrappers); only their downstream
 # Auth readiness/role dependencies above are synthetic.
 for f in sorted(D['functions'],key=lambda f: 0 if f['signature'].startswith('platform_private.') else 1):
  s+=f['body']+';\n'+f"REVOKE ALL ON FUNCTION {('public.' if not f['signature'].startswith('platform_private.') else '')+f['signature']} FROM PUBLIC;\n"
  for role in re.findall(r'(\w+)=X/',f['acl']): s+=f"GRANT EXECUTE ON FUNCTION {('public.' if not f['signature'].startswith('platform_private.') else '')+f['signature']} TO {role};\n"
 funcs=set(f['signature'].split('(')[0] for f in D['functions'])
 stubs=set()
 for t in D['triggers']:
  name=re.search(r'EXECUTE FUNCTION ([\w.]+)\(',t['definition']).group(1)
  if name not in funcs and name not in stubs:
   stubs.add(name); s+=f"CREATE FUNCTION {name}() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;\n"
  s+=t['definition']+';\n'
 for t in D['tables']:
  s+=f"ALTER TABLE {t['name']} ENABLE ROW LEVEL SECURITY; GRANT ALL ON {t['name']} TO anon,authenticated,service_role;\n"
 for p in D['policies']:
  s+=f"CREATE POLICY {p['policyname']} ON {p['tablename']} AS {p['permissive']} FOR {p['cmd']} TO {','.join(p['roles'])}"
  if p['qual']: s+=' USING ('+p['qual']+')'
  if p['with_check']: s+=' WITH CHECK ('+p['with_check']+')'
  s+=';\n'
 s+=f"INSERT INTO organizations VALUES('{A}',true),('{B}',true); INSERT INTO profiles VALUES('{U}','{A}',true),('{V}','{B}',true); INSERT INTO user_roles VALUES('{U}','financeiro'),('{V}','administrador'); INSERT INTO clientes VALUES('{C}','{A}'),('{E}','{B}'); INSERT INTO financial_categories VALUES('{K}',true,'AMBOS');"
 return s

def payload(total=1,amounts=None,customer=C,dates=None):
 if amounts is None: amounts=[.34,.33,.33]
 dates=dates or ['2026-10-24','2026-11-24','2026-12-24']
 return dict(customer_id=customer,supplier_name='Fictício local',description='TESTE LOCAL',category_id=K,total_amount=total,issue_date='2026-10-24',first_due_date='2026-10-24',installment_count=3,installments=[dict(installment_number=i+1,due_date=dates[i],amount=x) for i,x in enumerate(amounts)])
def call(p,kind='receivable',uid=U):
 return f"SELECT set_config('test.uid','{uid}',false); SET ROLE authenticated; SELECT rpc_create_financial_title('{kind}',{a.literal(json.dumps(p))}::jsonb);"

def main():
 tmp=Path(tempfile.mkdtemp(prefix='initial-parcels-',dir='/tmp')); tmp.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 cmd=['psql','-X','-A','-t','-h',str(tmp),'-p','55517','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
 count=0
 def run(s,success=True):
  r=subprocess.run(cmd,input=s,text=True,capture_output=True); (tmp/'last.log').write_text(r.stdout+r.stderr)
  assert (r.returncode==0)==success,r.stderr[-6000:]
  return r
 def ok(label):
  nonlocal count;count+=1;print('PASS '+label)
 def state():
  return run("SELECT jsonb_build_object('bodies',(SELECT jsonb_agg(jsonb_build_array(oid::regprocedure::text,md5(pg_get_functiondef(oid)),proacl::text,proowner) ORDER BY oid) FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'platform_private'::regnamespace)),'titles',(SELECT count(*) FROM accounts_receivable),'ap',(SELECT count(*) FROM accounts_payable),'ar_parts',(SELECT count(*) FROM accounts_receivable_installments),'ap_parts',(SELECT count(*) FROM accounts_payable_installments),'audit',(SELECT count(*) FROM financial_audit_log));").stdout
 def denied(label,s,code,msg):
  before=state();r=run(s,False);assert code in r.stderr and msg in r.stderr,r.stderr;assert state()==before;ok(label)
 def command(name,fail=False):
  text=(H/name).read_bytes().decode()
  # DO/DDL checkpoints get real transaction IDs, no function slicing.
  lines=text.splitlines(True);tag=None;out=[];checkpoints=0
  for line in lines:
   outside=tag is None
   if outside and (line.startswith('DO ') or line.startswith('CREATE ') or line.startswith('ALTER ')):
    out.append("DO $trace$ BEGIN RAISE NOTICE 'XID:%',txid_current(); END $trace$;\n");checkpoints+=1
   if outside and line.strip()=='COMMIT;' and fail:
    out.append("DO $fail$ BEGIN RAISE EXCEPTION 'DELIBERATE_POST_FAILURE'; END $fail$;\n")
   out.append(line)
   if not line.lstrip().startswith('--'):
    for match in re.finditer(r'\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$',line):
     if tag is None:tag=match.group()
     elif tag==match.group():tag=None
  before=state();r=run(''.join(out),not fail);ids=re.findall(r'XID:(\d+)',r.stderr);assert len(ids)==checkpoints and len(set(ids))==1,(name,ids,r.stderr)
  if fail: assert 'DELIBERATE_POST_FAILURE' in r.stderr and state()==before
  ok('full '+name+(' POST failure atomic' if fail else ' single xid'))
 try:
  subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'server.log'),'-o',f'-k {tmp} -h "" -p 55517','start'],check=True,capture_output=True)
  run(setup())
  run('BEGIN READ ONLY;'+a.guard()+'COMMIT;');ok('captured hashes owners ACL triggers RLS policies exact')
  for kind in ['receivable','payable']:
   denied('baseline '+kind+' 1/3 snapshot failure',call(payload(),kind),'23514','Parcela imutavel')
  # Install review bodies once only to obtain pg_get_functiondef normalized hashes.
  run('BEGIN;'+a.context+''.join((H/(s.split('(')[0]+'.sql.review')).read_bytes().decode() for s in a.CHANGED)+'COMMIT;')
  hashes={s:run(f"SELECT md5(pg_get_functiondef('public.{s}'::regprocedure));").stdout.strip() for s in a.CHANGED}
  (H/'post-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n');a.assemble()
  run(''.join(f['body']+';\n' for f in D['functions'] if f['signature'] in a.CHANGED))
  command('preflight.sql');command('candidate.sql.review',True);command('candidate.sql.review');command('postflight.sql')
  for kind in ['receivable','payable']:
   for uid,cust,org in [(U,C,A),(V,E,B)]:
    p=payload(customer=cust);r=run(call(p,kind,uid));assert '"success": true' in r.stdout
    vals=run(f"SELECT string_agg(original_amount::text,',' ORDER BY installment_number) FROM accounts_{kind}_installments WHERE {kind}_id=(SELECT id FROM accounts_{kind} WHERE organization_id='{org}' ORDER BY created_at DESC,id DESC LIMIT 1);").stdout.strip();assert vals=='0.34,0.33,0.33',vals;ok(kind+' '+org[0]+' 1/3 exact initial cents')
   r=run(call(payload(.99,[.33,.33,.33]),kind));assert '"success": true' in r.stdout;ok(kind+' .99/3')
   denied(kind+' .01/3',call(payload(.01,[.01,0,0]),kind),'23514','FIN_TITLE_INVALID_INSTALLMENT')
   p=payload(dates=['2026-10-27','2026-12-02','2027-02-11']);r=run(call(p,kind));j=json.loads(next(x for x in r.stdout.splitlines() if x.startswith('{')));tid=j['title_id']
   dates=run(f"SELECT string_agg(due_date::text,',' ORDER BY installment_number) FROM accounts_{kind}_installments WHERE {kind}_id='{tid}';").stdout.strip();assert dates=='2026-10-27,2026-12-02,2027-02-11';ok(kind+' custom dates inserted first')
   denied(kind+' later snapshot mutation',f"SELECT set_config('test.uid','',false); UPDATE accounts_{kind}_installments SET original_amount=.35 WHERE {kind}_id='{tid}' AND installment_number=1;",'23514','Parcela imutavel')
   denied(kind+' cross installment tenant',f"SELECT set_config('test.uid','',false); INSERT INTO accounts_{kind}_installments(organization_id,{kind}_id,installment_number) VALUES('{B}','{tid}',9);",'23514',f'FINANCIAL_{kind.upper()}_TENANT_MISMATCH')
   denied(kind+' cross tenant payload',call(dict(p,organization_id=B),kind),'42501','FINANCIAL_TENANT_MISMATCH')
   denied(kind+' private context inaccessible',f"SET ROLE authenticated; INSERT INTO platform_private.financial_initial_installments VALUES(txid_current(),gen_random_uuid(),'{kind}','{U}','{A}','[]');",'42501','permission denied')
  denied('B foreign customer A',call(payload(customer=C),uid=V),'23514','FINANCIAL_CUSTOMER_TENANT_MISMATCH')
  denied('A foreign customer B',call(payload(customer=E)),'23514','FINANCIAL_CUSTOMER_TENANT_MISMATCH')
  # A/B reads use captured RLS, not an error-only assertion.
  for uid,org in [(U,A),(V,B)]:
   for kind in ['receivable','payable']:
    r=run(f"SELECT set_config('test.uid','{uid}',false); SET ROLE authenticated; SELECT count(*)>0 AND bool_and(organization_id='{org}') FROM accounts_{kind};");assert r.stdout.strip().endswith('t');ok(kind+' scoped read '+org[0])
  for p,token in [(dict(payload(),installments=[dict(x,amount=.1) for x in payload()['installments']]),'FIN_TITLE_INVALID_SUM'),(dict(payload(),installments=[dict(x,installment_number=1) for x in payload()['installments']]),'FIN_TITLE_INVALID_SEQUENCE'),(payload(dates=['infinity','2026-11-24','2026-12-24']),'FIN_TITLE_INVALID_INSTALLMENT')]:
   denied(token,call(p),'23514',token)
  p=payload();del p['installments'];p['total_amount']=.01;denied('small total without custom array',call(p),'23514','FIN_TITLE_INVALID_INSTALLMENT')
  # Late failure after title+all installments+customization audit rolls everything back.
  run("CREATE FUNCTION public.local_late_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action IN ('AR_MANUAL_CREATED','AP_MANUAL_CREATED') THEN RAISE EXCEPTION 'LOCAL_LATE_FAIL' USING ERRCODE='23514'; END IF; RETURN NEW; END$$; CREATE TRIGGER local_late_fail BEFORE INSERT ON financial_audit_log FOR EACH ROW EXECUTE FUNCTION local_late_fail();")
  for kind in ['receivable','payable']:denied(kind+' late failure all effects rollback',call(payload(),kind),'23514','LOCAL_LATE_FAIL')
  run('DROP TRIGGER local_late_fail ON financial_audit_log;');assert run('SELECT count(*) FROM platform_private.financial_initial_installments;').stdout.strip()=='0';ok('private context empty after success and failure')
  run(f"UPDATE profiles SET ativo=false WHERE user_id='{U}';");denied('inactive actor',call(payload()),'42501','FINANCIAL_TENANT_REQUIRED');run(f"UPDATE profiles SET ativo=true WHERE user_id='{U}';")
  run(f"DELETE FROM user_roles WHERE user_id='{U}';");denied('role revoked',call(payload()),'42501','Sem permissão');run(f"INSERT INTO user_roles VALUES('{U}','financeiro');")
  command('rollback.sql.review',True);command('rollback.sql.review');command('preflight.sql')
  # No rewrite of immutable captures; rollback keeps empty private infrastructure.
  print(f'TOTAL {count} PASS; synthetic Auth, reduced schema, no hosted JWT/RLS certification')
  print(json.dumps(hashes))
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True)
if __name__=='__main__':main()
