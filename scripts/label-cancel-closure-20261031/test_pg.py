"""Exact captured composition; disposable Unix socket only. No hosted I/O."""
from pathlib import Path
import sys,json,hashlib,subprocess,re,traceback,time
H=Path(__file__).resolve().parent;ROOT=H.parents[1];S=ROOT/'scripts'
sys.path.insert(0,str(S/'delivery-atomic-hardening-20261030'))
import restore
from restore import pg
import test_pg as T
checks=[];raw=[];sources=[]
RPC='public.rpc_cancelar_etiqueta_produto(uuid,text)'
STATE="""SELECT jsonb_build_object('fn',(SELECT jsonb_build_object('body',pg_get_functiondef(oid),'md5',md5(pg_get_functiondef(oid)),'owner',pg_get_userbyid(proowner),'acl',proacl::text,'definer',prosecdef,'config',proconfig) FROM pg_proc WHERE oid='public.rpc_cancelar_etiqueta_produto(uuid,text)'::regprocedure),
'rel',(SELECT jsonb_object_agg(c.relname,jsonb_build_array(pg_get_userbyid(c.relowner),c.relacl::text,c.relrowsecurity,c.relforcerowsecurity)) FROM pg_class c WHERE c.oid IN ('public.produto_etiquetas'::regclass,'public.produto_etiqueta_eventos'::regclass,'public.financial_audit_log'::regclass)),
'policies',(SELECT jsonb_agg(jsonb_build_array(tablename,policyname,permissive,roles::text,cmd,qual,with_check) ORDER BY tablename COLLATE "C",policyname COLLATE "C") FROM pg_policies WHERE schemaname='public' AND tablename IN ('produto_etiquetas','produto_etiqueta_eventos','financial_audit_log')),
'triggers',(SELECT jsonb_agg(jsonb_build_array(tgrelid::regclass::text,tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgrelid::regclass::text COLLATE "C",tgname COLLATE "C",tgenabled::text COLLATE "C") FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.produto_etiquetas'::regclass,'public.produto_etiqueta_eventos'::regclass,'public.financial_audit_log'::regclass)))"""
def sql(s):return pg.sql(s)
def last(s):return sql(s).splitlines()[-1]
def ok(n):checks.append({'test':n,'status':'PASS'});print('PASS',n,flush=True)
def state():return json.loads(last(STATE+'::text;'))
def snap():return last("SELECT jsonb_build_object("+','.join("'%s',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text COLLATE \"C\"),'[]') FROM public.%s x)"%(t,t) for t in ['produto_etiquetas','produto_etiqueta_eventos','financial_audit_log'])+")::text;")
def actor(w,role='authenticated'):return f"SET ROLE {role};SET request.jwt.claim.sub='{w or ''}';SET request.jwt.claims='{json.dumps({'sub':w,'role':role})}';"
def call(w,label,role='authenticated'):return actor(w,role)+f"SELECT public.rpc_cancelar_etiqueta_produto('{label}','LOCAL REVIEW');"
def reject(n,s,code):
 r=subprocess.run(pg.psql(),input='\\set VERBOSITY verbose\n'+s,capture_output=True,text=True,timeout=40);raw.append({'test':n,'code':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 assert r.returncode!=0 and re.search(r'ERROR:\s+'+code+':',r.stderr),(n,r.stderr);ok(n)
def guard(v,n):return "DO $g$ BEGIN IF ("+STATE+") IS DISTINCT FROM '"+json.dumps(v).replace("'","''")+"'::jsonb THEN RAISE EXCEPTION '"+n+"'; END IF; END $g$;\n"
def load(p):sources.append({'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()});sql(p.read_text())
def run():
 assert pg.root.is_relative_to(Path('/tmp')) and pg.psql()[3]==str(pg.root)
 capture=json.loads((S/'delivery-atomic-hardening-20261030/capture/current.json').read_text())
 assert 'swzpzcwiasxmjutrmvkm' in (S/'os-delivery-reopening-20261027/live/public.fn_entrega_confirmar_engine_v1.sql.review').read_text()
 r=restore.restore();assert not any(r.values()),r;ok('full captured restore no unresolved objects, local socket only')
 for p in [S/'delivery-proof-authz-20261030/release-combined.sql.review',S/'stock-envase-recovery-20261027/install-v2.sql.review',S/'proof-select-tenant-20261030/install.sql.review',S/'delivery-evidence-tenant-20261030/install.sql.review',S/'produto-etiquetas-tenant-20261030/install.sql.review',S/'delivery-checklist-occurrence-authz-20261030/install.sql.review',S/'delivery-waiver-closure-20261030/install.sql.review',S/'delivery-group-capability-20261030/install.sql.review',S/'stock-envase-recovery-20261027/isolated/install.sql.review',S/'stock-envase-recovery-20261027/isolated/legacy-closure-install.sql.review',S/'stock-envase-recovery-20261027/isolated/release.sql.review']:load(p)
 ok('reported applied composition restored unchanged, not reinstalled hosted')
 T.setup();la,lb=T.u(8801),T.u(8802)
 # Actual INSERT with enabled table triggers; roots use existing fixture lot.
 for label in [la,lb]:sql(f"INSERT INTO public.produto_etiquetas(id,codigo_etiqueta,produto_nome,lote_codigo,lote_id,status,metadata) VALUES('{label}','LOCAL-{label}','LOCAL','LOCAL','{T.L}','gerada','{{}}');")
 ok('valid synthetic labels seeded with origin triggers enabled')
 pre=state();assert pre['fn']['md5']=='c640896710b8eb8a00eb230bbf9e1cbe';assert pre['fn']['definer'];assert last(f"SELECT has_function_privilege('authenticated','{RPC}','EXECUTE');")=='t'
 # Foreign reader sees zero yet vulnerable DEFINER writes. Rollback exposure proof.
 assert last(actor(T.V)+f"SELECT count(*) FROM public.produto_etiquetas WHERE id='{la}';")=='0';ok('FSF foreign label invisible through restrictive read')
 before=snap();out=sql('BEGIN;'+call(T.V,la)+f"RESET ROLE;SELECT status FROM public.produto_etiquetas WHERE id='{la}';ROLLBACK;")
 assert 'cancelada' in out and snap()==before;raw.append({'test':'foreign BEFORE vulnerability rollback','stdout':out});ok('foreign DEFINER cancellation reproduced with valid ID, rollback preserves label/event/audit')
 out=sql('BEGIN;'+call(T.U,lb)+f"RESET ROLE;SELECT status FROM public.produto_etiquetas WHERE id='{lb}';ROLLBACK;");assert 'cancelada' in out;ok('own BEFORE positive cancellation rolled back')
 sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{T.V}';")
 out=sql('BEGIN;'+call(T.V,la)+f"RESET ROLE;SELECT status FROM public.produto_etiquetas WHERE id='{la}';ROLLBACK;");assert 'cancelada' in out;ok('inactive BEFORE vulnerability reproduced with actual enabled triggers')
 sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{T.V}';")
 delta=(H/'candidate.sql.review').read_text();sql(delta);post=state()
 x=json.loads(json.dumps(pre));x['fn']['acl']=post['fn']['acl'];assert x==post;assert pre['fn']['acl']!=post['fn']['acl']
 assert last(f"SELECT has_function_privilege('service_role','{RPC}','EXECUTE');")=='t';ok('only client EXECUTE ACL changed; body owner policies triggers service unchanged')
 (H/'pre-state.json').write_text(json.dumps(pre,indent=2)+'\n');(H/'post-state.json').write_text(json.dumps(post,indent=2)+'\n')
 for n,v in [('preflight',guard(pre,'LABEL_CANCEL_PRE_DRIFT')),('postflight',guard(post,'LABEL_CANCEL_POST_DRIFT')),('install','BEGIN;SET LOCAL lock_timeout=\'3s\';\n'+guard(pre,'LABEL_CANCEL_PRE_DRIFT')+delta+guard(post,'LABEL_CANCEL_POST_DRIFT')+'COMMIT;'),('state',STATE+';')]: (H/(n+'.sql.review')).write_text(v+'\n')
 before=snap()
 for name,w,l,role in [('foreign FSF',T.V,la,'authenticated'),('own ARBio',T.U,lb,'authenticated'),('anon',None,la,'anon')]:reject('AFTER exact 42501 '+name,call(w,l,role),'42501');assert snap()==before
 sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{T.V}';");reject('AFTER inactive exact 42501',call(T.V,la),'42501');assert snap()==before
 sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{T.V}';")
 sql((H/'rollback.sql.review').read_text());assert state()==post and snap()==before;reject('rollback never reopens client',call(T.U,la),'42501')
 reject('installer rerun exact PRE rejects', (H/'install.sql.review').read_text(),'P0001');assert state()==post
 assert last(actor(T.U)+f"SELECT count(*) FROM public.produto_etiquetas WHERE id IN ('{la}','{lb}');")=='2';assert last(actor(T.V)+f"SELECT count(*) FROM public.produto_etiquetas WHERE id IN ('{la}','{lb}');")=='0';ok('own read/print source and foreign read isolation preserved')
 # Reconstruct PRE only inside local transaction to exercise exact installer without committing reopening.
 sql('BEGIN;'+f'GRANT EXECUTE ON FUNCTION {RPC} TO authenticated;'+guard(pre,'LOCAL_PRE_RECONSTRUCTION')+delta+guard(post,'LOCAL_POST')+'ROLLBACK;');assert state()==post;ok('exact PRE delta POST composition transaction tested, no persistent regrant')
 sources.append({'capture':str((S/'delivery-atomic-hardening-20261030/capture/current.json').relative_to(ROOT)),'sha256':hashlib.sha256((S/'delivery-atomic-hardening-20261030/capture/current.json').read_bytes()).hexdigest()})
if __name__=='__main__':
 status=1;start=time.monotonic()
 try:run();status=0
 except Exception as e:traceback.print_exc();checks.append({'test':'execution','status':'FAIL','error':str(e)})
 finally:(H/'test-results.json').write_text(json.dumps({'exit_code':status,'elapsed':time.monotonic()-start,'checks':checks,'raw':raw,'sources':sources},indent=2)+'\n')
 sys.exit(status)
