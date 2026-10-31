"""Captured disposable PostgreSQL only; real triggers, synthetic local actors."""
from pathlib import Path
import sys,json,subprocess,re,time,traceback,hashlib,importlib.util,os
H=Path(__file__).resolve().parent; ROOT=H.parents[2]; S=ROOT/'scripts'; ISO=S/'stock-envase-recovery-20261027/isolated'
sys.path.insert(0,str(S/'delivery-atomic-hardening-20261030'))
import restore
from restore import pg
sys.path.insert(0,str(S/'stock-envase-recovery-20261027'));import test_v2_pg as T
spec=importlib.util.spec_from_file_location('confirmation_generator',H/'assemble.py');G=importlib.util.module_from_spec(spec);spec.loader.exec_module(G)
checks=[];raw=[];sources=[]
def sql(s):return pg.sql(s)
def last(s):return sql(s).splitlines()[-1]
def ok(n):checks.append({'test':n,'status':'PASS'});print('PASS',n,flush=True)
def reject(n,s,code,message=None):
 r=subprocess.run(pg.psql(),input='\\set VERBOSITY verbose\n'+s,capture_output=True,text=True,timeout=45);raw.append({'test':n,'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 assert r.returncode!=0 and re.search(r'ERROR:\s+'+code+':',r.stderr) and (message is None or message in r.stderr),(n,r.stdout,r.stderr);ok(n)
def snapshot():return last("SELECT jsonb_build_object("+','.join("'%s',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text COLLATE \"C\"),'[]') FROM public.%s x)"%(t,t) for t in ['entregas','entrega_comprovantes','estoque_produto','estoque_movimentacoes','ordens_servico','laboratorio_esteira_eventos','financial_categories','payment_methods','receivable_payments','company_fiscal_settings']+T.TABLES)+",'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text COLLATE \"C\"),'[]') FROM platform_private.delivery_requests_20261030 x))::text;")
def state():return json.loads(last(G.STATE+'::text;'))
def load(p):sources.append({'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()});sql(p.read_text())
def env(os,pp,l,key):return T.envase(os,pp,l,[{'tipo_embalagem':'frasco_1L','quantidade':2}],key)
def create(os,pp,l,key,sign=False):
 assert json.loads(last(T.actor()+env(os,pp,l,'envase-test-'+key)))['estado']=='completed'
 stock=last(f"SELECT id FROM public.estoque_produto WHERE lote_id='{l}' AND status='reservado';")
 group=json.loads(last(T.actor()+T.group(os,[{'item_id':stock,'quantidade':2}],'group-test-'+key)))
 e=group['itens'][0]['entrega_id'];gen=json.loads(last(T.actor()+f"SELECT public.rpc_entrega_formulario_gerar_v1('{e}','generate-{key}');"));assert gen['success'] is True
 path=f'entregas/{e}/'+('assinaturas/' if sign else 'comprovantes/')+T.u(900+int(key))+('.png' if sign else '.pdf')
 sql(f"INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('entrega-documentos','{path}','{T.U}','{T.U}');")
 payload={'recebedor_nome':'LOCAL'}
 if sign:payload.update(assinatura_digital_png_path=path,assinatura_hash='a'*64);rpc='rpc_entrega_assinatura_coletar_v1'
 else:payload.update(arquivo_path=path,arquivo_nome='local.pdf',arquivo_mime='application/pdf');rpc='rpc_entrega_comprovante_anexar_v1'
 assert json.loads(last(T.actor()+f"SELECT public.{rpc}('{e}','proof-test-{key}','{json.dumps(payload)}');"))['success'] is True
 return e,path

def call(e,key,obs=None,actor=None,name='LOCAL'):
 obs=obs or last(f"SELECT updated_at FROM public.entregas WHERE id='{e}';")
 return T.actor(actor or T.U)+f"SELECT public.rpc_entrega_confirmar_manual_v1('{e}','{obs}','{key}','{json.dumps({'nome':name})}');"
def wait_lock(name):
 for _ in range(100):
  if last(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{name}' AND wait_event_type='Lock';")=='1':return
  time.sleep(.025)
 raise AssertionError('LOCK_WAIT_NOT_OBSERVED '+name)
def wait_revoke(label,change,stmt,restore_sql,gate=False):
 holder=T.T.session('BEGIN;'+('SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;' if gate else '')+change)
 w=subprocess.Popen(pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 w.stdin.write("\\set VERBOSITY verbose\nSET application_name='confirm_revocation';"+stmt+'\n');w.stdin.flush()
 wait_lock('confirm_revocation');T.T.finish(holder,'COMMIT;');before=snapshot()
 w.stdin.close();w.stdin=None;out,err=w.communicate(timeout=30);raw.append({'test':label,'stdout':out,'stderr':err,'returncode':w.returncode})
 assert w.returncode!=0 and re.search(r'ERROR:\s+42501:',err),(out,err)
 assert snapshot()==before;ok(label);sql(restore_sql)
def run():
 assert pg.root.is_relative_to(Path('/tmp')) and pg.psql()[3]==str(pg.root)
 # Ref comes from immutable canonical local capture; no credentials or hosted transport.
 assert 'swzpzcwiasxmjutrmvkm' in (S/'os-delivery-reopening-20261027/live/public.fn_entrega_confirmar_engine_v1.sql.review').read_text()
 cached=Path('/tmp/delivery-confirmation/applied-fixture.sql')
 if os.environ.get('CONFIRM_LOCAL_REUSE')=='1':
  assert cached.is_file() and cached.is_relative_to(Path('/tmp'))
  pg.start();sql(cached.read_text());ok('exact local captured composition checkpoint restored; disposable socket verified')
 else:
  r=restore.restore();assert not any(r.values()),r;ok('full captured restore without unresolved objects; disposable socket verified')
  prepare_checkpoint(cached)
 run_matrix()
def prepare_checkpoint(cached):
 for p in [S/'delivery-proof-authz-20261030/release-combined.sql.review',S/'stock-envase-recovery-20261027/install-v2.sql.review',S/'proof-select-tenant-20261030/install.sql.review',S/'delivery-evidence-tenant-20261030/install.sql.review',S/'produto-etiquetas-tenant-20261030/install.sql.review',S/'delivery-checklist-occurrence-authz-20261030/install.sql.review',S/'delivery-waiver-closure-20261030/install.sql.review',S/'delivery-group-capability-20261030/install.sql.review',ISO/'install.sql.review',ISO/'legacy-closure-install.sql.review',ISO/'release.sql.review']:load(p)
 ok('reported applied composition including isolated install closure release restored without regeneration')
 T.setup_v2();sys.path.insert(0,str(ISO));import sentinels
 sentinels.seed(sys.modules[__name__]);ok('existing full-row downstream sentinels seeded in disposable fixture only')
 sql("INSERT INTO storage.buckets(id,name,public) VALUES('entrega-documentos','entrega-documentos',false) ON CONFLICT DO NOTHING;")
 cmd=pg.psql();cmd[0]='pg_dump';cmd=[cmd[0],'-h',str(pg.root),'-p',str(pg.PORT),'-U','postgres','--clean','--if-exists','postgres']
 cached.write_text(subprocess.run(cmd,capture_output=True,text=True,check=True,timeout=40).stdout)
def run_matrix():
 pre=state();delta=G.candidate();measured=sql('BEGIN;'+delta+G.STATE+'::text;ROLLBACK;');post=json.loads([x for x in measured.splitlines() if x.startswith('{')][-1]);assert state()==pre
 released=json.loads([x for x in sql('BEGIN;'+delta+f'GRANT EXECUTE ON FUNCTION {G.RPC} TO authenticated;'+G.STATE+'::text;ROLLBACK;').splitlines() if x.startswith('{')][-1]);G.write(pre,post,released)
 load(H/'install.sql.review');assert state()==post;ok('exact install PRE POST commits writer closed')
 reject('closed writer refuses authenticated',call(T.u(999),'closed-0001',obs='2026-10-31'),'42501')
 load(H/'release.sql.review');assert state()==released;ok('separate minimum release exact PRE POST')
 e,path=create(T.O2,T.PP2,T.L2,'1');stmt=call(e,'confirm-0001');before=snapshot()
 reject('foreign FSF denies without mutations',call(e,'foreign-0001',actor=T.V),'42501');assert snapshot()==before
 first_before=json.loads(before);result=json.loads(last(stmt));assert result['success'] is True and result['status']=='entregue',result
 ok('canonical attach then physical confirmation advances transactionally')
 first_after=json.loads(snapshot())
 for table in T.TABLES+['financial_categories','payment_methods','receivable_payments','company_fiscal_settings','estoque_produto','estoque_movimentacoes']:assert first_before[table]==first_after[table],table
 ok('first physical success preserves existing financial fiscal outbox stock and ledger full content')
 before=snapshot();rep=json.loads(last(stmt));assert rep['replay'] is True and snapshot()==before;ok('exact replay preserves all snapshots')
 reject('same key changed receiver conflicts',stmt.replace('LOCAL','DIVERGENT'),'PT409','REPLAY_CONFLICT');assert snapshot()==before
 sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{T.U}';");blocked=snapshot();reject('inactive actor cannot replay',stmt,'42501');assert snapshot()==blocked;sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{T.U}';")
 reject('repeatable read explicitly unsupported','BEGIN ISOLATION LEVEL REPEATABLE READ;'+stmt,'0A000');assert snapshot()==before
 reject('serializable explicitly unsupported','BEGIN ISOLATION LEVEL SERIALIZABLE;'+stmt,'0A000');assert snapshot()==before
 e2,path2=create(T.O5,T.PP5,T.L5,'2',True);stmt2=call(e2,'confirm-0002');b=snapshot()
 assert last(f"SELECT e.validation_hash=c.validation_hash AND e.validation_token=c.validation_token FROM public.entregas e JOIN public.entrega_comprovantes c ON c.id=e.comprovante_id WHERE e.id='{e2}';")=='t';ok('reused form digital token/hash synchronized atomically')
 reject('singleton absent explicitly PT503','BEGIN;DELETE FROM cf_user_guards_v1.state;'+stmt2,'PT503');assert snapshot()==b
 reject('missing CAS denied before writes',stmt2.replace("'"+last(f"SELECT updated_at FROM public.entregas WHERE id='{e2}';")+"'",'NULL'),'22023');assert snapshot()==b
 reject('stale CAS denied',call(e2,'cas-stale-0001',obs='2020-01-01'),'PT409');assert snapshot()==b
 reject('financial payload rejected',stmt2.replace('{"nome": "LOCAL"}','{"nome":"LOCAL","faturamento":"bill_now"}'),'22023');assert snapshot()==b
 # Object owner changed locally through actual DML: orphan or foreign owner is not proof.
 sql(f"UPDATE storage.objects SET owner_id='{T.V}' WHERE name='{path2}';");b=snapshot();reject('foreign object owner rejects canonical digital proof',stmt2,'42501','OBJECT_DENIED');assert snapshot()==b;sql(f"UPDATE storage.objects SET owner_id='{T.U}' WHERE name='{path2}';")
 wait_revoke('profile revoked DURING observed lock denies confirmation',f"UPDATE public.profiles SET ativo=false WHERE user_id='{T.U}';",stmt2,f"UPDATE public.profiles SET ativo=true WHERE user_id='{T.U}';")
 wait_revoke('role revoked DURING observed lock denies confirmation',f"DELETE FROM public.user_roles WHERE user_id='{T.U}';",stmt2,f"INSERT INTO public.user_roles(user_id,role) VALUES('{T.U}','administrador');")
 wait_revoke('tenant changed DURING observed lock denies confirmation',f"UPDATE public.profiles SET organization_id='{T.B}' WHERE user_id='{T.U}';",stmt2,f"UPDATE public.profiles SET organization_id='{T.A}' WHERE user_id='{T.U}';")
 # Existing feature writers use NOWAIT gates: gate wait before acquisition permits committed revocation.
 wait_revoke('SaaS revoked DURING observed gate lock denies confirmation',f"UPDATE public.saas_plan_versions SET features_snapshot='[]' WHERE id='{T.T.VER}';",stmt2,f"UPDATE public.saas_plan_versions SET features_snapshot='[\"estoque_embalagens\",\"envase\",\"ordens_producao\",\"lotes_qualidade\"]' WHERE id='{T.T.VER}';",gate=True)
 b=snapshot();r=json.loads(last(stmt2));assert r['success'] and r['comprovante_id'];ok('canonical digital signature then physical confirmation positive')
 after=snapshot();rep=json.loads(last(stmt2));assert rep['replay'] and snapshot()==after;ok('digital confirmation replay no duplicate ledger event receipt')
 # A new manual chain from unused fixture, then observed cancel wins against waiting confirm.
 e3,path3=create(T.O7,T.PP7,T.L7,'3');obs3=last(f"SELECT updated_at FROM public.entregas WHERE id='{e3}';");stmt3=call(e3,'confirm-0003',obs3)
 cancel=T.actor()+f"SELECT public.rpc_entrega_cancelar_v1('{e3}','LOCAL CANCEL','{obs3}');"
 holder=T.T.session('BEGIN;'+cancel);w=T.T.session("BEGIN;SET application_name='confirm_cancel_loser';"+stmt3);wait_lock('confirm_cancel_loser')
 T.T.finish(holder,'COMMIT;');out,err=T.T.finish(w,'COMMIT;');raw.append({'test':'cancel wins','stdout':out,'stderr':err})
 assert 'DELIVERY_CONFIRM_OBSERVED_CONFLICT' in err and last(f"SELECT status::text FROM public.entregas WHERE id='{e3}';")=='cancelada';ok('canonical cancellation wins observed race and confirmation rolls back')
 cancel2=T.actor()+f"SELECT public.rpc_entrega_cancelar_v1('{e2}','LOCAL CANCEL','{r['updated_at']}');";b=snapshot();reject('confirmed physical delivery cannot ordinary cancel',cancel2,'42501');assert snapshot()==b
 # Full content sentinels before/after, not merely counts.
 for table in T.TABLES+['financial_categories','payment_methods','receivable_payments','company_fiscal_settings']:
  assert json.loads(snapshot())[table]==json.loads(before)[table],table
 ok('all fourteen existing financial fiscal outbox sentinels full content unchanged')
 hist=snapshot();sql((H/'rollback.sql.review').read_text());reject('deny rollback keeps canonical writer closed',stmt2,'42501');assert snapshot()==hist;ok('rollback preserves physical proof stock ledger and receipts history')

if __name__=='__main__':
 status=1;start=time.monotonic()
 try:run();status=0
 except Exception as e:checks.append({'test':'execution','status':'FAIL','error':str(e)});traceback.print_exc()
 finally:
  (H/'test-results.json').write_text(json.dumps({'checks':checks,'raw':raw,'exit_code':status,'elapsed_seconds':time.monotonic()-start},indent=2)+'\n');(H/'sources.json').write_text(json.dumps(sources,indent=2)+'\n')
 sys.exit(status)
