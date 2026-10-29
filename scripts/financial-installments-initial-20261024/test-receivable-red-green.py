"""Strict red/green regression using existing monetary harness. No authorization claim.
Real captured Auth/h15/RBAC replace permissive helpers; synthetic minimal identity tables.
No tickets, guard override, LIVE connection or installable SQL is emitted.
"""
import hashlib, importlib.util, json, sys
from decimal import Decimal
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[1]
OUT = ROOT/'docs/auditorias/evidencias-cadeia-financeira-20261029'
spec = importlib.util.spec_from_file_location('monetary', H/'test-receivable-semantics.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
live = json.loads((H/'receivable-recursive-live-20261029.json').read_text())
assert live['ref'] == 'swzpzcwiasxmjutrmvkm'
checks = []

def check(name, expected, actual, mode):
    ok = expected == actual
    checks.append(dict(test=name,expected=str(expected),actual=str(actual),mode=mode,status='PASS' if ok else 'FAIL'))
    assert ok, (name, expected, actual)

def captured(schema, name):
    fs = [f for f in live['functions'] if f['schema']==schema and f['name']==name]
    assert len(fs)==1, (schema,name)
    f=fs[0]
    assert hashlib.md5(f['body'].encode()).hexdigest()==f['md5']
    m.pg.sql(f['body']+';')
    return f

def identity():
    m.pg.sql('''CREATE TABLE profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean, senha_provisoria boolean);
    CREATE TABLE organizations(id uuid PRIMARY KEY, ativo boolean);
    CREATE TABLE user_roles(user_id uuid REFERENCES profiles(user_id), role app_role, UNIQUE(user_id,role));
    CREATE TABLE platform_org_admin_invites(user_id uuid, access_operation_status text, access_valid_after timestamptz);
    DROP FUNCTION public.has_role(uuid,app_role), public.is_financial_staff(uuid);''')
    installed=[]
    for schema,name in [('auth','uid'),('auth','jwt'),('platform_private','platform_actor_access_ready'),
        ('platform_private','h15_actor_organization'),('public','h15_actor_organization'),
        ('platform_private','has_role'),('public','has_role'),('public','fn_authz_uid_scope_ok'),('public','is_financial_staff')]:
        installed.append(captured(schema,name))
    m.pg.sql(f"INSERT INTO organizations VALUES('{m.A}',true),('{m.B}',true); INSERT INTO profiles VALUES('{m.U}','{m.A}',true,false); INSERT INTO user_roles VALUES('{m.U}','financeiro');")
    def scope(org=m.A, staff=True):
        # Local request context only, not JWT verification. Revocation is real table data.
        return f"SELECT set_config('request.jwt.claims','{{\"sub\":\"{m.U}\",\"iat\":1793275200}}',false);"
    m.scope=scope
    return installed

def main():
    m.pg.start()
    mode_hashes={}
    for mode in ['RED_BASELINE','GREEN_SANDBOX']:
        if mode=='GREEN_SANDBOX':
            m.pg.sql('DROP SCHEMA public,auth,platform_private,extensions CASCADE; CREATE SCHEMA public;')
        m.schema(); installed=identity()
        generator=m.fun('fn_generate_receivable_installments()')['body']
        loop_source=next(f for f in live['functions'] if f['name']=='generate_b2b_receivable_secure_impl')['body']
        start=loop_source.index('  FOR v_sch IN');end=loop_source.index('  END LOOP;',start)+len('  END LOOP;')
        loop=loop_source[start:end]
        if mode=='GREEN_SANDBOX':
            anchor="SELECT NEW.id,s.installment_number,s.due_date,s.amount,s.amount,'OPEN',NEW.organization_id,s.interest_amount"
            assert generator.count(anchor)==1
            generator=generator.replace(anchor,"SELECT NEW.id,s.installment_number,s.due_date,s.amount,s.amount,'OPEN',NEW.organization_id,0::numeric")
            anchor='interest_amount=COALESCE(v_sch.interest_amount,0)'
            assert loop.count(anchor)==1
            loop=loop.replace(anchor,'interest_amount=(SELECT COALESCE(sum(rp.interest_amount),0) FROM public.receivable_payments rp WHERE rp.installment_id=accounts_receivable_installments.id)')
            m.pg.sql(generator+';')
        t,x=m.title(501)
        # RED explicitly asserts failures of contractual expectations, not approval of 10600.
        check('initial contractual invariant',mode=='GREEN_SANDBOX',m.balance(x)==Decimal('10300'),mode)
        check('initial observed balance',Decimal('10600') if mode=='RED_BASELINE' else Decimal('10300'),m.balance(x),mode)
        pay,call=m.payment(x,3000,'lost-ack',100,200,50)
        check('partial balance',Decimal('7550'),m.balance(x),mode)
        def replay():
            m.ask(f"DO $fragment$ DECLARE p_partner_order_id uuid:='{m.uid(501)}';v_receivable_id uuid:='{t}';v_org uuid:='{m.A}';v_terms record;v_sch record;v_ari_id uuid;v_installments_json jsonb:='[]';BEGIN SELECT '{m.uid(10501)}'::uuid AS id INTO v_terms;{loop} END $fragment$;")
        replay()
        check('replay contractual invariant',mode=='GREEN_SANDBOX',m.balance(x)==Decimal('7550'),mode)
        check('replay observed balance',Decimal('7750') if mode=='RED_BASELINE' else Decimal('7550'),m.balance(x),mode)
        before=m.state();check('payment ACK replay UUID',pay,m.ask(call),mode)
        check('payment replay no effects',before,m.state(),mode)
        if mode=='GREEN_SANDBOX':
            replay();check('writer assignment replay no effects',before,m.state(),mode)
        check('initial finance snapshot remains 300',Decimal('300'),Decimal(m.pg.sql(f"SELECT interest_amount FROM partner_order_payment_schedule WHERE partner_order_id='{m.uid(501)}'")),mode)
        m.payment(x,1000,'second')
        check('second partial',Decimal('6550'),m.balance(x),mode)
        rev=m.ask(f"SELECT fn_reverse_payment('{pay}','receivable','LOCAL REASON');")
        check('reversal preserves remaining event',Decimal('9300'),m.balance(x),mode)
        before=m.state();check('reversal replay UUID',rev,m.ask(f"SELECT fn_reverse_payment('{pay}','receivable','LOCAL REASON');"),mode)
        check('reversal replay no effects',before,m.state(),mode)
        m.pg.sql(f"UPDATE profiles SET organization_id='{m.B}' WHERE user_id='{m.U}';")
        before=m.state();err=m.pg.sql(m.scope()+call,ok=False)
        check('h15 actual tenant denies replay',True,'FINANCIAL_SCOPE_DENIED' in err and m.state()==before,mode)
        m.pg.sql(f"UPDATE profiles SET organization_id='{m.A}',ativo=false WHERE user_id='{m.U}';")
        err=m.pg.sql(m.scope()+call,ok=False)
        check('actual inactive profile denies payment',True,('Sem permissão' in err or 'FINANCIAL_SCOPE_DENIED' in err) and m.state()==before,mode)
        mode_hashes[mode]=dict(generator=hashlib.md5(generator.encode()).hexdigest(),loop_fragment_sha256=hashlib.sha256(loop.encode()).hexdigest(),identity={f['signature']:f['md5'] for f in installed})
    OUT.mkdir(parents=True,exist_ok=True)
    result=dict(checks=checks,counts={s:sum(c['status']==s for c in checks) for s in ['PASS','FAIL']},hashes=mode_hashes,
        operational_go=False,strict_exit=True,baseline_contract_failures_expected=2,
        limits='Actual captured Auth/h15/RBAC over synthetic minimal identity tables; no JWT verification/RLS/ACL/full identity triggers. Alternate writer assignment loop only; full wrapper authorization stays BLOCKED. Monetary schema retains previous excluded guards/FKs. No ticket fabricated.')
    (OUT/'red-green.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result['counts']))

if __name__=='__main__': main()