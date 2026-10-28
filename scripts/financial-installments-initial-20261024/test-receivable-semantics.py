"""Disposable-only integration. No hosted client. Experimental generator is NOT deployable.
Captured money/receipt/snapshot/audit bodies; Auth/readiness/tenant feature/RLS and
order creator are excluded and explicitly synthetic. Original captures never change.
"""
from pathlib import Path
from decimal import Decimal as D, ROUND_HALF_UP, getcontext
import sys,json,hashlib,csv,re
sys.dont_write_bytecode=True
getcontext().prec=60
H=Path(__file__).resolve().parent; ROOT=H.parents[1]
sys.path.insert(0,str(ROOT/'scripts/contracts-c2-20261022/integral'))
import pg
CAP=H/'receivable-semantics-live-20261028.json'; LIVE=json.loads(CAP.read_text())
assert LIVE['ref']=='swzpzcwiasxmjutrmvkm' and pg.root.is_relative_to(Path('/tmp'))
WRITERS_PHASE='--writers-phase' in sys.argv
OUT=ROOT/'docs/auditorias'/('evidencias-escritores-saldo-20261028' if WRITERS_PHASE else 'evidencias-saldo-canonico-20261028')
A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
U='11111111-1111-4111-8111-111111111111'; PM='22222222-2222-4222-8222-222222222222'
C='33333333-3333-4333-8333-333333333333'; K='44444444-4444-4444-8444-444444444444'
def q(x):return "'"+str(x).replace("'","''")+"'"
def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
def money(x):return D(x).quantize(D('.01'),rounding=ROUND_HALF_UP)
def fun(sig):return next(x for x in LIVE['functions'] if x['signature']==sig)
rows=[]; used=[]
mode_hashes={}
def record(label,expected,actual,mode='BASELINE',severity='P1'):
    status='PASS' if expected==actual else 'FAIL'
    rows.append(dict(id=f'SALDO-{len(rows)+1:03}',cenario=label,status=status,esperado=str(expected),observado=str(actual),modo=mode,severidade=severity,nivel='PG_CORPOS_CAPTURADOS_AUTH_SCHEMA_PARCIAL_SINTETICOS'))
    print(status,mode,label,expected,actual,flush=True)
def install(sig):
    f=fun(sig);pg.sql(f['body']+';');used.append(sig)
    actual=pg.sql(f"SELECT md5(pg_get_functiondef('public.{sig}'::regprocedure));")
    assert actual==f['md5'],(sig,actual,f['md5'])
