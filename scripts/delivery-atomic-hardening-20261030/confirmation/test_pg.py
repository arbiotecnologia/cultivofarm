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
  pg.start()
  j=restore.metadata();roles={r['name'] for r in j['roles']}|{'supabase_admin'}
  for x in j['relations']+j['functions']+j['schemas']:
   roles.add(x['owner'])
   for ent in (x.get('acl') or '').strip('{}').split(','):
    if '=' in ent:roles.update([ent.split('=')[0],ent.split('/')[-1]])
  for p in j['policies']:roles.update(p['roles'])
  for r in sorted(roles-{'','postgres','pg_database_owner','public'}):sql('CREATE ROLE "'+r.replace('"','""')+'";')
  for r in j['roles']:
   if r['name']!='postgres':sql('ALTER ROLE "'+r['name']+'" '+('BYPASSRLS' if r['bypassrls'] else 'NOBYPASSRLS')+';')
  sql(cached.read_text());ok('exact local captured composition checkpoint restored; disposable socket verified')
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
 reject('review release stays NO-GO without remaining matrix', (H/'release.sql.review').read_text(), 'P0001', 'CONFIRM_RELEASE_NO_GO_REMAINING_MATRIX');assert state()==post
 # Disposable harness activation only; never alter the closed review release artifact.
 sql(f'GRANT EXECUTE ON FUNCTION {G.RPC} TO authenticated;');assert state()==released;ok('disposable harness-only activation exact state; review release remains closed')
 e,path=create(T.O2,T.PP2,T.L2,'1');stmt=call(e,'confirm-0001');before=snapshot()
 cap=json.loads(last(T.actor()+f"SELECT public.rpc_entrega_confirmacao_capability_v1('{e}');"))
 assert cap['os_id']==T.O2 and cap['comprovante_id']==last(f"SELECT comprovante_id FROM public.entregas WHERE id='{e}';") and cap['updated_at'];ok('capability binds observed OS canonical proof and CAS revision')
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
 reject('tampered canonical hash denied','BEGIN;'+f"UPDATE public.entrega_comprovantes SET validation_hash=repeat('0',64) WHERE entrega_id='{e2}';"+stmt2,'42501','PROOF_DENIED');assert snapshot()==b
 reject('missing storage object denied','BEGIN;'+f"DELETE FROM storage.objects WHERE name='{path2}';"+stmt2,'42501','OBJECT_DENIED');assert snapshot()==b
 reject('financial payload rejected',stmt2.replace('{"nome": "LOCAL"}','{"nome":"LOCAL","faturamento":"bill_now"}'),'22023');assert snapshot()==b
 # Object owner changed locally through actual DML: orphan or foreign owner is not proof.
 sql(f"UPDATE storage.objects SET owner_id='{T.V}' WHERE name='{path2}';");b=snapshot();reject('foreign object owner rejects canonical digital proof',stmt2,'42501','OBJECT_DENIED');assert snapshot()==b;sql(f"UPDATE storage.objects SET owner_id='{T.U}' WHERE name='{path2}';")
 wait_revoke('profile revoked DURING observed lock denies confirmation',f"UPDATE public.profiles SET ativo=false WHERE user_id='{T.U}';",stmt2,f"UPDATE public.profiles SET ativo=true WHERE user_id='{T.U}';")
 wait_revoke('role revoked DURING observed lock denies confirmation',f"DELETE FROM public.user_roles WHERE user_id='{T.U}';",stmt2,f"INSERT INTO public.user_roles(user_id,role) VALUES('{T.U}','administrador');")
 wait_revoke('tenant changed DURING observed lock denies confirmation',f"UPDATE public.profiles SET organization_id='{T.B}' WHERE user_id='{T.U}';",stmt2,f"UPDATE public.profiles SET organization_id='{T.A}' WHERE user_id='{T.U}';")
 # Existing feature writers use NOWAIT gates: gate wait before acquisition permits committed revocation.
 wait_revoke('SaaS revoked DURING observed gate lock denies confirmation',f"UPDATE public.organization_subscriptions SET status='SUSPENDED',suspended_at=now() WHERE organization_id='{T.A}';",stmt2,f"UPDATE public.organization_subscriptions SET status='ACTIVE',suspended_at=NULL WHERE organization_id='{T.A}';",gate=True)
 b=snapshot();r=json.loads(last(stmt2));assert r['success'] and r['comprovante_id'];ok('canonical digital signature then physical confirmation positive')
 after=snapshot();rep=json.loads(last(stmt2));assert rep['replay'] and snapshot()==after;ok('digital confirmation replay no duplicate ledger event receipt')
 ledger_lineage_matrix(e2,stmt2)
 coverage_matrix()
 proof_race_matrix()
 multi_item_matrix()
 # A new manual chain from unused fixture, then observed cancel wins against waiting confirm.
 e3,path3=create(T.O7,T.PP7,T.L7,'3');obs3=last(f"SELECT updated_at FROM public.entregas WHERE id='{e3}';");stmt3=call(e3,'confirm-0003',obs3)
 cancel=T.actor()+f"SELECT public.rpc_entrega_cancelar_v1('{e3}','LOCAL CANCEL','{obs3}');"
 holder=T.T.session('BEGIN;'+cancel);w=T.T.session("\\set VERBOSITY verbose\nBEGIN;SET application_name='confirm_cancel_loser';"+stmt3);wait_lock('confirm_cancel_loser')
 T.T.finish(holder,'COMMIT;');out,err=T.T.finish(w,'COMMIT;');raw.append({'test':'cancel wins','stdout':out,'stderr':err})
 assert re.search(r'ERROR:\s+PT409:',err) and 'DELIVERY_CONFIRM_OBSERVED_CONFLICT' in err and last(f"SELECT status::text FROM public.entregas WHERE id='{e3}';")=='cancelada';ok('canonical cancellation wins observed race and confirmation rolls back')
 cancel2=T.actor()+f"SELECT public.rpc_entrega_cancelar_v1('{e2}','LOCAL CANCEL','{r['updated_at']}');";b=snapshot();reject('confirmed physical delivery cannot ordinary cancel',cancel2,'42501');assert snapshot()==b
 # Full content sentinels before/after, not merely counts.
 for table in T.TABLES+['financial_categories','payment_methods','receivable_payments','company_fiscal_settings']:
  assert json.loads(snapshot())[table]==json.loads(before)[table],table
 ok('all fourteen existing financial fiscal outbox sentinels full content unchanged')
 hist=snapshot();sql((H/'rollback.sql.review').read_text());reject('deny rollback keeps canonical writer closed',stmt2,'42501');assert snapshot()==hist;ok('rollback preserves physical proof stock ledger and receipts history')

