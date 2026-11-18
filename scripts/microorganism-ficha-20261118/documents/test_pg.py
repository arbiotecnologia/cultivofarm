"""Disposable PG only. Reuses captured baseline bodies; Auth/schema/Storage are synthetic."""
from pathlib import Path
import json,subprocess,shutil,threading,time
H=Path(__file__).resolve().parent
baseline=(H.parent/'test_pg.py').read_text(encoding='utf-8')
prefix=baseline[:baseline.index(' pins=json.loads')]
# Execute baseline bootstrap without running/editing its tests or evidence writers.
prefix=prefix.replace('H=Path(__file__).resolve().parent','H=Path(__file__).resolve().parent.parent')
prefix+='\nfinally:\n pass\n'
exec(compile(prefix,str(H/'test_pg.py'),'exec'))
H=Path(__file__).resolve().parent
try:
 sql('CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean,file_size_limit bigint);CREATE TABLE storage.objects(id uuid,bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;')
 sql((H/'schema.sql.review').read_text(encoding='utf-8'))
 sql((H/'pin-helper.sql.review').read_text(encoding='utf-8'))
 capture=json.loads(sql((H/'pin-helper.sql.review').read_text(encoding='utf-8')+(H/'capture.sql.review').read_text(encoding='utf-8').split('-- Normalize')[0]))
 import importlib.util
 spec=importlib.util.spec_from_file_location('documents_assemble',H/'assemble.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 # Expected foundation is real captured actor/root, but HML marker and relations in this capture are synthetic.
 sql("INSERT INTO storage.buckets VALUES('microorganism-documents',false,10485760)")
 sql((H.parent/'05-release.sql.review').read_text(encoding='utf-8'))
 capture=json.loads(sql((H/'pin-helper.sql.review').read_text(encoding='utf-8')+(H/'capture.sql.review').read_text(encoding='utf-8')))
 out=tmp/'documents-assembled';module.assemble(capture,out)
 # Production preparation uses the same disposable definitions, not a hosted production capture.
 production_out=tmp/'documents-production-preparation'
 module.assemble({**capture,'ref':'swzpzcwiasxmjutrmvkm'},production_out)
 check('UTF8 roundtrip captured accented function',"SELECT md5(pg_get_functiondef('public.tenant_microorganism_ficha_save_v1(uuid,timestamptz,timestamptz,jsonb,jsonb,uuid)'::regprocedure))",module.EXPECTED[-1])
 assert json.loads((production_out/'binding.json').read_text(encoding='utf-8'))['ref']=='swzpzcwiasxmjutrmvkm'
 assert (production_out/'02-install.sql.review').read_bytes()==(out/'02-install.sql.review').read_bytes()
 results.append('production assembly same reviewed SQL from synthetic exact capture; no hosted proof')
 # Schema was already installed for capture; recreate only the disposable delta before assembled install.
 sql("DROP POLICY micro_documents_client_closed_v1 ON storage.objects;DROP TABLE platform_private.micro_document_versions_v1;DROP TABLE platform_private.micro_document_uploads_v1;DROP TABLE platform_private.micro_documents_gate_v1;")
 for signature in module.PUBLIC+['public.micro_document_attest_bytes_v1(uuid,text,integer,text)','platform_private.micro_document_context_v1(uuid,boolean)','platform_private.micro_document_immutable_v1()']:sql('DROP FUNCTION '+signature)
 sql((out/'01-pre.sql.review').read_text(encoding='utf-8'));sql((out/'02-install.sql.review').read_text(encoding='utf-8'));sql((out/'02-install.sql.review').read_text(encoding='utf-8'));sql((out/'03-post.sql.review').read_text(encoding='utf-8'))
 check('closed install',"SELECT has_function_privilege('authenticated','public.tenant_micro_document_list_v1(uuid)','EXECUTE')",'f')
 sql((out/'05-release.sql.review').read_text(encoding='utf-8'))
 sql((out/'02-install.sql.review').read_text(encoding='utf-8'))
 check('rerun preserves release','SELECT enabled FROM platform_private.micro_documents_gate_v1','t')
 ack=json.loads(sql(actor(f"SELECT public.tenant_microorganism_ficha_save_v1(NULL,NULL,NULL,'{{\"root\":{{\"nome\":\"Document QA\",\"tipo\":\"bacteria\"}}}}','[]','{U(200)}')")))
 micro=ack['id'];version=ack['updated_at'];meta={'title':'Laudo documental','file_name':'laudo.pdf','mime':'application/pdf','size_bytes':8,'sha256':'a'*64}
 def prepare(key=201,m=meta,v=version,doc='NULL',prev=0):return f"SELECT public.tenant_micro_document_prepare_v1('{micro}','{v}',{doc},{prev},'{json.dumps(m)}','{U(key)}')"
 p=json.loads(sql(actor(prepare())));upload=p['upload_id']
 check('prepare idempotent',actor(prepare()))
 check('reader cannot prepare',actor(prepare(202),2),error='role_denied')
 check('tenant B cannot prepare',actor(prepare(203),3),error='document_denied')
 check('tenant B cannot list',actor(f"SELECT public.tenant_micro_document_list_v1('{micro}')",3),error='document_denied')
 check('reader sees no fabricated docs',actor(f"SELECT public.tenant_micro_document_list_v1('{micro}')",2),'[]')
 check('oversize server',actor(prepare(204,{**meta,'size_bytes':10485761})),error='document_invalid')
 check('MIME server',actor(prepare(205,{**meta,'mime':'text/html'})),error='document_invalid')
 check('hash server',actor(prepare(206,{**meta,'sha256':'bad'})),error='document_invalid')
 check('approval server',actor(prepare(207,{**meta,'approved':True})),error='document_invalid')
 check('changed intent denied',actor(prepare(201,{**meta,'title':'Outro'})),error='intent_conflict')
 commit=f"SELECT public.tenant_micro_document_commit_v1('{micro}','{upload}')"
 check('not attested cannot commit',actor(commit),error='not_ready')
 check('client cannot attest',actor(f"SELECT public.micro_document_attest_bytes_v1('{upload}','{'a'*64}',8,'application/pdf')"),error='permission denied')
 sql("GRANT EXECUTE ON FUNCTION public.micro_document_attest_bytes_v1(uuid,text,integer,text) TO service_role")
 sql(f"SET ROLE service_role;SELECT public.micro_document_attest_bytes_v1('{upload}','{'a'*64}',8,'application/pdf')")
 a=json.loads(sql(actor(commit)));check('first version',f"SELECT version FROM platform_private.micro_document_versions_v1 WHERE micro_id='{micro}'",'1')
 check('reader opens committed',actor(f"SELECT public.tenant_micro_document_open_snapshot_v1('{micro}','{a['version_id']}')->>'sha256'",2),'a'*64)
 check('tenant B cannot open',actor(f"SELECT public.tenant_micro_document_open_snapshot_v1('{micro}','{a['version_id']}')",3),error='document_denied')
 parallel=[]
 def replay():parallel.append(json.loads(sql(actor(commit))))
 t1=threading.Thread(target=replay);t2=threading.Thread(target=replay);t1.start();t2.start();t1.join();t2.join();assert len(parallel)==2 and all(x['version_id']==a['version_id'] for x in parallel)
 check('concurrent replay single version',f"SELECT count(*) FROM platform_private.micro_document_versions_v1 WHERE micro_id='{micro}'",'1')
 check('concurrent replay single receipt',f"SELECT count(*) FROM platform_private.tenant_catalog_root_receipts WHERE idempotency_key='{U(201)}'",'1')
 check('old root CAS',actor(prepare(208)),error='root_stale')
 version=a['updated_at'];p2=json.loads(sql(actor(prepare(209,v=version,doc="'"+a['document_id']+"'",prev=1))))
 sql(f"SET ROLE service_role;SELECT public.micro_document_attest_bytes_v1('{p2['upload_id']}','{'a'*64}',8,'application/pdf')")
 # Root changes after bytes; atomic commit refuses without new version/receipt.
 sql(f"UPDATE public.microrganismos SET updated_at=clock_timestamp() WHERE id='{micro}'")
 check('late root conflict',actor(f"SELECT public.tenant_micro_document_commit_v1('{micro}','{p2['upload_id']}')"),error='stale')
 check('atomic version unchanged',f"SELECT count(*) FROM platform_private.micro_document_versions_v1 WHERE micro_id='{micro}'",'1')
 check('atomic receipt absent',f"SELECT count(*) FROM platform_private.tenant_catalog_root_receipts WHERE idempotency_key='{U(209)}'",'0')
 version=sql(f"SELECT updated_at FROM microrganismos WHERE id='{micro}'")
 p3=json.loads(sql(actor(prepare(210,v=version,doc="'"+a['document_id']+"'",prev=1))))
 check('two pending tenant quota',actor(prepare(211,v=version)),error='document_quota')
 sql(f"SET ROLE service_role;SELECT public.micro_document_attest_bytes_v1('{p3['upload_id']}','{'a'*64}',8,'application/pdf')")
 nextcommit=f"SELECT public.tenant_micro_document_commit_v1('{micro}','{p3['upload_id']}')"
 # Actual lock waiter observed before role revocation.
 holder=subprocess.Popen(['psql','-X','-qAt','-h',str(tmp),'-p',port,'-U','postgres'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 holder.stdin.write(f"BEGIN;SELECT 1 FROM microrganismos WHERE id='{micro}' FOR UPDATE;\n");holder.stdin.flush()
 pending=[]
 def waitcommit():pending.append(subprocess.run(['psql','-X','-qAt','-h',str(tmp),'-p',port,'-U','postgres','-v','ON_ERROR_STOP=1'],input=actor(nextcommit),text=True,capture_output=True))
 thread=threading.Thread(target=waitcommit);thread.start();observed=False
 for _ in range(100):
  if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE query LIKE '%tenant_micro_document_commit_v1%' AND pid<>pg_backend_pid() AND cardinality(pg_blocking_pids(pid))>0)")=='t':observed=True;break
  time.sleep(.02)
 assert observed
 sql(f"UPDATE platform_private.members SET editor=false WHERE id='{U(1)}'")
 holder.stdin.write('COMMIT;\n');holder.stdin.close();holder.wait(timeout=3);thread.join(timeout=5)
 assert pending and pending[0].returncode and 'role_denied' in pending[0].stderr
 check('revoked waiter no version',f"SELECT count(*) FROM platform_private.micro_document_versions_v1 WHERE micro_id='{micro}'",'1')
 sql(f"UPDATE platform_private.members SET editor=true WHERE id='{U(1)}'")
 a2=json.loads(sql(actor(nextcommit)));check('new immutable version',f"SELECT count(*) FROM platform_private.micro_document_versions_v1 WHERE micro_id='{micro}'",'2')
 check('historical version retained',actor(f"SELECT public.tenant_micro_document_open_snapshot_v1('{micro}','{a['version_id']}')->>'sha256'",2),'a'*64)
 check('immutable metadata',"UPDATE platform_private.micro_document_versions_v1 SET title='forged'",error='version_immutable')
 check('private DML denied',actor('SELECT * FROM platform_private.micro_document_versions_v1'),error='permission denied')
 sql((out/'04-rollback.sql.review').read_text(encoding='utf-8'));sql((out/'04-rollback.sql.review').read_text(encoding='utf-8'));sql((out/'02-install.sql.review').read_text(encoding='utf-8'))
 check('rollback rerun stays closed','SELECT enabled FROM platform_private.micro_documents_gate_v1','f')
 check('rollback history retained','SELECT count(*) FROM platform_private.micro_document_versions_v1','2')
 check('rollback client denied',actor(f"SELECT public.tenant_micro_document_list_v1('{micro}')"),error='permission denied')
 (H/'evidence/pg-result.json').write_text(json.dumps({'count':len(results),'checks':results,'limits':'Disposable PG; captured actor/root/receipt foundations, synthetic Auth/feature/Storage/schema; not hosted proof'},indent=2),encoding='utf-8',newline='\n')
 print(json.dumps({'count':len(results),'pass':True}))
finally:
 subprocess.run(priv+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp,ignore_errors=True)