def schema():
    pg.sql("""CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TYPE app_role AS ENUM ('administrador','gestor','financeiro','parceiro_b2b');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
    CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.org',true),'')::uuid$$;
    CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$SELECT platform_private.h15_actor_organization()$$;
    CREATE FUNCTION is_financial_staff(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1=auth.uid() AND current_setting('test.staff',true)='true'$$;
    CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$SELECT $1=auth.uid() AND $2='financeiro'::app_role$$;
    CREATE TABLE payment_methods(id uuid PRIMARY KEY,active boolean);
    CREATE TABLE bank_accounts(id uuid PRIMARY KEY,active boolean);
    CREATE TABLE financial_settings(require_receipt_on_receivable_payment boolean);
    CREATE TABLE platform_private.financial_initial_installments(transaction_id bigint,title_id uuid,kind text,actor_id uuid,organization_id uuid,installments jsonb);
    CREATE TABLE partner_orders(id uuid PRIMARY KEY,payment_terms_id uuid,c2_external_origin_snapshot jsonb);
    CREATE TABLE accounts_payable(id uuid,status text);
    CREATE TABLE accounts_payable_installments(id uuid,status text,due_date date,original_amount numeric,paid_amount numeric,discount_amount numeric,interest_amount numeric,penalty_amount numeric);
    CREATE TABLE payable_payments(id uuid,payment_date date,amount_paid numeric,organization_id uuid);
    """)
    # Exact captured column types/default/nullability and local check/unique constraints.
    # FKs to Auth/tenant/order catalog excluded, not silently replaced with permissive guards.
    names=['accounts_receivable','accounts_receivable_installments','receivable_payments','financial_receipts','financial_audit_log','partner_order_payment_schedule']
    for name in names:
        t=next(t for t in LIVE['tables'] if t['name']==name)
        cols=[f"{c['name']} {c['type']}"+(' DEFAULT '+c['default'] if c['default'] else '')+(' NOT NULL' if c['notnull'] else '') for c in t['columns']]
        cs=[f"CONSTRAINT {c['name']} {c['definition']}" for c in t['constraints'] if not c['definition'].startswith('FOREIGN KEY')]
        pg.sql(f"CREATE TABLE public.{name} ("+','.join(cols+cs)+');')
    for t in names:
        for i in LIVE['indexes']:
            if i['table']==t and i['unique'] and not i['name'].endswith('_pkey'):
                exists=pg.sql(f"SELECT to_regclass({q(i['name'])}) IS NOT NULL")=='t'
                if not exists:pg.sql(i['definition']+';')
    for sig in ['fn_generate_receivable_installments()','fn_recalc_receivable_installment()','fn_h6b_num(numeric)','fn_h6b_payment_fingerprint(text,uuid,jsonb)','rpc_register_receivable_payment(uuid,jsonb)','fn_reverse_payment(uuid,text,text)','fn_h6_guard_ar_installment_snapshot()','fn_h6_guard_title_snapshot()','fn_h6_payments_append_only()','fn_financial_audit()','fn_assign_receipt_metadata()','fn_sync_receipt_aliases()','issue_financial_receipt(uuid,text)','cancel_financial_receipt(uuid,text)','cancel_b2b_receivable_secure(uuid,text)','rpc_cancel_financial_installment(uuid,text,text)','fn_fin_cashflow(date,date,text,text)','fn_fin_aging(text)']:
        install(sig)
    included={'trg_ar_gen_installments','trg_h6_ar_snapshot','trg_audit_ar','trg_h6_ari_snapshot','trg_h6_rp_append_only','trg_recalc_ar_inst','trg_audit_rp','trg_assign_receipt_metadata','trg_sync_receipt_aliases'}
    for t in LIVE['tables']:
        if t['name'] in names:
            for tr in t['triggers'] or []:
                if tr['name'] in included:pg.sql(tr['definition']+';')
    pg.sql(f"INSERT INTO payment_methods VALUES('{PM}',true); INSERT INTO financial_settings VALUES(false);")
def scope(org=A,staff=True):
    return f"SELECT set_config('test.uid','{U}',false);SELECT set_config('test.org','{org}',false);SELECT set_config('test.staff','{str(staff).lower()}',false);"
def ask(s,org=A,staff=True):return pg.sql(scope(org,staff)+s).splitlines()[-1]
def state():return pg.sql("SELECT jsonb_build_object('titles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable x),'parts',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable_installments x),'payments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM receivable_payments x),'receipts',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM financial_receipts x),'audit',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM financial_audit_log x));")
def deny(label,s,code,mode,org=A,staff=True):
    before=state();err=pg.sql(scope(org,staff)+s,ok=False)
    assert code in err,(label,err)
    record(label,True,state()==before,mode)
