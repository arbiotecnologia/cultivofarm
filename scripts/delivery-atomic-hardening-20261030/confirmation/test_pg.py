"""Captured disposable PostgreSQL only; real triggers, synthetic local actors."""
from pathlib import Path
import sys,json,subprocess,re,time,traceback,hashlib,importlib.util
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
def snapshot():return last("SELECT jsonb_build_object("+','.join("'%s',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text COLLATE \"C\"),'[]') FROM public.%s x)"%(t,t) for t in ['entregas','entrega_comprovantes','estoque_produto','estoque_movimentacoes','ordens_servico','laboratorio_esteira_eventos']+T.TABLES)+",'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text COLLATE \"C\"),'[]') FROM platform_private.delivery_requests_20261030 x))::text;")
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
def run():
 assert pg.root.is_relative_to(Path('/tmp')) and pg.psql()[3]==str(pg.root)
 # Ref comes from immutable canonical local capture; no credentials or hosted transport.
 assert 'swzpzcwiasxmjutrmvkm' in (S/'os-delivery-reopening-20261027/live/public.fn_entrega_confirmar_engine_v1.sql.review').read_text()
 r=restore.restore();assert not any(r.values()),r;ok('full captured restore without unresolved objects; disposable socket verified')
 for p in [S/'delivery-proof-authz-20261030/release-combined.sql.review',S/'stock-envase-recovery-20261027/install-v2.sql.review',S/'proof-select-tenant-20261030/install.sql.review',S/'delivery-evidence-tenant-20261030/install.sql.review',S/'produto-etiquetas-tenant-20261030/install.sql.review',S/'delivery-checklist-occurrence-authz-20261030/install.sql.review',S/'delivery-waiver-closure-20261030/install.sql.review',S/'delivery-group-capability-20261030/install.sql.review',ISO/'install.sql.review',ISO/'legacy-closure-install.sql.review',ISO/'release.sql.review']:load(p)
 ok('reported applied composition including isolated install closure release restored without regeneration')
 T.setup_v2();sys.path.insert(0,str(ISO));import sentinels
 sentinels.seed(sys.modules[__name__]);ok('existing full-row downstream sentinels seeded in disposable fixture only')
 sql("INSERT INTO storage.buckets(id,name,public) VALUES('entrega-documentos','entrega-documentos',false) ON CONFLICT DO NOTHING;")
 pre=state();delta=G.candidate();measured=sql('BEGIN;'+delta+G.STATE+'::text;ROLLBACK;');post=json.loads([x for x in measured.splitlines() if x.startswith('{')][-1]);assert state()==pre
 released=json.loads([x for x in sql('BEGIN;'+delta+f'GRANT EXECUTE ON FUNCTION {G.RPC} TO authenticated;'+G.STATE+'::text;ROLLBACK;').splitlines() if x.startswith('{')][-1]);G.write(pre,post,released)
 load(H/'install.sql.review');assert state()==post;ok('exact install PRE POST commits writer closed')
 reject('closed writer refuses authenticated',call(T.u(999),'closed-0001',obs='2026-10-31'),'42501')
 load(H/'release.sql.review');assert state()==released;ok('separate minimum release exact PRE POST')
 e,path=create(T.O2,T.PP2,T.L2,'1');stmt=call(e,'confirm-0001');before=snapshot()
 reject('foreign FSF denies without mutations',call(e,'foreign-0001',actor=T.V),'42501');assert snapshot()==before
 result=json.loads(last(stmt));assert result['success'] is True and result['status']=='entregue',result
 ok('canonical attach then physical confirmation advances transactionally')
 before=snapshot();rep=json.loads(last(stmt));assert rep['replay'] is True and snapshot()==before;ok('exact replay preserves all snapshots')
if __name__=='__main__':
 status=1;start=time.monotonic()
 try:run();status=0
 except Exception as e:checks.append({'test':'execution','status':'FAIL','error':str(e)});traceback.print_exc()
 finally:
  (H/'test-results.json').write_text(json.dumps({'checks':checks,'raw':raw,'exit_code':status,'elapsed_seconds':time.monotonic()-start},indent=2)+'\n');(H/'sources.json').write_text(json.dumps(sources,indent=2)+'\n')
 sys.exit(status)
