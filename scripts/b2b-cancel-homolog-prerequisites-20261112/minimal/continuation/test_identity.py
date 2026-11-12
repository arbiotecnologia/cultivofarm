"""Local regression: trigger OID identity cannot depend on search_path display."""
import json,os,shutil,subprocess,tempfile
from pathlib import Path
import catalog_checks as C
H=Path(__file__).resolve().parent
def main():
 tmp=tempfile.mkdtemp(prefix='homolog-identity-',dir='/tmp');shutil.chown(tmp,user='lovable')
 env={k:v for k,v in os.environ.items() if not k.startswith('PG')};pre=['setpriv','--reuid=1000','--regid=1000','--init-groups'];data=tmp+'/data';port='55521'
 def cmd(a):return subprocess.run(pre+a,env=env,capture_output=True,text=True)
 assert cmd(['initdb','-D',data,'-U','postgres','-A','trust']).returncode==0
 assert cmd(['pg_ctl','-D',data,'-o',f'-p {port} -k {tmp} -c listen_addresses=','-l',tmp+'/log','start','-w']).returncode==0
 def sql(s):return subprocess.run(['psql','-X','-h',tmp,'-p',port,'-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=s,env=env,text=True,capture_output=True)
 rows=[]
 def check(n,c,detail=None):rows.append(dict(test=n,status='PASS' if c else 'FAIL',detail=detail));print(rows[-1]['status'],n,flush=True)
 try:
  z=sql("CREATE SCHEMA platform_private;CREATE SCHEMA extensions;CREATE SCHEMA other;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop WHEN TAG IN ('DROP EXTENSION') EXECUTE FUNCTION extensions.set_graphql_placeholder();")
  assert z.returncode==0,z.stderr
  md5=sql("SELECT md5(pg_get_functiondef('extensions.set_graphql_placeholder()'::regprocedure));").stdout.strip()
  sample={'schema':[],'definitions':[],'triggers':[{'evtname':'issue_graphql_placeholder','evtevent':'sql_drop','evtenabled':'O','evttags':['DROP EXTENSION'],'signature':'set_graphql_placeholder()','body_md5':md5}]}
  for sig,body in C.segmented_sources(sample):
   z=sql(body);assert z.returncode==0,z.stderr
  for path in ['public,pg_catalog','extensions,public,pg_catalog','other,pg_catalog']:
   z=sql('SET search_path='+path+';SELECT platform_private.cancel_homolog_catalog_check_v1();')
   check('same trigger OID passes with '+path,z.returncode==0,z.stderr)
  display1=sql("SET search_path=public;SELECT evtfoid::regprocedure::text FROM pg_event_trigger;").stdout.strip()
  display2=sql("SET search_path=extensions,public;SELECT evtfoid::regprocedure::text FROM pg_event_trigger;").stdout.strip()
  check('reproduced qualified vs unqualified display',display1=='extensions.set_graphql_placeholder()' and display2=='set_graphql_placeholder()',[display1,display2])
  z=sql("ALTER EVENT TRIGGER issue_graphql_placeholder DISABLE;SELECT platform_private.cancel_homolog_catalog_check_v1();")
  check('enabled-state drift still denied',z.returncode!=0 and 'EVENT_TRIGGER_IDENTITY_DRIFT' in z.stderr,z.stderr)
  sql('ALTER EVENT TRIGGER issue_graphql_placeholder ENABLE;')
  z=sql("CREATE FUNCTION other.set_graphql_placeholder() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;DROP EVENT TRIGGER issue_graphql_placeholder;CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop WHEN TAG IN ('DROP EXTENSION') EXECUTE FUNCTION other.set_graphql_placeholder();SELECT platform_private.cancel_homolog_catalog_check_v1();")
  check('other-schema same name denied',z.returncode!=0 and 'EVENT_TRIGGER_IDENTITY_DRIFT' in z.stderr,z.stderr)
  sql('DROP EVENT TRIGGER issue_graphql_placeholder;CREATE EVENT TRIGGER issue_graphql_placeholder ON ddl_command_end WHEN TAG IN (\'CREATE TABLE\') EXECUTE FUNCTION extensions.set_graphql_placeholder();')
  z=sql('SELECT platform_private.cancel_homolog_catalog_check_v1();')
  check('event/tag drift denied',z.returncode!=0 and 'EVENT_TRIGGER_IDENTITY_DRIFT' in z.stderr,z.stderr)
  sql('CREATE FUNCTION extensions.row_identity() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;CREATE TABLE public.row_parent(id uuid);CREATE TRIGGER identity_row BEFORE INSERT ON public.row_parent FOR EACH ROW EXECUTE FUNCTION extensions.row_identity();')
  rowmd5=sql("SELECT md5(pg_get_functiondef('extensions.row_identity()'::regprocedure));").stdout.strip()
  z=sql("SELECT platform_private.cancel_homolog_resolve_function_v1('row_identity()','"+rowmd5+"')='extensions.row_identity()'::regprocedure;")
  check('ordinary row-trigger identity resolves qualified OID',z.returncode==0 and z.stdout.strip()=='t',z.stderr)
  # Namespace/argument replacement normalizes only the printed function name;
  # trigger arguments and timing remain exactly pinned by the checker.
  z=sql("SELECT regexp_replace('CREATE TRIGGER x BEFORE INSERT ON row_parent FOR EACH ROW EXECUTE FUNCTION row_identity(\"arg\")','EXECUTE FUNCTION [^(]+\\(','EXECUTE FUNCTION FUNCTION_ID(')=regexp_replace('CREATE TRIGGER x BEFORE INSERT ON row_parent FOR EACH ROW EXECUTE FUNCTION extensions.row_identity(\"arg\")','EXECUTE FUNCTION [^(]+\\(','EXECUTE FUNCTION FUNCTION_ID(');")
  check('row display normalization preserves definition',z.returncode==0 and z.stdout.strip()=='t',z.stderr)
  z=sql("SELECT regexp_replace('EXECUTE FUNCTION row_identity(\"different\")','EXECUTE FUNCTION [^(]+\\(','EXECUTE FUNCTION FUNCTION_ID(')<>regexp_replace('EXECUTE FUNCTION extensions.row_identity(\"arg\")','EXECUTE FUNCTION [^(]+\\(','EXECUTE FUNCTION FUNCTION_ID(');")
  check('argument change not normalized away',z.returncode==0 and z.stdout.strip()=='t',z.stderr)
 finally:cmd(['pg_ctl','-D',data,'stop','-m','fast','-w'])
 out=H/'evidence'/('identity-'+Path(tmp).name+'.json');out.write_text(json.dumps(dict(hosted=False,synthetic_event_body=True,checks=rows),indent=2)+'\n')
 assert all(r['status']=='PASS' for r in rows),str(out)
if __name__=='__main__':main()