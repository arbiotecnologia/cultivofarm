"""Disposable PG component: current production bodies, real order columns, explicit Auth seams. NOT JWT/E2E."""
import importlib.util
import json
import pathlib
import sys
import subprocess
import threading
import time

sys.dont_write_bytecode = True
H = pathlib.Path(__file__).resolve().parent
ROOT = H.parents[1]
sys.path.insert(0, str(ROOT / 'scripts/contracts-c2-20261022/integral'))
import pg

U = '11111111-1111-4111-8111-111111111111'
P = '22222222-2222-4222-8222-222222222222'
O = '33333333-3333-4333-8333-333333333333'
rows = []


def check(name, expected, actual):
    assert expected == actual, (name, expected, actual)
    rows.append({'test':name,'status':'PASS','expected':expected,'actual':actual})
    print('PASS', name, flush=True)


def main():
    assert pg.root.is_relative_to(pathlib.Path('/tmp'))
    pg.start()
    live = json.loads((H / 'capture/production-metadata.json').read_text())
    dep = json.loads((H / 'capture/production-dependencies.json').read_text())
    F = {f['signature']: f for f in live['functions'] + dep['functions']}
    pg.sql("""CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA platform_private;
    CREATE TYPE app_role AS ENUM ('administrador','gestor','financeiro');
    CREATE TYPE partner_order_status AS ENUM ('rascunho','pendente','em_analise_comercial','aguardando_aprovacao_credito','aprovado','reprovado','cancelado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','solicitado','aguardando_cotacao','aguardando_ajuste_comercial','aguardando_itens','reprovado_sem_itens');
    CREATE TABLE public.synthetic_scope(uid uuid,allowed boolean,visible boolean);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT uid FROM public.synthetic_scope$$;
    CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$SELECT $1=auth.uid() AND allowed FROM public.synthetic_scope$$;
    CREATE FUNCTION public.b2b_phase1_order_visible(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT visible FROM public.synthetic_scope$$;
    CREATE TABLE public.partner_financial_settings(partner_id uuid,active boolean,credit_limit numeric(14,2));
    CREATE TABLE public.partner_order_audit_logs(usuario_id uuid,partner_id uuid,order_id uuid,acao text,dados_anteriores jsonb,dados_novos jsonb);
    """)
    columns = []
    enums = set()
    for c in dep['columns']:
        if c['table'] != 'partner_orders': continue
        typ = c['type']
        if typ not in ('uuid','text','numeric','bool','date','timestamptz','int4','jsonb','partner_order_status'):
            enums.add(typ)
            # Other custom order enums are irrelevant to the approval branch; preserve names and captured defaults.
    for enum in enums:
        vals = set()
        for c in dep['columns']:
            if c['table']=='partner_orders' and c['type']==enum and c['default'] and c['default'].startswith("'"):
                vals.add(c['default'].split("'")[1])
        if not vals: vals.add('SYNTHETIC_UNUSED')
        pg.sql('CREATE TYPE '+enum+' AS ENUM ('+','.join("'"+v+"'" for v in vals)+');')
    for c in dep['columns']:
        if c['table'] != 'partner_orders': continue
        typ = c['type']
        if typ=='numeric' and c['precision']: typ += f"({c['precision']},{c['scale']})"
        columns.append(c['name']+' '+typ+(' DEFAULT '+c['default'] if c['default'] else '')+(' NOT NULL' if c['nullable']=='NO' else ''))
    pg.sql('CREATE SEQUENCE public.partner_orders_numero_seq; CREATE TABLE public.partner_orders('+','.join(columns)+');')
    # Install exact real approval bodies, not a surrogate function.
    for sig in ('fn_b2b_guard_credit_approval_fields()','approve_b2b_credit(uuid,text)'):
        pg.sql(F[sig]['body']+';')
        check('exact LIVE body '+sig,F[sig]['md5'],pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))"))
    t = next(t for t in live['triggers'] if t['name']=='trg_b2b_guard_credit_approval_fields')
    pg.sql(t['definition']+';')
    # Exposure is deliberately NOT replaced with a permissive stub. Use the captured body and its actual input relations.
    pg.sql('CREATE TABLE accounts_receivable(id uuid,partner_id uuid,status text); CREATE TABLE accounts_receivable_installments(receivable_id uuid,original_amount numeric,received_amount numeric,status text,due_date date); CREATE TABLE partner_order_financial_links(partner_order_id uuid); ALTER TABLE partner_financial_settings ADD COLUMN overdue_tolerance_days int; ALTER TABLE partner_financial_settings ADD COLUMN block_if_overdue boolean; ALTER TABLE partner_financial_settings ADD COLUMN credit_limit_action text;')
    pg.sql(F['fn_b2b_credit_exposure(uuid,numeric,uuid)']['body']+';')
    check('exact LIVE exposure',F['fn_b2b_credit_exposure(uuid,numeric,uuid)']['md5'],pg.sql("SELECT md5(pg_get_functiondef('fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure))"))
    pg.sql(F['tg_partner_orders_credit_guard()']['body']+';')
    ct = next(t for t in live['triggers'] if t['name']=='trg_partner_orders_credit_guard')
    pg.sql(ct['definition']+';')
    pg.sql(f"INSERT INTO synthetic_scope VALUES('{U}',true,true); INSERT INTO partner_financial_settings VALUES('{P}',true,100000,0,false,'approval_required');")
    def reset(amount=120000):
        pg.sql(f"TRUNCATE partner_orders,partner_order_audit_logs; INSERT INTO partner_orders(id,partner_id,created_by,total,status) VALUES('{O}','{P}','{U}',{amount},'aguardando_aprovacao_credito');")
    def deny(name, sql, code):
        before=pg.sql('SELECT to_jsonb(p)::text FROM partner_orders p'); a=pg.sql('SELECT count(*) FROM partner_order_audit_logs')
        err=pg.sql(sql,ok=False)
        if code not in err: print(err, flush=True)
        check(name+' SQLSTATE',True,code in err)
        check(name+' atomic state',before,pg.sql('SELECT to_jsonb(p)::text FROM partner_orders p'))
        check(name+' no audit',a,pg.sql('SELECT count(*) FROM partner_order_audit_logs'))
    reset()
    # RED: GUC spoof is a local SQL role/guard demonstration, NOT a hosted authenticated RLS exploit.
    pg.sql(f"SELECT set_config('arbio.b2b_credit_approval','on',false); UPDATE partner_orders SET credit_approved_by='{U}',credit_approved_at=now() WHERE id='{O}';")
    check('RED captured guard accepts caller-set GUC',U,pg.sql('SELECT credit_approved_by FROM partner_orders'))
    pg.sql((H/'01-credit-approval.body.sql.review').read_text())
    reset()
    deny('GREEN spoofed GUC no private ticket',f"UPDATE partner_orders SET credit_approved_by='{U}',credit_approved_at=now() WHERE id='{O}';",'credit_approval_fields_immutable')
    # Existing function ACL must be set as captured in this synthetic database before testing entrypoint ACL.
    pg.sql('REVOKE ALL ON FUNCTION approve_b2b_credit(uuid,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION approve_b2b_credit(uuid,text) TO authenticated,service_role; GRANT USAGE ON SCHEMA public,auth TO authenticated;')
    def call(): return f"SELECT public.approve_b2b_credit('{O}','SYNTHETIC');"
    for val in ('NULL','0','-1',"'NaN'"):
        pg.sql(f'UPDATE partner_financial_settings SET active=true,credit_limit={val};')
        deny('undefined/nonfinite limit '+val,call(),'credit_release_failed')
    check('Infinity refused by real numeric(14,2) type',True,'numeric field overflow' in pg.sql("UPDATE partner_financial_settings SET credit_limit='Infinity';",ok=False))
    pg.sql('UPDATE partner_financial_settings SET active=false,credit_limit=100000;')
    deny('inactive settings',call(),'credit_release_failed')
    pg.sql('DELETE FROM partner_financial_settings;')
    deny('absent settings',call(),'credit_release_failed')
    pg.sql(f"INSERT INTO partner_financial_settings VALUES('{P}',true,100000,0,false,'approval_required');")
    pg.sql(f"UPDATE partner_orders SET c2_external_origin_snapshot='{{\"contract\":\"C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1\"}}';")
    deny('accounting gate preserved',call(),'C2_ACCOUNTING_PENDING')
    pg.sql("UPDATE partner_orders SET c2_external_origin_snapshot=NULL; UPDATE synthetic_scope SET allowed=false;")
    deny('role revoked',call(),'forbidden')
    pg.sql("UPDATE synthetic_scope SET allowed=true,visible=false;")
    deny('foreign scope',call(),'b2b_phase1_scope_denied')
    pg.sql("UPDATE synthetic_scope SET visible=true;")
    deny('unsupported isolation', 'BEGIN ISOLATION LEVEL REPEATABLE READ;'+call(),'CREDIT_ISOLATION_UNSUPPORTED')
    # Deterministic fresh read after the shared credit lock, distinct from order row lock.
    held=subprocess.Popen(pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    box={}
    thread=None
    try:
        held.stdin.write(f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('b2b_credit:{P}',0)); SELECT 'HELD';\n"); held.stdin.flush()
        while held.stdout.readline().strip() != 'HELD':
            if held.poll() is not None: raise AssertionError('lock holder died')
        def wait():
            box['r']=subprocess.run(pg.psql(),input=("SET application_name='incremental_reauth'; SET statement_timeout='10s'; "+call()).encode(),capture_output=True)
        thread=threading.Thread(target=wait,daemon=True); thread.start()
        blocked=False
        for _ in range(100):
            if pg.sql("SELECT exists(SELECT 1 FROM pg_stat_activity WHERE application_name='incremental_reauth' AND cardinality(pg_blocking_pids(pid))>0)")=='t':
                blocked=True; break
            time.sleep(.05)
        check('reauth race proven blocking pids',True,blocked)
        pg.sql('UPDATE synthetic_scope SET allowed=false;')
        held.stdin.write('COMMIT;\n'); held.stdin.close(); held.wait(timeout=10)
        thread.join(timeout=15)
        check('reauth race settled',False,thread.is_alive())
        check('revoked during partner lock denied',True,box['r'].returncode != 0 and b'b2b_phase1_scope_denied' in box['r'].stderr)
        check('revoked during lock no audit','0',pg.sql('SELECT count(*) FROM partner_order_audit_logs'))
        check('revoked during lock no ticket','0',pg.sql('SELECT count(*) FROM platform_private.credit_approval_tickets_20261029'))
    finally:
        if held.poll() is None: held.kill(); held.wait(timeout=5)
        pg.sql('UPDATE synthetic_scope SET allowed=true;')
    reset()
    r=json.loads(pg.sql(call()).splitlines()[-1])
    check('configured excess legitimate canonical approval',True,r['ok'])
    check('approved excess analysis status','em_analise_comercial',pg.sql('SELECT status FROM partner_orders'))
    check('one audit','1',pg.sql('SELECT count(*) FROM partner_order_audit_logs'))
    check('consumed ticket','0',pg.sql('SELECT count(*) FROM platform_private.credit_approval_tickets_20261029'))
    new_hashes=pg.sql("SELECT jsonb_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))) FROM pg_proc WHERE oid IN ('approve_b2b_credit(uuid,text)'::regprocedure,'fn_b2b_guard_credit_approval_fields()'::regprocedure,'tg_partner_orders_credit_guard()'::regprocedure,'platform_private.b2b_credit_config_block(uuid)'::regprocedure)")
    deny('replay processed',call(),'already_released')
    deny('private ticket denied authenticated','SET ROLE authenticated; SELECT * FROM platform_private.credit_approval_tickets_20261029;','permission denied')
    reset(50000)
    pg.sql(f"UPDATE partner_orders SET status='aprovado'; UPDATE partner_orders SET final_amount_with_interest=100000.01;")
    check('isolated amount plus cent blocked','aguardando_aprovacao_credito',pg.sql('SELECT status FROM partner_orders'))
    reset(50000)
    pg.sql('UPDATE partner_orders SET status=\'aprovado\'; UPDATE partner_orders SET final_amount_with_interest=100000;')
    check('exact limit accepted','aprovado',pg.sql('SELECT status FROM partner_orders'))
    pg.sql((H/'01-credit-approval.rollback.sql.review').read_text())
    check('deny-only rollback revokes client entry','f',pg.sql("SELECT has_function_privilege('authenticated','approve_b2b_credit(uuid,text)','EXECUTE')"))
    check('deny-only rollback retains hardened guard',False,'arbio.b2b_credit_approval' in pg.sql("SELECT pg_get_functiondef('fn_b2b_guard_credit_approval_fields()'::regprocedure)"))
    result={'level':'DISPOSABLE_CURRENT_BODIES_AUTH_SEAMS_NOT_E2E','candidate_function_md5':json.loads(new_hashes),'checks':rows,'passed':len(rows),'fail':0,'omitted':['full partner_order trigger stack','real JWT/RLS sessions','h15 implementation chain','business data','external outputs','shared writer integration']}
    pathlib.Path(sys.argv[1]).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'passed':len(rows),'fail':0}))


if __name__=='__main__': main()