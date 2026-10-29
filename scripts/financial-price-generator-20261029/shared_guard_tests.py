"""Disposable PostgreSQL ONLY — component tests of shared-credit-guard.sql.review (NOT E2E, NOT JWT/RLS).
Runs inside test-price-generator.py after all Price checks, reusing its harness. Writer bodies are the
CAPTURED/REVIEWED ones (md5-checked); helpers they call that are not part of this slice are explicitly
SYNTHETIC stubs (delivery canonical value, delivery billing guard, next generation date, tenant fill).
"""
import json
from decimal import Decimal as D


def did(k): return 'c0000000-0000-4000-8000-0000000001%02d' % k   # SYNTHETIC debtor
def pid(k): return 'a0000000-0000-4000-8000-0000000001%02d' % k   # SYNTHETIC partner


def run(t):
    pg, m, check, deny, q, A, B, U, U2, V, K, PM, CB, PB = (t.pg, t.m, t.check, t.deny, t.q, t.A, t.B, t.U, t.U2, t.V, t.K, t.PM, t.CB, t.PB)
    live = json.loads((t.PKG / 'receivable-recursive-live-20261029.json').read_text())
    F = {f['name']: f for f in live['functions']}
    rel = {r['name']: r for r in live['relations']}
    st = lambda oid: pg.sql(f"SELECT status||'|'||coalesce(credit_block_reason,'') FROM partner_orders WHERE id='{oid}'")
    cx = lambda p: json.loads(pg.sql(f"SELECT public.fn_b2b_credit_exposure('{p}',0,NULL)"), parse_float=D)

    # ---- Reduced schema for the remaining writers (SYNTHETIC rows only).
    pg.sql("""ALTER TABLE partner_orders ADD COLUMN IF NOT EXISTS financial_status text, ADD COLUMN IF NOT EXISTS receivable_generated_at timestamptz, ADD COLUMN IF NOT EXISTS receivable_generated_by uuid;
      ALTER TABLE public.partner_order_financial_links ADD COLUMN partner_id uuid, ADD COLUMN receivable_id uuid, ADD COLUMN financial_status text, ADD COLUMN billing_trigger text, ADD COLUMN created_by uuid;
      CREATE UNIQUE INDEX ON public.partner_order_financial_links(partner_order_id);
      ALTER TABLE public.partner_financial_settings ADD COLUMN billing_trigger text;
      CREATE TABLE public.entregas(id uuid PRIMARY KEY, status text, cliente_id uuid, financial_status text, receivable_id uuid, partner_order_id uuid, billing_generated_at timestamptz, billing_generated_by uuid);
      CREATE TABLE public.entrega_reconciliacoes(entrega_id uuid, status text, valor_faturavel_max numeric);
      CREATE TABLE public.test_entrega_valor(entrega_id uuid PRIMARY KEY, valor numeric);  -- SYNTHETIC
      CREATE FUNCTION public.fn_entrega_valor_faturavel_v1(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('valor',(SELECT valor FROM public.test_entrega_valor WHERE entrega_id=$1),'origem','SINTETICO') $$;
      CREATE FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"synthetic":true}'::jsonb $$;
      CREATE TABLE public.recurring_financial_templates(id uuid PRIMARY KEY, organization_id uuid, active boolean, end_date date, type text, amount numeric(14,2), customer_id uuid, description text,
        category_id uuid, cost_center_id uuid, fiscal_invoice_required boolean, notes text, created_by uuid, payment_method_id uuid, supplier_name text, recurrence_frequency text, due_day int, next_generation_date date, updated_at timestamptz);
      CREATE TABLE public.recurring_generation_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid, reference_date date, status text, error_message text, generated_by uuid, generated_entity_type text, generated_entity_id uuid, amount numeric);
      CREATE FUNCTION public.fn_calc_next_generation_date(text, date, int) RETURNS date LANGUAGE sql AS $$ SELECT ($2 + 30) $$;  -- SYNTHETIC
      CREATE FUNCTION public.test_tenant_fill() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.organization_id := coalesce(NEW.organization_id, platform_private.h15_actor_organization()); RETURN NEW; END $$;
      CREATE TRIGGER a_synthetic_tenant_fill BEFORE INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.test_tenant_fill();  -- SYNTHETIC stand-in for tenant_organization_guard""")
    for n in ('fn_generate_receivable_from_entrega', 'fn_generate_recurring_title', 'fn_h6c_entrega_ar_b2b_link'):
        pg.sql(F[n]['body'] + ';')
    sig = {'fn_generate_receivable_from_entrega': '(uuid,jsonb)', 'fn_generate_recurring_title': '(uuid,date,boolean)', 'fn_h6c_entrega_ar_b2b_link': '()'}
    check('captured delivery/recurring/h6c writers installed exact (md5)', [F[n]['md5'] for n in sig],
          [pg.sql(f"SELECT md5(pg_get_functiondef('public.{n}{s}'::regprocedure))") for n, s in sig.items()], 'SHARED_INSTALL')
    pg.sql(next(x['definition'] for x in rel['entregas']['triggers'] if x['name'] == 'trg_h6c_entrega_ar_b2b_link') + ';')

    # Fixtures: debtor k -> partner k, tenant A, limit 100000 active block (k=5: limit 0).
    pg.sql('ALTER TABLE public.partner_accounts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;')
    ks = range(1, 25)
    pg.sql("INSERT INTO public.clientes VALUES " + ','.join(f"('{did(k)}','{A}')" for k in ks) + ";"
           "INSERT INTO public.partner_accounts VALUES " + ','.join(f"('{pid(k)}','{did(k)}',true,'{A}')" for k in ks if k != 12) + f",('{pid(12)}','{did(12)}',true,'{B}');"  # 12: owner B, client of A
           "INSERT INTO public.partner_financial_settings(partner_id,credit_limit,overdue_tolerance_days,block_if_overdue,credit_limit_action,active) VALUES "
           + ','.join(f"('{pid(k)}',{0 if k == 5 else 100000},0,false,{q('approval_required') if k >= 20 else q('block')},true)" for k in ks) + ";")
    # Price stub extended to debtor 8 (SYNTHETIC, same shape as the main stub).
    pg.sql(t.STUB_SETTINGS.replace(f"'{t.C7}'::uuid", f"'{t.C7}'::uuid,'{did(8)}'::uuid"))

    candidate = (t.H / 'shared-credit-guard.sql.review').read_text()
    # ---- Before candidate: reproduce the gap with the ORIGINAL guard.
    o_before = t.order(t.PI, 'pendente', '1.00')
    check('baseline: original guard accepts order with inactive settings', 'pendente|', st(o_before), 'SETTINGS_INACTIVE')
    mt = lambda cust, amt, key='', org=A, uid=U: t.scope(uid, org) + f"SELECT public.rpc_create_financial_title('receivable',{q(json.dumps(dict(description='SINTÉTICO manual '+key, category_id=K, total_amount=amt, installment_count=1, first_due_date='2026-12-15', customer_id=cust, payment_method_id=PM, installments=[dict(installment_number=1, amount=amt, due_date='2026-12-15')])))}::jsonb);"
    r0 = json.loads(pg.sql(mt(did(11), '150000.00', 'baseline')).splitlines()[-1])
    check('baseline: manual writer exceeds partner limit with no credit check', ('150000.00', None), (pg.sql(f"SELECT total_amount FROM accounts_receivable WHERE id='{r0['title_id']}'"), pg.sql(f"SELECT partner_id FROM accounts_receivable WHERE id='{r0['title_id']}'") or None), 'BASELINE_GAP')

    pg.sql(candidate)
    check('candidate guard body differs from captured only by settings/limit block', True, pg.sql("SELECT md5(pg_get_functiondef('public.tg_partner_orders_credit_guard()'::regprocedure))") != F['tg_partner_orders_credit_guard']['md5'], 'SHARED_INSTALL')
    check('authenticated cannot EXECUTE shared guard', 'f', pg.sql("SELECT has_function_privilege('authenticated','platform_private.b2b_shared_receivable_credit_guard()','EXECUTE')"), 'ACL')

    # ---- (1) B2B guard: settings inactive/absent/zero now hold the order; normal path unchanged.
    check('B2B: inactive settings -> held', 'aguardando_aprovacao_credito|configuracao_financeira_inativa', st(t.order(t.PI, 'pendente', '1.00')), 'SETTINGS_INACTIVE')
    check('B2B: absent settings -> held', 'aguardando_aprovacao_credito|configuracao_financeira_inativa', st(t.order('a0000000-0000-4000-8000-0000000000a8', 'pendente', '1.00')), 'SETTINGS_INACTIVE')
    check('B2B: limit 0 is not unlimited -> held', 'aguardando_aprovacao_credito|limite_nao_definido', st(t.order(pid(5), 'pendente', '1.00')), 'SETTINGS_INACTIVE')
    check('B2B: exact limit 100000 accepted', 'pendente|', st(t.order(pid(10), 'pendente', '100000.00')), 'B2B_GUARD')
    check('B2B: +0.01 blocked', 'aguardando_aprovacao_credito|limite_excedido_bloqueado', st(t.order(pid(10), 'pendente', '0.01')), 'B2B_GUARD')
    check('baseline order unchanged (no history rewrite)', 'pendente|', st(o_before), 'HISTORY')

    # ---- (2) Manual writer.
    r = json.loads(pg.sql(mt(did(1), '60000.00', 'm1')).splitlines()[-1])
    check('manual: partner_id derived server-side', pid(1), pg.sql(f"SELECT partner_id FROM accounts_receivable WHERE id='{r['title_id']}'"), 'MANUAL')
    deny('manual: inactive settings', mt(t.CI, '1.00', 'mi'), 'CREDIT_SETTINGS_INACTIVE', 'MANUAL')
    deny('manual: limit 0', mt(did(5), '1.00', 'm5'), 'CREDIT_NO_LIMIT_DEFINED', 'MANUAL')
    deny('manual: two active partners', mt(t.C4, '1.00', 'm4'), 'CREDIT_PARTNER_LINK_AMBIGUOUS', 'MANUAL')
    deny('manual: REPEATABLE READ refused', t.scope() + "BEGIN ISOLATION LEVEL REPEATABLE READ;" + mt(did(1), '1.00', 'rr').split(';', 3)[-1] + "COMMIT;", 'CREDIT_ISOLATION_UNSUPPORTED', 'MANUAL')
    rn = json.loads(pg.sql(mt(t.C3, '500000.00', 'nolink')).splitlines()[-1])
    check('manual: debtor without partner untouched', '', pg.sql(f"SELECT coalesce(partner_id::text,'') FROM accounts_receivable WHERE id='{rn['title_id']}'"), 'NO_WIDENING')
    rc = json.loads(pg.sql(mt(did(12), '500000.00', 'owner-b')).splitlines()[-1])
    check('manual: partner owned by other tenant never attributed/locked', ('', '0'), (pg.sql(f"SELECT coalesce(partner_id::text,'') FROM accounts_receivable WHERE id='{rc['title_id']}'"), str(cx(pid(12))['exposicao_atual']).split('.')[0]), 'NO_WIDENING')
    rb = json.loads(pg.sql(mt(CB, '100.00', 'tenant-b', org=B, uid=V)).splitlines()[-1])
    check('tenant B manual attributed to B partner only', PB, pg.sql(f"SELECT partner_id FROM accounts_receivable WHERE id='{rb['title_id']}'"), 'TENANT')
    deny('tenant A actor -> tenant B customer still refused by d51_5', mt(CB, '1.00', 'xa'), 'FINANCIAL_CUSTOMER', 'TENANT')

    # Race manual -> manual (different actors/keys, same debtor): exactly one fits.
    p1, pid1, _ = t.held(mt(did(1), '30000.00', 'race-a'))
    th, box, blocked = t.waiter(mt(did(1), '20000.00', 'race-b', uid=U2), 'shared-w1')
    check('manual->manual: second waits on b2b_credit', '{%d}' % pid1, blocked, 'SHARED_RACE')
    t.finish(p1, 'COMMIT'); th.join(15)
    check('manual->manual: 60000+30000+20000 second refused after fresh read', True, 'CREDIT_LIMIT_EXCEEDED_BLOCK' in box['r'].stderr.decode(), 'SHARED_RACE')
    pg.sql(mt(did(1), '10000.00', 'exact'))
    check('manual: exact remaining accepted (100000)', '100000.00', str(cx(pid(1))['exposicao_atual']), 'SHARED_LIMIT')
    deny('manual: +0.01 refused', mt(did(1), '0.01', 'plus'), 'CREDIT_LIMIT_EXCEEDED_BLOCK', 'SHARED_LIMIT')

    # Race manual -> B2B order, and B2B order -> manual.
    p1, pid1, _ = t.held(mt(did(6), '70000.00', 'r6'))
    th, box, blocked = t.waiter(f"INSERT INTO partner_orders(id,payment_terms_id,partner_id,status,total,final_amount_with_interest) VALUES(gen_random_uuid(),gen_random_uuid(),'{pid(6)}','pendente',30000.01,30000.01) RETURNING id;", 'shared-w2')
    check('manual->B2B: order guard waits', '{%d}' % pid1, blocked, 'SHARED_RACE')
    t.finish(p1, 'COMMIT'); th.join(15)
    check('manual->B2B: 70000+30000.01 held by guard', 'aguardando_aprovacao_credito|limite_excedido_bloqueado', st(box['r'].stdout.decode().strip().splitlines()[-1]), 'SHARED_RACE')
    p1, pid1, _ = t.held(f"INSERT INTO partner_orders(id,payment_terms_id,partner_id,status,total,final_amount_with_interest) VALUES(gen_random_uuid(),gen_random_uuid(),'{pid(7)}','pendente',50000,50000) RETURNING id;")
    th, box, blocked = t.waiter(mt(did(7), '50000.01', 'r7', uid=U2), 'shared-w3')
    check('B2B->manual: manual waits', '{%d}' % pid1, blocked, 'SHARED_RACE')
    t.finish(p1, 'COMMIT'); th.join(15)
    check('B2B->manual: 50000+50000.01 refused', True, 'CREDIT_LIMIT_EXCEEDED_BLOCK' in box['r'].stderr.decode(), 'SHARED_RACE')

    # Race manual -> Price (same debtor), Price installed with partner context.
    p1, pid1, _ = t.held(mt(did(8), '60000.00', 'r8'))
    th, box, blocked = t.waiter(t.nf('2026-10-29') + t.call(t.payload(1, amount='66666.67', key='k-shared-price', cust=did(8)), uid=U2), 'shared-w4')
    check('manual->Price: Price waits', '{%d}' % pid1, blocked, 'SHARED_RACE')
    t.finish(p1, 'COMMIT'); th.join(15)
    check('manual->Price: 60000+40000.00 = limit accepted exactly', True, box['r'].returncode == 0, 'SHARED_RACE')
    check('Price title attributed once (canonical 100000, no double count)', '100000.00', str(cx(pid(8))['exposicao_atual']), 'SHARED_LIMIT')
    deny('Price +0.02 after manual refused', t.nf('2026-10-29') + t.call(t.payload(1, amount='0.02', key='k-shared-plus', cust=did(8))), 'LIMIT_EXCEEDED', 'SHARED_LIMIT')

    # ---- (3) Recurring writer (captured body, authenticated and cron sessions).
    tpl = lambda k, amt: pg.sql(f"INSERT INTO public.recurring_financial_templates VALUES(gen_random_uuid(),'{A}',true,NULL,'RECEIVABLE',{amt},'{did(k)}','SINTÉTICO recorrente','{K}',NULL,false,NULL,'{U}','{PM}',NULL,'monthly',15,NULL,now()) RETURNING id;").splitlines()[0]
    t.order(pid(2), 'aprovado', '40000.00')
    t1 = tpl(2, '60000.01')
    logs = lambda: pg.sql("SELECT count(*) FROM public.recurring_generation_log")
    lb = logs()
    deny('recurring: 40000 committed + 60000.01 refused', t.scope() + f"SELECT public.fn_generate_recurring_title('{t1}','2026-12-15',true);", 'CREDIT_LIMIT_EXCEEDED_BLOCK', 'RECURRING')
    check('recurring: refusal leaves no log/audit (atomic)', lb, logs(), 'RECURRING')
    deny('recurring cron session (no JWT) also refused', t.scope('', '') + f"SELECT public.fn_generate_recurring_title('{t1}','2026-12-15',false);", 'CREDIT_LIMIT_EXCEEDED_BLOCK', 'RECURRING')
    t2 = tpl(2, '60000.00')
    rid = pg.sql(t.scope() + f"SELECT public.fn_generate_recurring_title('{t2}','2026-12-15',true);").splitlines()[-1]
    check('recurring: exact fit accepted, partner attributed', pid(2), pg.sql(f"SELECT partner_id FROM accounts_receivable WHERE id='{rid}'"), 'RECURRING')

    # ---- (4) Delivery writer (captured body + captured h6c link trigger).
    def entrega(k, valor, order_amt=None):
        po = t.order(pid(k), 'entregue', order_amt) if order_amt else None
        e = pg.sql(f"INSERT INTO public.entregas(id,status,cliente_id,financial_status,partner_order_id) VALUES(gen_random_uuid(),'entregue','{did(k)}','PENDING',{q(po) if po else 'NULL'}) RETURNING id;").splitlines()[0]
        pg.sql(f"INSERT INTO public.test_entrega_valor VALUES('{e}',{valor});")
        return e, po
    bill = lambda e, v: t.scope() + f"SELECT public.fn_generate_receivable_from_entrega('{e}',{q(json.dumps(dict(total_amount=v, category_id=K, payment_method_id=PM, first_due_date='2026-12-15')))}::jsonb);"
    e3, po3 = entrega(3, '100000.00', '100000.00')
    check('delivery: committed order counted before billing', '100000.00', str(cx(pid(3))['exposicao_atual']), 'DELIVERY')
    ar3 = pg.sql(bill(e3, '100000.00')).splitlines()[-1]
    check('delivery of committed order at limit accepted (order replaced, not added)', (pid(3), 't', '100000.00'),
          (pg.sql(f"SELECT partner_id FROM accounts_receivable WHERE id='{ar3}'"), pg.sql(f"SELECT receivable_generated FROM partner_orders WHERE id='{po3}'"), str(cx(pid(3))['exposicao_atual'])), 'DELIVERY')
    check('delivery replay returns same title', ar3, pg.sql(bill(e3, '100000.00')).splitlines()[-1], 'DELIVERY')
    e9, _ = entrega(9, '100000.01', '100000.00')
    deny('delivery title 0.01 above its committed order at limit refused', bill(e9, '100000.01'), 'CREDIT_LIMIT_EXCEEDED_BLOCK', 'DELIVERY')
    pg.sql(mt(did(4), '80000.00', 'd4'))
    e4, _ = entrega(4, '20000.01')
    deny('delivery without order over limit refused', bill(e4, '20000.01'), 'CREDIT_LIMIT_EXCEEDED_BLOCK', 'DELIVERY')
    check('delivery refusal keeps entrega unbilled', 'PENDING|', pg.sql(f"SELECT financial_status||'|'||coalesce(receivable_id::text,'') FROM public.entregas WHERE id='{e4}'"), 'DELIVERY')
    e4b, _ = entrega(4, '20000.00')
    pg.sql(bill(e4b, '20000.00'))
    check('delivery exact remaining accepted', '100000.00', str(cx(pid(4))['exposicao_atual']), 'DELIVERY')
    other = t.order(pid(4), 'entregue', '1.00')
    e_bad = pg.sql(f"INSERT INTO public.entregas(id,status,cliente_id,financial_status,partner_order_id) VALUES(gen_random_uuid(),'entregue','{did(3)}','PENDING','{other}') RETURNING id;").splitlines()[0]
    pg.sql(f"INSERT INTO public.test_entrega_valor VALUES('{e_bad}',1);")
    deny('delivery whose order belongs to another partner refused', bill(e_bad, '1.00'), 'CREDIT_ORDER_PARTNER_MISMATCH', 'DELIVERY')

    # ================= Review fixes (commit f2d19a6) =================
    # (a) B2B_ORDER is not a free pass.
    def conv(k, amt, status='aprovado', origin=None, cust=None, partner=None):
        o = origin or t.order(pid(k), status, amt)
        terms = pg.sql(f"SELECT payment_terms_id FROM partner_orders WHERE id='{o}'")
        pg.sql(f"INSERT INTO partner_order_payment_schedule(partner_order_id,payment_terms_id,installment_number,due_date,amount,principal_amount,interest_amount) VALUES('{o}','{terms}',1,CURRENT_DATE+30,{amt},{amt},0) ON CONFLICT DO NOTHING;")
        return o, t.scope() + f"INSERT INTO accounts_receivable(origin_type,origin_id,description,category_id,total_amount,first_due_date,installment_count,created_by,organization_id,customer_id,partner_id) VALUES('B2B_ORDER','{o}','SINTÉTICO conv','{K}',{amt},CURRENT_DATE+30,1,'{U}','{A}',{q(cust or did(k))},{q(partner or pid(k))}) RETURNING id;"
    mal = mt(did(13), '100000.01', 'mal')
    mal = mal.replace('"customer_id"', '"origin_type": "B2B_ORDER", "origin_id": "%s", "partner_id": "%s", "customer_id"' % (t.order(pid(13), 'aprovado', '1.00'), pid(13)))
    deny('malicious manual payload origin_type=B2B_ORDER still checked (writer forces MANUAL)', mal, 'CREDIT_LIMIT_EXCEEDED_BLOCK', 'REVIEW_B2B_ORIGIN')
    deny('direct B2B_ORDER with fabricated order id refused', t.scope() + f"INSERT INTO accounts_receivable(origin_type,origin_id,description,category_id,total_amount,first_due_date,installment_count,created_by,organization_id,customer_id,partner_id) VALUES('B2B_ORDER',gen_random_uuid(),'x','{K}',500000,CURRENT_DATE+30,1,'{U}','{A}','{did(13)}','{pid(13)}');", 'CREDIT_B2B_ORIGIN_UNPROVEN', 'REVIEW_B2B_ORIGIN')
    deny('direct B2B_ORDER without origin refused', t.scope() + f"INSERT INTO accounts_receivable(origin_type,description,category_id,total_amount,first_due_date,installment_count,created_by,organization_id,customer_id) VALUES('B2B_ORDER','x','{K}',500000,CURRENT_DATE+30,1,'{U}','{A}','{did(13)}');", 'CREDIT_B2B_ORIGIN_UNPROVEN', 'REVIEW_B2B_ORIGIN')
    o14 = t.order(pid(14), 'aprovado', '10.00')
    _, sql = conv(13, '10.00', origin=o14)
    deny('B2B_ORDER pointing to another partner order refused', sql, 'CREDIT_ORDER_PARTNER_MISMATCH', 'REVIEW_B2B_ORIGIN')
    o15, sql = conv(15, '100000.00')
    tid15 = pg.sql(sql).splitlines()[-1]
    check('legit conversion of committed order at limit accepted (neutral)', pid(15), pg.sql(f"SELECT partner_id FROM accounts_receivable WHERE id='{tid15}'"), 'REVIEW_B2B_ORIGIN')
    _, sql = conv(15, '100000.00', origin=o15)
    deny('second B2B_ORDER for same order refused', sql, 'CREDIT_B2B_ORIGIN_ALREADY_BILLED', 'REVIEW_B2B_ORIGIN')
    _, sql = conv(16, '0.01', origin=t.order(pid(16), 'aprovado', '100000.00'))
    pg.sql(f"UPDATE partner_orders SET receivable_generated=true WHERE partner_id='{pid(16)}';")
    pg.sql(mt(did(16), '100000.00', 'fill16'))
    deny('B2B_ORDER of already generated order counts in full (+0.01 refused)', sql, 'CREDIT_LIMIT_EXCEEDED_BLOCK', 'REVIEW_B2B_ORIGIN')
    # approved-over-limit order (approval_required partner 20): conversion does not increase exposure -> accepted.
    o20 = t.order(pid(20), 'pendente', '120000.00')
    check('over-limit order held for approval', 'aguardando_aprovacao_credito|limite_excedido', st(o20), 'REVIEW_APPROVAL')
    pg.sql(f"UPDATE partner_orders SET credit_approved_by='{U}', status='em_analise_comercial' WHERE id='{o20}';")
    check('legit approval of configured excess releases to analysis', 'em_analise_comercial|', st(o20), 'REVIEW_APPROVAL')
    pg.sql(f"UPDATE partner_orders SET status='aprovado' WHERE id='{o20}';")
    check('approved order proceeds to aprovado', 'aprovado|', st(o20), 'REVIEW_APPROVAL')
    _, sql = conv(20, '120000.00', origin=o20)
    check('conversion of credit-approved over-limit order accepted (delta 0)', pid(20), pg.sql(f"SELECT partner_id FROM accounts_receivable WHERE id='{pg.sql(sql).splitlines()[-1]}'"), 'REVIEW_APPROVAL')
    # (b) approval never releases absent/inactive settings or undefined limit.
    for k, mut, reason in ((21, f"UPDATE public.partner_financial_settings SET active=false WHERE partner_id='{pid(21)}'", 'configuracao_financeira_inativa'),
                           (22, f"DELETE FROM public.partner_financial_settings WHERE partner_id='{pid(22)}'", 'configuracao_financeira_inativa'),
                           (23, f"UPDATE public.partner_financial_settings SET credit_limit=0 WHERE partner_id='{pid(23)}'", 'limite_nao_definido')):
        o = t.order(pid(k), 'pendente', '120000.00'); pg.sql(mut + ';')
        pg.sql(f"UPDATE partner_orders SET credit_approved_by='{U}', status='em_analise_comercial' WHERE id='{o}';")
        check(f'approval with {reason} (k={k}) stays held, approver not recorded', f'aguardando_aprovacao_credito|{reason}|', pg.sql(f"SELECT status||'|'||coalesce(credit_block_reason,'')||'|'||coalesce(credit_approved_by::text,'') FROM partner_orders WHERE id='{o}'"), 'REVIEW_APPROVAL')
    o24 = t.order(pid(24), 'pendente', '120000.00')
    pg.sql(f"UPDATE partner_orders SET credit_approved_by='{U}', status='em_analise_comercial' WHERE id='{o24}';")
    pg.sql(f"UPDATE public.partner_financial_settings SET active=false WHERE partner_id='{pid(24)}';")
    pg.sql(f"UPDATE partner_orders SET status='aprovado' WHERE id='{o24}';")
    check('approved-then-settings-inactivated cannot reach aprovado', 'aguardando_aprovacao_credito|configuracao_financeira_inativa', st(o24), 'REVIEW_APPROVAL')
    # (c) link re-validated after the wait: unlink / delete / transfer committed while waiting.
    for k, mut in ((17, "client_id=NULL"), (18, "deleted_at=now()"), (19, f"commercial_owner_organization_id='{B}'")):
        p1, b1, _ = t.held(mt(did(k), '10.00', 'hold%d' % k))
        th, box, blocked = t.waiter(mt(did(k), '10.00', 'wait%d' % k, uid=U2), 'shared-rv%d' % k)
        check(f'waiter blocked on b2b_credit (k={k})', '{%d}' % b1, blocked, 'REVIEW_RELINK')
        pg.sql(f"UPDATE public.partner_accounts SET {mut} WHERE id='{pid(k)}';")
        before = pg.sql(f"SELECT count(*) FROM accounts_receivable WHERE customer_id='{did(k)}'")
        t.finish(p1, 'COMMIT'); th.join(15)
        check(f'partner {mut.split("=")[0]} changed during wait -> refused, nothing written (k={k})', (True, str(int(before) + 1)),  # only the holder's title
              ('CREDIT_PARTNER_LINK_CHANGED' in box['r'].stderr.decode(), pg.sql(f"SELECT count(*) FROM accounts_receivable WHERE customer_id='{did(k)}'")), 'REVIEW_RELINK')
    rr = json.loads(pg.sql(mt(did(18), '1.00', 'after-del')).splitlines()[-1])
    check('after partner deletion debtor is no longer attributed', '', pg.sql(f"SELECT coalesce(partner_id::text,'') FROM accounts_receivable WHERE id='{rr['title_id']}'"), 'REVIEW_RELINK')
