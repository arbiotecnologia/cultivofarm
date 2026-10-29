"""Disposable PostgreSQL ONLY — component test, NOT an authorized E2E.
Reuses the monetary harness schema (captured receivable/payment/reversal/snapshot bodies,
synthetic Auth/h15/staff), installs the reviewed context generator and title RPC of the
installments package, then the INACTIVE Price candidate. The four unproven dependencies
(payment settings, canonical exposure, fiscal NF origin, accounting gate) stay deny-only and
are replaced ONLY by explicitly SYNTHETIC stubs for component steps. No hosted connection.
"""
import hashlib, importlib.util, json, subprocess, sys, pathlib
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal as D
sys.dont_write_bytecode = True
H = pathlib.Path(__file__).resolve().parent
PKG = H.parent / 'financial-installments-initial-20261024'


def load(name, path):
    s = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m


m = load('monetary', PKG / 'test-receivable-semantics.py')
eng = load('engine', PKG / 'price-schedule.py')
bc = load('build', H / 'build-candidate.py')
pg = m.pg
A, B, U, PM, C, K = m.A, m.B, m.U, m.PM, m.C, m.K
V = '66666666-6666-4666-8666-666666666666'          # second synthetic actor (tenant B)
CB = '77777777-7777-4777-8777-777777777777'         # synthetic customer of B
NF = '88888888-8888-4888-8888-888888888888'         # SYNTHETIC NF reference (not a real NF)
checks = []


def check(name, expected, actual, mode):
    checks.append(dict(test=name, expected=str(expected), actual=str(actual), mode=mode, status='PASS' if expected == actual else 'FAIL'))
    print('PASS' if expected == actual else 'FAIL', mode, name, '' if expected == actual else (expected, actual), flush=True)


def q(x): return "'" + str(x).replace("'", "''") + "'"


def scope(uid=U, org=A, staff=True):
    return f"SELECT set_config('test.uid',{q(uid or '')},false);SELECT set_config('test.org',{q(org or '')},false);SELECT set_config('test.staff','{str(staff).lower()}',false);"


def state():
    return pg.sql("SELECT jsonb_build_object('t',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable x),'p',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable_installments x),"
                  "'pay',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM receivable_payments x),'s',(SELECT jsonb_agg(to_jsonb(x) ORDER BY receivable_id) FROM platform_private.price_schedule_snapshots x),"
                  "'r',(SELECT jsonb_agg(to_jsonb(x) ORDER BY idempotency_key) FROM platform_private.price_generation_receipts x),'c',(SELECT count(*) FROM platform_private.financial_initial_installments),"
                  "'a',(SELECT count(*) FROM financial_audit_log));")


def call(payload, uid=U, org=A, staff=True, role='authenticated'):
    return scope(uid, org, staff) + f"SET ROLE {role}; SELECT public.rpc_create_price_receivable_candidate({q(json.dumps(payload))}::jsonb);"


def deny(name, sql, code, mode):
    before = state(); err = pg.sql(sql, ok=False)
    check(name, (True, True), (code in err, state() == before), mode)


def ok(sql):
    return json.loads(pg.sql(sql).splitlines()[-1])


def payload(n=3, amount='100000.00', key='price-key-0001', cust=C, **kw):
    d = dict(generation='manual_authorized', idempotency_key=key, customer_id=cust, nf_reference=NF, table_amount=amount, installment_count=n, description='SINTÉTICO Price')
    d.update(kw); return d


STUB_SETTINGS = f"""CREATE OR REPLACE FUNCTION platform_private.price_payment_settings(p_org uuid, p_customer uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN (p_org,p_customer) IN (('{A}'::uuid,'{C}'::uuid),('{B}'::uuid,'{CB}'::uuid)) THEN jsonb_build_object('credit_limit','100000.00','payment_method_id','{PM}','category_id','{K}','synthetic',true)
 ELSE (SELECT NULL::jsonb FROM (SELECT 1/0) z) END $$;"""  # SYNTHETIC: foreign pair raises
STUB_EXPOSURE = """CREATE OR REPLACE FUNCTION platform_private.price_credit_exposure(p_org uuid, p_customer uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(greatest(i.original_amount+i.interest_amount+i.penalty_amount-i.discount_amount-i.received_amount,0)),0)+coalesce(current_setting('test.extra_exposure',true),'')::text::numeric*0
   + coalesce(nullif(current_setting('test.extra_exposure',true),'')::numeric,0)
 FROM public.accounts_receivable_installments i JOIN public.accounts_receivable r ON r.id=i.receivable_id
 WHERE r.organization_id=p_org AND r.customer_id=p_customer AND i.status NOT IN ('CANCELED','CANCELLED') $$;"""  # SYNTHETIC lower-bound