def prove(e,key,sign=False,generate=True):
 if generate:assert json.loads(last(T.actor()+f"SELECT public.rpc_entrega_formulario_gerar_v1('{e}','generate-{key}');"))['success']
 path=f'entregas/{e}/'+('assinaturas/' if sign else 'comprovantes/')+str(__import__('uuid').uuid4())+('.png' if sign else '.pdf')
 sql(f"INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('entrega-documentos','{path}','{T.U}','{T.U}');")
 payload={'recebedor_nome':'LOCAL'}
 if sign:payload.update(assinatura_digital_png_path=path,assinatura_hash='b'*64);rpc='rpc_entrega_assinatura_coletar_v1'
 else:payload.update(arquivo_path=path,arquivo_nome='local.pdf',arquivo_mime='application/pdf');rpc='rpc_entrega_comprovante_anexar_v1'
 stmt=T.actor()+f"SELECT public.{rpc}('{e}','proof-{key}','{json.dumps(payload)}');"
 assert json.loads(last(stmt))['success'];b=snapshot();assert json.loads(last(stmt))['replayed'] and snapshot()==b;ok('proof '+key+' exact replay')
 assert last(f"SELECT e.validation_hash=c.validation_hash AND e.validation_token=c.validation_token FROM public.entregas e JOIN public.entrega_comprovantes c ON c.id=e.comprovante_id WHERE e.id='{e}';")=='t'
 return path
def multi_item_matrix():
 # Existing demand is 5000 ml; partial envase then remainder, two independent stock rows.
 a=json.loads(last(T.actor()+T.envase(T.O6,T.PP6,T.L6,[{'tipo_embalagem':'frasco_1L','quantidade':2}],'matrix-partial-01')));assert a['estado']=='partial';ok('partial envase demand remains open')
 a=json.loads(last(T.actor()+T.envase(T.O6,T.PP6,T.L6,[{'tipo_embalagem':'frasco_1L','quantidade':3}],'matrix-complete-01')));assert a['estado']=='completed'
 stocks=last(f"SELECT jsonb_agg(jsonb_build_object('item_id',id,'quantidade',quantidade) ORDER BY id) FROM public.estoque_produto WHERE lote_id='{T.L6}' AND status='reservado';")
 res=json.loads(last(T.actor()+T.group(T.O6,json.loads(stocks),'matrix-group-01')));assert len(res['itens'])==2
 e1,e2=[i['entrega_id'] for i in res['itens']];prove(e1,'multi-new-digital',True,False);prove(e2,'multi-attach')
 stmt1=call(e1,'multi-confirm-01');stmt2=call(e2,'multi-confirm-02');b=snapshot();r1=json.loads(last(stmt1));assert r1['finalizada'] is False and r1['os_status']=='entregue';ok('first item cannot finalize with pending independent stock delivery')
 r2=json.loads(last(stmt2));assert r2['finalizada'] is True;ok('second item after OS entregue completes 5000ml demand independently')
 rep=json.loads(last(stmt1));assert rep['replay'];ok('first partial ACK replay remains exact after second item finalization')
 for t in T.TABLES:assert json.loads(b)[t]==json.loads(snapshot())[t],t
 ok('multi-item physical confirmation no finance fiscal outbox changes')

