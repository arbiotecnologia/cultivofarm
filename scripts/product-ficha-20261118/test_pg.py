"""Disposable PG, captured motor/actor, declared synthetic identity/config/schema. No hosted IO."""
import os,subprocess,tempfile,shutil,json,time
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
 CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT org FROM platform_private.members WHERE id=auth.uid()$$;
 CREATE FUNCTION is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION _saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT feature FROM platform_private.members WHERE id=$1$$;
 CREATE FUNCTION platform_private.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT editor FROM platform_private.members WHERE id=$1$$;
 CREATE FUNCTION can_view_catalog_internal(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE TABLE produtos(id uuid PRIMARY KEY,owner_organization_id uuid,nome text);
 CREATE TABLE product_technical_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),produto_id uuid REFERENCES produtos(id),resumo_curto text,updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE platform_private.tenant_catalog_root_cfg(root text PRIMARY KEY,kind text,allowed text[],parent_col text,parent_tbl text,refs jsonb,safe_defaults jsonb);
 CREATE TABLE platform_private.tenant_catalog_root_receipts(actor_id uuid,organization_id uuid,idempotency_key uuid,payload_hash text,result jsonb,created_at timestamptz DEFAULT now(),PRIMARY KEY(actor_id,organization_id,idempotency_key));
 GRANT USAGE ON SCHEMA auth TO authenticated;''')
 for f in ['platform_private.catalog_tenant_actor','platform_private.tenant_catalog_ref_owner','public.tenant_catalog_root_save']:sql((B/'capture'/f'{f}.sql').read_text(encoding='utf-8'))
 src=(H.parent/'tenant-exclusive-catalog-20261101/crud_section.py').read_text(encoding='utf-8');sql(src[src.index('CREATE FUNCTION platform_private.tenant_catalog_receipt'):src.index('CREATE FUNCTION public.tenant_catalog_root_save')])
 sql("INSERT INTO platform_private.tenant_catalog_root_cfg VALUES('product_technical_profiles','profile',ARRAY['produto_id','resumo_curto'],'produto_id','produtos','{\"produto_id\":\"produtos\"}','{}');")
 sql(f"INSERT INTO organizations VALUES('{U(11)}',true,'ativa'),('{U(12)}',true,'ativa');INSERT INTO platform_private.members(id,org,editor) VALUES('{U(1)}','{U(11)}',true),('{U(2)}','{U(11)}',false),('{U(3)}','{U(12)}',true);INSERT INTO produtos VALUES('{U(21)}','{U(11)}','Produto QA');")
 sql((H.parent/'b2b-solid-packaging-order-20261106/captured/solid-pack/platform_private.recorte_a_actor_fresh.0cb006c4.live-20261106.sql').read_text(encoding='utf-8')+';')
 sql('''REVOKE ALL ON FUNCTION platform_private.recorte_a_actor_fresh(text) FROM PUBLIC,anon,authenticated,service_role;
 CREATE TABLE culturas(id uuid PRIMARY KEY,nome text,ativo boolean,owner_organization_id uuid);
 CREATE TABLE catalogo_alvos(id uuid PRIMARY KEY,nome text,ativo boolean);
 CREATE TABLE product_crop_recommendations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),produto_id uuid REFERENCES produtos(id),cultura_id uuid REFERENCES culturas(id),cultura_nome text,fase_recomendada text,objetivo_uso text,dose_recomendada text,observacao text,ativo boolean DEFAULT true,created_at timestamptz DEFAULT now());
 CREATE TABLE product_target_recommendations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),produto_id uuid REFERENCES produtos(id),catalogo_alvo_id uuid,alvo_nome text NOT NULL,alvo_tipo text NOT NULL,descricao text,prioridade integer DEFAULT 1,ativo boolean DEFAULT true,created_at timestamptz DEFAULT now());
 CREATE TABLE catalog_technical_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entidade_tipo text NOT NULL,entidade_id uuid NOT NULL,fonte_titulo text NOT NULL,fonte_url text,fonte_tipo text,nivel_confianca text,idioma_original text,pais_origem text,resumo_evidencia text,data_consulta date,observacoes text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());''')
 sql((H/'source.sql.review').read_text(encoding='utf-8'))
 sql('GRANT EXECUTE ON FUNCTION public.tenant_catalog_root_save(text,uuid,jsonb,timestamptz,uuid) TO authenticated;')
 e={'field':'resumo_curto','value':'Conteúdo aceito','candidate_key':'A','identity':{'entity':'produto','id':U(21),'name':'Produto QA'},'sources':[{'url':'https://example.org/ficha','title':'Documento','excerpt':'Trecho'}]}
 def save(key=100,ev=None,id='NULL',rev='NULL'):
  p={'produto_id':U(21),'resumo_curto':'Conteúdo aceito','documentary_evidence':[e] if ev is None else ev}
  if id!='NULL':p.pop('produto_id')
  return f"SELECT tenant_catalog_root_save('product_technical_profiles',{id},'{json.dumps(p,ensure_ascii=False)}',{rev},'{U(key)}');"
 check('closed gate',actor(save()),error='product_evidence_closed')
 sql('UPDATE platform_private.product_evidence_gate_v1 SET enabled=true')
 ack=json.loads(sql(actor(save())));id=ack['id'];rev=ack['updated_at']
 check('sources reopen',actor(f"SELECT tenant_product_documentary_read_v1('{U(21)}')->'evidence'->0->>'value'"),'Conteúdo aceito')
 check('reader allowed',actor(f"SELECT jsonb_array_length(tenant_product_documentary_read_v1('{U(21)}')->'evidence')",2),'1')
 check('B read denied',actor(f"SELECT tenant_product_documentary_read_v1('{U(21)}')",3),error='denied')
 check('B write denied',actor(save(101),3),error='foreign')
 check('reader write denied',actor(save(102),2),error='role_denied')
 check('replay identical',actor(save()),None)
 check('single history after replay','SELECT count(*) FROM platform_private.product_evidence_history_v1','1')
 check('candidate retained',actor(f"SELECT tenant_product_documentary_read_v1('{U(21)}')->'evidence'->0->>'candidate_key'"),'A')
 check('profile version acknowledged',actor(f"SELECT tenant_product_documentary_read_v1('{U(21)}')->>'profile_id'"),id)
 check('duplicate evidence field rejected',actor(save(108,[e,e])),error='duplicate_field')
 check('wrong product name rejected',actor(save(107,[{**e,'identity':{**e['identity'],'name':'Outro produto'}}])),error='identity')
 check('missing candidate rejected',actor(save(109,[{k:v for k,v in e.items() if k!='candidate_key'}])),error='evidence_shape')
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
 sql(f"UPDATE platform_private.members SET feature=true WHERE id='{U(1)}';INSERT INTO culturas VALUES('{U(31)}','Soja',true,'{U(11)}'),('{U(32)}','Milho',true,'{U(12)}');")
 def relation_save(children,key=130,expected=rev):
  payload={'resumo_curto':'Conteúdo aceito','product_relations':children}
  return f"SELECT tenant_catalog_root_save('product_technical_profiles','{id}','{json.dumps(payload,ensure_ascii=False)}','{expected}','{U(key)}');"
 crop={'kind':'crop','id':None,'expected':None,'fields':{'cultura_id':U(31),'cultura_nome':'WRONG','ativo':True}}
 crop_ack=json.loads(sql(actor(relation_save([crop]))))
 check('canonical culture name','SELECT cultura_nome FROM product_crop_recommendations','Soja')
 check('relation replay single insert',actor(relation_save([crop])))
 check('no duplicate culture','SELECT count(*) FROM product_crop_recommendations','1')
 check('foreign culture abort',actor(relation_save([{**crop,'fields':{'cultura_id':U(32)}}],131,crop_ack['updated_at'])),error='crop_foreign')
 check('foreign culture no receipt',f"SELECT count(*) FROM platform_private.tenant_catalog_root_receipts WHERE idempotency_key='{U(131)}'",'0')
 observed_crop=json.loads(sql('SELECT to_jsonb(x) FROM product_crop_recommendations x'))
 sql("UPDATE product_crop_recommendations SET observacao='Concurrent edit'")
 changed={**crop,'id':observed_crop['id'],'expected':observed_crop,'fields':{'observacao':'Stale overwrite'}}
 check('row CAS no invented revision',actor(relation_save([changed],132,crop_ack['updated_at'])),error='child_stale')
 check('concurrent row retained','SELECT observacao FROM product_crop_recommendations','Concurrent edit')
 broken={'kind':'source','id':None,'expected':None,'fields':{'fonte_titulo':'Bad','fonte_url':'javascript:x','fonte_tipo':'outro','nivel_confianca':'baixo'}}
 check('late source aborts prior child',actor(relation_save([crop,broken],133,crop_ack['updated_at'])),error='source_invalid')
 check('atomic children no second crop','SELECT count(*) FROM product_crop_recommendations','1')
 check('atomic late no receipt',f"SELECT count(*) FROM platform_private.tenant_catalog_root_receipts WHERE idempotency_key='{U(133)}'",'0')
 check('private helper execute denied',actor(f"SELECT platform_private.product_relations_apply_v1('{U(21)}','{U(11)}','[]')"),error='permission denied')
 # Real captured VOLATILE fresh actor, STABLE legacy actor; test dependencies remain declared synthetic.
 check('captured fresh actor volatile',"SELECT provolatile FROM pg_proc WHERE oid='platform_private.recorte_a_actor_fresh(text)'::regprocedure",'v')
 check('legacy actor stable',"SELECT provolatile FROM pg_proc WHERE oid='platform_private.catalog_tenant_actor(text)'::regprocedure",'s')
 check('private tables RLS',"SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('platform_private.product_evidence_gate_v1'::regclass,'platform_private.product_evidence_history_v1'::regclass)",'t')
 check('latest evidence index',"SELECT count(*) FROM pg_indexes WHERE schemaname='platform_private' AND indexname='product_evidence_history_v1_latest' AND indexdef LIKE '%(product_id, sequence DESC)%'",'1')
 cmd=['psql','-X','-qAt','-h',str(t),'-p',port,'-U','postgres','-v','ON_ERROR_STOP=1']
 def race(name,lock,request,revoke,error,held_change=""):
  holder=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
  holder.stdin.write('BEGIN;'+lock+"SELECT 'HELD';\n");holder.stdin.flush()
  while holder.stdout.readline().strip()!='HELD':
   assert holder.poll() is None,'LOCK_HOLDER_FAILED'
  runner=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
  runner.stdin.write("SET application_name='product_fresh_race';"+actor(request));runner.stdin.close();runner.stdin=None
  try:
   deadline=time.monotonic()+10
   while sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='product_fresh_race' AND wait_event_type='Lock'")!='1':
    assert time.monotonic()<deadline,'RACE_DID_NOT_WAIT'
    time.sleep(.02)
   if revoke:sql(revoke)
   if held_change:
    holder.stdin.write(held_change+"\n");holder.stdin.flush()
   holder.stdin.write('COMMIT;\n');holder.stdin.flush();holder.stdin.close();holder.stdin=None
   holder.communicate(timeout=10)
   out,err=runner.communicate(timeout=10)
   if error:assert runner.returncode and error in err,(name,out,err)
   else:assert runner.returncode==0,(name,out,err)
   results.append(name)
   return out.strip()
  finally:
   if holder.poll() is None:holder.kill();holder.wait()
   if runner.poll() is None:runner.kill();runner.wait()
   sql(f"UPDATE platform_private.members SET feature=true,editor=true,org='{U(11)}' WHERE id='{U(1)}'")
 before=sql('SELECT count(*) FROM platform_private.tenant_catalog_root_receipts')
 race('fresh revocation after profile row wait',f"SELECT 1 FROM product_technical_profiles WHERE id='{id}' FOR UPDATE;",relation_save([crop],140,crop_ack['updated_at']),f"UPDATE platform_private.members SET editor=false WHERE id='{U(1)}'",'role_denied')
 race('fresh feature revocation after parent wait',f"SELECT 1 FROM produtos WHERE id='{U(21)}' FOR UPDATE;",save(141),f"UPDATE platform_private.members SET feature=false WHERE id='{U(1)}'",'feature_unavailable')
 receipt_lock="SELECT pg_advisory_xact_lock(hashtextextended(concat_ws(':','tcr','%s'::uuid,'%s'::uuid,'%s'::uuid),0));" % (U(1),U(11),U(100))
 race('fresh revocation after receipt wait replay',receipt_lock,save(),f"UPDATE platform_private.members SET editor=false WHERE id='{U(1)}'",'role_denied')
 race('fresh revocation after gate wait replay','SELECT 1 FROM platform_private.product_evidence_gate_v1 FOR UPDATE;',save(),f"UPDATE platform_private.members SET editor=false WHERE id='{U(1)}'",'role_denied')
 race('fresh scope changed after child row wait',f"SELECT 1 FROM product_crop_recommendations WHERE id='{observed_crop['id']}' FOR UPDATE;",relation_save([{**changed,'expected':json.loads(sql('SELECT to_jsonb(x) FROM product_crop_recommendations x'))}],142,crop_ack['updated_at']),f"UPDATE platform_private.members SET org='{U(12)}' WHERE id='{U(1)}'",'product_actor_changed')
 race('gate OFF reader after concurrent wait','SELECT 1 FROM platform_private.product_evidence_gate_v1 FOR UPDATE;',f"SELECT tenant_product_documentary_read_v1('{U(21)}')",f"UPDATE platform_private.members SET feature=false WHERE id='{U(1)}'",'feature_unavailable')
 race('gate closes during reader wait','SELECT 1 FROM platform_private.product_evidence_gate_v1 FOR UPDATE;',f"SELECT tenant_product_documentary_read_v1('{U(21)}')",None,'evidence_closed','UPDATE platform_private.product_evidence_gate_v1 SET enabled=false;')
 sql('UPDATE platform_private.product_evidence_gate_v1 SET enabled=true')
 check('concurrent refusal no receipts','SELECT count(*) FROM platform_private.tenant_catalog_root_receipts',before)
 check('concurrent refusal no children','SELECT count(*) FROM product_crop_recommendations','1')
 sql('UPDATE platform_private.product_evidence_gate_v1 SET enabled=false')
 check('rollback denies new relations',actor(relation_save([crop],134,crop_ack['updated_at'])),error='evidence_closed')
 check('rollback denies reader',actor(f"SELECT tenant_product_documentary_read_v1('{U(21)}')"),error='evidence_closed')
 check('rollback history retained','SELECT count(*) FROM platform_private.product_evidence_history_v1','1')
 sql('UPDATE platform_private.product_evidence_gate_v1 SET enabled=true')
 check('release restores exact accepted evidence',actor(f"SELECT jsonb_array_length(tenant_product_documentary_read_v1('{U(21)}')->'evidence')"),'1')
 # Legitimate root/profile writes without documentary_evidence do not create history.
 def manual(value,key):
  current=sql(f"SELECT updated_at FROM product_technical_profiles WHERE id='{id}'")
  payload=json.dumps({'resumo_curto':value},ensure_ascii=False)
  return json.loads(sql(actor(f"SELECT tenant_catalog_root_save('product_technical_profiles','{id}','{payload}','{current}','{U(key)}');")))
 manual_same=manual(e['value'],160)
 same=json.loads(sql(actor(f"SELECT tenant_product_documentary_read_v1('{U(21)}')")))
 assert same['evidence']==[e] and same['history']['evidence']==[e]
 assert same['profile_revision']!=same['history']['profile_revision']
 results.append('manual same text reopens with accepted candidate and current revision')
 check('manual same history immutable','SELECT count(*) FROM platform_private.product_evidence_history_v1','1')
 manual('Texte changé',161)
 check('manual divergent text not attributed',actor(f"SELECT jsonb_array_length(tenant_product_documentary_read_v1('{U(21)}')->'evidence')"),'0')
 check('manual divergent history and candidate retained',actor(f"SELECT tenant_product_documentary_read_v1('{U(21)}')->'history'->'evidence'->0->>'candidate_key'"),'A')
 current=sql(f"SELECT updated_at FROM product_technical_profiles WHERE id='{id}'")
 check('manual divergent reader current revision',actor(f"SELECT (tenant_product_documentary_read_v1('{U(21)}')->>'profile_revision')::timestamptz='{current}'::timestamptz"),'t')
 manual(e['value']+' ',162)
 check('no whitespace normalization',actor(f"SELECT jsonb_array_length(tenant_product_documentary_read_v1('{U(21)}')->'evidence')"),'0')
 manual(e['value'],163)
 check('exact restored text retains accepted candidate',actor(f"SELECT tenant_product_documentary_read_v1('{U(21)}')->'evidence'->0->>'candidate_key'"),'A')
 # Reader waits at gate while a legitimate manual edit commits; profile and sources
 # must both come from the new single SQL snapshot, never old sources/new text.
 output=race('reader concurrent manual edit single snapshot','SELECT 1 FROM platform_private.product_evidence_gate_v1 FOR UPDATE;',f"SELECT tenant_product_documentary_read_v1('{U(21)}')",None,None,f"UPDATE product_technical_profiles SET resumo_curto='Texto concorrente novo',updated_at=clock_timestamp() WHERE id='{id}';")
 concurrent=json.loads(output)
 assert concurrent['evidence']==[] and concurrent['history']['evidence']==[e]
 current=sql(f"SELECT updated_at FROM product_technical_profiles WHERE id='{id}'")
 check('concurrent revision matches changed profile',f"SELECT '{concurrent['profile_revision']}'::timestamptz='{current}'::timestamptz",'t')
 manual(e['value'],166)
 output=race('reader concurrent same-text edit retains exact evidence','SELECT 1 FROM platform_private.product_evidence_gate_v1 FOR UPDATE;',f"SELECT tenant_product_documentary_read_v1('{U(21)}')",None,None,f"UPDATE product_technical_profiles SET updated_at=clock_timestamp() WHERE id='{id}';")
 assert json.loads(output)['evidence']==[e]
 # Explicit empty snapshot retires earlier evidence; latest-only reconciliation never resurrects it.
 current=sql(f"SELECT updated_at FROM product_technical_profiles WHERE id='{id}'")
 sql(actor(save(164,[],id=f"'{id}'",rev=f"'{current}'")))
 manual(e['value'],165)
 check('explicit empty evidence not resurrected',actor(f"SELECT jsonb_array_length(tenant_product_documentary_read_v1('{U(21)}')->'evidence')"),'0')
 check('accepted history still retained','SELECT count(*) FROM platform_private.product_evidence_history_v1','2')
 crop_ack['updated_at']=sql(f"SELECT updated_at FROM product_technical_profiles WHERE id='{id}'")
 # Snapshot control isolated in one STABLE caller: identical authority body is
 # exercised before and after the same lock. The VOLATILE variant must reject.
 sql("CREATE FUNCTION public.snapshot_control() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$BEGIN PERFORM platform_private.recorte_a_actor_fresh('mutate'); PERFORM pg_advisory_xact_lock(771991); PERFORM platform_private.recorte_a_actor_fresh('mutate'); END$$; GRANT EXECUTE ON FUNCTION public.snapshot_control() TO authenticated;")
 race('VOLATILE authority refreshes inside STABLE caller','SELECT pg_advisory_xact_lock(771991);','SELECT public.snapshot_control();',f"UPDATE platform_private.members SET editor=false WHERE id='{U(1)}'",'role_denied')
 sql('ALTER FUNCTION platform_private.recorte_a_actor_fresh(text) STABLE')
 race('negative control STABLE snapshot misses revocation','SELECT pg_advisory_xact_lock(771991);','SELECT public.snapshot_control();',f"UPDATE platform_private.members SET editor=false WHERE id='{U(1)}'",None)
 sql('ALTER FUNCTION platform_private.recorte_a_actor_fresh(text) VOLATILE')
 pins=json.loads(sql("SELECT jsonb_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))) FROM pg_proc WHERE proname IN ('tenant_catalog_root_save','tenant_product_documentary_read_v1','product_source_https_v1')"))
 print(json.dumps({'count':len(results),'pass':results,'pins':pins,'limits':'disposable PG: captured motor/STABLE actor/VOLATILE fresh body; real concurrent PostgreSQL sessions; synthetic identity/dependencies/schema/config/receipt reconstruction; not hosted JWT/RLS'},ensure_ascii=False))
finally:
 subprocess.run(priv+['pg_ctl','-D',str(t/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(t,ignore_errors=True)