STUB_NF = f"""CREATE OR REPLACE FUNCTION platform_private.price_nf_origin(p_nf uuid, p_org uuid, p_customer uuid) RETURNS date LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN p_nf='{NF}'::uuid THEN nullif(current_setting('test.nf_date',true),'')::date END $$;"""  # SYNTHETIC NF date
STUB_ACC = """CREATE OR REPLACE FUNCTION platform_private.price_accounting_gate(p_org uuid, p_customer uuid) RETURNS void LANGUAGE sql STABLE SET search_path='' AS $$ SELECT $$;"""  # SYNTHETIC
DENY_ONLY = {}


def nf(d): return f"SELECT set_config('test.nf_date','{d}',false);"


def main(out):
    pg.start(); m.schema()
    pg.sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE financial_categories(id uuid PRIMARY KEY, active boolean, type text);
      CREATE TABLE financial_cost_centers(id uuid PRIMARY KEY, active boolean);""" + f"INSERT INTO financial_categories VALUES('{K}',true,'RECEITA');")
    # Reviewed context generator + title RPC (this package's review bodies, unchanged).
    for f in ('fn_generate_receivable_installments.sql.review', 'rpc_create_financial_title.sql.review'):
        pg.sql((PKG / f).read_text())
    pg.sql("ALTER TABLE platform_private.financial_initial_installments ADD PRIMARY KEY (transaction_id,title_id,kind);")
    # Historical 10300 title through captured path BEFORE Price (must stay byte-identical).
    hist_tid, hist_inst = m.title(910)
    m.payment(hist_inst, '7550', 'hist-7550')
    hist_before = pg.sql(f"SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable_installments x WHERE receivable_id='{hist_tid}'")
    sql = bc.build().read_text()
    pg.sql(sql)
    check('candidate installs in single transaction', 't', pg.sql("SELECT to_regprocedure('public.rpc_create_price_receivable_candidate(jsonb)') IS NOT NULL"), 'INSTALL')
    check('anon has no EXECUTE', 'f', pg.sql("SELECT has_function_privilege('anon','public.rpc_create_price_receivable_candidate(jsonb)','EXECUTE')"), 'ACL')
    check('authenticated no direct table access', 'f', pg.sql("SELECT has_table_privilege('authenticated','platform_private.price_schedule_snapshots','SELECT') OR has_table_privilege('authenticated','platform_private.holiday_calendars','INSERT')"), 'ACL')
    check('authenticated cannot call private compute', 'f', pg.sql("SELECT has_function_privilege('authenticated','platform_private.price_compute(numeric,int,date,platform_private.holiday_calendars)','EXECUTE')"), 'ACL')
    # ---- Candidate as-is: denied by the real absent dependencies (in order).
    deny('candidate as-is: settings absent', nf('2026-10-29') + call(payload()), 'PAYMENT_SETTINGS_OFFICIAL_ABSENT', 'DENY_CANDIDATE_AS_IS')
    pg.sql(STUB_SETTINGS)
    deny('fiscal origin unproven', nf('2026-10-29') + call(payload()), 'FISCAL_ORIGIN_UNPROVEN', 'DENY_CANDIDATE_AS_IS')
    pg.sql(STUB_NF)
    deny('accounting gate pending', nf('2026-10-29') + call(payload()), 'C2_ACCOUNTING_PENDING', 'DENY_CANDIDATE_AS_IS')
    pg.sql(STUB_ACC)
    deny('calendar not loaded', nf('2026-10-29') + call(payload()), 'CALENDAR_SOURCE_REQUIRED', 'CALENDAR_DB')
    # ---- Calendar persistence (sealed).
    doc = bc.doc; canon = bc.sealed(); sha = doc['integrity']['sha256']
    deny('loader rejects wrong digest', f"SELECT platform_private.price_calendar_load({q(canon)},{q('0'*64)});", 'CALENDAR_INTEGRITY_MISMATCH', 'CALENDAR_DB')
    t = json.loads(json.dumps(doc)); t['coverage_end'] = '2028-12-31'; tc = bc.sealed(t)
    deny('loader rejects widened coverage (digest)', f"SELECT platform_private.price_calendar_load({q(tc)},{q(sha)});", 'CALENDAR_INTEGRITY_MISMATCH', 'CALENDAR_DB')
    t = json.loads(json.dumps(doc)); t['locality'] = 'Unaí-MG'; tc = bc.sealed(t)
    pg.sql(f"SELECT platform_private.price_calendar_load({q(tc)},{q(hashlib.sha256(tc.encode()).hexdigest())});")  # other city, self-consistent
    t2 = json.loads(json.dumps(doc)); t2['version'] = 'other-v'; t2c = bc.sealed(t2)
    pg.sql(f"SELECT platform_private.price_calendar_load({q(t2c)},{q(hashlib.sha256(t2c.encode()).hexdigest())});")
    check('authenticated cannot load calendar', 'f', pg.sql("SELECT has_function_privilege('authenticated','platform_private.price_calendar_load(text,text)','EXECUTE')"), 'CALENDAR_DB')
    deny('other-city dataset under pinned version rejected', nf('2026-10-29') + call(payload()), 'CALENDAR_LOCALITY_MISMATCH', 'CALENDAR_DB')
    pg.sql("ALTER TABLE platform_private.holiday_calendars DISABLE TRIGGER price_calendar_immutable; DELETE FROM platform_private.holiday_calendars WHERE version='paracatu-mg-2026-2027-v2'; ALTER TABLE platform_private.holiday_calendars ENABLE TRIGGER price_calendar_immutable;")  # harness-only reset as owner
    check('load official v2', 'paracatu-mg-2026-2027-v2', pg.sql(f"SELECT platform_private.price_calendar_load({q(canon)},{q(sha)});"), 'CALENDAR_DB')
    check('14+14 holidays persisted', '28', pg.sql("SELECT cardinality(holidays) FROM platform_private.holiday_calendars WHERE version='paracatu-mg-2026-2027-v2'"), 'CALENDAR_DB')
    deny('calendar UPDATE immutable', "UPDATE platform_private.holiday_calendars SET coverage_end='2028-12-31';", 'PRICE_RECORD_IMMUTABLE', 'CALENDAR_DB')
    deny('calendar DELETE immutable', "DELETE FROM platform_private.holiday_calendars;", 'PRICE_RECORD_IMMUTABLE', 'CALENDAR_DB')
    deny('calendar TRUNCATE immutable', "TRUNCATE platform_private.holiday_calendars CASCADE;", 'PRICE_RECORD_IMMUTABLE', 'CALENDAR_DB')
    # ---- SQL compute vs independent Python engine (dates and cents).
    pol = json.loads((PKG / 'arbio-fsf-policy.draft.json').read_text())
    R2 = eng.load_real_calendar(PKG / pol['active_candidate']['holiday_calendar_dataset'], pol)
    cal = "(SELECT c FROM platform_private.holiday_calendars c WHERE version='paracatu-mg-2026-2027-v2')"
    import datetime
    cases = [(amt, n, nfd) for amt in ('0.05', '1.00', '12345.67', '99999.99', '100000.00', '166666.66') for n in (1, 2, 3)
             for nfd in ('2026-01-01', '2026-08-21', '2026-10-29', '2026-12-02', '2026-12-30', '2026-12-31', '2027-01-01')]
    for amt, n, nfd in cases:
        tag = f'{amt} {n}x NF{nfd}'
        try:
            s = eng.price_schedule(eng.net_principal(amt), n); sch = eng.due_schedule(datetime.date.fromisoformat(nfd), n, R2)
            exp = [[r['interest'], r['principal'], r['payment'], x['nominal'].isoformat(), x['adjusted'].isoformat()] for r, x in zip(s['rows'], sch)]
        except eng.Rejected as e:
            exp = str(e)
        r = pg.sql(f"SELECT platform_private.price_compute({amt},{n},'{nfd}',{cal});", ok=None) if False else subprocess.run(pg.psql(), input=f"SELECT platform_private.price_compute({amt},{n},'{nfd}',{cal});".encode(), capture_output=True)
        if r.returncode == 0:
            js = json.loads(r.stdout.decode().strip())
            got = [[D(x['interest']), D(x['principal']), D(x['amount']), x['nominal_due'], x['due_date']] for x in js['rows']]
            got = got if not isinstance(exp, str) else 'ACCEPTED'
        else:
            err = r.stderr.decode(); got = next((c for c in ('PLAN_NOT_REPRESENTABLE_IN_CENTS', 'CALENDAR_COVERAGE_EXCEEDED') if c in err), err[-200:])
        check('SQL == engine ' + tag, exp, got, 'SQL_VS_ENGINE')
    # ---- Component chain: schedule -> writer -> snapshot -> payment -> reversal.
    deny('2028 due blocks whole plan', nf('2027-11-15') + call(payload(key='k-2028-blocked')), 'CALENDAR_COVERAGE_EXCEEDED', 'COMPONENT')
    deny('client schedule rejected', nf('2026-10-29') + call(payload(key='k-client-sched', installments=[])), 'PRICE_CLIENT_SCHEDULE_REJECTED', 'COMPONENT')
    deny('client rate rejected', nf('2026-10-29') + call(payload(key='k-client-rate', rate='0')), 'PRICE_CLIENT_SCHEDULE_REJECTED', 'COMPONENT')
    deny('automatic generation blocked', nf('2026-10-29') + call(payload(key='k-auto', generation='automatic')), 'AUTO_GENERATION_BLOCKED', 'COMPONENT')
    deny('4 installments rejected', nf('2026-10-29') + call(payload(4, key='k-4x')), 'INSTALLMENTS_OUT_OF_RANGE', 'COMPONENT')
    for bad, code in (('NaN', 'TABLE_AMOUNT_INVALID'), ('-1', 'TABLE_AMOUNT_INVALID'), ('1.001', 'TABLE_AMOUNT_INVALID'), (100, 'TABLE_AMOUNT_INVALID')):
        deny(f'table amount {bad!r}', nf('2026-10-29') + call(payload(amount=bad, key=f'k-bad-{bad}')), code, 'COMPONENT')
    deny('missing NF date', nf('') + call(payload(key='k-nf-missing')), 'NF_ISSUE_DATE_REQUIRED', 'COMPONENT')
    deny('no session', nf('2026-10-29') + call(payload(key='k-nouid'), uid=None), 'Sessão inválida', 'AUTH')
    deny('anon role', nf('2026-10-29') + call(payload(key='k-anon'), role='anon'), 'permission denied', 'AUTH')
    deny('non-staff denied by captured RPC', nf('2026-10-29') + call(payload(key='k-nostaff'), staff=False), 'Sem permissão', 'AUTH')
    deny('no tenant', nf('2026-10-29') + call(payload(key='k-noorg'), org=None), 'FINANCIAL_TENANT_REQUIRED', 'AUTH')
    deny('foreign customer (A actor, B customer)', nf('2026-10-29') + call(payload(key='k-foreign', cust=CB)), 'division by zero', 'AUTH')
    deny('tenant smuggling rejected', nf('2026-10-29') + call(payload(key='k-smuggle', organization_id=B)), 'PRICE_CLIENT_SCHEDULE_REJECTED', 'AUTH')
    pg.sql(STUB_EXPOSURE)
    # Limit on financed total incl. interest: hist 10300 open balance 2750 counts.
    exp_now = D(pg.sql(f"SELECT platform_private.price_credit_exposure('{A}','{C}')"))
    check('synthetic exposure = historical open balance', D('2750.00'), exp_now, 'LIMIT')
    deny('limit exceeded (100000x3 total 103621.40 > 100000)', nf('2026-10-29') + call(payload(key='k-limit')), 'LIMIT_EXCEEDED_BLOCK', 'LIMIT')
    pg.sql(STUB_EXPOSURE.replace("+ coalesce(nullif(current_setting('test.extra_exposure',true),'')::numeric,0)", "+ coalesce(nullif(current_setting('test.extra_exposure',true),'')::numeric,0) - 2750"))
    # exposure now 0 + extra; 60000 net -> 62172.84 financed (3x).
    base = nf('2026-10-29') + "SELECT set_config('test.extra_exposure','37827.17',false);"
    deny('threshold +0.01 blocked', base + call(payload(key='k-thr-plus')), 'LIMIT_EXCEEDED_BLOCK', 'LIMIT')
    base = nf('2026-10-29') + "SELECT set_config('test.extra_exposure','37827.16',false);"
    r = ok(base + call(payload(key='k-main-3x')))
    tid = r['receivable_id']
    check('exact threshold accepted', (True, False), (r['success'], r['replayed']), 'LIMIT')
    check('NF 2026-10-29 3x due dates', ['2026-11-30', '2026-12-28', '2027-01-28'], [x['due_date'] for x in r['rows']], 'COMPONENT')
    check('nominal dates kept', ['2026-11-28', '2026-12-28', '2027-01-28'], [x['nominal_due'] for x in r['rows']], 'COMPONENT')
    rows = pg.sql(f"SELECT string_agg(installment_number||':'||due_date||':'||original_amount||':'||interest_amount||':'||net_amount,',' ORDER BY installment_number) FROM accounts_receivable_installments WHERE receivable_id='{tid}'")
    check('writer rows = Price payments, interest_amount 0', '1:2026-11-30:20724.28:0.00:20724.28,2:2026-12-28:20724.28:0.00:20724.28,3:2027-01-28:20724.28:0.00:20724.28', rows, 'COMPONENT')
    check('title total = financed total', '62172.84', pg.sql(f"SELECT total_amount FROM accounts_receivable WHERE id='{tid}'"), 'COMPONENT')
    check('cents sum = total', 't', pg.sql(f"SELECT sum(original_amount)=(SELECT total_amount FROM accounts_receivable WHERE id='{tid}') FROM accounts_receivable_installments WHERE receivable_id='{tid}'"), 'COMPONENT')
    check('context consumed', '0', pg.sql("SELECT count(*) FROM platform_private.financial_initial_installments"), 'COMPONENT')
    snap = json.loads(pg.sql(f"SELECT to_jsonb(s) FROM platform_private.price_schedule_snapshots s WHERE receivable_id='{tid}'"))
    check('snapshot pins calendar version+hash', ('paracatu-mg-2026-2027-v2', bc.doc['integrity']['sha256']), (snap['calendar_version'], snap['calendar_sha256']), 'SNAPSHOT')
    check('snapshot breakdown', (['1080.00', '726.40', '366.44'], '60000.00', '1.800'), ([f"{D(x['interest']):.2f}" for x in snap['rows']], f"{D(snap['principal']):.2f}", f"{D(snap['monthly_rate_percent']):.3f}"), 'SNAPSHOT')
    deny('snapshot UPDATE immutable', f"UPDATE platform_private.price_schedule_snapshots SET financed_total=1 WHERE receivable_id='{tid}';", 'PRICE_RECORD_IMMUTABLE', 'SNAPSHOT')
    deny('snapshot DELETE immutable', "DELETE FROM platform_private.price_schedule_snapshots;", 'PRICE_RECORD_IMMUTABLE', 'SNAPSHOT')
    deny('receipt UPDATE immutable', "UPDATE platform_private.price_generation_receipts SET request_sha256='x';", 'PRICE_RECORD_IMMUTABLE', 'SNAPSHOT')
    deny('captured title snapshot guard', f"UPDATE accounts_receivable SET total_amount=1 WHERE id='{tid}';", 'imutavel', 'SNAPSHOT')
    # Replay.
    before = state()
    r2 = ok(base + call(payload(key='k-main-3x')))
    check('replay same key/payload returns same title, no writes', (tid, True, True), (r2['receivable_id'], r2['replayed'], state() == before), 'IDEMPOTENCY')
    deny('same key different payload PT409', base + call(payload(2, key='k-main-3x')), 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY')
    # Concurrency: two sessions same new key -> one title.
    pg.sql("SELECT set_config('test.extra_exposure','0',false);")
    def send(_):
        return subprocess.run(pg.psql(), input=(nf('2026-10-29') + "SELECT set_config('test.extra_exposure','0',false);" + call(payload(1, amount='1000.00', key='k-race'))).encode(), capture_output=True)
    with ThreadPoolExecutor(2) as ex: rs = list(ex.map(send, range(2)))
    ids = {json.loads(x.stdout.decode().strip().splitlines()[-1])['receivable_id'] for x in rs if x.returncode == 0}
    check('concurrent same key: both ACK, one title', (2, 1, '1'), (sum(x.returncode == 0 for x in rs), len(ids), pg.sql("SELECT count(*) FROM platform_private.price_generation_receipts WHERE idempotency_key='k-race'")), 'IDEMPOTENCY')
    # Integral rollback: success inside a transaction then forced failure.
    before = state()
    err = pg.sql(nf('2026-10-29') + scope() + "BEGIN; SET LOCAL ROLE authenticated; SELECT public.rpc_create_price_receivable_candidate(" + q(json.dumps(payload(2, amount='5000.00', key='k-rollback'))) + "::jsonb); DO $$BEGIN RAISE EXCEPTION 'FORCED_POST_FAILURE'; END$$; COMMIT;", ok=False)
    check('integral rollback after success', (True, True), ('FORCED_POST_FAILURE' in err, state() == before), 'ROLLBACK')
    # NF 2026-12-02 1x -> 04/01/2027; month-end examples.
    r3 = ok(nf('2026-12-02') + call(payload(1, amount='1000.00', key='k-dec02')))
    check('NF 2026-12-02 1x -> 2027-01-04', ['2027-01-04'], [x['due_date'] for x in r3['rows']], 'COMPONENT')
    r4 = ok(nf('2026-12-31') + call(payload(3, amount='1000.00', key='k-dec31')))
    check('NF 2026-12-31 3x month-end', (['2027-01-30', '2027-02-28', '2027-03-30'], ['2027-02-01', '2027-03-01', '2027-03-30']), ([x['nominal_due'] for x in r4['rows']], [x['due_date'] for x in r4['rows']]), 'COMPONENT')
    # Tenant B actor with own customer (A/B isolation in component scope).
    r5 = ok(nf('2026-10-29') + call(payload(2, amount='1000.00', key='k-b-own', cust=CB), uid=V, org=B))
    check('tenant B title owned by B', B, pg.sql(f"SELECT organization_id FROM accounts_receivable WHERE id='{r5['receivable_id']}'"), 'AUTH')
    deny('B actor cannot use A customer', nf('2026-10-29') + call(payload(2, amount='1000.00', key='k-b-foreign', cust=C), uid=V, org=B), 'division by zero', 'AUTH')
    # Payment and reversal through captured RPCs on Price installment 1.
    inst1 = pg.sql(f"SELECT id FROM accounts_receivable_installments WHERE receivable_id='{tid}' AND installment_number=1")
    snap_before = pg.sql("SELECT jsonb_agg(to_jsonb(s) ORDER BY receivable_id) FROM platform_private.price_schedule_snapshots s")
    pay_id, _ = m.payment(inst1, '20724.28', 'price-pay-1')
    check('payment settles installment balance 0', D('0.00'), m.balance(inst1), 'PAYMENT')
    deny('overpayment beyond Price payment denied', m.scope() + f"SELECT rpc_register_receivable_payment('{tid and pg.sql(chr(83)+'ELECT id FROM accounts_receivable_installments WHERE receivable_id='+q(tid)+' AND installment_number=2')}',{q(json.dumps(dict(amount_received='20724.29',idempotency_key='over-2',payment_method_id=PM,payment_date='2026-10-28')))}::jsonb);", 'excede', 'PAYMENT')
    m.ask(f"SELECT fn_reverse_payment('{pay_id}','receivable','LOCAL SINTÉTICO');")
    check('reversal restores Price payment balance', D('20724.28'), m.balance(inst1), 'REVERSAL')
    check('original_amount unchanged after payment/reversal', '20724.28', pg.sql(f"SELECT original_amount FROM accounts_receivable_installments WHERE id='{inst1}'"), 'REVERSAL')
    check('snapshots unchanged after payment/reversal', snap_before, pg.sql("SELECT jsonb_agg(to_jsonb(s) ORDER BY receivable_id) FROM platform_private.price_schedule_snapshots s"), 'REVERSAL')
    check('historical 10300/7550 title untouched', hist_before, pg.sql(f"SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable_installments x WHERE receivable_id='{hist_tid}'"), 'HISTORY')
    check('historical balance still 2750', D('2750.00'), m.balance(hist_inst), 'HISTORY')
    summary = {}
    for c in checks: summary.setdefault(c['mode'], {}).setdefault(c['status'], 0); summary[c['mode']][c['status']] += 1
    res = dict(level='DISPOSABLE_PG_COMPONENT_NOT_E2E', synthetic=['auth.uid/h15/staff (monetary harness)', 'payment settings stub', 'exposure lower-bound stub', 'NF origin stub', 'accounting gate stub', 'NF reference', 'customers'],
               candidate_sha256=hashlib.sha256((H / 'price-generator.sql.review').read_bytes()).hexdigest(), checks=checks, summary=summary,
               fail=sum(c['status'] == 'FAIL' for c in checks))
    if out: pathlib.Path(out).write_text(json.dumps(res, indent=1, ensure_ascii=False, default=str))
    print(json.dumps(dict(total=len(checks), fail=res['fail'], summary=summary)))
    return res['fail']


if __name__ == '__main__':
    raise SystemExit(1 if main(sys.argv[1] if len(sys.argv) > 1 else None) else 0)