def ledger_lineage_matrix(e,stmt):
 # Deliberate corrupt-fixture injection as local postgres, never an actor or deployable seam.
 mid=last(f"SELECT id FROM public.estoque_movimentacoes WHERE referencia_id='{e}' AND acao='expedicao';")
 for field,value in [('os_id',T.O7),('lote_id',T.L7),('os_tipo','onfarm'),('referencia_tipo','os')]:
  original=last(f"SELECT {field} FROM public.estoque_movimentacoes WHERE id='{mid}';")
  sql(f"SET session_replication_role=replica;UPDATE public.estoque_movimentacoes SET {field}='{value}' WHERE id='{mid}';SET session_replication_role=origin;")
  before=snapshot();reject('actual corrupted ledger '+field+' rejects replay',stmt,'42501','DELIVERY_CONFIRM_REPLAY_STATE_DENIED');assert snapshot()==before
  sql(f"SET session_replication_role=replica;UPDATE public.estoque_movimentacoes SET {field}='{original}' WHERE id='{mid}';SET session_replication_role=origin;")
 before=snapshot();assert json.loads(last(stmt))['replay'] and snapshot()==before;ok('restored ledger lineage exact replay no writes')

def coverage_matrix():
 # Seed otherwise-contained upstream manufacture locally; tested group/proof/confirm run origin triggers.
 os,pp,l=T.u(701),T.u(702),T.u(703);p2,pp2,l2,l3=T.u(704),T.u(705),T.u(706),T.u(707)
 sql("SET session_replication_role=replica;"+T.manufactured(os,pp,l,vol=4000,status='pronto_entrega')+f"""
 INSERT INTO public.produtos SELECT (jsonb_populate_record(NULL::public.produtos,to_jsonb(p)||jsonb_build_object('id','{p2}','nome','LOCAL MATRIX PRODUCT 2'))).* FROM public.produtos p WHERE id='{T.PROD}';
 INSERT INTO public.programacao_producao SELECT (jsonb_populate_record(NULL::public.programacao_producao,to_jsonb(p)||jsonb_build_object('id','{pp2}','produto_id','{p2}','volume_necessario',2000))).* FROM public.programacao_producao p WHERE id='{pp}';
 INSERT INTO public.lotes SELECT (jsonb_populate_record(NULL::public.lotes,to_jsonb(p)||jsonb_build_object('id','{l2}','produto_id','{p2}','programacao_id','{pp2}','codigo_lote','LOCAL-MATRIX-2'))).* FROM public.lotes p WHERE id='{l}';
 INSERT INTO public.lotes SELECT (jsonb_populate_record(NULL::public.lotes,to_jsonb(p)||jsonb_build_object('id','{l3}','codigo_lote','LOCAL-MATRIX-3'))).* FROM public.lotes p WHERE id='{l}';
 SET session_replication_role=origin;""")
 stocks=[]
 for n,lot,prod in [(711,l,T.PROD),(712,l3,T.PROD),(713,l2,p2)]:
  sid=T.u(n);stocks.append(sid)
  sql(f"SET session_replication_role=replica;INSERT INTO public.estoque_produto SELECT (jsonb_populate_record(NULL::public.estoque_produto,to_jsonb(s)||jsonb_build_object('id','{sid}','lote_id','{lot}','produto_id','{prod}','reservado_para_os_id','{os}','quantidade',2,'quantidade_reservada',2,'volume_total',2))).* FROM public.estoque_produto s WHERE id='{T.RX}';SET session_replication_role=origin;")
 group=json.loads(last(T.actor()+T.group(os,[{'item_id':s,'quantidade':2} for s in stocks],'coverage-group-001')))
 deliveries=[i['entrega_id'] for i in group['itens']]
 for n,e in enumerate(deliveries):prove(e,'coverage-'+str(n))
 before=json.loads(snapshot())
 # Confirm both same-product lots; the other product still has uncovered demand.
 same=[e for e in deliveries if last(f"SELECT produto_id FROM public.entregas WHERE id='{e}';")==T.PROD]
 other=next(e for e in deliveries if e not in same)
 for n,e in enumerate(same):
  r=json.loads(last(call(e,'coverage-confirm-'+str(n))));assert r['finalizada'] is False;ok('multi-lot same-product coverage leaves other product demand open '+str(n))
 observed=last(f"SELECT updated_at FROM public.entregas WHERE id='{other}';")
 assert json.loads(last(T.actor()+f"SELECT public.rpc_entrega_cancelar_v1('{other}','LOCAL COVERAGE CANCEL','{observed}');"))['success']
 b=snapshot();reject('cancelled delivery cannot cover remaining product',call(other,'coverage-cancel-deny'),'PT409','DELIVERY_CONFIRM_OBSERVED_CONFLICT');assert snapshot()==b
 assert last(f"SELECT status FROM public.ordens_servico WHERE id='{os}';")=='entregue';ok('canonical cancellation and reversed reservation leave 2000ml product demand uncovered')
 # Re-deliver the canonically returned stock, with original programming/product roots.
 sid=last(f"SELECT estoque_produto_id FROM public.entregas WHERE id='{other}';")
 replacement=json.loads(last(T.actor()+T.group(os,[{'item_id':sid,'quantidade':2}],'coverage-replacement-001')))['itens'][0]['entrega_id']
 prove(replacement,'coverage-replacement');r=json.loads(last(call(replacement,'coverage-replacement-confirm')));assert r['finalizada'] is True;ok('replacement covers second product once; two programs three lots 6000ml finalize')
 for table in T.TABLES:assert before[table]==json.loads(snapshot())[table],table
 ok('multi-product cancellation replacement preserves financial fiscal outbox sentinels')

