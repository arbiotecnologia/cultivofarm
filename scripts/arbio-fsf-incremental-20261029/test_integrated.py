"""Integrated subset-01 rehearsal on a disposable PostgreSQL restored from read-only canonical catalog capture.

Exact captured bodies/ACL/RLS/triggers; synthetic fixture ROWS only (seeded with session_replication_role=replica,
which is pre-state setup, never inside the tested transaction). Sessions use SET ROLE authenticated + request.jwt.claims,
the PostgREST mechanism WITHOUT signature verification: this is NOT JWT/RLS hosted proof.
"""
import hashlib
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.dont_write_bytecode = True
H = Path(__file__).resolve().parent
ROOT = H.parents[1]
sys.path.insert(0, str(H))
import restore_stack  # noqa: E402
from restore_stack import pg  # noqa: E402

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'docs/auditorias/evidencias-cadeia-financeira-20261029/incremental-integrated-2110')
OUT.mkdir(parents=True, exist_ok=True)
rows = []

# Synthetic identities (NOT production ids). Names mirror roles: ARBIO internal, FSF tenant, FSF partner inside ARBIO.
ORG_A = 'a0000000-0000-4000-8000-00000000000a'   # supplier tenant (AR Bio analogue)
ORG_F = 'f0000000-0000-4000-8000-00000000000f'   # buyer tenant (tenantFSF analogue)
PART = 'b0000000-0000-4000-8000-00000000000b'    # partner_accounts owned by ORG_A (commercial partner FSF analogue)
U_ADM = 'c0000000-0000-4000-8000-000000000001'   # ARBio administrador
U_FIN = 'c0000000-0000-4000-8000-000000000002'   # ARBio financeiro
U_FSF = 'c0000000-0000-4000-8000-000000000003'   # tenantFSF administrador only (rh@ analogue), zero partner_users
U_CUM = 'c0000000-0000-4000-8000-000000000004'   # ARBio administrador + parceiro_b2b (cumulative external)
U_SUP = 'c0000000-0000-4000-8000-000000000005'   # platform superadmin
COUNTERS = ['accounts_receivable', 'accounts_receivable_installments', 'financial_documents', 'fiscal_invoices',
            'comunicacao_outbox', 'comunicacao_eventos', 'notificacoes_operacionais', 'portal_notificacoes',
            'production_planning', 'production_timeline_events', 'partner_order_payment_schedule']


def check(name, expected, actual, note=''):
    status = 'PASS' if expected == actual else 'FAIL'
    rows.append({'test': name, 'status': status, 'expected': expected, 'actual': actual, 'note': (note.split('CONTEXT:')[0] if isinstance(note, str) else note)[:600]})
    print(status, name, '' if status == 'PASS' else f'expected={expected!r} actual={actual!r}', flush=True)


def session(uid, body, ok=True, app='itest'):
    claims = json.dumps({'sub': uid, 'role': 'authenticated', 'iat': int(time.time())})
    return pg.sql(f"SET application_name='{app}'; SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims}', false);\n{body}", ok)


