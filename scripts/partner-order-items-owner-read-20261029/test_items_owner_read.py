"""partner_order_items owner-read complement on disposable PostgreSQL restored from read-only canonical capture.
Stages: BASELINE -> orders package -> items package -> items rollback. Synthetic rows, unsigned claims (NOT JWT/RLS proof).
"""
import json, re, sys
from pathlib import Path
sys.dont_write_bytecode = True
H = Path(__file__).resolve().parent
ROOT = H.parents[1]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'docs/auditorias/evidencias-cadeia-financeira-20261029/partner-order-items-owner-read')
OUT.mkdir(parents=True, exist_ok=True)
ORD = ROOT / 'scripts/partner-orders-owner-read-20261029'
sys.path.insert(0, str(ORD))
sys.argv = [sys.argv[0], str(OUT)]
import test_owner_read as B  # noqa: E402  helpers/fixture constants only
T, pg, check, fill, attempt, rows = B.T, B.pg, B.check, B.fill, B.attempt, B.rows
U, ROLES, PART, PART2, O1, O2, ORG_A, ORG_F = B.U, B.ROLES, B.PART, B.PART2, B.O1, B.O2, B.ORG_A, B.ORG_F
I1, I2 = 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002'
PROD = 'f2000000-0000-4000-8000-000000000001'
POL = """SELECT md5(string_agg(policyname||'|'||permissive||'|'||cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), E'\\n' ORDER BY policyname)) FROM pg_policies WHERE schemaname='public' AND tablename='{t}'"""
V = "\\set VERBOSITY verbose\n"


def out1(o):
    m = re.search(r'ERROR:\s+([0-9A-Z]{5}):', o)
    if m: return 'SQLSTATE=' + m.group(1)
    return 'ERR_UNPARSED' if 'ERROR' in o else (o.strip().splitlines()[-1] if o.strip() else '')


def state():
    return pg.sql("SELECT md5(coalesce(string_agg(to_jsonb(i)::text, ',' ORDER BY id),'')) FROM public.partner_order_items i")


def snap(item_json):
    res = {}
    for k, uid in U.items():
        r = {}
        for lab, oid in (('items_O1', O1), ('items_O2', O2)):
            r[lab] = out1(attempt(uid, V + f"SELECT 'N='||count(*) FROM public.partner_order_items WHERE order_id='{oid}';")[1])
        r['orders_O1'] = out1(attempt(uid, V + f"SELECT 'N='||count(*) FROM public.partner_orders WHERE id='{O1}';")[1])
        new = {**json.loads(item_json), 'id': 'f1000000-0000-4000-8000-0000000000ff'}
        lit = json.dumps(new).replace("'", "''")
        r['insert'] = out1(attempt(uid, V + f"BEGIN; INSERT INTO public.partner_order_items SELECT * FROM jsonb_populate_record(NULL::public.partner_order_items, '{lit}'::jsonb); SELECT 'INSERTED'; ROLLBACK;")[1])
        r['update'] = out1(attempt(uid, V + f"BEGIN; WITH u AS (UPDATE public.partner_order_items SET quantidade=quantidade WHERE id='{I1}' RETURNING 1) SELECT 'U='||count(*) FROM u; ROLLBACK;")[1])
        r['update_move'] = out1(attempt(uid, V + f"BEGIN; WITH u AS (UPDATE public.partner_order_items SET order_id='{O2}' WHERE id='{I1}' RETURNING 1) SELECT 'U='||count(*) FROM u; ROLLBACK;")[1])
        r['delete'] = out1(attempt(uid, V + f"BEGIN; WITH d AS (DELETE FROM public.partner_order_items WHERE id='{I1}' RETURNING 1) SELECT 'D='||count(*) FROM d; ROLLBACK;")[1])
        res[k] = r
    res['anon'] = {'items_all': out1(pg.sql("SET ROLE anon; SELECT 'N='||count(*) FROM public.partner_order_items;"))}
    return res


def dml(s):
    return {k: {x: y for x, y in v.items() if x in ('insert', 'update', 'update_move', 'delete')} for k, v in s.items()}


