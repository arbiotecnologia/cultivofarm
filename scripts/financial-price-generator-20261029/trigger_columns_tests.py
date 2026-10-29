"""Disposable PostgreSQL ONLY — trigger column-list gap (captured DDL) vs candidate DDL. Component, NOT E2E/JWT."""
import json


def pid(k): return 'a0000000-0000-4000-8000-0000000001%02d' % k   # SYNTHETIC partner
def did(k): return 'c0000000-0000-4000-8000-0000000001%02d' % k   # SYNTHETIC debtor


def run(t):
    pg, check, q, A, U = t.pg, t.check, t.q, t.A, t.U
    live = json.loads((t.PKG / 'receivable-recursive-live-20261029.json').read_text())
    trg = {x['name']: x['definition'] for r in live['relations'] if r['name'] == 'partner_orders' for x in (r['triggers'] or [])}
    F = {f['name']: f for f in live['functions']}
    st = lambda o: pg.sql(f"SELECT status||'|'||coalesce(credit_block_reason,'')||'|'||coalesce(credit_approved_by::text,'') FROM partner_orders WHERE id='{o}'")
    ks = range(30, 46)
    pg.sql("INSERT INTO public.clientes VALUES " + ','.join(f"('{did(k)}','{A}')" for k in ks) + ";"
           "INSERT INTO public.partner_accounts VALUES " + ','.join(f"('{pid(k)}','{did(k)}',true,'{A}')" for k in ks) + ";"
           "INSERT INTO public.partner_financial_settings(partner_id,credit_limit,overdue_tolerance_days,block_if_overdue,credit_limit_action,active) VALUES "
           + ','.join(f"('{pid(k)}',100000,0,false,{q('block') if k % 2 == 0 else q('approval_required')},true)" for k in ks) + ";")
    ddl = pg.sql("SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='trg_partner_orders_credit_guard'")
    check('installed trigger DDL == captured LIVE DDL', trg['trg_partner_orders_credit_guard'].replace('EXECUTE FUNCTION tg_', 'EXECUTE FUNCTION tg_'), ddl, 'TRG_COLUMNS')

    def scenario(base, tag):
        # (1) approved order, isolated final_amount_with_interest increase beyond limit (block partner).
        o = t.order(pid(base), 'pendente', '50000.00'); pg.sql(f"UPDATE partner_orders SET status='aprovado' WHERE id='{o}';")
        pg.sql(f"UPDATE partner_orders SET final_amount_with_interest=150000 WHERE id='{o}';")
        a1 = st(o).split('|')[0]
        # (2) held order (approval_required), settings inactivated, isolated approver write.
        o2 = t.order(pid(base + 1), 'pendente', '120000.00')
        pg.sql(f"UPDATE public.partner_financial_settings SET active=false WHERE partner_id='{pid(base + 1)}'; UPDATE partner_orders SET credit_approved_by='{U}' WHERE id='{o2}';")
        a2 = st(o2)
        # (3) limit 0, isolated approver write.
        o3 = t.order(pid(base + 3), 'pendente', '120000.00')
        pg.sql(f"UPDATE public.partner_financial_settings SET credit_limit=0 WHERE partner_id='{pid(base + 3)}'; UPDATE partner_orders SET credit_approved_by='{U}' WHERE id='{o3}';")
        a3 = st(o3)
        # (4) legit configured excess: isolated approver -> analysis -> aprovado; then decrease (legit) / increase.
        o4 = t.order(pid(base + 5), 'pendente', '120000.00')
        pg.sql(f"UPDATE partner_orders SET credit_approved_by='{U}' WHERE id='{o4}';")
        pg.sql(f"UPDATE partner_orders SET status='em_analise_comercial' WHERE id='{o4}'; UPDATE partner_orders SET status='aprovado' WHERE id='{o4}';")
        a4 = st(o4)
        o5 = t.order(pid(base + 7), 'pendente', '40000.00'); pg.sql(f"UPDATE partner_orders SET status='aprovado' WHERE id='{o5}'; UPDATE partner_orders SET final_amount_with_interest=30000 WHERE id='{o5}';")
        a5 = st(o5).split('|')[0]
        # (6) approved order, settings inactivated afterwards, isolated value change.
        o6 = t.order(pid(base + 2), 'pendente', '10000.00'); pg.sql(f"UPDATE partner_orders SET status='aprovado' WHERE id='{o6}'; UPDATE public.partner_financial_settings SET active=false WHERE partner_id='{pid(base + 2)}'; UPDATE partner_orders SET final_amount_with_interest=10000.01 WHERE id='{o6}';")
        a6 = st(o6).split('|')[0]
        return a1, a2, a3, a4, a5, a6

    b = scenario(30, 'captured')
    check('RED captured DDL: isolated final_amount increase over limit keeps aprovado (guard not fired)', 'aprovado', b[0], 'TRG_COLUMNS_RED')
    check('RED captured DDL: isolated approver recorded despite inactive settings', f'aguardando_aprovacao_credito|limite_excedido|{U}', b[1], 'TRG_COLUMNS_RED')
    check('RED captured DDL: isolated approver recorded despite limit 0', f'aguardando_aprovacao_credito|limite_excedido|{U}', b[2], 'TRG_COLUMNS_RED')
    check('RED captured DDL: value change after settings inactivated keeps aprovado', 'aprovado', b[5], 'TRG_COLUMNS_RED')
    pg.sql((t.H / 'credit-guard-trigger-columns.sql.review').read_text())
    check('candidate DDL installed', 'CREATE TRIGGER trg_partner_orders_credit_guard BEFORE INSERT OR UPDATE OF status, total, final_amount_with_interest, credit_approved_by ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_partner_orders_credit_guard()',
          pg.sql("SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='trg_partner_orders_credit_guard'"), 'TRG_COLUMNS')
    g = scenario(38, 'candidate')
    check('GREEN: isolated final_amount increase over limit re-checked, leaves aprovado', 'aguardando_aprovacao_credito', g[0], 'TRG_COLUMNS_GREEN')
    check('GREEN: isolated approver with inactive settings not recorded', 'aguardando_aprovacao_credito|configuracao_financeira_inativa|', g[1], 'TRG_COLUMNS_GREEN')
    check('GREEN: isolated approver with limit 0 not recorded', 'aguardando_aprovacao_credito|limite_nao_definido|', g[2], 'TRG_COLUMNS_GREEN')
    check('GREEN: legit configured excess approval still reaches aprovado', f'aprovado||{U}', g[3], 'TRG_COLUMNS_GREEN')
    check('GREEN: legit value decrease after approval stays aprovado', 'aprovado', g[4], 'TRG_COLUMNS_GREEN')
    check('GREEN: value change after settings inactivated leaves aprovado', 'aguardando_aprovacao_credito', g[5], 'TRG_COLUMNS_GREEN')
    check('captured-baseline legit path identical (aprovado + approver)', f'aprovado||{U}', b[3], 'TRG_COLUMNS_GREEN')
    # Rollback restores captured DDL exactly.
    pg.sql((t.H / 'credit-guard-trigger-columns.rollback.sql.review').read_text())
    check('rollback restores captured DDL', ddl, pg.sql("SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='trg_partner_orders_credit_guard'"), 'TRG_ROLLBACK')
    pg.sql((t.H / 'credit-guard-trigger-columns.sql.review').read_text())
    # Captured LIVE approval-field guard: isolated approver writes outside approve_b2b_credit raise (GUC-gated, see report).
    pg.sql("ALTER TABLE partner_orders ADD COLUMN IF NOT EXISTS credit_approved_at timestamptz;")
    pg.sql(F['fn_b2b_guard_credit_approval_fields']['body'] + ';'); pg.sql(trg['trg_b2b_guard_credit_approval_fields'] + ';')
    check('captured approval-fields guard installed exact (md5)', F['fn_b2b_guard_credit_approval_fields']['md5'], pg.sql("SELECT md5(pg_get_functiondef('public.fn_b2b_guard_credit_approval_fields()'::regprocedure))"), 'TRG_APPROVAL_FIELDS')
    o = t.order(pid(45), 'pendente', '120000.00')
    t.deny('LIVE: isolated credit_approved_by write without approve_b2b_credit refused', f"UPDATE partner_orders SET credit_approved_by='{U}' WHERE id='{o}';", 'P0001', 'TRG_APPROVAL_FIELDS')
    pg.sql(f"DROP TRIGGER trg_b2b_guard_credit_approval_fields ON partner_orders;")
