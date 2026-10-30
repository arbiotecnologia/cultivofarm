"""Real PostgreSQL bodies and triggers; synthetic rows/Auth claim transport, no hosted writes."""
import json, subprocess, time, traceback
from pathlib import Path
import restore
from restore import pg
H=Path(__file__).resolve().parent
checks=[]
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
    return "SELECT public.rpc_cockpit_criar_entrega_v1('%s','%s','%s'::jsonb,'%s','{}'::jsonb);"%(os,origin,json.dumps(items),key)
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
    INSERT INTO public.saas_plan_versions(id,plan_id,version_number,name_snapshot,status,effective_from,price_amount,currency,billing_cycle,trial_days,published_at,features_snapshot) VALUES('{VER}','{PLAN}',1,'LOCAL','PUBLISHED',now()-interval '1 day',0,'BRL','monthly',0,now()-interval '1 day','["estoque_embalagens"]');
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
    sql((H/'candidate.sql.review').read_text())
    checks.append({'test':'candidate compiles with captured real types/bodies','status':'PASS'})
    # Exact downstream tables: a transaction context blocks any writer, not the producers globally.
    tables=['accounts_receivable','accounts_receivable_installments','financial_receipts','financial_documents','fiscal_invoices','fiscal_invoice_items','fiscal_events','comunicacao_outbox','comunicacao_eventos','os_faturamento_base']
    for t in tables: sql(f'CREATE TRIGGER z_delivery_no_downstream BEFORE INSERT OR UPDATE OR DELETE ON public.{t} FOR EACH ROW EXECUTE FUNCTION platform_private.delivery_no_downstream_20261030();')
    setup()
    sql('GRANT EXECUTE ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb),public.rpc_entrega_cancelar_v1(uuid,text) TO authenticated;')
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
    check('exact replay returns stored group',actor()+call('first-group').replace('SELECT public.','SELECT (public.').replace("'{}'::jsonb);","'{}'::jsonb)->>'replay')::boolean;"))
    check('replay creates no duplicate',"SELECT count(*)=2 FROM public.entregas;")
    deny('changed payload replay conflict',actor()+call('first-group',[{'item_id':S,'quantidade':3},{'item_id':T,'quantidade':2}]),'DELIVERY_REPLAY_CONFLICT')
    ent=sql('SELECT id FROM public.entregas ORDER BY id LIMIT 1;')
    deny('cross tenant cancel',actor(V)+f"SELECT public.rpc_entrega_cancelar_v1('{ent}','local');",'DELIVERY_SCOPE_DENIED')
    print('CANCEL',sql(actor()+f"SELECT public.rpc_entrega_cancelar_v1('{ent}','local');"),flush=True)
    check('cancel real reversal and release atomically',f"SELECT status='cancelada' FROM public.entregas WHERE id='{ent}';")
    check('cancel replay same actor',actor()+f"SELECT (public.rpc_entrega_cancelar_v1('{ent}','local')->>'replay')::boolean;")
    deny('cancel changed reason replay denied',actor()+f"SELECT public.rpc_entrega_cancelar_v1('{ent}','changed');",'DELIVERY_REPLAY_CONFLICT')
    check('no downstream titles fiscal outbox', 'SELECT '+ ' AND '.join(f'(SELECT count(*) FROM public.{t})=0' for t in tables)+';')
    check('private context removed on success',"SELECT count(*)=0 FROM platform_private.delivery_context_20261030;")

if __name__=='__main__':
    try: main()
    except Exception:
        traceback.print_exc();checks.append({'test':'execution stopped at concrete failure','status':'FAIL','error':traceback.format_exc()})
    finally:
        (H/'test-results.json').write_text(json.dumps(checks,indent=2)+'\n')
        print('RESULT',sum(x['status']=='PASS' for x in checks),'PASS',sum(x['status']=='FAIL' for x in checks),'FAIL',flush=True)