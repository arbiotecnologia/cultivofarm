"""Disposable component PG. Real captured actor/root bodies, synthetic Auth/feature/schema dependencies. No hosted IO."""
import os,subprocess,tempfile,shutil,json
from pathlib import Path
H=Path(__file__).resolve().parent
os.environ['PATH']=str(Path(shutil.which('initdb')).resolve().parent)+os.pathsep+os.environ['PATH']
tmp=Path(tempfile.mkdtemp(prefix='micro-ficha-'));tmp.chmod(0o777)
priv=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
port=str(58000+os.getpid()%900);results=[]
def sql(s,error=None):
 r=subprocess.run(['psql','-X','-qAt','-h',str(tmp),'-p',port,'-U','postgres','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True)
 if error: assert r.returncode and error in r.stderr,(error,r.stderr)
 else: assert not r.returncode,r.stderr
 return r.stdout.strip()
def check(n,s,expected=None,error=None):
 r=sql(s,error)
 if expected is not None:assert r==expected,(n,r,expected)
 results.append(n)
U=lambda n:f'00000000-0000-4000-8000-{n:012d}'
def actor(s,n=1):return f"SET ROLE authenticated;SET test.uid='{U(n)}';SET request.jwt.claims='{{\"role\":\"authenticated\",\"sub\":\"{U(n)}\",\"exp\":9999999999}}';"+s
try:
 subprocess.run(priv+['initdb','-D',str(tmp/'data'),'-U','postgres','-A','trust'],check=True,capture_output=True)
 subprocess.run(priv+['pg_ctl','-D',str(tmp/'data'),'-o',f'-k {tmp} -h "" -p {port}','-l',str(tmp/'log'),'-w','start'],check=True,capture_output=True)
 sql('''CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA platform_private;
 CREATE TYPE public.app_role AS ENUM('administrador','gestor','consultor_tecnico');
 CREATE TABLE public.organizations(id uuid PRIMARY KEY,ativo boolean,status text);
 CREATE TABLE platform_private.members(id uuid PRIMARY KEY,org uuid,editor boolean);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT current_setting('test.uid',true)::uuid$$;
 CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT org FROM platform_private.members WHERE id=auth.uid()$$;
 CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION public._saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE FUNCTION platform_private.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT editor FROM platform_private.members WHERE id=$1$$;
 CREATE FUNCTION public.can_view_catalog_internal(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM platform_private.members WHERE id=$1)$$;
 CREATE TABLE public.produtos(id uuid PRIMARY KEY,owner_organization_id uuid);CREATE TABLE public.culturas(id uuid PRIMARY KEY,owner_organization_id uuid);
 CREATE TABLE public.microrganismos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_organization_id uuid,updated_at timestamptz DEFAULT now(),nome text,tipo text,codigo text,nome_cientifico text,fornecedor text,funcao_agronomica text,concentracao_label text,descricao text,observacoes text,b2b_enabled boolean DEFAULT false);
 CREATE TABLE public.microorganism_technical_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),microrganismo_id uuid UNIQUE REFERENCES public.microrganismos(id),updated_at timestamptz DEFAULT now(),resumo_curto text,mecanismo_acao text,beneficios_agronomicos text,explicacao_tecnica text,explicacao_produtor text,explicacao_b2b text,indicacoes_uso text,cuidados_aplicacao text,compatibilidade text,armazenamento text,observacoes_regulatorias text,status_validacao text DEFAULT 'rascunho');
 CREATE TABLE platform_private.tenant_catalog_root_cfg(root text PRIMARY KEY,kind text,allowed text[],parent_col text,parent_tbl text,refs jsonb,safe_defaults jsonb);
 CREATE TABLE platform_private.tenant_catalog_root_receipts(actor_id uuid,organization_id uuid,idempotency_key uuid,payload_hash text,result jsonb,created_at timestamptz DEFAULT now(),PRIMARY KEY(actor_id,organization_id,idempotency_key));
 GRANT USAGE ON SCHEMA auth TO authenticated;''')
 for f in ('platform_private.catalog_tenant_actor','platform_private.tenant_catalog_ref_owner','public.tenant_catalog_root_save'):sql((H/'capture'/f'{f}.sql').read_text())
 # Transport redacted one receipt SQL clause: reconstruct only this explicitly declared seam from reviewed original.
 src=(H.parents[1]/'scripts/tenant-exclusive-catalog-20261101/crud_section.py').read_text();a=src.index('CREATE FUNCTION platform_private.tenant_catalog_receipt');b=src.index('CREATE FUNCTION public.tenant_catalog_root_save');sql(src[a:b])
 sql("INSERT INTO platform_private.tenant_catalog_root_cfg VALUES('microrganismos','root',ARRAY['nome','tipo','codigo','nome_cientifico','fornecedor','funcao_agronomica','concentracao_label','descricao','observacoes','b2b_enabled'],'','','{}','{\"b2b_enabled\":false}'),('microorganism_technical_profiles','profile',ARRAY['microrganismo_id','resumo_curto','mecanismo_acao','beneficios_agronomicos','explicacao_tecnica','explicacao_produtor','explicacao_b2b','indicacoes_uso','cuidados_aplicacao','compatibilidade','armazenamento','observacoes_regulatorias'],'microrganismo_id','microrganismos','{\"microrganismo_id\":\"microrganismos\"}','{}');")
 sql(f"INSERT INTO organizations VALUES('{U(11)}',true,'ativa'),('{U(12)}',true,'ativa');INSERT INTO platform_private.members VALUES('{U(1)}','{U(11)}',true),('{U(2)}','{U(11)}',false),('{U(3)}','{U(12)}',true);")
 sql((H/'02-install.sql.review').read_text())
 check('closed install',"SELECT has_function_privilege('authenticated','public.tenant_microorganism_ficha_save_v1(uuid,timestamptz,timestamptz,jsonb,jsonb,uuid)','EXECUTE')",'f')
 sql((H/'05-release.sql.review').read_text())
 ev=[{'field':'resumo_curto','value':'Fonte aceita','identity':{'name':'Micro QA'},'sources':[{'url':'https://example.org/ficha','title':'Fonte','excerpt':'Evidência'}]}]
 payload={'root':{'nome':'Micro QA','tipo':'bacteria'},'content':{'resumo_curto':'Fonte aceita'},'extra':{'cepa':'QA','sinonimos':'Outro'}}
 def save(p=payload,key=101,id='NULL',v='NULL',pv='NULL',e=ev):return f"SELECT public.tenant_microorganism_ficha_save_v1({id},{v},{pv},'{json.dumps(p)}','{json.dumps(e)}','{U(key)}');"
 ack=json.loads(sql(actor(save())));id=ack['id'];v=ack['updated_at'];pv=sql(f"SELECT updated_at FROM public.microorganism_technical_profiles WHERE microrganismo_id='{id}'")
 check('save sources reopen',actor(f"SELECT (public.tenant_microorganism_ficha_read_v1('{id}')->'evidence'->0->>'value')"),'Fonte aceita')
 check('extra persisted',actor(f"SELECT public.tenant_microorganism_ficha_read_v1('{id}')->'extra'->>'cepa'"),'QA')
 check('replay same id',actor(save()+''),None);r=json.loads(sql(actor(save())));assert r['id']==id and r['replayed']
 check('changed intent denied',actor(save({'root':{'nome':'Outro'}})),error='idempotency_conflict')
 check('cross tenant read denied',actor(f"SELECT public.tenant_microorganism_ficha_read_v1('{id}')",3),error='catalog_denied')
 check('reader write denied',actor(save(key=102),2),error='role_denied')
 check('cross tenant write denied',actor(save(key=103,id=f"'{id}'",v=f"'{v}'",pv=f"'{pv}'"),3),error='catalog_denied')
 check('stale CAS denied',actor(save(key=104,id=f"'{id}'",v="'2000-01-01'",pv=f"'{pv}'")),error='micro_stale')
 check('stale profile denied',actor(save(key=105,id=f"'{id}'",v=f"'{v}'",pv="'2000-01-01'")),error='profile_stale')
 for n,p in enumerate([{'root':{'owner_organization_id':U(12)}},{'content':{'status_validacao':'aprovado'}},{'extra':{'approved':True}}]):check('forbidden '+str(n),actor(save(p,key=110+n)),error='forbidden')
 check('sources required',actor(save(key=120,e=[{**ev[0],'sources':[]} ])),error='source_required')
 check('direct private DML denied',actor('SELECT * FROM platform_private.micro_ficha_extra_v1'),error='permission denied')
 check('atomic invalid rollback',actor(save({'root':{'nome':'Não salvar'},'content':{'microrganismo_id':id}},key=121)),error='forbidden')
 check('still single root','SELECT count(*) FROM public.microrganismos','1')
 sql((H/'04-rollback.sql.review').read_text());check('rollback keeps evidence','SELECT count(*) FROM platform_private.micro_ficha_extra_v1','1')
 check('rollback denies writer',actor(save(key=130)),error='permission denied')
 print(json.dumps({'count':len(results),'pass':results,'limits':'component PostgreSQL: real actor/root bodies; synthetic Auth/feature/schema, receipt reconstruction; NOT hosted JWT/RLS'},ensure_ascii=False))
finally:
 subprocess.run(priv+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp,ignore_errors=True)
