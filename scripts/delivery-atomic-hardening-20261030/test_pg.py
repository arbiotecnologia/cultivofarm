"""Real PostgreSQL bodies and triggers; synthetic rows/Auth claim transport, no hosted writes."""
import json, subprocess, time, traceback, sys
from pathlib import Path
import restore
import build_motor
from restore import pg
H=Path(__file__).resolve().parent
checks=[]
observed={}
cancel_observed={}
def cancel(ent,motivo='local'):
    if ent not in cancel_observed:cancel_observed[ent]=sql(f"SELECT updated_at FROM public.entregas WHERE id='{ent}';")
    return f"SELECT public.rpc_entrega_cancelar_v1('{ent}','{motivo}','{cancel_observed[ent]}'::timestamptz);"
def u(n): return f'10000000-0000-4000-8000-{n:012d}'
A,B,U,V,C,D,O,P,L,M,S,T,PROD,PLAN,VER,MOD,FEAT=[u(n) for n in range(1,18)]
def sql(s): return pg.sql(s)
def check(label,s):
    out=sql(s); assert out.splitlines()[-1]=='t',label+':'+out
    checks.append({'test':label,'status':'PASS'});print('PASS',label,flush=True)
def deny(label,s,code):
    e=pg.sql(s,False);assert code in e,label+':'+e
    checks.append({'test':label,'status':'PASS','expected':code});print('PASS',label,flush=True)
def actor(w=U): return f"SET ROLE authenticated; SET request.jwt.claim.sub='{w}';"
def call(key,items=None,os=O,origin='manual'):
    if items is None: items=[{'item_id':S,'quantidade':2},{'item_id':T,'quantidade':2}]
    if key not in observed:
        observed[key]={'os':sql(f"SELECT updated_at FROM public.ordens_servico WHERE id='{os}';"),'items':{x['item_id']:sql(f"SELECT updated_at FROM public.estoque_produto WHERE id='{x['item_id']}';") for x in items}}
    items=[dict(x,observed_updated_at=observed[key]['items'].get(x['item_id'])) for x in items]
    return "SELECT public.rpc_cockpit_criar_entrega_v1('%s','%s','%s'::jsonb,'%s','{}'::jsonb,'%s'::timestamptz);"%(os,origin,json.dumps(items),key,observed[key]['os'])
def setup():
    # Loading a static manufactured baseline is not a test of upstream manufacture/provisioning.
    # All triggers are re-enabled unchanged before every tested writer.
    sql("SET session_replication_role=replica;"+f"""
    INSERT INTO cf_user_guards_v1.state VALUES(true,1);
    INSERT INTO auth.users(id) VALUES('{U}'),('{V}');
    INSERT INTO public.organizations(id,nome) VALUES('{A}','LOCAL AR BIO'),('{B}','LOCAL FSF TENANT');
    INSERT INTO public.profiles(user_id,organization_id,nome,ativo,senha_provisoria) VALUES('{U}','{A}','LOCAL A',true,false),('{V}','{B}','LOCAL B',true,false);
    INSERT INTO public.user_roles(user_id,role) VALUES('{U}','administrador'),('{V}','administrador');
    INSERT INTO public.clientes(id,organization_id,nome,codigo_cliente) VALUES('{C}','{A}','LOCAL CLIENT A','LOCAL-A'),('{D}','{B}','LOCAL CLIENT B','LOCAL-B');
    INSERT INTO public.produtos(id,nome,tipo) VALUES('{PROD}','LOCAL BIO','inoculante');
    INSERT INTO public.fazendas(id,organization_id,cliente_id,nome) VALUES('{u(18)}','{A}','{C}','LOCAL A'),('{u(19)}','{B}','{D}','LOCAL B');
    INSERT INTO public.talhoes(id,organization_id,fazenda_id,nome) VALUES('{u(20)}','{A}','{u(18)}','LOCAL A'),('{u(21)}','{B}','{u(19)}','LOCAL B');
    INSERT INTO public.ordens_servico(id,organization_id,cliente_id,fazenda_id,talhao_id,produto_id,origem,status,numero_os) VALUES('{O}','{A}','{C}','{u(18)}','{u(20)}','{PROD}','agronomica','pronto_entrega','LOCAL-A'),('{P}','{B}','{D}','{u(19)}','{u(21)}','{PROD}','agronomica','pronto_entrega','LOCAL-B');
    INSERT INTO public.lotes(id,organization_id,produto_id,status,codigo_lote,volume_produzido) VALUES('{L}','{A}','{PROD}','aprovado','LOCAL-A',100000),('{M}','{A}','{PROD}','aprovado','LOCAL-B',100000);
    INSERT INTO public.estoque_produto(id,lote_id,produto_id,quantidade,volume_total,status) VALUES('{S}','{L}','{PROD}',10,10,'disponivel'),('{T}','{M}','{PROD}',10,10,'disponivel');
    INSERT INTO public.saas_modules(id,key,name) VALUES('{MOD}','local','LOCAL');
    INSERT INTO public.saas_features(id,module_id,key,name) VALUES('{FEAT}','{MOD}','estoque_embalagens','LOCAL');
    INSERT INTO public.saas_plans(id,key,name) VALUES('{PLAN}','local','LOCAL');
    INSERT INTO public.saas_plan_versions(id,plan_id,version_number,name_snapshot,status,effective_from,price_amount,currency,billing_cycle,trial_days,published_at,features_snapshot) VALUES('{VER}','{PLAN}',1,'LOCAL','PUBLISHED',now()-interval '1 day',0,'BRL','monthly',1,now()-interval '1 day','["estoque_embalagens"]');
    INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled) VALUES('{VER}','{FEAT}',true);
    INSERT INTO public.organization_subscriptions(organization_id,plan_id,plan_version_id,status) VALUES('{A}','{PLAN}','{VER}','ACTIVE'),('{B}','{PLAN}','{VER}','ACTIVE');
    SET session_replication_role=origin;
    """)