def title(n,total='10300',interest='300',count=1,org=A,external=True):
    order=uid(n);terms=uid(n+10000);tid=uid(n+20000)
    amounts=[money(D(total)/count)]*(count-1);amounts.append(D(total)-sum(amounts,D(0)))
    ints=[money(D(interest)/count)]*(count-1);ints.append(D(interest)-sum(ints,D(0)))
    pg.sql(f"INSERT INTO partner_orders VALUES('{order}','{terms}',"+("'{}'::jsonb" if external else 'NULL')+");")
    for i,(amt,intr) in enumerate(zip(amounts,ints),1):
        pg.sql(f"INSERT INTO partner_order_payment_schedule(partner_order_id,payment_terms_id,installment_number,due_date,amount,principal_amount,interest_amount) VALUES('{order}','{terms}',{i},CURRENT_DATE+{i*30},{amt},{amt-intr},{intr});")
    ask(f"INSERT INTO accounts_receivable(id,origin_type,origin_id,description,category_id,total_amount,first_due_date,installment_count,created_by,organization_id,customer_id) VALUES('{tid}','B2B_ORDER','{order}','SYNTHETIC LOCAL','{K}',{total},CURRENT_DATE+30,{count},'{U}','{org}','{C}');",org)
    inst=pg.sql(f"SELECT id FROM accounts_receivable_installments WHERE receivable_id='{tid}' ORDER BY installment_number LIMIT 1;")
    return tid,inst
BAL='original_amount+interest_amount+penalty_amount-discount_amount-received_amount'
def balance(inst):return D(pg.sql(f"SELECT {BAL} FROM accounts_receivable_installments WHERE id='{inst}';"))
def payment(inst,amount,key,interest=0,penalty=0,discount=0,org=A):
    payload=dict(amount_received=str(amount),idempotency_key=key,payment_method_id=PM,payment_date='2026-10-28',interest_amount=str(interest),penalty_amount=str(penalty),discount_amount=str(discount))
    call=f"SELECT rpc_register_receivable_payment('{inst}',{q(json.dumps(payload))}::jsonb);"
    return ask(call,org),call