def main():
    j = T.restore_stack.merge_supplement(json.loads((T.H / 'capture/stack-metadata-2028.json').read_text()))
    res = T.restore_stack.restore(j)
    check('restoration has zero unresolved objects', {k: 0 for k in res}, {k: len(v) for k, v in res.items()})
    check('restored items policies equal hosted capture', '3233f822832e8121b0c42aaf572c4ada', pg.sql(POL.format(t='partner_order_items')))
    check('restored phase1_order_visible equals hosted pin', '8504f07fbc3a7975accf919f386d00eb',
          pg.sql("SELECT md5(pg_get_functiondef('platform_private.b2b_phase1_order_visible(uuid)'::regprocedure))"))
    for org in (ORG_A, ORG_F):
        fill('organizations', {'id': org, 'ativo': True, 'status': 'ativa', 'partner_account_id': None})
    fill('partner_accounts', {'id': PART, 'commercial_owner_organization_id': ORG_A, 'ativo': True})
    fill('partner_accounts', {'id': PART2, 'commercial_owner_organization_id': ORG_F, 'ativo': True})
    for k, uid in U.items():
        fill('users', {'id': uid}, 'auth')
        fill('profiles', {'user_id': uid, 'organization_id': ORG_F if k == 'fsf_admin' else ORG_A,
                          'ativo': k != 'arbio_admin_inactive', 'senha_provisoria': False})
        for role in ROLES[k]:
            fill('user_roles', {'user_id': uid, 'role': role})
    fill('partner_users', {'user_id': U['ext_partner_part'], 'partner_id': PART, 'tenant_id': ORG_A, 'revoked_at': None})
    fill('partner_orders', {'id': O1, 'partner_id': PART, 'status': 'pendente', 'total': 10, 'subtotal': 10, 'created_by': U['arbio_admin']})
    fill('partner_orders', {'id': O2, 'partner_id': PART2, 'status': 'pendente', 'total': 10, 'subtotal': 10, 'created_by': U['fsf_admin']})
    fill('produtos', {'id': PROD, 'nome': 'Produto sintetico', 'ativo': True})
    fill('partner_order_items', {'id': I1, 'order_id': O1, 'product_id': PROD, 'quantidade': 1, 'preco_unitario': 10, 'subtotal': 10})
    fill('partner_order_items', {'id': I2, 'order_id': O2, 'product_id': PROD, 'quantidade': 1, 'preco_unitario': 10, 'subtotal': 10})
    item_json = pg.sql(f"SELECT to_jsonb(i) FROM public.partner_order_items i WHERE id='{I1}'")
    lit0 = json.dumps({**json.loads(item_json), 'id': 'f1000000-0000-4000-8000-0000000000fe'}).replace("'", "''")
    ctl = pg.sql(f"SET session_replication_role=replica; BEGIN; INSERT INTO public.partner_order_items SELECT * FROM jsonb_populate_record(NULL::public.partner_order_items, '{lit0}'::jsonb); SELECT 'INS_OK'; ROLLBACK;")
    check('fixture control: item INSERT payload valid (privileged, rolled back)', 'INS_OK', ctl.strip().splitlines()[-1])

    s0 = state(); base = snap(item_json); check('baseline persisted nothing', s0, state())
    bad = {k: v for k, v in base.items() for x, y in v.items() if y == 'ERR_UNPARSED' or (y.startswith('SQLSTATE=') and y != 'SQLSTATE=42501')}
    check('baseline DML outcomes only 42501 or row counts (no fixture errors)', {}, bad)
    check('RED baseline: ARBio admin sees zero order and zero items', ('N=0', 'N=0'), (base['arbio_admin']['orders_O1'], base['arbio_admin']['items_O1']))

    # orders package only
    pg.sql((ORD / 'install.sql.final.review').read_text())
    s1 = state(); st1 = snap(item_json); check('orders-only stage persisted nothing', s1, state())
    check('GAP: orders package alone -> admin sees order but still zero items', ('N=1', 'N=0'), (st1['arbio_admin']['orders_O1'], st1['arbio_admin']['items_O1']))

    inst = (H / 'install.sql.review').read_text()
    r = pg.sql(inst.replace('__HELPER_MD5__', '0' * 32).replace('__POST_POLICIES_MD5__', '0' * 32), False)
    check('wrong POST pin aborts atomically', ('POST_HELPER_BODY_DRIFT', 'f', '3233f822832e8121b0c42aaf572c4ada'),
          ('POST_HELPER_BODY_DRIFT' if 'POST_HELPER_BODY_DRIFT' in r else r[-200:],
           pg.sql("SELECT to_regprocedure('platform_private.b2b_owner_internal_order_readable(uuid)') IS NOT NULL"), pg.sql(POL.format(t='partner_order_items'))))
    pins_f = H / 'pins.json'
    if not pins_f.exists():
        body = inst.split('-- ---------- POSTFLIGHT ----------')[0]
        o = pg.sql(body + "\nSELECT md5(pg_get_functiondef('platform_private.b2b_owner_internal_order_readable(uuid)'::regprocedure))||' '||(" + POL.format(t='partner_order_items') + ");\nROLLBACK;")
        h, p = o.strip().splitlines()[-1].split()
        pins_f.write_text(json.dumps({'helper_md5': h, 'post_policies_md5': p}, indent=2) + '\n')
    pins = json.loads(pins_f.read_text())
    final = inst.replace('__HELPER_MD5__', pins['helper_md5']).replace('__POST_POLICIES_MD5__', pins['post_policies_md5'])
    rb = (H / 'rollback.sql.review').read_text().replace('__POST_POLICIES_MD5__', pins['post_policies_md5'])
    (H / 'install.sql.final.review').write_text(final); (H / 'rollback.sql.final.review').write_text(rb)
    pre_ro = 'BEGIN READ ONLY;\n' + final.split('-- ---------- PREFLIGHT ----------')[1].split('-- ---------- CHANGE ----------')[0] + 'ROLLBACK;\n'
    post_ro = 'BEGIN READ ONLY;\n' + final.split('-- ---------- POSTFLIGHT ----------')[1].replace('COMMIT;', 'ROLLBACK;')
    (H / 'preflight.sql.readonly').write_text(pre_ro); (H / 'postflight.sql.readonly').write_text(post_ro)
    pg.sql(pre_ro); check('read-only preflight passes (orders installed, items baseline)', True, True)
    pg.sql(final)
    pg.sql(post_ro); check('read-only postflight passes after install', True, True)
    check('rerun refused', True, 'PRE_' in pg.sql(final, False))
    check('helper ACL: no PUBLIC/anon', 'postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres',
          pg.sql("SELECT array_to_string(proacl,',') FROM pg_proc WHERE oid='platform_private.b2b_owner_internal_order_readable(uuid)'::regprocedure"))
    src = re.sub(r'--[^\n]*', '', pg.sql("SELECT prosrc FROM pg_proc WHERE oid='platform_private.b2b_owner_internal_order_readable(uuid)'::regprocedure"))
    check('helper references only partner_orders + owner predicate (no items -> no recursion)',
          [('', 'b2b_owner_internal_partner_readable'), ('partner_orders', '')], sorted(set(re.findall(r'public\.(\w+)|platform_private\.(\w+)', src))))
    check('partner_orders policies never reference partner_order_items', '0',
          pg.sql("SELECT count(*) FROM pg_policies WHERE tablename='partner_orders' AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%partner_order_items%'"))

    s2 = state(); post = snap(item_json); check('post-install persisted nothing', s2, state())
    check('DML matrix identical to baseline for every actor', dml(base), dml(post))
    exp = {k: st1[k]['items_O1'] for k in U}; exp.update({'arbio_admin': 'N=1', 'arbio_gc': 'N=1'})
    check('items of own partner: only ARBio admin/gestor_comercial newly see (financeiro not in baseline permissive)', exp, {k: post[k]['items_O1'] for k in U})
    check('ARBio internal actors see zero items of other-tenant order', ['N=0'] * 3, [post[k]['items_O2'] for k in ('arbio_admin', 'arbio_fin', 'arbio_gc')])
    for k in ('fsf_admin', 'arbio_cum_admin_parceiro', 'arbio_norole', 'arbio_admin_inactive', 'arbio_gestor', 'superadmin', 'arbio_fin'):
        check(f'negative: {k} sees zero ARBio items', 'N=0', post[k]['items_O1'])
    check('external B2B partner path preserved', base['ext_partner_part']['items_O1'], post['ext_partner_part']['items_O1'])
    check('anon still zero', 'N=0', post['anon']['items_all'])
    sel = lambda: out1(attempt(U['arbio_admin'], V + f"SELECT 'N='||count(*) FROM public.partner_order_items WHERE order_id='{O1}';")[1])
    for setup, undo, label in (
        (f"UPDATE public.organizations SET ativo=false WHERE id='{ORG_A}'", f"UPDATE public.organizations SET ativo=true WHERE id='{ORG_A}'", 'inactive owner org'),
        (f"UPDATE public.partner_accounts SET ativo=false WHERE id='{PART}'", f"UPDATE public.partner_accounts SET ativo=true WHERE id='{PART}'", 'inactive partner'),
        (f"UPDATE public.partner_accounts SET deleted_at=now() WHERE id='{PART}'", f"UPDATE public.partner_accounts SET deleted_at=NULL WHERE id='{PART}'", 'deleted partner'),
        (f"UPDATE public.profiles SET ativo=false WHERE user_id='{U['arbio_admin']}'", f"UPDATE public.profiles SET ativo=true WHERE user_id='{U['arbio_admin']}'", 'inactive profile'),
        (f"INSERT INTO public.user_roles(user_id,role) VALUES ('{U['arbio_admin']}','parceiro_b2b')", f"DELETE FROM public.user_roles WHERE user_id='{U['arbio_admin']}' AND role='parceiro_b2b'", 'mixed external role added'),
    ):
        pg.sql('SET session_replication_role=replica; ' + setup + ';')
        check(f'{label} denies items', 'N=0', sel())
        pg.sql('SET session_replication_role=replica; ' + undo + ';')
    check('positive restored after fixture resets', 'N=1', sel())
    o = attempt(U['arbio_admin'], V + f"SELECT 'P='||count(p.nome) FROM public.partner_order_items i LEFT JOIN public.produtos p ON p.id=i.product_id WHERE i.order_id='{O1}';")[1]
    check('hook join items->produtos readable for owner admin (catalog RLS unchanged)', 'P=1', out1(o))
    o = attempt(U['fsf_admin'], V + f"SELECT 'P='||count(*) FROM public.partner_order_items i JOIN public.produtos p ON p.id=i.product_id WHERE i.order_id='{O1}';")[1]
    check('tenantFSF join on ARBio items returns zero', 'P=0', out1(o))

    pg.sql(rb)
    check('items rollback restores exact original items policies', '3233f822832e8121b0c42aaf572c4ada', pg.sql(POL.format(t='partner_order_items')))
    check('items rollback leaves orders package intact', '87776bb912a6157a493cd0488586c7af', pg.sql(POL.format(t='partner_orders')))
    check('rollback neutralizes helper', 'postgres=X/postgres,service_role=X/postgres',
          pg.sql("SELECT array_to_string(proacl,',') FROM pg_proc WHERE oid='platform_private.b2b_owner_internal_order_readable(uuid)'::regprocedure"))
    after = snap(item_json)
    check('matrix after items rollback equals orders-only stage', st1, after)
    check('rollback rerun refused', True, 'ROLLBACK_PRE_DRIFT' in pg.sql(rb, False))
    (OUT / 'results.json').write_text(json.dumps({'rows': rows, 'pins': pins, 'baseline': base, 'orders_only': st1, 'post': post}, indent=2, ensure_ascii=False) + '\n')
    p = sum(x['status'] == 'PASS' for x in rows)
    print(json.dumps({'pass': p, 'fail': len(rows) - p}))
    return 0 if p == len(rows) else 1


if __name__ == '__main__':
    sys.exit(main())
