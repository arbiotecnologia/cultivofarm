"""Disposable PostgreSQL ONLY — component test, NOT an authorized E2E.
Reuses the monetary harness schema (captured receivable/payment/reversal/snapshot bodies,
synthetic Auth/h15/staff), installs the reviewed context generator and title RPC of the
installments package, then the INACTIVE Price candidate. The four unproven dependencies
(payment settings, canonical exposure, fiscal NF origin, accounting gate) stay deny-only and
are replaced ONLY by explicitly SYNTHETIC stubs for component steps. No hosted connection.
"""
import hashlib, importlib.util, json, re, subprocess, sys, pathlib
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
# SYNTHETIC partners/debtors for canonical exposure composition (never real ids).
PA, PB = 'a0000000-0000-4000-8000-0000000000a1', 'b0000000-0000-4000-8000-0000000000b1'
CX, PX, PY = 'c0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-0000000000a3'
C3, C4, C5, C6, C7 = ('c0000000-0000-4000-8000-0000000000c%d' % k for k in (3, 4, 5, 6, 7))
# debtor -> partner for empty/reciprocal (Z), exact B2B (W), overdue block (O), overdue no block (N), inactive settings (I)
CZ, CW, CO, CN, CI = ('c0000000-0000-4000-8000-0000000000d%d' % k for k in range(1, 6))
PZ, PW, PO, PN, PI = ('a0000000-0000-4000-8000-0000000000e%d' % k for k in range(1, 6))
EXTRA_A = (CX, C3, C4, C5, C6, C7, CZ, CW, CO, CN, CI)
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
    if code not in err: print('   ERR:', err.strip().splitlines()[0][:300])


def ok(sql):
    return json.loads(pg.sql(sql).splitlines()[-1])


def payload(n=3, amount='100000.00', key='price-key-0001', cust=C, **kw):
    d = dict(generation='manual_authorized', idempotency_key=key if key.startswith('price-') else 'price-' + key, customer_id=cust, nf_reference=NF, table_amount=amount, installment_count=n, description='SINTÉTICO Price')
    d.update(kw); return d


STUB_SETTINGS = f"""CREATE OR REPLACE FUNCTION platform_private.price_payment_settings(p_org uuid, p_customer uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN (p_org,p_customer) IN (('{A}'::uuid,'{C}'::uuid),('{B}'::uuid,'{CB}'::uuid)) OR (p_org='{A}'::uuid AND p_customer IN ({','.join("'%s'::uuid" % x for x in EXTRA_A)})) THEN jsonb_build_object('credit_limit','100000.00','payment_method_id','{PM}','category_id','{K}','synthetic',true)
 END $$;"""  # SYNTHETIC: foreign pair -> NULL (absent)
STUB_EXPOSURE = """CREATE OR REPLACE FUNCTION platform_private.price_credit_exposure(p_org uuid, p_customer uuid, p_partner uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(greatest(i.original_amount+i.interest_amount+i.penalty_amount-i.discount_amount-i.received_amount,0)),0)
   + coalesce(nullif(current_setting('test.extra_exposure',true),'')::numeric,0)
 FROM public.accounts_receivable_installments i JOIN public.accounts_receivable r ON r.id=i.receivable_id
 WHERE r.organization_id=p_org AND r.customer_id=p_customer AND i.status NOT IN ('CANCELED','CANCELLED') $$;"""  # SYNTHETIC lower-bound
STUB_NF = f"""CREATE OR REPLACE FUNCTION platform_private.price_nf_origin(p_nf uuid, p_org uuid, p_customer uuid) RETURNS date LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN p_nf='{NF}'::uuid THEN nullif(current_setting('test.nf_date',true),'')::date END $$;"""  # SYNTHETIC NF date
STUB_ACC = """CREATE OR REPLACE FUNCTION platform_private.price_accounting_gate(p_org uuid, p_customer uuid) RETURNS void LANGUAGE sql STABLE SET search_path='' AS $$ SELECT $$;"""  # SYNTHETIC


U2 = '99999999-9999-4999-8999-999999999992'   # SYNTHETIC second staff actor, tenant A
U3 = '99999999-9999-4999-8999-999999999993'   # SYNTHETIC third staff actor, revoked during wait


