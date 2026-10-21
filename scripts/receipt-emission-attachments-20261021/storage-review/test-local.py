"""Disposable PG via explicit /tmp socket, no hosted credentials. RLS test with synthetic tenant/roles/operation; not HTTP proof."""
from pathlib import Path
import os,subprocess,tempfile,json
H=Path(__file__).resolve().parent
pre=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
t=Path(tempfile.mkdtemp(prefix='receipt-pg-',dir='/tmp'));t.chmod(0o777);started=False;checks=[]
try:
 subprocess.run(pre+['initdb','-D',str(t/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
 subprocess.run(pre+['pg_ctl','-D',str(t/'data'),'-l',str(t/'log'),'-o',f'-k {t} -h "" -p 55529','start','-w'],check=True,capture_output=True);started=True
 def run(s,ok=True):
  r=subprocess.run(['psql','-X','-h',str(t),'-p','55529','-U','postgres','-v','ON_ERROR_STOP=1','-At'],input=s,text=True,capture_output=True)
  if ok and r.returncode:raise AssertionError(r.stderr)
  return r
 run("""CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA storage;GRANT USAGE ON SCHEMA storage TO authenticated,anon,service_role;
 CREATE TABLE storage.objects(id int PRIMARY KEY,bucket_id text,name text);GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,anon,service_role;
 CREATE TABLE storage.buckets(id text,public boolean,file_size_limit bigint,allowed_mime_types text[]);INSERT INTO storage.buckets VALUES('financial-receipts',false,NULL,NULL);
 CREATE FUNCTION public.h15_actor_organization() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('fixture.tenant',true)$$;
 CREATE FUNCTION public.is_financial_staff(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('fixture.staff',true)='yes'$$;
 CREATE FUNCTION public.financial_storage_object_permitted(text,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1='financial-receipts' AND split_part($2,'/',1)=public.h15_actor_organization() AND public.is_financial_staff(NULL)$$;
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE POLICY tenant ON storage.objects TO authenticated USING(public.financial_storage_object_permitted(bucket_id,name)) WITH CHECK(public.financial_storage_object_permitted(bucket_id,name));
 CREATE POLICY other_bucket ON storage.objects TO authenticated,anon USING(bucket_id='other') WITH CHECK(bucket_id='other');
 INSERT INTO storage.objects VALUES(1,'financial-receipts','A/2026/receipt.pdf'),(2,'financial-receipts','B/2026/receipt.pdf'),(3,'other','public.txt');""")
 run((H.parents[1]/'authz-cache/v6/live-storage.sql.review').read_text())
 def ctx(op,tenant='A',staff='yes',role='authenticated'):
  return f"SET ROLE {role};SET fixture.tenant='{tenant}';SET fixture.staff='{staff}';SET storage.operation='{op}';"
 assert run(ctx('storage.object.sign')+'SELECT count(*) FROM storage.objects;').stdout.splitlines()[-1]=='2';checks.append('baseline permits sign lookup')
 snapshot=run('SELECT jsonb_build_object('+(H/'preflight.sql.review').read_text().split('SELECT jsonb_build_object(',1)[1].split(';')[0]+';').stdout.strip();s=json.loads(snapshot)
 c=(H/'candidate.sql.review').read_text().replace('NULL /* REVIEWED_CONTRACT */',"'"+json.dumps(s).replace("'","''")+"'::jsonb")
 run(c)
 for op in ['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info','object.list','object.list_v2','object.upload','object.upload_update','object.delete','object.delete_many']:
  for prefix in ['', 'storage.']:
   assert run(ctx(prefix+op)+'SELECT count(*) FROM storage.objects;').stdout.splitlines()[-1]=='2',op
   checks.append('allow '+prefix+op)
 for op in ['','object.sign','object.sign_many','object.sign_upload_url','render.image_sign','object.get_signed','object.copy','object.future','OBJECT.GET_AUTHENTICATED']:
  for prefix in ['', 'storage.']:
   assert run(ctx(prefix+op)+'SELECT count(*) FROM storage.objects;').stdout.splitlines()[-1]=='1',op
   checks.append('deny '+prefix+op)
 for label,args in [('foreign',{'tenant':'C'}),('revoked',{'staff':'no'}),('anon',{'role':'anon'})]:
  assert run(ctx('object.get_authenticated',**args)+'SELECT count(*) FROM storage.objects;').stdout.splitlines()[-1]=='1';checks.append(label)
 for op in ['object.upload','storage.object.upload_update']:
  run(ctx(op)+"BEGIN;INSERT INTO storage.objects VALUES(4,'financial-receipts','A/new.pdf') ON CONFLICT(id) DO UPDATE SET name=excluded.name;INSERT INTO storage.objects VALUES(1,'financial-receipts','A/2026/receipt.pdf') ON CONFLICT(id) DO UPDATE SET name=excluded.name;ROLLBACK;");checks.append('insert/upsert '+op)
 for op in ['object.sign_upload_url','object.sign','']:
  assert run(ctx(op)+"INSERT INTO storage.objects VALUES(4,'financial-receipts','A/new.pdf');",False).returncode;checks.append('deny insert '+op)
 assert run(ctx('object.upload')+"UPDATE storage.objects SET name='B/foreign.pdf' WHERE id=1;",False).returncode;checks.append('update tenant WITH CHECK')
 assert run(ctx('object.sign',role='service_role')+'SELECT count(*) FROM storage.objects;').stdout.splitlines()[-1]=='3';checks.append('service bypass explicitly remains')
 assert run(c,False).returncode;checks.append('idempotent fail-closed occupied')
 bad=c.replace(json.dumps(s).replace("'","''"),json.dumps({}).replace("'","''"))
 assert run(bad,False).returncode;checks.append('drift denied')
 assert run("SELECT count(*) FROM storage.objects;").stdout.strip()=='3';checks.append('original objects preserved')
 # A permissive OR must not bypass the restrictive receipt fence.
 run("CREATE POLICY accidental_broad ON storage.objects FOR SELECT TO authenticated USING(true);")
 assert run(ctx('object.sign')+'SELECT count(*) FROM storage.objects;').stdout.splitlines()[-1]=='1';checks.append('broad permissive cannot restore sign')
 run('DROP POLICY accidental_broad ON storage.objects;')
 # Missing context (NULL, fresh connection) is denied, not merely empty string.
 assert run("SET ROLE authenticated;SET fixture.tenant='A';SET fixture.staff='yes';SELECT count(*) FROM storage.objects;").stdout.splitlines()[-1]=='1';checks.append('NULL operation denied')
 post=run("SELECT md5(string_agg(concat_ws('|',policyname,permissive,roles::text,cmd,qual,with_check),E'\\n' ORDER BY policyname)) FROM pg_policies WHERE schemaname='storage' AND tablename='objects';").stdout.strip()
 rollback=(H/'rollback.sql.review').read_text()
 assert run(rollback,False).returncode;checks.append('unreviewed rollback denied')
 run(rollback.replace('NULL /* REVIEWED_POST_HASH */',"'"+post+"'"))
 for op in ['object.sign','object.get_authenticated','object.upload']:
  assert run(ctx(op)+'SELECT count(*) FROM storage.objects;').stdout.splitlines()[-1]=='1';checks.append('safe rollback containment '+op)
 assert run(ctx('object.upload')+"INSERT INTO storage.objects VALUES(4,'financial-receipts','A/new.pdf');",False).returncode;checks.append('safe rollback insert denied')
 assert run('SELECT count(*) FROM storage.objects;').stdout.strip()=='3';checks.append('safe rollback preserves objects')
 print(json.dumps({'checks':len(checks),'passed':checks,'scope':'disposable PG/synthetic context, no hosted HTTP'},indent=2))
finally:
 if started:subprocess.run(pre+['pg_ctl','-D',str(t/'data'),'stop','-m','immediate'],capture_output=True)