def writers_scenarios(mode,offset):
    """Exact assignment loop, not full writer authorization; never deployable."""
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    import subprocess
    fresh=json.loads((H/'receivable-writers-live-20261028.json').read_text())
    f=next(x for x in fresh['functions'] if x['signature']=='generate_b2b_receivable_secure_impl(uuid)')
    assert f['md5']==fun('generate_b2b_receivable_secure_impl(uuid)')['md5']
    start=f['body'].index('  FOR v_sch IN');end=f['body'].index('  END LOOP;',start)+len('  END LOOP;')
    loop=f['body'][start:end]
    def replay_loop(t,n,proposal=False):
        body=loop
        if proposal:
            anchor='interest_amount=COALESCE(v_sch.interest_amount,0)'
            assert body.count(anchor)==1
            # Hypothesis: operational interest derives only from immutable events.
            body=body.replace(anchor,"interest_amount=(SELECT COALESCE(sum(rp.interest_amount),0) FROM public.receivable_payments rp WHERE rp.installment_id=accounts_receivable_installments.id)")
        return ask(f"DO $fragment$ DECLARE p_partner_order_id uuid:='{uid(n)}'; v_receivable_id uuid:='{t}'; v_org uuid:='{A}'; v_terms record; v_sch record; v_ari_id uuid; v_installments_json jsonb:='[]'; BEGIN SELECT '{uid(n+10000)}'::uuid AS id INTO v_terms; {body} END $fragment$;")
    n=offset+70;t,x=title(n)
    replay_loop(t,n,mode.startswith('EXPERIMENTO'))
    record('loop completo de atribuicoes B2B conserva total (nao autoriza writer)',D('10300'),balance(x),mode,'P0')
    payment(x,3000,f'loop-partial-{offset}',100,200,50)
    replay_loop(t,n,mode.startswith('EXPERIMENTO'))
    record('loop repetido nao apaga nem duplica encargo do evento',D('7550'),balance(x),mode,'P0')
    record('juros operacionais permanecem soma dos eventos',D('100'),D(pg.sql(f"SELECT interest_amount FROM accounts_receivable_installments WHERE id='{x}'")),mode,'P0')
    record('snapshot cronograma preserva remuneracao inicial',D('300'),D(pg.sql(f"SELECT interest_amount FROM partner_order_payment_schedule WHERE partner_order_id='{uid(n)}'")),mode)
    before=state();err=pg.sql(scope()+f"BEGIN; UPDATE partner_order_payment_schedule SET amount=10301 WHERE partner_order_id='{uid(n)}'; DO $fragment$ DECLARE p_partner_order_id uuid:='{uid(n)}'; v_receivable_id uuid:='{t}'; v_org uuid:='{A}'; v_terms record; v_sch record; v_ari_id uuid; v_installments_json jsonb:='[]'; BEGIN SELECT '{uid(n+10000)}'::uuid AS id INTO v_terms; {loop} END $fragment$; COMMIT;",ok=False)
    record('snapshot parcela nega divergencia de original','Parcela imutavel','Parcela imutavel' if 'Parcela imutavel' in err else err,mode)
    record('divergencia de snapshot aborta transacao sem compensar',True,state()==before,mode)
    def concurrent_calls(x,amount,keys):
        barrier=Barrier(2)
        def send(key):
            payload=dict(amount_received=str(amount),idempotency_key=key,payment_method_id=PM,payment_date='2026-10-28')
            barrier.wait()
            return subprocess.run(pg.psql(),input=scope()+f"SELECT rpc_register_receivable_payment('{x}',{q(json.dumps(payload))}::jsonb);",text=True,capture_output=True)
        with ThreadPoolExecutor(max_workers=2) as pool:return list(pool.map(send,keys))
    t,x=title(offset+71)
    rs=concurrent_calls(x,3000,[f'same-key-{offset}']*2)
    ids=[r.stdout.strip().splitlines()[-1] for r in rs if r.returncode==0]
    record('duas sessoes mesma chave retorno unico',(2,1),(len(ids),len(set(ids))),mode)
    record('duas sessoes mesma chave ledger unico',D('3000'),D(pg.sql(f"SELECT sum(amount_received) FROM receivable_payments WHERE installment_id='{x}'")),mode)
    record('duas sessoes mesma chave saldo correto',D('7300'),balance(x),mode)
    t,x=title(offset+72)
    rs=concurrent_calls(x,6000,[f'key-one-{offset}',f'key-two-{offset}'])
    record('duas baixas excedentes uma aceita outra nega',(1,1),(sum(r.returncode==0 for r in rs),sum('excede o saldo' in r.stderr for r in rs)),mode)
    record('baixas concorrentes distintas nao sobrebaixam',D('4300'),balance(x),mode)
    record('ledger concorrente corresponde a valor aceito',D('6000'),D(pg.sql(f"SELECT sum(amount_received) FROM receivable_payments WHERE installment_id='{x}'")),mode)
    t,x=title(offset+73)
    pay,_=payment(x,1000,f'reversal-race-{offset}')
    reverse_barrier=Barrier(2)
    def reverse(_):
        reverse_barrier.wait()
        return subprocess.run(pg.psql(),input=scope()+f"SELECT fn_reverse_payment('{pay}','receivable','LOCAL');",text=True,capture_output=True)
    with ThreadPoolExecutor(max_workers=2) as pool:rs=list(pool.map(reverse,range(2)))
    record('estorno simultaneo uma compensacao no ledger',D('0'),D(pg.sql(f"SELECT sum(amount_received) FROM receivable_payments WHERE installment_id='{x}'")),mode,'P0')
    record('estorno simultaneo conserva total financiado',D('10300'),balance(x),mode,'P0')
    if mode.startswith('EXPERIMENTO'):
        rs=concurrent_calls(x,10600,[f'over-one-{offset}',f'over-two-{offset}'])
        record('proposta nega 10600 em duas sessoes',2,sum('excede o saldo' in r.stderr for r in rs),mode,'P0')