def session(s):
    p=pg.popen(s);p.stdin.write(s+'\n');p.stdin.flush();return p
def finish(p,s=''):
    if s:p.stdin.write(s+'\n');p.stdin.flush()
    p.stdin.close();p.wait(timeout=10);return p.stdout.read(),p.stderr.read()
def wait():
    until=time.monotonic()+2
    while time.monotonic()<until:
        if int(sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid<>pg_backend_pid()"))>0:return
        time.sleep(.02)
    raise AssertionError('no actual PG wait')
def main():
    r=restore.restore();print('RESTORE',json.dumps({k:len(v) for k,v in r.items()}),flush=True)
    assert not any(r.values()),'RESTORE_FAILED: '+json.dumps(r)
    sql((H/'candidate.sql.review').read_text())
    build_motor.build()
    sql((H/'motor-delta.sql.review').read_text())
    checks.append({'test':'candidate compiles with captured real types/bodies','status':'PASS'})
    # Exact downstream tables: a transaction context blocks any writer, not the producers globally.
    tables=['accounts_receivable','accounts_receivable_installments','financial_receipts','financial_documents','fiscal_invoices','fiscal_invoice_items','fiscal_events','comunicacao_outbox','comunicacao_eventos','os_faturamento_base']
    setup()
    sql('GRANT EXECUTE ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz),public.rpc_entrega_cancelar_v1(uuid,text,timestamptz) TO authenticated;')
    check('real h15 and SaaS resolve synthetic tenant',actor()+f"SELECT public.h15_actor_organization()='{A}'::uuid AND public.saas_has_feature('estoque_embalagens');")
    deny('tenant FSF cannot use AR Bio IDs',actor(V)+call('cross-tenant'),'DELIVERY_SCOPE_DENIED')
    deny('anonymous ACL denies',"SET ROLE anon;"+call('anonymous'),'permission denied')
    for role in ['financeiro','parceiro_b2b','parceiro_b2b_tecnico','superadmin','consultor_tecnico']:
        sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{U}','{role}');")
        if role=='financeiro':
            # Mixed internal admin+finance retains existing admin authority; finance alone tested separately.
            sql(f"DELETE FROM public.user_roles WHERE user_id='{U}' AND role='administrador';")
        deny('role '+role+' denied',actor()+call('role-denied'), 'DELIVERY_ACTOR_DENIED')
        sql(f"DELETE FROM public.user_roles WHERE user_id='{U}' AND role='{role}';")
        if role=='financeiro':sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{U}','administrador');")
    sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{U}';")
    deny('inactive denied',actor()+call('inactive'),'DELIVERY_ACTOR_DENIED')
    sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{U}';")
    for qty in [None,'NaN',0,-1,'Infinity']:
        deny('invalid quantity '+str(qty),actor()+call('invalid-quantity',[{'item_id':S,'quantidade':qty}]),'DELIVERY_ITEMS_INVALID')
    deny('OnFarm remains contained',actor()+call('onfarm-deny',origin='onfarm'),'DELIVERY_ORIGIN_CLOSED')
    check('all negative paths no deliveries receipts',"SELECT (SELECT count(*) FROM public.entregas)=0 AND (SELECT count(*) FROM platform_private.delivery_requests_20261030)=0;")
    out=sql(actor()+call('first-group'));print('GROUP',out,flush=True)
    check('two-item group real reserve split delivery expedition',"SELECT (SELECT count(*) FROM public.entregas)=2 AND (SELECT count(*) FROM platform_private.delivery_requests_20261030)=1 AND (SELECT count(*) FROM public.estoque_movimentacoes WHERE acao='expedicao')=2;")
    check('exact replay returns stored group',actor()+call('first-group').replace('SELECT public.','SELECT (public.').replace(');',")->>'replay')::boolean;"))
    check('replay creates no duplicate',"SELECT count(*)=2 FROM public.entregas;")
    deny('changed payload replay conflict',actor()+call('first-group',[{'item_id':S,'quantidade':3},{'item_id':T,'quantidade':2}]),'DELIVERY_REPLAY_CONFLICT')
    ent=sql('SELECT id FROM public.entregas ORDER BY id LIMIT 1;')
    deny('cross tenant cancel',actor(V)+cancel(ent),'DELIVERY_SCOPE_DENIED')
    before=sql("SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text) FROM public.estoque_produto x;")
    sql("CREATE FUNCTION public.local_cancel_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.status='cancelada' THEN RAISE EXCEPTION 'LOCAL_CANCEL_FAULT'; END IF; RETURN NEW; END$$;CREATE TRIGGER zz_cancel_fault BEFORE UPDATE ON public.entregas FOR EACH ROW EXECUTE FUNCTION public.local_cancel_fault();")
    deny('cancel failure after return ledger atomically rolls back',actor()+cancel(ent),'LOCAL_CANCEL_FAULT')
    check('failed cancel rolls back reversal stock delivery and receipt',f"SELECT (SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text) FROM public.estoque_produto x)='{before}' AND (SELECT status::text FROM public.entregas WHERE id='{ent}')='separado' AND NOT EXISTS(SELECT 1 FROM platform_private.delivery_requests_20261030 WHERE action='cancel') AND NOT EXISTS(SELECT 1 FROM public.estoque_movimentacoes WHERE acao='estorno_expedicao');")
    sql('DROP TRIGGER zz_cancel_fault ON public.entregas;')
    print('CANCEL',sql(actor()+cancel(ent)),flush=True)
    check('canonical split merge keeps unique index source history and main balance',f"SELECT (SELECT status::text FROM public.entregas WHERE id='{ent}')='cancelada' AND (SELECT status::text FROM public.estoque_produto WHERE id=(SELECT estoque_produto_id FROM public.entregas WHERE id='{ent}'))='estornado' AND (SELECT sum(quantidade) FROM public.estoque_produto)=20;")
    check('cancel exact replay',actor()+cancel(ent).replace('SELECT public.','SELECT (public.').replace(');',")->>'replay')::boolean;"))
    deny('cancel changed reason replay denied',actor()+cancel(ent,'other'),'DELIVERY_REPLAY_CONFLICT')
    check('no downstream titles fiscal outbox', 'SELECT '+ ' AND '.join(f'(SELECT count(*) FROM public.{t})=0' for t in tables)+';')
    check('private context removed on success',"SELECT count(*)=0 FROM platform_private.delivery_context_20261030;")
    # Real two-connection waits, not timers pretending to establish concurrency.
    for lockkind in ['advisory','row']:
        locksql=(f"SELECT pg_advisory_xact_lock(hashtextextended('delivery_request:'||jsonb_build_array('{A}'::uuid,'{U}'::uuid,'group','first-group')::text,0));" if lockkind=='advisory' else f"SELECT 1 FROM cf_user_guards_v1.state FOR UPDATE; SELECT 1 FROM public.ordens_servico WHERE id='{O}' FOR UPDATE;")
        holder=session('BEGIN;'+locksql);time.sleep(.1)
        worker=session(actor()+call('first-group'));wait()
        if lockkind=='advisory':sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{U}';")
        finish(holder,(f"UPDATE public.profiles SET ativo=false WHERE user_id='{U}';" if lockkind=='row' else '')+'COMMIT;');out,err=finish(worker)
        assert any(code in err for code in ['DELIVERY_ACTOR_DENIED','DELIVERY_SCOPE_CHANGED','ESTQ_IDENTIDADE_INATIVA']),err+out
        checks.append({'test':'revocation after '+lockkind+' wait before replay','status':'PASS'});print('PASS revocation',lockkind,flush=True)
        sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{U}';")
    holder=session('BEGIN;'+actor()+call('first-group'));time.sleep(.15)
    worker=session(actor()+call('first-group'));wait();finish(holder,'COMMIT;');out,err=finish(worker)
    assert '"replay": true' in out and not err,err+out
    checks.append({'test':'two actual concurrent exact replays no extra group','status':'PASS'})
    check('concurrent replay remains two deliveries',"SELECT count(*)=2 FROM public.entregas;")
    # Failure after item 1 already ran: triggers, stock ledger, batch receipt and group receipt roll back.
    baseline=sql("SELECT jsonb_build_array((SELECT count(*) FROM public.entregas),(SELECT count(*) FROM public.estoque_movimentacoes),(SELECT count(*) FROM public.estoque_produto),(SELECT count(*) FROM platform_private.stock_batch_requests),(SELECT count(*) FROM platform_private.delivery_requests_20261030))::text;")
    sql("CREATE FUNCTION public.local_fail_second_delivery() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF (SELECT count(*) FROM public.entregas)>2 THEN RAISE EXCEPTION 'LOCAL_ITEM_TWO_FAILURE'; END IF; RETURN NEW; END$$; CREATE TRIGGER zz_local_fail_second BEFORE INSERT ON public.entregas FOR EACH ROW EXECUTE FUNCTION public.local_fail_second_delivery();")
    deny('item2 trigger failure aborts first delivery reserve expedition',actor()+call('second-group-fault'),'LOCAL_ITEM_TWO_FAILURE')
    after=sql("SELECT jsonb_build_array((SELECT count(*) FROM public.entregas),(SELECT count(*) FROM public.estoque_movimentacoes),(SELECT count(*) FROM public.estoque_produto),(SELECT count(*) FROM platform_private.stock_batch_requests),(SELECT count(*) FROM platform_private.delivery_requests_20261030))::text;")
    assert baseline==after,(baseline,after)
    checks.append({'test':'item2 rollback has no stock ledger receipt residues','status':'PASS'})
    sql('DROP TRIGGER zz_local_fail_second ON public.entregas;')
    # Attempt actual downstream insertion from delivery trigger, not a mocked producer.
    sql("CREATE FUNCTION public.local_attempt_billing() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN INSERT INTO public.accounts_receivable(id) VALUES(gen_random_uuid()); RETURN NEW; END$$; CREATE TRIGGER zz_local_billing AFTER INSERT ON public.entregas FOR EACH ROW EXECUTE FUNCTION public.local_attempt_billing();")
    deny('delivery trigger title attempt fails transactionally',actor()+call('billing-fault-group'),'DELIVERY_DOWNSTREAM_FORBIDDEN')
    check('attempted title leaves zero title and no new group',"SELECT (SELECT count(*) FROM public.accounts_receivable)=0 AND (SELECT count(*) FROM public.entregas)=2 AND NOT EXISTS(SELECT 1 FROM platform_private.delivery_requests_20261030 WHERE request_key='billing-fault-group');")
    sql('DROP TRIGGER zz_local_billing ON public.entregas;')
    # Trigger-unit tests run exact LIVE bodies on LIKE tables; do not claim full B2B integration.
    sql("CREATE TABLE public.local_order_guard_probe (LIKE public.partner_orders INCLUDING DEFAULTS); CREATE TRIGGER accounting_guard BEFORE UPDATE ON public.local_order_guard_probe FOR EACH ROW EXECUTE FUNCTION platform_private.c2_accounting_pending_guard();")
    sql(f"INSERT INTO public.local_order_guard_probe(id,partner_id,status,c2_external_origin_snapshot) VALUES('{u(30)}','{u(31)}','em_analise_comercial','{{\"contract\":\"C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1\"}}');")
    deny('exact LIVE accounting guard rejects entregue on pending snapshot',f"UPDATE public.local_order_guard_probe SET status='entregue' WHERE id='{u(30)}';",'C2_ACCOUNTING_PENDING')
    sql("CREATE TRIGGER a00_delivery_transition BEFORE UPDATE OF status ON public.local_order_guard_probe FOR EACH ROW EXECUTE FUNCTION platform_private.delivery_order_transition_guard_20261030();")
    deny('delivery transition barrier precedes any auto billing trigger',f"BEGIN;INSERT INTO platform_private.delivery_context_20261030(txid,actor,organization_id,action) VALUES(txid_current(),'{U}','{A}','group'); UPDATE public.local_order_guard_probe SET status='entregue'; COMMIT;",'DELIVERY_B2B_TRANSITION_CLOSED')
    check('final no context no billing fiscal messages', 'SELECT (SELECT count(*) FROM platform_private.delivery_context_20261030)=0 AND '+ ' AND '.join(f'(SELECT count(*) FROM public.{t})=0' for t in tables)+';')
    # Own tenant B positive, same caller key as A: separate immutable namespaces.
    sql('SET session_replication_role=replica;'+f"INSERT INTO public.lotes(id,organization_id,produto_id,status,codigo_lote,volume_produzido) VALUES('{u(40)}','{B}','{PROD}','aprovado','LOCAL-B-OWN',100); INSERT INTO public.estoque_produto(id,lote_id,produto_id,quantidade,volume_total,status) VALUES('{u(41)}','{u(40)}','{PROD}',10,10,'disponivel'); SET session_replication_role=origin;")
    # Retain A's original observed request; B's first request has different objects.
    observed.pop('first-group')
    print('TENANT B',sql(actor(V)+call('first-group',[{'item_id':u(41),'quantidade':2}],os=P)),flush=True)
    check('same request key tenants separated no collision',"SELECT count(*)=2 FROM platform_private.delivery_requests_20261030 WHERE action='group' AND request_key='first-group';")
    deny('B cannot replay A cancel result',actor(V)+cancel(ent),'DELIVERY_SCOPE_DENIED')
    deny('GUC spoof cannot cancel directly',actor()+f"SET app.entrega_cancelamento_id='{ent}'; UPDATE public.entregas SET status='cancelada' WHERE id<>(SELECT id FROM public.entregas WHERE id='{ent}') AND organization_id='{A}';",'ENTREGA_CANCELAMENTO_EXIGE_RPC')
    deny('direct stock mutation remains ACL closed',actor()+f"UPDATE public.estoque_produto SET quantidade=500 WHERE id='{S}';",'permission denied')
    deny('private context cannot be minted by caller',actor()+f"INSERT INTO platform_private.delivery_context_20261030(txid,actor,organization_id,action) VALUES(txid_current(),'{U}','{A}','cancel');",'permission denied')
    # Same global gate used by the independent batch motor; real concurrent oversell.
    sql('SET session_replication_role=replica;'+f"INSERT INTO public.lotes(id,organization_id,produto_id,status,codigo_lote,volume_produzido) VALUES('{u(50)}','{A}','{PROD}','aprovado','LOCAL-OVERSELL',100); INSERT INTO public.estoque_produto(id,lote_id,produto_id,quantidade,volume_total,status) VALUES('{u(51)}','{u(50)}','{PROD}',10,10,'disponivel'); SET session_replication_role=origin;")
    one=actor()+call('oversell-one',[{'item_id':u(51),'quantidade':7}]);two=actor()+call('oversell-two',[{'item_id':u(51),'quantidade':7}])
    holder=session('BEGIN;'+one);time.sleep(.15);worker=session(two);wait();finish(holder,'COMMIT;');out,err=finish(worker)
    assert 'DELIVERY_OBSERVED_CONFLICT' in err,err+out
    checks.append({'test':'actual concurrent oversell second stale CAS denied','status':'PASS'})
    check('oversell balance conserved no negatives',f"SELECT sum(quantidade)=10 AND min(quantidade)>=0 AND count(*) FILTER(WHERE status='expedido')=1 FROM public.estoque_produto WHERE lote_id='{u(50)}';")
    # Negative child ACK through result corruption at its persisted receipt, no motor stub.
    sql("CREATE FUNCTION public.local_bad_ack() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.result=jsonb_set(NEW.result,'{ok}','false'); RETURN NEW; END$$;CREATE TRIGGER zz_bad_ack BEFORE INSERT ON platform_private.stock_batch_requests FOR EACH ROW EXECUTE FUNCTION public.local_bad_ack();")
    snap=sql("SELECT jsonb_build_array((SELECT count(*) FROM public.entregas),(SELECT count(*) FROM public.estoque_movimentacoes),(SELECT count(*) FROM public.estoque_produto),(SELECT count(*) FROM platform_private.stock_batch_requests))::text;")
    # Reserve RPC returns local result, not stored receipt: receipt corruption may not alter ACK.
    attempt=pg.sql(actor()+call('ack-negative',[{'item_id':S,'quantidade':1}]),False)
    if 'DELIVERY_RESERVE_ACK_INVALID' in attempt:
        checks.append({'test':'negative child ACK rolls back group','status':'PASS'})
    else:
        checks.append({'test':'negative ACK fault-injection does not affect returned child envelope','status':'BLOCKED','error':attempt})
    sql('DROP TRIGGER zz_bad_ack ON platform_private.stock_batch_requests;')
    check('negative receipt ACK leaves every effect unchanged',"SELECT jsonb_build_array((SELECT count(*) FROM public.entregas),(SELECT count(*) FROM public.estoque_movimentacoes),(SELECT count(*) FROM public.estoque_produto),(SELECT count(*) FROM platform_private.stock_batch_requests))::text='"+snap+"';")
    check('final financial fiscal outbox empty after concurrency', 'SELECT '+ ' AND '.join(f'(SELECT count(*) FROM public.{t})=0' for t in tables)+';')
    # Characterize the remaining inversion in LIVE independent batch; never silently call it safe.
    holder=session('BEGIN;'+f"SELECT 1 FROM public.estoque_produto WHERE id='{S}' FOR UPDATE;");time.sleep(.1)
    worker=session(actor()+call('batch-order-characterization',[{'item_id':S,'quantidade':1}]));wait()
    batch="SELECT public.rpc_estoque_reservar_v1('%s','manual','%s'::jsonb,'independent-batch-proof','%s'::jsonb);"%(O,json.dumps([{'item_id':S,'quantidade':1}]),json.dumps({'cliente_id':C}))
    out,err=finish(holder,actor()+batch+'COMMIT;');out2,err2=finish(worker)
    assert '"ok": true' in out and 'DELIVERY_OBSERVED_CONFLICT' in err2 and 'deadlock detected' not in err+err2,err+err2+out+out2
    checks.append({'test':'independent real batch versus group stock wait succeeds batch and rejects stale group without deadlock','status':'PASS','observed':err2})

if __name__=='__main__':
    try: main()
    except Exception:
        traceback.print_exc();checks.append({'test':'execution stopped at concrete failure','status':'FAIL','error':traceback.format_exc()})
    finally:
        (H/'test-results.json').write_text(json.dumps(checks,indent=2)+'\n')
        print('RESULT',sum(x['status']=='PASS' for x in checks),'PASS',sum(x['status']=='FAIL' for x in checks),'FAIL',sum(x['status']=='BLOCKED' for x in checks),'BLOCKED',flush=True)
    sys.exit(1 if any(x['status']!='PASS' for x in checks) else 0)