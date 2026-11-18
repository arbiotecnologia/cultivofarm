"""Disposable PG, captured motor/actor, declared synthetic identity/config/schema. No hosted IO."""
import os,subprocess,tempfile,shutil,json
from pathlib import Path
H=Path(__file__).resolve().parent; B=H.parent/'microorganism-ficha-20261118'
os.environ['PATH']=str(Path(shutil.which('initdb')).resolve().parent)+os.pathsep+os.environ['PATH']
t=Path(tempfile.mkdtemp(prefix='product-ficha-'));t.chmod(0o777);port=str(57000+os.getpid()%900)
priv=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
results=[]
def sql(s,error=None):
 r=subprocess.run(['psql','-X','-qAt','-h',str(t),'-p',port,'-U','postgres','-v','ON_ERROR_STOP=1'],input=s,text=True,encoding='utf-8',capture_output=True)
 if error: assert r.returncode and error in r.stderr,r.stderr
 else: assert r.returncode==0,r.stderr
 return r.stdout.strip()
def check(n,s,value=None,error=None):
 r=sql(s,error)
 if value is not None: assert r==value,(n,r,value)
 results.append(n)
U=lambda n:f'00000000-0000-4000-8000-{n:012d}'
def actor(s,n=1):return f"SET ROLE authenticated;SET test.uid='{U(n)}';SET request.jwt.claims='{{\"role\":\"authenticated\",\"sub\":\"{U(n)}\",\"exp\":9999999999}}';"+s
try:
 subprocess.run(priv+['initdb','-D',str(t/'data'),'-U','postgres','-A','trust'],check=True,capture_output=True)
 subprocess.run(priv+['pg_ctl','-D',str(t/'data'),'-o',f'-k {t} -h "" -p {port}','-l',str(t/'log'),'-w','start'],check=True,capture_output=True)
 sql('''CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA platform_private;
 CREATE TYPE app_role AS ENUM('administrador','gestor');
 CREATE TABLE organizations(id uuid PRIMARY KEY,ativo boolean,status text);
 CREATE TABLE platform_private.members(id uuid PRIMARY KEY,org uuid,editor boolean,feature boolean DEFAULT true);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT current_setting('test.uid',true)::uuid$$;
 CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$SELECT org FROM platform_private.members WHERE id=auth.uid()$$;
 CREATE FUNCTION is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION _saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT feature FROM platform_private.members WHERE id=$1$$;
 CREATE FUNCTION platform_private.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT editor FROM platform_private.members WHERE id=$1$$;
 CREATE FUNCTION can_view_catalog_internal(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE TABLE produtos(id uuid PRIMARY KEY,owner_organization_id uuid);
 CREATE TABLE product_technical_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),produto_id uuid REFERENCES produtos(id),resumo_curto text,updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE platform_private.tenant_catalog_root_cfg(root text PRIMARY KEY,kind text,allowed text[],parent_col text,parent_tbl text,refs jsonb,safe_defaults jsonb);
 CREATE TABLE platform_private.tenant_catalog_root_receipts(actor_id uuid,organization_id uuid,idempotency_key uuid,payload_hash text,result jsonb,created_at timestamptz DEFAULT now(),PRIMARY KEY(actor_id,organization_id,idempotency_key));
 GRANT USAGE ON SCHEMA auth TO authenticated;''')
 for f in ['platform_private.catalog_tenant_actor','platform_private.tenant_catalog_ref_owner','public.tenant_catalog_root_save']:sql((B/'capture'/f'{f}.sql').read_text(encoding='utf-8'))
 src=(H.parent/'tenant-exclusive-catalog-20261101/crud_section.py').read_text(encoding='utf-8');sql(src[src.index('CREATE FUNCTION platform_private.tenant_catalog_receipt'):src.index('CREATE FUNCTION public.tenant_catalog_root_save')])
 sql("INSERT INTO platform_private.tenant_catalog_root_cfg VALUES('product_technical_profiles','profile',ARRAY['produto_id','resumo_curto'],'produto_id','produtos','{\"produto_id\":\"produtos\"}','{}');")
 sql(f"INSERT INTO organizations VALUES('{U(11)}',true,'ativa'),('{U(12)}',true,'ativa');INSERT INTO platform_private.members(id,org,editor) VALUES('{U(1)}','{U(11)}',true),('{U(2)}','{U(11)}',false),('{U(3)}','{U(12)}',true);INSERT INTO produtos VALUES('{U(21)}','{U(11)}');")
 sql((H/'source.sql.review').read_text(encoding='utf-8'))
 sql('GRANT EXECUTE ON FUNCTION public.tenant_catalog_root_save(text,uuid,jsonb,timestamptz,uuid) TO authenticated;')
 e={'field':'resumo_curto','value':'Conteúdo aceito','identity':{'entity':'produto','id':U(21),'name':'Produto QA'},'sources':[{'url':'https://example.org/ficha','title':'Documento','excerpt':'Trecho'}]}
 def save(key=100,ev=None,id='NULL',rev='NULL'):
  p={'produto_id':U(21),'resumo_curto':'Conteúdo aceito','documentary_evidence':[e] if ev is None else ev}
  if id!='NULL':p.pop('produto_id')
  return f"SELECT tenant_catalog_root_save('product_technical_profiles',{id},'{json.dumps(p,ensure_ascii=False)}',{rev},'{U(key)}');"
 check('closed gate',actor(save()),error='product_evidence_closed')
 sql('UPDATE platform_private.product_evidence_gate_v1 SET enabled=true')
 ack=json.loads(sql(actor(save())));id=ack['id'];rev=ack['updated_at']
 check('sources reopen',actor(f"SELECT tenant_product_documentary_read_v1('{U(21)}')->0->>'value'"),'Conteúdo aceito')
 check('reader allowed',actor(f"SELECT jsonb_array_length(tenant_product_documentary_read_v1('{U(21)}'))",2),'1')
 check('B read denied',actor(f"SELECT tenant_product_documentary_read_v1('{U(21)}')",3),error='denied')
 check('B write denied',actor(save(101),3),error='foreign')
 check('reader write denied',actor(save(102),2),error='role_denied')
 check('replay identical',actor(save()),None)
 check('single history after replay','SELECT count(*) FROM platform_private.product_evidence_history_v1','1')
 for i,url in enumerate(['javascript:alert(1)','data:text/html,x','http://example.org','https://a:b@example.org/','https://example.org/%0a','https://localhost/a']):
  check('unsafe URL '+url,actor(save(110+i,[{**e,'sources':[{**e['sources'][0],'url':url}]}])),error='source_invalid')
 check('value mismatch atomic',actor(save(120,[{**e,'value':'Diferente'}])),error='value_mismatch')
 check('foreign identity late atomic',actor(save(121,[{**e,'identity':{**e['identity'],'id':U(22)}}])),error='identity')
 check('late failure no profile','SELECT count(*) FROM product_technical_profiles','1')
 check('late failure no receipt',f"SELECT count(*) FROM platform_private.tenant_catalog_root_receipts WHERE idempotency_key='{U(121)}'",'0')
 check('stale CAS',actor(save(122,id=f"'{id}'",rev="'2000-01-01'")),error='stale')
 sql(f"UPDATE platform_private.members SET feature=false WHERE id='{U(1)}'")
 check('feature revoked read',actor(f"SELECT tenant_product_documentary_read_v1('{U(21)}')"),error='feature_unavailable')
 check('feature revoked replay',actor(save()),error='feature_unavailable')
 check('private DML denied',actor('SELECT * FROM platform_private.product_evidence_history_v1'),error='permission denied')
 pins=json.loads(sql("SELECT jsonb_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))) FROM pg_proc WHERE proname IN ('tenant_catalog_root_save','tenant_product_documentary_read_v1','product_source_https_v1')"))
 print(json.dumps({'count':len(results),'pass':results,'pins':pins,'limits':'disposable PG: captured motor/actor; synthetic identity/schema/config/receipt reconstruction; not hosted JWT/RLS'},ensure_ascii=False))
finally:
 subprocess.run(priv+['pg_ctl','-D',str(t/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(t,ignore_errors=True)