def main():
    pg.start();schema()
    for mode in ['BASELINE','EXPERIMENTO_NAO_INSTALAVEL']:
        if mode.startswith('EXPERIMENTO'):
            # Fresh schemas prevent aggregate BI from inheriting baseline fixtures.
            pg.sql('DROP SCHEMA public,auth,platform_private,extensions CASCADE; CREATE SCHEMA public;')
            schema()
        if mode.startswith('EXPERIMENTO'):
            s=fun('fn_generate_receivable_installments()')['body'];anchor="SELECT NEW.id,s.installment_number,s.due_date,s.amount,s.amount,'OPEN',NEW.organization_id,s.interest_amount"
            assert s.count(anchor)==1
            pg.sql(s.replace(anchor,"SELECT NEW.id,s.installment_number,s.due_date,s.amount,s.amount,'OPEN',NEW.organization_id,0::numeric")+';')
        mode_hashes[mode]={sig:pg.sql(f"SELECT md5(pg_get_functiondef('public.{sig}'::regprocedure));") for sig in set(used)}
        offset=0 if mode=='BASELINE' else 100000
        t,i=title(offset+1)
        record('saldo inicial financiado 10300, nao 10600',D('10300'),balance(i),mode,'P0')
        if mode=='BASELINE':
            pay,_=payment(i,10600,'overpayment-baseline')
            record('baixa nao pode exceder total contratual',True,D(pg.sql(f"SELECT received_amount FROM accounts_receivable_installments WHERE id='{i}'"))<=D('10300'),mode,'P0')
        else:
            deny('experimento recusa 10600 para total 10300',f"SELECT rpc_register_receivable_payment('{i}',{q(json.dumps(dict(amount_received='10600',payment_method_id=PM,idempotency_key='experimental-overpayment')))}::jsonb);",'excede o saldo',mode)
        t,i=title(offset+2)
        pay,call=payment(i,3000,'partial-lost-ack',100,200,50)
        record('parcial, mora monetaria, multa e desconto',D('7550'),balance(i),mode)
        record('juros sao soma eventos apos primeira baixa',D('100'),D(pg.sql(f"SELECT interest_amount FROM accounts_receivable_installments WHERE id='{i}'")),mode)
        aging_expression=D(pg.sql(f"SELECT original_amount-received_amount-discount_amount FROM accounts_receivable_installments WHERE id='{i}'"))
        record('saldo operacional e aging exigivel apos parcial',D('7550'),aging_expression,mode,'P1')
        payment(i,1000,'second-partial')
        record('segunda baixa acumula sem perder financiamento',D('6550'),balance(i),mode)
        before=state(); replay=ask(call)
        record('ACK perdido replay mesmo UUID sem novo efeito',(pay,True),(replay,state()==before),mode)
        deny('chave mesma payload divergente',call.replace('3000','3001'),'FIN_IDEMPOTENCY_CONFLICT',mode)
        deny('parcela estrangeira antes replay',call,'FINANCIAL_SCOPE_DENIED',mode,org=B)
        deny('papel revogado sintetico',call,'Sem permissão',mode,staff=False)
        deny('cancelar parcela com baixa ativa',f"SELECT rpc_cancel_financial_installment('{i}','receivable','motivo local');",'não estornados',mode)
        rec=json.loads(ask(f"SELECT issue_financial_receipt('{pay}','LOCAL');"));rid=rec['receipt_id']
        record('recibo valor evento nao saldo',D('3000'),D(pg.sql(f"SELECT amount FROM financial_receipts WHERE id='{rid}'")),mode)
        before=state();replay=json.loads(ask(f"SELECT issue_financial_receipt('{pay}','LOCAL');"))
        record('recibo replay sem duplicar',(rid,True),(replay['receipt_id'],state()==before),mode)
        deny('recibo cross-tenant',f"SELECT issue_financial_receipt('{pay}','LOCAL');",'não encontrado',mode,org=B)
        ask(f"SELECT cancel_financial_receipt('{rid}','motivo local');")
        record('cancelar recibo nao estorna baixa',D('6550'),balance(i),mode)
        deny('recibo cancelado segunda intencao',f"SELECT cancel_financial_receipt('{rid}','motivo local');",'já cancelado',mode)
        reversal=ask(f"SELECT fn_reverse_payment('{pay}','receivable','motivo local');")
        record('estorno parcial preserva pagamento remanescente',D('9300'),balance(i),mode)
        before=state();again=ask(f"SELECT fn_reverse_payment('{pay}','receivable','motivo local');")
        record('estorno replay sem duplicar',(reversal,True),(again,state()==before),mode)
        record('ledger de eventos liquidos remanescentes',D('1000'),D(pg.sql(f"SELECT sum(amount_received) FROM receivable_payments WHERE installment_id='{i}'")),mode)
        deny('snapshot original imutavel',f"UPDATE accounts_receivable_installments SET original_amount=1 WHERE id='{i}';",'Parcela imutavel',mode)
        deny('snapshot titulo imutavel',f"UPDATE accounts_receivable SET total_amount=1 WHERE id='{t}';",'Snapshot financeiro imutavel',mode)
        deny('evento UPDATE imutavel',f"UPDATE receivable_payments SET amount_received=1 WHERE id='{pay}';",'imutavel',mode)
        # Owner-approved totals are INPUT FIXTURES here; no interest rate recalculation/test repetition.
        for j,(months,total) in enumerate([(0,'6000'),(1,'6108.00'),(6,'6677.87'),(8,'7029.96'),(12,'7609.45')],10):
            t,x=title(offset+j,total,str(D(total)-6000),count=max(1,months))
            actual=D(pg.sql(f"SELECT sum({BAL}) FROM accounts_receivable_installments WHERE receivable_id='{t}'"))
            record(f'valor financiado fixture {months}m conservado na geracao',D(total),actual,mode,'P0')
            originals=D(pg.sql(f"SELECT sum(original_amount) FROM accounts_receivable_installments WHERE receivable_id='{t}'"))
            record(f'rateio centavos soma {months}m',D(total),originals,mode)
            expected=money(D(total)/max(1,months))
            payment(x,expected,f'settlement-{offset}-{months}')
            record(f'quitacao parcela {months}m saldo zero',D(0),balance(x),mode)
        t,x=title(offset+30,'1.00','0',3,external=False)
        record('ramo generico 1 real 3 parcelas',[D('.33'),D('.33'),D('.34')],[D(v) for v in pg.sql(f"SELECT original_amount FROM accounts_receivable_installments WHERE receivable_id='{t}' ORDER BY installment_number").splitlines()],mode)
        t,x=title(offset+31)
        for j,amount in enumerate(['0','-1','0.001','NaN']):
            payload=dict(amount_received=amount,payment_method_id=PM,idempotency_key=f'negative-{j}')
            deny(f'valor invalido {amount}',f"SELECT rpc_register_receivable_payment('{x}',{q(json.dumps(payload))}::jsonb);",'inválid',mode)
        deny('cancelamento B2B permanece contido',f"SELECT cancel_b2b_receivable_secure('{uid(offset+31)}','motivo local');",'B2B_FINANCIAL_CONTRACT_UNAVAILABLE',mode)
        # Replay the exact alternate writer assignment, not its unproven full authorization chain.
        ask(f"UPDATE accounts_receivable_installments SET interest_amount=300 WHERE id='{x}';")
        record('outro escritor repoe juros financiados apos experimento',D('10300'),balance(x),mode,'P0')
        # Installed cashflow agrees with additive consumers; aging excludes new interest.
        lo=pg.sql('SELECT min(due_date)-1 FROM accounts_receivable_installments;');hi=pg.sql('SELECT max(due_date)+1 FROM accounts_receivable_installments;')
        additive=D(pg.sql(f"SELECT sum(greatest(0,{BAL})) FROM accounts_receivable_installments WHERE status IN ('OPEN','PARTIAL','OVERDUE')"))
        cf=D(ask(f"SELECT sum(entradas) FROM fn_fin_cashflow('{lo}','{hi}','day','projected');"))
        record('cashflow capturado concorda com formula aditiva',additive,cf,mode)
        aging=D(ask("SELECT sum(total) FROM fn_fin_aging('RECEIVABLE');"))
        record('aging e caixa projetado concordam incluindo ajustes',additive,aging,mode,'P1')
        t,foreign=title(offset+40,org=B)
        before=state()
        import subprocess
        result=subprocess.run(pg.psql(),input=scope()+f"SELECT rpc_cancel_financial_installment('{foreign}','receivable','motivo local');",text=True,capture_output=True)
        denied=result.returncode!=0 and ('denied' in result.stderr.lower() or 'permiss' in result.stderr.lower())
        record('cancelamento deve negar parcela de outro tenant e ser atomico',(True,True),(denied,state()==before),mode,'P0')
        if WRITERS_PHASE: writers_scenarios(mode,offset)
    for label,severity in [
        ('geracao B2B integral: gates fiscais/preco/tenant/snapshot e escritor alternativo','P0'),
        ('mudanca segura de contrato unico com todos consumidores BI','P0'),
        ('remediacao historica: nao classificar juros apenas por valor/coincidencia','P0'),
        ('revogacao real depois locks e RLS JWT A/B','P0'),
        ('ledger contabil: writer/cadeia nao identificados','P0'),
        ('calendario fracionario parcelamento e gatilho billing','P1'),
        ('mora automatica indice/pro-rata e antecipacao contratual','P1'),
        ('concorrencia multi-sessao recibo e cancelamento tenant/RLS','P0'),
    ]:
        rows.append(dict(id=f'SALDO-{len(rows)+1:03}',cenario=label,status='BLOCKED',esperado='contrato integrado homologado',observado='nao comprovado nesta bateria',modo='GATE',severidade=severity,nivel='NAO_CERTIFICADO'))
    rows.append(dict(id=f'SALDO-{len(rows)+1:03}',cenario='JWT browser hosted dados pagamento fiscal real',status='NOT RUN',esperado='fora de escopo',observado='proibido',modo='GATE',severidade='P0',nivel='REAL_NAO_EXECUTADO'))
    OUT.mkdir(parents=True,exist_ok=True)
    with (OUT/'matriz.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=rows[0].keys(),lineterminator='\n');w.writeheader();w.writerows(rows)
    meta=dict(ref=LIVE['ref'],capture_sha256=hashlib.sha256(CAP.read_bytes()).hexdigest(),results=rows,counts={s:sum(r['status']==s for r in rows) for s in ['PASS','FAIL','BLOCKED','NOT RUN']},captured_body_hashes={s:fun(s)['md5'] for s in set(used)},effective_local_body_hashes_by_mode=mode_hashes,independent_modes=True,has_failures=any(r['status']=='FAIL' for r in rows),operational_go=False,writer_loop_only=WRITERS_PHASE,excluded_triggers={t['name']:[x['name'] for x in t['triggers'] or [] if x['name'] not in included_names()] for t in LIVE['tables']},limits='Auth/h15/roles synthetic; exact columns/checks/unique indexes subset; FK/RLS/tenant/SaaS/risk/order/fiscal triggers excluded; ledger means receivable_payments only; experiment not SQL candidate nor production correction',runtime_changes=False)
    (OUT/'execucao.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta['counts']))
def included_names():return {'trg_ar_gen_installments','trg_h6_ar_snapshot','trg_audit_ar','trg_h6_ari_snapshot','trg_h6_rp_append_only','trg_recalc_ar_inst','trg_audit_rp','trg_assign_receipt_metadata','trg_sync_receipt_aliases'}
if __name__=='__main__':main()
