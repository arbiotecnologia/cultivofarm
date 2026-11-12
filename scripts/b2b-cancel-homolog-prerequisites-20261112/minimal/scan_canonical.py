"""Match only indispensable hosted MD5s against local canonical source definitions.
Disposable catalog shells prove pg_get_functiondef hash, never runtime authority.
No business rows, remote access, credentials or installation on the app database.
"""
import hashlib,json,os,re,shutil,subprocess,tempfile
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
EXPECTED={
 'public.rpc_register_receivable_payment(uuid,jsonb)':'f59c6c09309dfa8bb5fedfa53f0873d0',
 'public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb)':'e340a643e46c6cc0dea0fcebd207f612',
 'public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamptz,text,text,uuid)':'9c94985d80502c8aea8bfb5da3abdecd',
 'public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid,uuid)':'96f6f30724c829cd4a78ce232bd5c84a',
 'public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)':'a518f355f035d485f720419e05e89906',
 'public.approve_partner_order(uuid,text,date)':'778476b1d93df2069f78f1426823e106',
 'public.approve_b2b_credit(uuid,text)':'9909cf85ef63a2adf3358ad71d20c73c',
 'public.approve_b2b_payment_terms_secure(uuid,text)':'5fa8f5b2894ade8f6a6b4eb275961916',
}
def definitions(text):
 pattern=re.compile(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:public\.)?[a-z_0-9]+)\s*\(',re.I)
 for m in pattern.finditer(text):
  name=m[1].removeprefix('public.')
  if not any(s.startswith('public.'+name+'(') for s in EXPECTED):continue
  start=m.start();suffix=text[m.end():]
  opening=re.search(r'\bAS\s+(\$[a-zA-Z_0-9]*\$)',suffix,re.I)
  if not opening:continue
  tag=opening[1];end=suffix.find(tag,opening.end())
  if end<0:continue
  stmt=text[start:m.end()+end+len(tag)]+';'
  yield name,stmt
def main():
 H.mkdir(parents=True,exist_ok=True);(H/'matched').mkdir(exist_ok=True);(H/'evidence').mkdir(exist_ok=True)
 variants={}
 for folder in ['supabase/migrations','scripts','restoration']:
  for p in sorted((ROOT/folder).rglob('*')):
   if not p.is_file() or p.suffix not in ('.sql','.review','.readonly'):continue
   if H in p.parents:continue
   try:text=p.read_text()
   except (UnicodeError,OSError):continue
   for name,body in definitions(text):
    sha=hashlib.sha256(body.encode()).hexdigest();variants.setdefault(sha,dict(name=name,body=body,paths=[]))['paths'].append(str(p.relative_to(ROOT)))
 tmp=tempfile.mkdtemp(prefix='cancel-source-',dir='/tmp');shutil.chown(tmp,user='lovable')
 env={k:v for k,v in os.environ.items() if not k.startswith('PG')};pre=['setpriv','--reuid=1000','--regid=1000','--init-groups'];port='55498';data=tmp+'/data'
 def cmd(args):return subprocess.run(pre+args,capture_output=True,text=True,env=env)
 r=cmd(['initdb','-D',data,'-U','postgres','-A','trust']);assert r.returncode==0,r.stderr
 r=cmd(['pg_ctl','-D',data,'-o',f'-p {port} -k {tmp} -c listen_addresses=','-l',tmp+'/log','start','-w']);assert r.returncode==0,r.stderr
 def sql(s):return subprocess.run(['psql','-X','-h',tmp,'-p',port,'-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=s,capture_output=True,text=True,env=env)
 results=[];matched={}
 try:
  # Empty composite shells required at CREATE time; no policies/auth stubs or data used.
  refs=set()
  for v in variants.values():refs.update(re.findall(r'\b(?:public|platform_private)\.([a-z_0-9]+)(?:%ROWTYPE|\s*;|\s*[,\n])',v['body'],re.I))
  refs.update(['partner_orders','partner_accounts','accounts_receivable','accounts_receivable_installments','fiscal_invoices','fiscal_events','fiscal_sefaz_transmissions','fiscal_xml_runs','company_fiscal_settings','profiles'])
  setup="CREATE SCHEMA platform_private;CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE TYPE public.app_role AS ENUM ('administrador','financeiro','gestor','gestor_comercial');CREATE TYPE public.partner_order_status AS ENUM ('aprovado','pendente','entregue');"
  for n in refs:
   if n in ('app_role','partner_order_status'):continue
   setup+=f'CREATE TABLE IF NOT EXISTS public.{n}(id uuid);CREATE TABLE IF NOT EXISTS platform_private.{n}(id uuid);'
  assert sql(setup).returncode==0
  for sha,v in variants.items():
   stmt=re.sub(r'^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION','CREATE OR REPLACE FUNCTION',v['body'],flags=re.I)
   signatures=[s for s in EXPECTED if s.startswith('public.'+v['name']+'(')]
   sig=signatures[0]
   r=sql('SET check_function_bodies=off;'+stmt+f"SELECT md5(pg_get_functiondef(to_regprocedure('{sig}')));")
   measured=r.stdout.strip().splitlines()[-1] if r.returncode==0 and r.stdout.strip() else None
   results.append(dict(signature=sig,expected=EXPECTED[sig],measured=measured,source_sha256=sha,paths=v['paths'],error=r.stderr if r.returncode else None))
   if measured==EXPECTED[sig]:
    matched.setdefault(sig,dict(md5=measured,source_sha256=sha,paths=v['paths']))
    filename=v['name']+'.sql';(H/'matched'/filename).write_text(v['body']+'\n')
 finally:cmd(['pg_ctl','-D',data,'stop','-m','fast','-w'])
 report=dict(verification='PG_FUNCTIONDEF_HASH_ONLY_EMPTY_COMPOSITE_SHELLS',hosted=False,expected=EXPECTED,matched=matched,missing=[s for s in EXPECTED if s not in matched],variants=results)
 (H/'evidence/canonical-body-matches.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(dict(variants=len(results),matched=matched,missing=report['missing']),indent=2))
if __name__=='__main__':main()