def held(sql):
    """Open transaction that performs `sql` and stays open (holds its locks)."""
    p = subprocess.Popen(pg.psql(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write("SET statement_timeout='15s'; SELECT pg_backend_pid(); BEGIN; " + sql + " SELECT 'HELD';\n"); p.stdin.flush()
    lines = []
    while True:
        ln = p.stdout.readline()
        if not ln: raise AssertionError('holder died: ' + p.stderr.read()[-300:])
        if ln.strip() == 'HELD': break
        lines.append(ln.strip())
    pid = int(lines[0]); out = lines[-1]
    return p, pid, out


def finish(p, verb):
    try:
        p.stdin.write(verb + ";\n"); p.stdin.close(); p.wait(timeout=10)
    finally:
        if p.poll() is None: p.kill()


def waiter(sql, tag):
    box = {}
    def run():
        box['r'] = subprocess.run(pg.psql(), input=(f"SET application_name='{tag}'; SET statement_timeout='15s';" + sql).encode(), capture_output=True)
    import threading, time
    t = threading.Thread(target=run, daemon=True); t.start()
    blocked = None
    for _ in range(100):
        blocked = pg.sql(f"SELECT coalesce((SELECT pg_blocking_pids(pid)::text FROM pg_stat_activity WHERE application_name='{tag}' AND wait_event_type='Lock'),'')")
        if blocked: break
        time.sleep(0.05)
    return t, box, blocked


def exposure(): return D(pg.sql(f"SELECT platform_private.price_credit_exposure('{A}','{C}','{PA}')"))


def debtor_races():
    """Two DIFFERENT actors, DIFFERENT keys, SAME tenant+debtor; each fits alone, sum exceeds."""
    pg.sql("CREATE TABLE public.test_staff_revoked(uid uuid PRIMARY KEY);"  # SYNTHETIC revocation seam
           "CREATE OR REPLACE FUNCTION is_financial_staff(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1=auth.uid() AND current_setting('test.staff',true)='true' AND NOT EXISTS(SELECT 1 FROM public.test_staff_revoked WHERE uid=$1)$$;")
    e0 = exposure(); f = D('20000.00'); extra = D('100000.00') - e0 - D('30000.00')  # e0+extra+f=90000 fits, +2f=110000 exceeds
    env = nf('2026-10-29') + f"SELECT set_config('test.extra_exposure','{extra}',false);"
    one = lambda key, uid: env + scope(uid) + "SET LOCAL ROLE authenticated; SELECT public.rpc_create_price_receivable_candidate(" + q(json.dumps(payload(1, amount='33333.33', key=key))) + "::jsonb);"
    check('race setup: each request fits alone, sum exceeds', (True, False), (e0 + extra + f <= 100000, e0 + extra + 2 * f <= 100000), 'DEBTOR_RACE')
    before = state()
    p1, pid1, out1 = held(one('k-race-debtor-u', U))
    t, box, blocked = waiter(env + call(payload(1, amount='33333.33', key='k-race-debtor-u2'), uid=U2), 'price-w2')
    check('second actor waits on first via pg_blocking_pids', '{' + str(pid1) + '}', blocked, 'DEBTOR_RACE')
    finish(p1, 'COMMIT'); t.join(15)
    err = box['r'].stderr.decode()
    check('exactly 1 success + 1 LIMIT refusal (different actors/keys)', (True, True, True), (json.loads(out1)['success'], box['r'].returncode != 0, 'LIMIT_EXCEEDED_BLOCK' in err), 'DEBTOR_RACE')
    check('only one new title/receipt', (1, 1), (len(json.loads(state())['t'] or []) - len(json.loads(before)['t'] or []), len(json.loads(state())['r'] or []) - len(json.loads(before)['r'] or [])), 'DEBTOR_RACE')
    check('fresh exposure after commit includes winner', e0 + f, exposure(), 'DEBTOR_RACE')
    # Different debtor is NOT serialized behind the lock (tenant B customer CB).
    p1, pid1, _ = held(env + scope(U) + "SELECT pg_advisory_xact_lock(hashtextextended('price-debtor|" + A + "|" + C + "', 11));")
    rb = subprocess.run(pg.psql(), input=(nf('2026-10-29') + "SET lock_timeout='500ms';" + call(payload(1, amount='100.00', key='k-race-other-debtor', cust=CB), uid=V, org=B)).encode(), capture_output=True)
    finish(p1, 'ROLLBACK')
    check('other debtor proceeds while A|C held', 0, rb.returncode, 'DEBTOR_RACE')
    # Revocation during wait: staff revoked while blocked -> denied after lock, nothing written.
    pg.sql("SELECT set_config('test.extra_exposure','0',false);")
    env0 = nf('2026-10-29')
    p1, pid1, _ = held(env0 + scope(U) + "SELECT pg_advisory_xact_lock(hashtextextended('price-debtor|" + A + "|" + C + "', 11));")
    before = state()
    t, box, blocked = waiter(env0 + call(payload(1, amount='100.00', key='k-race-revoked'), uid=U3), 'price-w3')
    check('revocation case: waiter blocked by holder', '{' + str(pid1) + '}', blocked, 'REVOCATION_WAIT')
    pg.sql(f"INSERT INTO public.test_staff_revoked VALUES('{U3}');")
    finish(p1, 'ROLLBACK'); t.join(15)
    check('revoked during wait -> denied after lock, state unchanged', (True, True), ('Sem permissão' in box['r'].stderr.decode(), state() == before), 'REVOCATION_WAIT')
    # Same-KEY wait + revocation: replay of an existing receipt must be denied after the key lock.
    U4 = '99999999-9999-4999-8999-999999999994'  # SYNTHETIC staff actor
    r0 = ok(env0 + call(payload(1, amount='100.00', key='k-replay-revoke'), uid=U4))
    rl = ok(env0 + call(payload(1, amount='100.00', key='k-replay-revoke'), uid=U4))
    check('legitimate replay idempotent before revocation', (r0['receivable_id'], True), (rl['receivable_id'], rl['replayed']), 'REPLAY_REVOCATION')
    keylock = "SELECT pg_advisory_xact_lock(hashtextextended('" + U4 + "|" + A + "|price-k-replay-revoke', 7));"
    p1, pid1, _ = held(keylock)
    before = state()
    t, box, blocked = waiter(env0 + call(payload(1, amount='100.00', key='k-replay-revoke'), uid=U4), 'price-w4')
    check('replay waiter blocked on same KEY lock', '{' + str(pid1) + '}', blocked, 'REPLAY_REVOCATION')
    pg.sql(f"INSERT INTO public.test_staff_revoked VALUES('{U4}');")  # committed before release
    finish(p1, 'ROLLBACK'); t.join(15)
    out4, err4 = box['r'].stdout.decode(), box['r'].stderr.decode()
    check('revoked replay denied, no result exposed, no mutation', (True, False, True), ('Sem permissão' in err4, r0['receivable_id'] in out4, state() == before), 'REPLAY_REVOCATION')
    pg.sql(f"DELETE FROM public.test_staff_revoked WHERE uid='{U4}';")
    rl2 = ok(env0 + call(payload(1, amount='100.00', key='k-replay-revoke'), uid=U4))
    check('replay idempotent again after re-grant, no writes', (r0['receivable_id'], True, True), (rl2['receivable_id'], rl2['replayed'], state() == before), 'REPLAY_REVOCATION')
    # Non-RC isolation refused before any lock/write.
    for lvl in ('REPEATABLE READ', 'SERIALIZABLE'):
        before = state()
        err = pg.sql(env0 + scope(U2) + f"BEGIN ISOLATION LEVEL {lvl}; SET LOCAL ROLE authenticated; SELECT public.rpc_create_price_receivable_candidate(" + q(json.dumps(payload(1, amount='100.00', key='k-iso-' + lvl[:3]))) + "::jsonb); COMMIT;", ok=False)
        check(f'{lvl} refused (stale snapshot), state unchanged', (True, True), ('PRICE_ISOLATION_READ_COMMITTED_REQUIRED' in err, state() == before), 'ISOLATION')


def b2b_title(n, total, cust, partner, due=30):
    """SYNTHETIC B2B title carrying partner_id, through the captured generator path (owner insert)."""
    order, terms, tid = m.uid(n), m.uid(n + 10000), m.uid(n + 20000)
    pg.sql(f"INSERT INTO partner_orders(id,payment_terms_id,c2_external_origin_snapshot,partner_id,status,total,final_amount_with_interest,receivable_generated) VALUES('{order}','{terms}','{{}}'::jsonb,'{partner}','entregue',{total},{total},true);"
           f"INSERT INTO partner_order_payment_schedule(partner_order_id,payment_terms_id,installment_number,due_date,amount,principal_amount,interest_amount) VALUES('{order}','{terms}',1,CURRENT_DATE+{due},{total},{total},0);")
    m.ask(f"INSERT INTO accounts_receivable(id,origin_type,origin_id,description,category_id,total_amount,first_due_date,installment_count,created_by,organization_id,customer_id,partner_id) VALUES('{tid}','B2B_ORDER','{order}','SYNTHETIC B2B','{K}',{total},CURRENT_DATE+{due},1,'{U}','{A}','{cust}','{partner}');", A)
    return tid, pg.sql(f"SELECT id FROM accounts_receivable_installments WHERE receivable_id='{tid}'")


def order(partner, status, amount, generated=False, link=False):
    oid = pg.sql(f"INSERT INTO partner_orders(id,payment_terms_id,partner_id,status,total,final_amount_with_interest,receivable_generated) VALUES(gen_random_uuid(),gen_random_uuid(),'{partner}','{status}',{amount},{amount},{str(generated).lower()}) RETURNING id;").splitlines()[0]
    if link: pg.sql(f"INSERT INTO public.partner_order_financial_links(partner_order_id) VALUES('{oid}');")
    return oid


def canonical_exposure():
    """Captured fn_b2b_credit_exposure + ORIGINAL tg_partner_orders_credit_guard; component evidence, not E2E."""
    real = re.search(r"CREATE FUNCTION platform_private\.price_credit_exposure.*?END \$\$;", bc.build().read_text(), re.S).group(0)
    pg.sql(real.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION', 1))  # restore candidate body over the earlier stub
    live = json.loads((PKG / 'receivable-recursive-live-20261029.json').read_text())
    g = next(f for f in live['functions'] if f['name'] == 'tg_partner_orders_credit_guard')
    pg.sql(g['body'] + ';')
    trg = next(t['definition'] for r in live['relations'] if r['name'] == 'partner_orders' for t in (r['triggers'] or []) if t['name'] == 'trg_partner_orders_credit_guard')
    pg.sql(trg + ';')
    check('ORIGINAL tg_partner_orders_credit_guard installed (md5) + captured trigger DDL', g['md5'], pg.sql("SELECT md5(pg_get_functiondef('public.tg_partner_orders_credit_guard()'::regprocedure))"), 'B2B_GUARD')
    tid, inst = b2b_title(950, '10000.00', CX, PX)
    m.payment(inst, '1000', 'b2b-cx-1000')
    order(PX, 'aprovado', '2000.00'); order(PX, 'em_analise_comercial', '1500.00')
    order(PX, 'entregue', '5000.00', generated=True); order(PX, 'aprovado', '3000.00', link=True)
    order(PX, 'cancelado', '999.00'); order(PX, 'rascunho', '444.00'); order(PY, 'aprovado', '7777.00')
    fx = json.loads(pg.sql(f"SELECT public.fn_b2b_credit_exposure('{PX}',0,NULL)"))
    check('canonical: open net of payment events 10000-1000', D('9000.00'), D(str(fx['saldo_em_aberto'])), 'EXPOSURE_CANON')
    check('canonical: committed/pending exclude generated, linked, canceled, draft, other partner', (D('2000.00'), D('1500.00'), D('12500.00')), (D(str(fx['comprometido_nao_faturado'])), D(str(fx['comprometido_pendente'])), D(str(fx['exposicao_atual']))), 'EXPOSURE_CANON')
    xp = lambda c=CX, p=PX: D(pg.sql(f"SELECT platform_private.price_credit_exposure('{A}','{c}','{p}')"))
    cx = lambda p, amt=0: json.loads(pg.sql(f"SELECT public.fn_b2b_credit_exposure('{p}',{amt},NULL)"))
    st = lambda oid: pg.sql(f"SELECT status||'|'||coalesce(credit_block_reason,'') FROM partner_orders WHERE id='{oid}'")
    check('candidate exposure = canonical (no Price titles yet)', D('12500.00'), xp(), 'EXPOSURE_CANON')
    env = nf('2026-10-29')
    before = state()
    p1, pid1, out = held(f"INSERT INTO partner_orders(id,payment_terms_id,partner_id,status,total,final_amount_with_interest) VALUES(gen_random_uuid(),gen_random_uuid(),'{PX}','pendente',50000,50000) RETURNING id;")
    t, box, blocked = waiter(env + call(payload(1, amount='66666.67', key='k-canon-race', cust=CX), uid=U2), 'price-w5')
    check('B2B->Price: Price waits on guard-held b2b_credit', '{' + str(pid1) + '}', blocked, 'EXPOSURE_RACE')
    finish(p1, 'COMMIT'); t.join(15)
    check('B2B order accepted by original guard (62500 <= limit)', 'pendente|', st(out), 'EXPOSURE_RACE')
    check('B2B->Price: 12500+50000+40000 refused, no write', (True, True), ('LIMIT_EXCEEDED_BLOCK' in box['r'].stderr.decode(), json.loads(state())['t'] == json.loads(before)['t']), 'EXPOSURE_RACE')
    r = ok(env + call(payload(1, amount='62500.00', key='k-canon-exact', cust=CX)))
    check('Price exact remaining 37500 accepted (limit 100000)', (True, '37500.00'), (r['success'], f"{D(str(r['financed_total'])):.2f}"), 'EXPOSURE_LIMIT')
    check('Price title carries server-derived partner_id', PX, pg.sql(f"SELECT partner_id FROM accounts_receivable WHERE id='{r['receivable_id']}'"), 'PARTNER_CONTEXT')
    check('context consumed exactly once', '0', pg.sql("SELECT count(*) FROM platform_private.price_title_partner_context"), 'PARTNER_CONTEXT')
    check('canonical now SEES Price title (no harness patch)', D('100000.00'), D(str(cx(PX)['exposicao_atual'])), 'EXPOSURE_LIMIT')
    check('candidate = canonical, no double count', D('100000.00'), xp(), 'EXPOSURE_LIMIT')
    deny('Price +0.01 over limit blocked', env + call(payload(1, amount='0.02', key='k-canon-plus', cust=CX)), 'LIMIT_EXCEEDED_BLOCK', 'EXPOSURE_LIMIT')
    check('B2B +0.01 after Price blocked by ORIGINAL guard', 'aguardando_aprovacao_credito|limite_excedido_bloqueado', st(order(PX, 'pendente', '0.01')), 'EXPOSURE_LIMIT')
    deny('payload partner_id rejected (never trusted)', env + call(payload(1, amount='100.00', key='k-partner-smuggle', cust=CZ, partner_id=PY)), 'PRICE_CLIENT_SCHEDULE_REJECTED', 'PARTNER_CONTEXT')
    pg.sql(f"INSERT INTO platform_private.price_title_partner_context VALUES(1,'{U}','{A}','{CW}','{PY}');")  # SYNTHETIC stale row of another txid
    ra = ok(env + call(payload(1, amount='100.00', key='k-replay-partner', cust=CW)))
    rb = ok(env + call(payload(1, amount='100.00', key='k-replay-partner', cust=CW)))
    check('stale other-txid context inert; replay keeps one title with validated partner', (ra['receivable_id'], True, PW), (rb['receivable_id'], rb['replayed'], pg.sql(f"SELECT partner_id FROM accounts_receivable WHERE id='{ra['receivable_id']}'")), 'PARTNER_CONTEXT')
    pg.sql("ALTER TABLE platform_private.price_title_partner_context DISABLE ROW LEVEL SECURITY; DELETE FROM platform_private.price_title_partner_context WHERE transaction_id=1;")  # owner cleanup of synthetic row
    check('empty partner exposure 0', D('0.00'), xp(CZ, PZ), 'EXPOSURE_EMPTY')
    p1, pid1, out = held(env + scope(U2) + "SET LOCAL ROLE authenticated; SELECT public.rpc_create_price_receivable_candidate(" + q(json.dumps(payload(1, amount='100000.00', key='k-recip', cust=CZ))) + "::jsonb);")
    t, box, blocked = waiter(f"INSERT INTO partner_orders(id,payment_terms_id,partner_id,status,total,final_amount_with_interest) VALUES(gen_random_uuid(),gen_random_uuid(),'{PZ}','pendente',40000.01,40000.01) RETURNING id;", 'b2b-w1')
    check('Price->B2B: original guard waits on Price b2b_credit', '{' + str(pid1) + '}', blocked, 'EXPOSURE_RACE')
    finish(p1, 'COMMIT'); t.join(15)
    oz = box['r'].stdout.decode().strip().splitlines()[-1]
    check('Price->B2B: after commit 60000+40000.01 blocked by guard', 'aguardando_aprovacao_credito|limite_excedido_bloqueado', st(oz), 'EXPOSURE_RACE')
    ok(env + call(payload(1, amount='100000.00', key='k-w-60000', cust=CW)))
    check('B2B exact remaining 39940 (60+60000 Price) accepted by guard', 'pendente|', st(order(PW, 'pendente', '39940.00')), 'EXPOSURE_LIMIT')
    check('B2B +0.01 blocked by guard', 'aguardando_aprovacao_credito|limite_excedido_bloqueado', st(order(PW, 'pendente', '0.01')), 'EXPOSURE_LIMIT')
    b2b_title(960, '500.00', CO, PO, due=-10); b2b_title(970, '500.00', CN, PN, due=-10)
    check('overdue counted', (True, D('500.00')), (cx(PO)['tem_vencidos'], D(str(cx(PO)['saldo_vencido']))), 'OVERDUE')
    deny('Price blocked when overdue and block_if_overdue', env + call(payload(1, amount='100.00', key='k-overdue-block', cust=CO)), 'CREDIT_OVERDUE_BLOCK', 'OVERDUE')
    check('B2B blocked by guard for overdue', 'aguardando_aprovacao_credito|inadimplencia', st(order(PO, 'pendente', '100.00')), 'OVERDUE')
    ok(env + call(payload(1, amount='100.00', key='k-overdue-noblock', cust=CN)))
    check('overdue without block: Price allowed, overdue still counted', D('560.00'), xp(CN, PN), 'OVERDUE')
    deny('Price denied when partner settings inactive', env + call(payload(1, amount='100.00', key='k-inactive', cust=CI)), 'CREDIT_SETTINGS_INACTIVE', 'SETTINGS_INACTIVE')
    check('observed: original guard ignores settings.active', 'pendente|', st(order(PI, 'pendente', '100.00')), 'SETTINGS_INACTIVE')
    for cust, code, label in ((C3, 'CREDIT_PARTNER_LINK_REQUIRED', 'no partner link'), (C4, 'CREDIT_PARTNER_LINK_AMBIGUOUS', 'two active partners'),
                              (C5, 'CREDIT_PARTNER_LINK_REQUIRED', 'inactive partner'), (C6, 'CREDIT_LIMIT_CONTRADICTION', 'partner limit 50000 vs policy 100000'),
                              (C7, 'CREDIT_NO_LIMIT_DEFINED', 'partner without settings')):
        deny('gate: ' + label, env + call(payload(1, amount='100.00', key='k-gate-' + cust[-2:], cust=cust)), code, 'EXPOSURE_GATES')
    deny('tenant B actor cannot reach A debtor CX', env + call(payload(1, amount='100.00', key='k-b-cx', cust=CX), uid=V, org=B), 'PAYMENT_SETTINGS_OFFICIAL_ABSENT', 'EXPOSURE_GATES')
    check('other partner exposure unaffected', D('7777.00'), D(str(cx(PY)['exposicao_atual'])), 'EXPOSURE_CANON')


def nf(d): return f"SELECT set_config('test.nf_date','{d}',false);"


def main(out):
    pg.start(); m.schema()
    pg.sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE financial_categories(id uuid PRIMARY KEY, active boolean, type text);
      CREATE TABLE financial_cost_centers(id uuid PRIMARY KEY, active boolean);""" + f"INSERT INTO financial_categories VALUES('{K}',true,'RECEITA');")
    # Captured d51_5 tenant-link trigger composed over a SYNTHETIC clientes fixture (id->tenant only).
    pg.sql(f"CREATE TABLE public.clientes(id uuid PRIMARY KEY, organization_id uuid NOT NULL); INSERT INTO public.clientes VALUES('{C}','{A}'),('{CB}','{B}');")  # SYNTHETIC
    pg.sql(f"INSERT INTO public.clientes SELECT unnest(ARRAY[{','.join(q(x) for x in EXTRA_A)}]::uuid[]),'{A}';")
    # Reduced B2B schema (only columns read by the captured exposure body), SYNTHETIC rows.
    pg.sql(f"""ALTER TABLE partner_orders ADD COLUMN partner_id uuid, ADD COLUMN status text, ADD COLUMN total numeric(14,2),
      ADD COLUMN final_amount_with_interest numeric(14,2), ADD COLUMN receivable_generated boolean DEFAULT false;
      CREATE TABLE public.partner_order_financial_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid);
      CREATE TABLE public.partner_financial_settings(partner_id uuid PRIMARY KEY, credit_limit numeric(14,2), overdue_tolerance_days int, block_if_overdue boolean, credit_limit_action text, active boolean);
      CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, client_id uuid, ativo boolean, commercial_owner_organization_id uuid);
      INSERT INTO public.partner_accounts VALUES('{PA}','{C}',true,'{A}'),('{PB}','{CB}',true,'{B}'),('{PX}','{CX}',true,'{A}'),('{PY}',NULL,true,'{A}'),
        ('a0000000-0000-4000-8000-0000000000a4','{C4}',true,'{A}'),('a0000000-0000-4000-8000-0000000000a5','{C4}',true,'{A}'),
        ('a0000000-0000-4000-8000-0000000000a6','{C5}',false,'{A}'),('a0000000-0000-4000-8000-0000000000a7','{C6}',true,'{A}'),('a0000000-0000-4000-8000-0000000000a8','{C7}',true,'{A}');
      INSERT INTO public.partner_financial_settings VALUES('{PA}',100000,0,false,'block',true),('{PB}',100000,0,false,'block',true),('{PX}',100000,0,false,'block',true),('{PY}',100000,0,false,'block',true),
        ('a0000000-0000-4000-8000-0000000000a7',50000,0,false,'block',true);
      INSERT INTO public.partner_accounts VALUES('{PZ}','{CZ}',true,'{A}'),('{PW}','{CW}',true,'{A}'),('{PO}','{CO}',true,'{A}'),('{PN}','{CN}',true,'{A}'),('{PI}','{CI}',true,'{A}');
      INSERT INTO public.partner_financial_settings VALUES('{PZ}',100000,0,false,'block',true),('{PW}',100000,0,false,'block',true),('{PO}',100000,0,true,'block',true),('{PN}',100000,0,false,'block',true),('{PI}',100000,0,false,'block',false);
      ALTER TABLE partner_orders ADD COLUMN credit_approved_by uuid, ADD COLUMN credit_block_reason text;""")
    fx = next(f for f in json.loads((PKG / 'receivable-recursive-live-20261029.json').read_text())['functions'] if f['name'] == 'fn_b2b_credit_exposure')
    pg.sql(fx['body'] + ';'); pg.sql("REVOKE ALL ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) FROM PUBLIC;")
    check('captured fn_b2b_credit_exposure installed exact (md5)', fx['md5'], pg.sql("SELECT md5(pg_get_functiondef('public.fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure))"), 'EXPOSURE_CANON')
    m.install('d51_5_validate_financial_tenant_links()')
    d51 = [(t['name'], tr['definition']) for t in m.LIVE['tables'] if t['name'] in ('accounts_receivable', 'accounts_receivable_installments', 'receivable_payments', 'financial_receipts') for tr in (t['triggers'] or []) if tr['name'] == 'd51_5_validate_tenant_links']
    for _, ddl in d51: pg.sql(ddl + ';')
    check('captured d51_5 trigger installed on 4 tables (md5-pinned body)', 4, len(d51), 'D51_5')
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
        r = subprocess.run(pg.psql(), input=f"SELECT platform_private.price_compute({amt},{n},'{nfd}',{cal});".encode(), capture_output=True)
        if r.returncode == 0:
            js = json.loads(r.stdout.decode().strip(), parse_float=D)
            got = [[D(x["interest"]).quantize(D("0.01")), D(x["principal"]).quantize(D("0.01")), D(x["amount"]).quantize(D("0.01")), x['nominal_due'], x['due_date']] for x in js['rows']]
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
    deny('foreign customer (A actor, B customer)', nf('2026-10-29') + call(payload(key='k-foreign', cust=CB)), 'PAYMENT_SETTINGS_OFFICIAL_ABSENT', 'AUTH')
    deny('tenant smuggling rejected', nf('2026-10-29') + call(payload(key='k-smuggle', organization_id=B)), 'PRICE_CLIENT_SCHEDULE_REJECTED', 'AUTH')
    pg.sql(STUB_EXPOSURE)
    # Limit on financed total incl. interest: hist 10300 open balance 2750 counts.
    exp_now = exposure()
    check('synthetic exposure = historical open balance', D('2750.00'), exp_now, 'LIMIT')
    # exposure 2750 (historical) + extra; 100000 table -> 60000 net -> 62172.84 financed (3x).
    base = nf('2026-10-29') + "SELECT set_config('test.extra_exposure','35077.17',false);"
    deny('financed total incl. interest +0.01 over limit blocked', base + call(payload(key='k-thr-plus')), 'LIMIT_EXCEEDED_BLOCK', 'LIMIT')
    base = nf('2026-10-29') + "SELECT set_config('test.extra_exposure','35077.16',false);"
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
    deny('receipt DELETE immutable', "DELETE FROM platform_private.price_generation_receipts;", 'PRICE_RECORD_IMMUTABLE', 'SNAPSHOT')
    deny('receipt TRUNCATE immutable', "TRUNCATE platform_private.price_generation_receipts;", 'PRICE_RECORD_IMMUTABLE', 'SNAPSHOT')
    deny('d51_5: AR of tenant A with tenant B customer', f"INSERT INTO accounts_receivable(origin_type,description,category_id,total_amount,first_due_date,installment_count,created_by,organization_id,customer_id) VALUES('MANUAL','x','{K}',10,CURRENT_DATE,1,'{U}','{A}','{CB}');", 'FINANCIAL_CUSTOMER_TENANT_MISMATCH', 'D51_5')
    deny('d51_5: installment re-pointed to foreign tenant', f"UPDATE accounts_receivable_installments SET organization_id='{B}' WHERE receivable_id='{tid}' AND installment_number=3;", 'FINANCIAL_RECEIVABLE_TENANT_MISMATCH', 'D51_5')
    check('d51_5: Price title/installments tenant-consistent', 'A|3', pg.sql(f"SELECT CASE WHEN r.organization_id='{A}' THEN 'A' END||'|'||count(*) FROM accounts_receivable r JOIN accounts_receivable_installments i ON i.receivable_id=r.id AND i.organization_id=r.organization_id WHERE r.id='{tid}' GROUP BY r.organization_id"), 'D51_5')
    deny('captured title snapshot guard', f"UPDATE accounts_receivable SET total_amount=1 WHERE id='{tid}';", 'imutavel', 'SNAPSHOT')
    # Replay.
    before = state()
    r2 = ok(base + call(payload(key='k-main-3x')))  # replay must not re-check limit nor write
    check('replay same key/payload returns same title, no writes', (tid, True, True), (r2['receivable_id'], r2['replayed'], state() == before), 'IDEMPOTENCY')
    deny('same key different payload PT409', base + call(payload(2, key='k-main-3x')), 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY')
    # Concurrency: two sessions same new key -> one title.
    pg.sql("SELECT set_config('test.extra_exposure','0',false);")
    def send(_):
        return subprocess.run(pg.psql(), input=(nf('2026-10-29') + "SELECT set_config('test.extra_exposure','0',false);" + call(payload(1, amount='1000.00', key='k-race'))).encode(), capture_output=True)
    with ThreadPoolExecutor(2) as ex: rs = list(ex.map(send, range(2)))
    ids = {json.loads(x.stdout.decode().strip().splitlines()[-1])['receivable_id'] for x in rs if x.returncode == 0}
    check('concurrent same key: both ACK, one title', (2, 1, '1'), (sum(x.returncode == 0 for x in rs), len(ids), pg.sql("SELECT count(*) FROM platform_private.price_generation_receipts WHERE idempotency_key='price-k-race'")), 'IDEMPOTENCY')
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
    deny('B actor cannot use A customer', nf('2026-10-29') + call(payload(2, amount='1000.00', key='k-b-foreign', cust=C), uid=V, org=B), 'PAYMENT_SETTINGS_OFFICIAL_ABSENT', 'AUTH')
    # numeric(14,2) ceiling: reject clearly, no unexpected overflow.
    for amt, want in (('999999999999.99', 'OK'), ('1000000000000.00', 'TABLE_AMOUNT_INVALID'), ('1e20', 'TABLE_AMOUNT_INVALID'), ('99999999999999999999999999.99', 'TABLE_AMOUNT_INVALID')):
        for n in (1, 3):
            rr = subprocess.run(pg.psql(), input=f"SELECT (platform_private.price_compute({amt},{n},'2026-10-29',{cal})->>'financed_total');".encode(), capture_output=True)
            got = 'OK' if rr.returncode == 0 else ('TABLE_AMOUNT_INVALID' if 'TABLE_AMOUNT_INVALID' in rr.stderr.decode() else rr.stderr.decode()[-160:])
            check(f'compute edge {amt} {n}x', want, got, 'NUMERIC_EDGE')
            if rr.returncode == 0: check(f'compute edge {amt} {n}x fits numeric(14,2)', 't', pg.sql(f"SELECT ({q(rr.stdout.decode().strip())}::numeric)::numeric(14,2) IS NOT NULL"), 'NUMERIC_EDGE')
    deny('RPC at ceiling: limit blocks before any write (no overflow)', nf('2026-10-29') + call(payload(3, amount='999999999999.99', key='k-ceiling')), 'LIMIT_EXCEEDED_BLOCK', 'NUMERIC_EDGE')
    deny('RPC above ceiling rejected', nf('2026-10-29') + call(payload(3, amount='1000000000000.00', key='k-over-ceiling')), 'TABLE_AMOUNT_INVALID', 'NUMERIC_EDGE')
    debtor_races()
    canonical_exposure()
    # Payment and reversal through captured RPCs on Price installment 1.
    inst1 = pg.sql(f"SELECT id FROM accounts_receivable_installments WHERE receivable_id='{tid}' AND installment_number=1")
    snap_before = pg.sql("SELECT jsonb_agg(to_jsonb(s) ORDER BY receivable_id) FROM platform_private.price_schedule_snapshots s")
    pay_id, _ = m.payment(inst1, '20724.28', 'price-pay-1')
    check('payment settles installment balance 0', D('0.00'), m.balance(inst1), 'PAYMENT')
    inst2 = pg.sql(f"SELECT id FROM accounts_receivable_installments WHERE receivable_id='{tid}' AND installment_number=2")
    over = dict(amount_received='20724.29', idempotency_key='price-over-2', payment_method_id=PM, payment_date='2026-10-28')
    deny('overpayment beyond Price payment denied', m.scope() + f"SELECT rpc_register_receivable_payment('{inst2}',{q(json.dumps(over))}::jsonb);", 'excede', 'PAYMENT')
    m.ask(f"SELECT fn_reverse_payment('{pay_id}','receivable','LOCAL SINTÉTICO');")
    check('reversal restores Price payment balance', D('20724.28'), m.balance(inst1), 'REVERSAL')
    check('original_amount unchanged after payment/reversal', '20724.28', pg.sql(f"SELECT original_amount FROM accounts_receivable_installments WHERE id='{inst1}'"), 'REVERSAL')
    check('snapshots unchanged after payment/reversal', snap_before, pg.sql("SELECT jsonb_agg(to_jsonb(s) ORDER BY receivable_id) FROM platform_private.price_schedule_snapshots s"), 'REVERSAL')
    # NOTE: this is a fixture-preservation check (10300 title + 7550 payment -> 2750), NOT the original
    # P0 regressions; those (10300 vs 10600, replay 7550 vs 7750) run unchanged in test-receivable-red-green.py.
    check('historical 10300/7550 title untouched', hist_before, pg.sql(f"SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable_installments x WHERE receivable_id='{hist_tid}'"), 'HISTORY')
    check('historical balance still 2750', D('2750.00'), m.balance(hist_inst), 'HISTORY')
    # Shared partner-credit guard over the remaining receivable writers (separate .review file).
    load('shared_guard_tests', H / 'shared_guard_tests.py').run(sys.modules[__name__])
    summary = {}
    for c in checks: summary.setdefault(c['mode'], {}).setdefault(c['status'], 0); summary[c['mode']][c['status']] += 1
    res = dict(level='DISPOSABLE_PG_COMPONENT_NOT_E2E', synthetic=['auth.uid/h15/staff (monetary harness)', 'payment settings stub', 'exposure lower-bound stub', 'NF origin stub', 'accounting gate stub', 'NF reference', 'customers', 'delivery canonical value/billing guard stubs', 'next generation date stub', 'tenant fill stub'],
               shared_guard_sha256=hashlib.sha256((H / 'shared-credit-guard.sql.review').read_bytes()).hexdigest(),
               candidate_sha256=hashlib.sha256((H / 'price-generator.sql.review').read_bytes()).hexdigest(), checks=checks, summary=summary,
               fail=sum(c['status'] == 'FAIL' for c in checks))
    if out: pathlib.Path(out).write_text(json.dumps(res, indent=1, ensure_ascii=False, default=str))
    print(json.dumps(dict(total=len(checks), fail=res['fail'], summary=summary)))
    return res['fail']


if __name__ == '__main__':
    raise SystemExit(1 if main(sys.argv[1] if len(sys.argv) > 1 else None) else 0)