def attempt(uid, body):
    claims = json.dumps({'sub': uid, 'role': 'authenticated', 'iat': int(time.time())})
    r = subprocess.run(pg.psql(), input=f"SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{claims}', false);\n{body}", capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


def spoof_result(uid, oid):
    rc, out = attempt(uid, f"SELECT set_config('arbio.b2b_credit_approval','on',false); WITH u AS (UPDATE public.partner_orders SET credit_approved_by=auth.uid(), credit_approved_at=now() WHERE id='{oid}' RETURNING 1) SELECT 'ROWS='||count(*) FROM u;")
    return 'ERROR' if rc else out.splitlines()[-1]


def fill(table, values):
    cols = json.loads(pg.sql(f"""SELECT coalesce(json_agg(json_build_object('n',a.attname,'t',format_type(a.atttypid,a.atttypmod),'typ',t.typtype,'oid',a.atttypid)),'[]')
      FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.{table}'::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull AND d.adbin IS NULL AND a.attgenerated='' AND a.attidentity=''"""))
    v = dict(values)
    for c in cols:
        if c['n'] in v: continue
        t = c['t']
        if c['typ'] == 'e':
            v[c['n']] = pg.sql(f"SELECT enumlabel FROM pg_enum WHERE enumtypid={c['oid']} ORDER BY enumsortorder LIMIT 1")
        elif t == 'uuid': v[c['n']] = '00000000-0000-4000-8000-%012d' % (abs(hash((table, c['n']))) % 10**12)
        elif t.startswith(('numeric', 'integer', 'bigint', 'smallint', 'double', 'real')): v[c['n']] = 0
        elif t == 'boolean': v[c['n']] = False
        elif t.startswith('timestamp') or t == 'date': v[c['n']] = '2026-10-29'
        elif t in ('jsonb', 'json'): v[c['n']] = {}
        elif t.endswith('[]'): v[c['n']] = '{}'
        else: v[c['n']] = f'synthetic-{table}-{c["n"]}'
    def lit(x):
        if x is None: return 'NULL'
        if isinstance(x, bool): return 'true' if x else 'false'
        if isinstance(x, (int, float)): return str(x)
        if isinstance(x, (dict, list)): return "'" + json.dumps(x).replace("'", "''") + "'"
        return "'" + str(x).replace("'", "''") + "'"
    pg.sql(f"SET session_replication_role=replica; INSERT INTO public.{table}({','.join(v)}) VALUES ({','.join(lit(x) for x in v.values())});")


def counters():
    return {t: pg.sql(f'SELECT count(*) FROM public.{t}') for t in COUNTERS}


def order(oid, status='aguardando_aprovacao_credito', snapshot=None, total=1000):
    fill('partner_orders', {'id': oid, 'partner_id': PART, 'status': status, 'total': total, 'subtotal': total,
                            'credit_block_reason': 'limite_excedido', 'c2_external_origin_snapshot': snapshot,
                            'created_by': U_FSF})


def ost(oid):
    return pg.sql(f"SELECT status||'|'||coalesce(credit_approved_by::text,'-')||'|'||coalesce(credit_block_reason,'-') FROM public.partner_orders WHERE id='{oid}'")


def race(kind, oid, revoke_sql, label):
    """Hold the row (FOR UPDATE) or the shared credit advisory lock, start approval, revoke while it waits."""
    holder = pg.popen('')
    hold = (f"BEGIN; SELECT 1 FROM public.partner_orders WHERE id='{oid}' FOR UPDATE;" if kind == 'row'
            else f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('b2b_credit:{PART}',0));")
    holder.stdin.write(hold + " SELECT 'HELD';\n"); holder.stdin.flush()
    while holder.stdout.readline().strip() != 'HELD':
        assert holder.poll() is None, holder.stderr.read()
    box = {}
    app = f'race_{kind}'
    def run():
        claims = json.dumps({'sub': U_ADM, 'role': 'authenticated', 'iat': int(time.time())})
        box['r'] = subprocess.run(pg.psql(), input=f"SET application_name='{app}'; SET ROLE authenticated; SELECT set_config('request.jwt.claims','{claims}',false); SELECT public.approve_b2b_credit('{oid}','race');", capture_output=True, text=True)
    th = threading.Thread(target=run, daemon=True); th.start()
    blocked = False
    for _ in range(100):
        if pg.sql(f"SELECT exists(SELECT 1 FROM pg_stat_activity WHERE application_name='{app}' AND cardinality(pg_blocking_pids(pid))>0)") == 't':
            blocked = True; break
        time.sleep(0.1)
    check(f'{label}: approval waits on {kind} lock (pg_blocking_pids)', True, blocked)
    revoke_sql() if callable(revoke_sql) else pg.sql(revoke_sql)
    holder.stdin.write('COMMIT;\n\\q\n'); holder.stdin.flush(); holder.wait(timeout=15)
    th.join(timeout=20)
    r = box.get('r')
    check(f'{label}: revoked while waiting is denied', True, bool(r) and r.returncode != 0 and 'b2b_credit_internal_scope_denied' in r.stderr, (r.stderr[-300:] if r else 'no result'))
    check(f'{label}: order unchanged', 'aguardando_aprovacao_credito|-|limite_excedido', ost(oid))


def main():
    j = restore_stack.merge_supplement(json.loads((H / 'capture/stack-metadata-2028.json').read_text()))
    res = restore_stack.restore(j)
    unresolved = {k: len(v) for k, v in res.items()}
    check('restoration has zero unresolved objects', {k: 0 for k in res}, unresolved)
    pg.sql((H / 'preflight.sql.readonly').read_text())
    check('exact preflight passes on restored stack', True, True)

    # ---------- fixture pre-state (synthetic rows) ----------
    for org, partner_link in ((ORG_A, None), (ORG_F, None)):
        fill('organizations', {'id': org, 'ativo': True, 'status': 'ativa', 'partner_account_id': partner_link})
    fill('partner_accounts', {'id': PART, 'commercial_owner_organization_id': ORG_A, 'ativo': True})
    for uid, org in ((U_ADM, ORG_A), (U_FIN, ORG_A), (U_FSF, ORG_F), (U_CUM, ORG_A), (U_SUP, ORG_A)):
        fill('profiles', {'user_id': uid, 'organization_id': org, 'ativo': True, 'senha_provisoria': False})
    for uid, role in ((U_ADM, 'administrador'), (U_FIN, 'financeiro'), (U_FSF, 'administrador'),
                      (U_CUM, 'administrador'), (U_CUM, 'parceiro_b2b'), (U_SUP, 'superadmin')):
        fill('user_roles', {'user_id': uid, 'role': role})
    fill('partner_financial_settings', {'partner_id': PART, 'active': True, 'credit_limit': 100000,
                                        'auto_generate_receivable': True, 'billing_trigger': 'na_aprovacao'})
    ent = pg.sql(f"SELECT count(*) FROM platform_private.entitlements_for_user('{U_ADM}') WHERE feature_key='pedidos_b2b'")
    check('fixture: no invented SaaS entitlement seeded', '0', ent, 'saas gate is exercised as real code')

    # ---------- RED on captured baseline (before install), each in rolled-back transaction ----------
    order('d0000000-0000-4000-8000-000000000001')
    rc, out = attempt(U_ADM, "BEGIN; SELECT public.approve_b2b_credit('d0000000-0000-4000-8000-000000000001','saas'); ROLLBACK;")
    check('baseline without subscription: phase1 scope denies before SaaS gate', True, rc != 0 and 'b2b_phase1_scope_denied' in out, out[-200:])
    seed_plan()
    check('real entitlement resolver returns pedidos_b2b (synthetic subscription rows)', '1', pg.sql(f"SELECT count(*) FROM platform_private.entitlements_for_user('{U_ADM}') WHERE feature_key='pedidos_b2b'"))
    base_internal = session(U_ADM, "BEGIN; SELECT public.approve_b2b_credit('d0000000-0000-4000-8000-000000000001','red'); ROLLBACK;", False)
    check('RED baseline: internal ARBio admin cannot approve (phase1 resolves buyer partner)', True, 'b2b_phase1_scope_denied' in base_internal, base_internal[-200:])
    pg.sql(f"SET session_replication_role=replica; UPDATE public.organizations SET partner_account_id='{PART}' WHERE id='{ORG_F}';")
    rc, base_self = attempt(U_FSF, "BEGIN; SELECT public.approve_b2b_credit('d0000000-0000-4000-8000-000000000001','red')::text; SELECT status||'|'||(credit_approved_by IS NOT NULL) FROM public.partner_orders WHERE id='d0000000-0000-4000-8000-000000000001'; ROLLBACK;")
    check('RED baseline: buyer tenant admin whose org points to partner self-approves credit (rolled back)', True, rc == 0 and 'em_analise_comercial|true' in base_self, base_self)
    (OUT / 'red-baseline-self-approval.txt').write_text(base_self[-2000:] + '\n')
    pg.sql(f"SET session_replication_role=replica; UPDATE public.organizations SET partner_account_id=NULL WHERE id='{ORG_F}';")
    for uid, label in ((U_FSF, 'tenantFSF'), (U_ADM, 'ARBio admin')):
        sp = spoof_result(uid, 'd0000000-0000-4000-8000-000000000001')
        check(f'baseline GUC spoof by {label}: no row changed', True, sp in ('ERROR', 'ROWS=0'), sp)
    check('baseline order unchanged after spoof attempts', 'aguardando_aprovacao_credito|-|limite_excedido', ost('d0000000-0000-4000-8000-000000000001'))

    # ---------- install exact artifact ----------
    pg.sql((H / '01-credit-approval.install.sql.review').read_text())
    pg.sql((H / 'postflight.sql.readonly').read_text())
    check('installer COMMIT + postflight on restored stack', True, True)
    sigs = ['public.approve_b2b_credit(uuid,text)', 'public.fn_b2b_guard_credit_approval_fields()', 'public.tg_partner_orders_credit_guard()',
            'platform_private.b2b_credit_config_block(uuid)', 'platform_private.b2b_credit_internal_authority(uuid,uuid)']
    md5 = {s: pg.sql(f"SELECT md5(pg_get_functiondef('{s}'::regprocedure))") for s in sigs}

    # ---------- integrated authority ----------
    O1 = 'd0000000-0000-4000-8000-000000000001'
    before = counters()
    for uid, label in ((U_FSF, 'tenantFSF admin'), (U_CUM, 'cumulative admin+parceiro_b2b'), (U_SUP, 'superadmin (deliberate narrowing)')):
        e = session(uid, f"SELECT public.approve_b2b_credit('{O1}','neg');", False)
        check(f'negative: {label} denied', True, 'b2b_credit_internal_scope_denied' in e or 'forbidden' in e, e[-200:])
    pg.sql(f"SET session_replication_role=replica; UPDATE public.organizations SET partner_account_id='{PART}' WHERE id='{ORG_F}';")
    e = session(U_FSF, f"SELECT public.approve_b2b_credit('{O1}','self');", False)
    check('GREEN: buyer tenant pointing to partner cannot self-approve', True, 'b2b_credit_internal_scope_denied' in e, e[-200:])
    pg.sql(f"SET session_replication_role=replica; UPDATE public.organizations SET partner_account_id=NULL WHERE id='{ORG_F}';")
    for uid, label in ((U_FSF, 'tenantFSF'), (U_ADM, 'ARBio admin')):
        sp = spoof_result(uid, O1)
        check(f'GUC spoof by {label} after install: no row changed', True, sp in ('ERROR', 'ROWS=0'), sp)
    check('order unchanged after spoof attempts', 'aguardando_aprovacao_credito|-|limite_excedido', ost(O1))
    pg.sql(f"SET session_replication_role=replica; UPDATE public.organization_subscriptions SET status='CANCELLED', cancelled_at=now() WHERE organization_id='{ORG_A}';")
    rc, e = attempt(U_ADM, f"SELECT public.approve_b2b_credit('{O1}','saas');")
    check('positive path blocked by real SaaS gate when subscription cancelled, atomically', True, rc != 0 and 'saas_feature_not_entitled' in e, e[-200:])
    check('SaaS abort leaves order unchanged and zero tickets', 'aguardando_aprovacao_credito|-|limite_excedido|0', ost(O1) + '|' + pg.sql('SELECT count(*) FROM platform_private.credit_approval_tickets_20261029'))
    pg.sql(f"SET session_replication_role=replica; UPDATE public.organization_subscriptions SET status='ACTIVE', cancelled_at=NULL WHERE organization_id='{ORG_A}';")
    rc, out = attempt(U_ADM, f"SELECT public.approve_b2b_credit('{O1}','ok')::text;")
    check('positive: internal ARBio admin releases credit', 'em_analise_comercial|' + U_ADM + '|-', ost(O1), str(out))
    check('positive: exactly one audit row', '1', pg.sql(f"SELECT count(*) FROM public.partner_order_audit_logs WHERE order_id='{O1}' AND acao='credito_aprovado'"))
    check('positive: zero residual tickets', '0', pg.sql('SELECT count(*) FROM platform_private.credit_approval_tickets_20261029'))
    after = counters()
    check('zero titles/dispatch/fiscal/planning on credit release (na_aprovacao + auto ON)', before, after)
    rep = session(U_ADM, f"SELECT public.approve_b2b_credit('{O1}','again');", False)
    check('replay refused (already_released), no second audit', True, 'already_released' in rep and pg.sql(f"SELECT count(*) FROM public.partner_order_audit_logs WHERE order_id='{O1}' AND acao='credito_aprovado'") == '1', rep)
    ready = pg.sql(f"SELECT ready_for_production::text||'|'||coalesce(approved_by::text,'-') FROM public.partner_orders WHERE id='{O1}'")
    check('credit release never sets production/commercial approval', 'false|-', ready)

    # settings and accounting gates
    O2 = 'd0000000-0000-4000-8000-000000000002'; order(O2)
    pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET active=false WHERE partner_id='{PART}';")
    e = session(U_FIN, f"SELECT public.approve_b2b_credit('{O2}','cfg');", False)
    check('inactive settings deny (no fallback)', True, 'configuracao_financeira_inativa' in e, e[-200:])
    pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET active=true, credit_limit=0 WHERE partner_id='{PART}';")
    e = session(U_FIN, f"SELECT public.approve_b2b_credit('{O2}','cfg');", False)
    check('zero limit is never unlimited', True, 'limite_nao_definido' in e, e[-200:])
    pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=100000 WHERE partner_id='{PART}';")
    O3 = 'd0000000-0000-4000-8000-000000000003'
    order(O3, snapshot={'contract': 'C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1', 'partner_id': PART})
    e = session(U_ADM, f"SELECT public.approve_b2b_credit('{O3}','acc');", False)
    check('C2_ACCOUNTING_PENDING preserved', True, 'C2_ACCOUNTING_PENDING' in e or 'C2_EXTERNAL' in e, e[-200:])
    check('accounting-pending order unchanged', 'aguardando_aprovacao_credito|-|limite_excedido', ost(O3))

    # ---------- revocation races (real locks, real authority reread) ----------
    O4 = 'd0000000-0000-4000-8000-000000000004'; order(O4)
    race('row', O4, f"SET session_replication_role=replica; DELETE FROM public.user_roles WHERE user_id='{U_ADM}' AND role='administrador';", 'role revoked during row lock')
    fill('user_roles', {'user_id': U_ADM, 'role': 'administrador'})
    O5 = 'd0000000-0000-4000-8000-000000000005'; order(O5)
    race('advisory', O5, f"SET session_replication_role=replica; UPDATE public.profiles SET ativo=false WHERE user_id='{U_ADM}';", 'profile deactivated during advisory lock')
    pg.sql(f"SET session_replication_role=replica; UPDATE public.profiles SET ativo=true WHERE user_id='{U_ADM}';")
    O6 = 'd0000000-0000-4000-8000-000000000006'; order(O6)
    race('advisory', O6, lambda: fill('partner_users', {'user_id': U_ADM, 'partner_id': PART, 'tenant_id': ORG_A}), 'external partner link added during advisory lock')
    check('race paths left zero tickets', '0', pg.sql('SELECT count(*) FROM platform_private.credit_approval_tickets_20261029'))
    check('race paths created no titles/dispatch', before, counters())

    # ---------- deny-only rollback ----------
    hist = pg.sql("SELECT count(*) FROM public.partner_order_audit_logs")
    pg.sql((H / '01-credit-approval.rollback.sql.review').read_text())
    e = session(U_FIN, f"SELECT public.approve_b2b_credit('{O2}','rb');", False)
    check('after rollback approval EXECUTE denied', True, 'permission denied' in e, e[-200:])
    check('rollback retains history', hist, pg.sql("SELECT count(*) FROM public.partner_order_audit_logs"))
    check('rollback retains ticket table and guards', 't', pg.sql("SELECT to_regclass('platform_private.credit_approval_tickets_20261029') IS NOT NULL AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_partner_orders_credit_guard')"))

    fails = [r for r in rows if r['status'] != 'PASS']
    result = {'scope': 'disposable PG, exact captured catalog, synthetic rows, PostgREST-style claims without signature: NOT JWT/RLS/E2E proof',
              'candidate_function_md5': md5, 'pass': len(rows) - len(fails), 'fail': len(fails), 'rows': rows}
    (OUT / 'integrated-results.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'pass': result['pass'], 'fail': result['fail']}))
    return 1 if fails else 0


def seed_entitlement(src):
    """Seed only tables the captured resolver reads; returns True if resolver is satisfiable without code changes."""
    (OUT / 'entitlement-seed-note.txt').write_text('See integrated test; rows are synthetic pre-state of real tables.\n')
    try:
        seed_plan()
        return True
    except AssertionError as e:
        (OUT / 'entitlement-seed-error.txt').write_text(str(e))
        return False


MOD = 'e0000000-0000-4000-8000-0000000000m1'.replace('m', '0')
FEAT = 'e0000000-0000-4000-8000-000000000f01'
PV = 'e0000000-0000-4000-8000-000000000a01'


def seed_plan(orgs=(ORG_A, ORG_F)):
    fill('saas_modules', {'id': MOD, 'key': 'b2b', 'active': True})
    fill('saas_features', {'id': FEAT, 'module_id': MOD, 'key': 'pedidos_b2b', 'active': True})
    fill('saas_plan_versions', {'id': PV, 'status': 'PUBLISHED', 'version_number': 1, 'revision': 1, 'price_amount': 0, 'currency': 'BRL', 'billing_cycle': 'monthly', 'trial_days': 30, 'published_at': '2026-01-01', 'limits_snapshot': {}, 'features_snapshot': ['pedidos_b2b'], 'effective_from': '2026-01-01', 'effective_to': None})
    fill('saas_plan_version_features', {'plan_version_id': PV, 'feature_id': FEAT, 'enabled': True})
    for i, org in enumerate(orgs):
        fill('organization_subscriptions', {'id': f'e0000000-0000-4000-8000-00000000050{i}', 'organization_id': org, 'plan_version_id': PV,
                                            'status': 'ACTIVE', 'started_at': '2026-01-01', 'cancel_at': None})


if __name__ == '__main__':
    sys.exit(main())