def proof_race_matrix():
 for n,action in enumerate(['sign','attach']):
  os,pp,l=T.u(730+n*3),T.u(731+n*3),T.u(732+n*3)
  sql('SET session_replication_role=replica;'+T.manufactured(os,pp,l)+'SET session_replication_role=origin;')
  e,path=create(os,pp,l,str(80+n));obs=last(f"SELECT updated_at FROM public.entregas WHERE id='{e}';")
  newpath=f"entregas/{e}/"+('assinaturas/' if action=='sign' else 'comprovantes/')+T.u(780+n)+('.png' if action=='sign' else '.pdf')
  sql(f"INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('entrega-documentos','{newpath}','{T.U}','{T.U}');")
  payload={'recebedor_nome':'LOCAL'}
  if action=='sign':payload.update(assinatura_digital_png_path=newpath,assinatura_hash='c'*64);rpc='rpc_entrega_assinatura_coletar_v1'
  else:payload.update(arquivo_path=newpath,arquivo_nome='local.pdf',arquivo_mime='application/pdf');rpc='rpc_entrega_comprovante_anexar_v1'
  proof=T.actor()+f"SELECT public.{rpc}('{e}','race-proof-{action}','{json.dumps(payload)}');"
  holder=T.T.session('BEGIN;'+proof)
  waiter=T.T.session("\\set VERBOSITY verbose\nBEGIN;SET application_name='proof_confirm_race';"+call(e,'race-confirm-'+action,obs))
  wait_lock('proof_confirm_race');out,err=T.T.finish(holder,'COMMIT;');assert not err,(out,err)
  b=snapshot();out,err=T.T.finish(waiter,'COMMIT;');raw.append({'test':action+' wins against confirm','stdout':out,'stderr':err})
  assert re.search(r'ERROR:\s+PT409:',err) and 'DELIVERY_CONFIRM_OBSERVED_CONFLICT' in err,(out,err);assert snapshot()==b;ok(action+' wins observed lock; stale confirmation PT409 with exact snapshots')
  confirmation=call(e,'race-confirm-fresh-'+action);holder=T.T.session('BEGIN;'+confirmation)
  waiter=T.T.session("\\set VERBOSITY verbose\nBEGIN;SET application_name='confirm_proof_race';"+proof)
  wait_lock('confirm_proof_race');out,err=T.T.finish(holder,'COMMIT;');assert not err,(out,err)
  b=snapshot();out,err=T.T.finish(waiter,'COMMIT;');raw.append({'test':'confirm wins against '+action,'stdout':out,'stderr':err})
  assert re.search(r'ERROR:\s+PT409:',err) and 'DELIVERY_PROOF_CLOSED' in err,(out,err);assert snapshot()==b;ok('confirmation wins observed lock; '+action+' denied PT409 with exact snapshots')

if __name__=='__main__':
 status=1;start=time.monotonic()
 try:run();status=0
 except Exception as e:checks.append({'test':'execution','status':'FAIL','error':str(e)});traceback.print_exc()
 finally:
  (H/'test-results.json').write_text(json.dumps({'checks':checks,'raw':raw,'exit_code':status,'elapsed_seconds':time.monotonic()-start},indent=2)+'\n');(H/'sources.json').write_text(json.dumps(sources,indent=2)+'\n')
 sys.exit(status)
