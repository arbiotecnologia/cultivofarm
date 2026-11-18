"""Disposable component PG. Real captured actor/root bodies, synthetic Auth/feature/schema dependencies. No hosted IO."""
import os,subprocess,tempfile,shutil,json,threading,time
from pathlib import Path
H=Path(__file__).resolve().parent
os.environ['PATH']=str(Path(shutil.which('initdb')).resolve().parent)+os.pathsep+os.environ['PATH']
tmp=Path(tempfile.mkdtemp(prefix='micro-ficha-'));tmp.chmod(0o777)
priv=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
port=str(58000+os.getpid()%900);results=[]
def sql(s,error=None):
 r=subprocess.run(['psql','-X','-qAt','-h',str(tmp),'-p',port,'-U','postgres','-v','ON_ERROR_STOP=1'],input=s,text=True,encoding="utf-8",capture_output=True)
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
 CREATE TABLE public.microrganismos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_organization_id uuid,updated_at timestamptz DEFAULT now(),nome text,tipo text,codigo text,nome_cientifico text,fornecedor text,funcao_agronomica text,concentracao_label text,concentracao_ufc_ml numeric,descricao text,observacoes text,b2b_enabled boolean DEFAULT false);
 CREATE TABLE public.microorganism_technical_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),microrganismo_id uuid UNIQUE REFERENCES public.microrganismos(id),updated_at timestamptz DEFAULT now(),resumo_curto text,mecanismo_acao text,beneficios_agronomicos text,explicacao_tecnica text,explicacao_produtor text,explicacao_b2b text,indicacoes_uso text,cuidados_aplicacao text,compatibilidade text,armazenamento text,observacoes_regulatorias text,status_validacao text DEFAULT 'rascunho');
 CREATE TABLE platform_private.tenant_catalog_root_cfg(root text PRIMARY KEY,kind text,allowed text[],parent_col text,parent_tbl text,refs jsonb,safe_defaults jsonb);
 CREATE TABLE platform_private.tenant_catalog_root_receipts(actor_id uuid,organization_id uuid,idempotency_key uuid,payload_hash text,result jsonb,created_at timestamptz DEFAULT now(),PRIMARY KEY(actor_id,organization_id,idempotency_key));
 GRANT USAGE ON SCHEMA auth TO authenticated;''')
 for f in ('platform_private.catalog_tenant_actor','platform_private.tenant_catalog_ref_owner','public.tenant_catalog_root_save'):sql((H/'capture'/f'{f}.sql').read_text(encoding='utf-8'))
 # Transport redacted one receipt SQL clause: reconstruct only this explicitly declared seam from reviewed original.
 src=(H.parents[1]/'scripts/tenant-exclusive-catalog-20261101/crud_section.py').read_text(encoding='utf-8');a=src.index('CREATE FUNCTION platform_private.tenant_catalog_receipt');b=src.index('CREATE FUNCTION public.tenant_catalog_root_save');sql(src[a:b])
 sql("INSERT INTO platform_private.tenant_catalog_root_cfg VALUES('microrganismos','root',ARRAY['nome','tipo','codigo','nome_cientifico','fornecedor','funcao_agronomica','concentracao_label','concentracao_ufc_ml','descricao','observacoes','b2b_enabled'],'','','{}','{\"b2b_enabled\":false}'),('microorganism_technical_profiles','profile',ARRAY['microrganismo_id','resumo_curto','mecanismo_acao','beneficios_agronomicos','explicacao_tecnica','explicacao_produtor','explicacao_b2b','indicacoes_uso','cuidados_aplicacao','compatibilidade','armazenamento','observacoes_regulatorias'],'microrganismo_id','microrganismos','{\"microrganismo_id\":\"microrganismos\"}','{}');")
 sql(f"INSERT INTO organizations VALUES('{U(11)}',true,'ativa'),('{U(12)}',true,'ativa');INSERT INTO platform_private.members VALUES('{U(1)}','{U(11)}',true),('{U(2)}','{U(11)}',false),('{U(3)}','{U(12)}',true);")
 sql('''CREATE TABLE public.catalogo_alvos(id uuid PRIMARY KEY,nome text,ativo boolean);
 CREATE TABLE public.microorganism_targets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),microrganismo_id uuid REFERENCES public.microrganismos(id),catalogo_alvo_id uuid REFERENCES public.catalogo_alvos(id),alvo_nome text NOT NULL,alvo_tipo text NOT NULL,descricao text,prioridade integer DEFAULT 1,ativo boolean DEFAULT true);
 CREATE TABLE public.microorganism_crop_recommendations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),microrganismo_id uuid REFERENCES public.microrganismos(id),cultura_id uuid REFERENCES public.culturas(id),cultura_nome text,fase_recomendada text,objetivo_uso text,observacao text,ativo boolean DEFAULT true);
 CREATE TABLE public.catalog_technical_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entidade_tipo text,entidade_id uuid,fonte_titulo text,fonte_url text,fonte_tipo text,idioma_original text,pais_origem text,resumo_evidencia text,nivel_confianca text,data_consulta date,observacoes text,updated_at timestamptz DEFAULT now());''')
 sql((H/'02-install.sql.review').read_text(encoding='utf-8'))
 pins=json.loads(sql("SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE proname IN ('tenant_microorganism_ficha_read_v1','tenant_microorganism_ficha_save_v1','tenant_catalog_documentary_capability_v1','tenant_catalog_documentary_reserve_v1','tenant_catalog_documentary_finish_v1')"))
 assert pins==json.loads((H/'evidence/local-post-function-pins.json').read_text(encoding='utf-8')),'POST_PIN_DRIFT'
 # Offline environment-specific assembly: disposable catalog captures, never hosted proof.
 dependencies=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'md5',md5(pg_get_functiondef(oid)),'definition',pg_get_functiondef(oid))) FROM pg_proc WHERE oid IN (to_regprocedure('platform_private.catalog_tenant_actor(text)'),to_regprocedure('public.tenant_catalog_root_save(text,uuid,jsonb,timestamptz,uuid)'),to_regprocedure('platform_private.tenant_catalog_receipt(uuid,uuid,text)'))"))
 config=json.loads(sql("SELECT jsonb_agg(c) FROM platform_private.tenant_catalog_root_cfg c"))
 cap={'ref':'vrlcdwmlytukrjezrrnf','catalog':{'functions':dependencies,'config':config}}
 capture_path=tmp/'synthetic-capture.json';capture_path.write_text(json.dumps(cap),encoding="utf-8",newline="\n")
 output=tmp/'assembled'
 subprocess.run(['python3',str(H/'assemble.py'),str(capture_path),str(output)],check=True,capture_output=True)
 sql((output/'02-install.sql.review').read_text(encoding='utf-8'))
 check('idempotent rerun closed gate','SELECT enabled FROM platform_private.micro_ficha_gate_v1','f')
 sql((output/'03-post.sql.review').read_text(encoding='utf-8'))
 check('closed install',"SELECT has_function_privilege('authenticated','public.tenant_microorganism_ficha_save_v1(uuid,timestamptz,timestamptz,jsonb,jsonb,uuid)','EXECUTE')",'f')
 sql((output/'05-release.sql.review').read_text(encoding='utf-8'))
 sql((output/'02-install.sql.review').read_text(encoding='utf-8'))
 check('idempotent rerun preserves release','SELECT enabled FROM platform_private.micro_ficha_gate_v1','t')
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
 # Real captured audit/identity/version triggers; Auth/entitlements remain synthetic.
 capture=(H/'capture/production-review-0214.txt').read_text(encoding='utf-8')
 import re
 trigger_bodies={}
 for body,definition,signature in re.findall(r'map\[body:(CREATE OR REPLACE FUNCTION .*?)\n definition:(CREATE TRIGGER .*?) function:(.*?) md5:',capture,re.S):
  if signature in ('platform_private.catalog_owner_immutable()','platform_private.catalog_touch_version()','log_catalog_change()'):
   trigger_bodies[signature]=body
   sql(body)
   sql(definition+';')
 sql("CREATE TABLE IF NOT EXISTS public.catalog_technical_audit_logs(id uuid DEFAULT gen_random_uuid(),entidade_tipo text,entidade_id uuid,acao text,dados_anteriores jsonb,dados_novos jsonb,usuario_id uuid);")
 # Holder proof: actual pg_blocking_pids before revocation (not a timing-only sleep).
 holder=subprocess.Popen(['psql','-X','-qAt','-h',str(tmp),'-p',port,'-U','postgres','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 holder.stdin.write(f"BEGIN;SELECT 1 FROM microrganismos WHERE id='{id}' FOR UPDATE;SELECT pg_sleep(0);\n");holder.stdin.flush()
 concurrent=[]
 def pending():
  concurrent.append(subprocess.run(['psql','-X','-qAt','-h',str(tmp),'-p',port,'-U','postgres','-v','ON_ERROR_STOP=1'],input=actor(save({'root':{'nome':'REVOKED WRITE'}},key=135,id=f"'{id}'",v=f"'{v}'",pv=f"'{pv}'")),text=True,encoding="utf-8",capture_output=True))
 thread=threading.Thread(target=pending);thread.start()
 observed=False
 for _ in range(100):
  if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.query LIKE '%REVOKED WRITE%' AND a.pid<>pg_backend_pid() AND cardinality(pg_blocking_pids(a.pid))>0)")=='t':observed=True;break
  time.sleep(.015)
 assert observed,'no demonstrated lock wait'
 sql(f"UPDATE platform_private.members SET editor=false WHERE id='{U(1)}'")
 holder.stdin.write('COMMIT;\n');holder.stdin.close();holder.wait(timeout=3)
 thread.join(timeout=5);assert concurrent and concurrent[0].returncode and 'role_denied' in concurrent[0].stderr
 check('revoked waiter no mutation',f"SELECT nome FROM microrganismos WHERE id='{id}'",'Micro QA')
 check('revoked waiter no receipt',f"SELECT count(*) FROM platform_private.tenant_catalog_root_receipts WHERE idempotency_key='{U(135)}'",'0')
 sql(f"UPDATE platform_private.members SET editor=true WHERE id='{U(1)}'")
 # Concurrent exact-key replay: one root, one receipt, identical IDs.
 parallel=[]
 def replay():parallel.append(json.loads(sql(actor(save({'root':{'nome':'Concurrent QA','tipo':'bacteria'}},key=136,e=[])))))
 t1=threading.Thread(target=replay);t2=threading.Thread(target=replay);t1.start();t2.start();t1.join();t2.join()
 assert len(parallel)==2 and parallel[0]['id']==parallel[1]['id'] and sorted(p['replayed'] for p in parallel)==[False,True]
 check('concurrent replay single receipt',f"SELECT count(*) FROM platform_private.tenant_catalog_root_receipts WHERE idempotency_key='{U(136)}'",'1')
 check('concurrent replay single root',"SELECT count(*) FROM microrganismos WHERE nome='Concurrent QA'",'1')
 check('reader own provenance',actor(f"SELECT public.tenant_microorganism_ficha_read_v1('{id}')->'extra'->>'cepa'",2),'QA')
 check('quantitative canonical concentration',actor(save({'root':{'concentracao_ufc_ml':'1000000'}},key=140,id=f"'{id}'",v=f"'{v}'",pv=f"'{pv}'")))
 v=sql(f"SELECT updated_at FROM microrganismos WHERE id='{id}'")
 check('quantitative persisted',f"SELECT concentracao_ufc_ml FROM microrganismos WHERE id='{id}'",'1000000')
 check('legacy label unchanged',f"SELECT concentracao_label IS NULL FROM microrganismos WHERE id='{id}'",'t')
 check('empty quantitative invalid',actor(save({'root':{'concentracao_ufc_ml':'NaN'}},key=141)),error='concentration_invalid')
 check('negative quantitative invalid',actor(save({'root':{'concentracao_ufc_ml':'-1'}},key=142)),error='concentration_invalid')
 child={'kind':'target','id':None,'updated_at':None,'fields':{'alvo_nome':'Alvo QA','alvo_tipo':'praga'}}
 check('canonical target insertion',actor(save({'root':{},'children':[child]},key=143,id=f"'{id}'",v=f"'{v}'",pv=f"'{pv}'")))
 check('captured trigger audit event',"SELECT count(*) FROM catalog_technical_audit_logs WHERE entidade_tipo='alvo_microrganismo' AND acao='insert'",'1')
 check('canonical target exists','SELECT count(*) FROM microorganism_targets','1')
 v=sql(f"SELECT updated_at FROM microrganismos WHERE id='{id}'")
 broken={**child,'fields':{'microrganismo_id':U(999)}}
 check('late child error aborts root',actor(save({'root':{'nome':'FORBIDDEN COMMIT'},'children':[broken]},key=144,id=f"'{id}'",v=f"'{v}'",pv=f"'{pv}'")),error='child_field_forbidden')
 check('atomic root unchanged',f"SELECT nome FROM microrganismos WHERE id='{id}'",'Micro QA')
 check('atomic no receipt',f"SELECT count(*) FROM platform_private.tenant_catalog_root_receipts WHERE idempotency_key='{U(144)}'",'0')
 reserve=f"SELECT public.tenant_catalog_documentary_reserve_v1('microrganismo','{id}')"
 q1=json.loads(sql(actor(reserve)));q2=json.loads(sql(actor(reserve)))
 check('shared two concurrency limit',actor(reserve),error='documentary_quota')
 check('quota other tenant cannot reserve',actor(reserve,3),error='catalog_denied')
 check('lease forged cannot finish',actor(f"SELECT public.tenant_catalog_documentary_finish_v1('{q1['lease']}')",3),'f')
 check('lease own finish',actor(f"SELECT public.tenant_catalog_documentary_finish_v1('{q1['lease']}')"),'t')
 check('after finish new lease',actor(reserve))
 sql((H/'04-rollback.sql.review').read_text(encoding='utf-8'));check('rollback keeps evidence','SELECT count(*) FROM platform_private.micro_ficha_extra_v1','2')
 check('rollback denies writer',actor(save(key=130)),error='permission denied')
 print(json.dumps({'count':len(results),'pass':results,'limits':'component PostgreSQL: real actor/root bodies; synthetic Auth/feature/schema, receipt reconstruction; NOT hosted JWT/RLS'},ensure_ascii=False))
finally:
 subprocess.run(priv+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp,ignore_errors=True)
