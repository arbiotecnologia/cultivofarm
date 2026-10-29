"""partner_orders owner-read candidate on a disposable PostgreSQL restored from the read-only canonical catalog capture.
Synthetic rows only; unsigned request.jwt.claims (NOT JWT/RLS hosted proof). Matrix BASELINE -> INSTALL -> ROLLBACK.
"""
import json, sys, re
from pathlib import Path
sys.dont_write_bytecode = True
H = Path(__file__).resolve().parent
ROOT = H.parents[1]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'docs/auditorias/evidencias-cadeia-financeira-20261029/partner-orders-owner-read')
OUT.mkdir(parents=True, exist_ok=True)
INC = ROOT / 'scripts/arbio-fsf-incremental-20261029'
sys.path.insert(0, str(INC))
sys.argv = [sys.argv[0], str(OUT)]
import test_integrated as T  # noqa: E402  (helpers only; its main() is not run)
from restore_stack import pg  # noqa: E402

check, fill, attempt, rows = T.check, T.fill, T.attempt, T.rows
ORG_A, ORG_F, PART = T.ORG_A, T.ORG_F, T.PART
PART2 = 'b0000000-0000-4000-8000-0000000000b2'   # partner owned by ORG_F (other tenant)
U = {
    'arbio_admin': 'c0000000-0000-4000-8000-000000000001',
    'arbio_fin': 'c0000000-0000-4000-8000-000000000002',
    'fsf_admin': 'c0000000-0000-4000-8000-000000000003',
    'arbio_cum_admin_parceiro': 'c0000000-0000-4000-8000-000000000004',
    'superadmin': 'c0000000-0000-4000-8000-000000000005',
    'arbio_gc': 'c0000000-0000-4000-8000-000000000006',
    'arbio_norole': 'c0000000-0000-4000-8000-000000000007',
    'arbio_admin_inactive': 'c0000000-0000-4000-8000-000000000008',
    'ext_partner_part': 'c0000000-0000-4000-8000-000000000009',
    'arbio_gestor': 'c0000000-0000-4000-8000-00000000000a',
}
ROLES = {'arbio_admin': ['administrador'], 'arbio_fin': ['financeiro'], 'fsf_admin': ['administrador'],
         'arbio_cum_admin_parceiro': ['administrador', 'parceiro_b2b'], 'superadmin': ['superadmin'],
         'arbio_gc': ['gestor_comercial'], 'arbio_norole': [], 'arbio_admin_inactive': ['administrador'],
         'ext_partner_part': ['parceiro_b2b'], 'arbio_gestor': ['gestor']}
O1, O2 = 'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002'
POL_Q = """SELECT md5(string_agg(policyname||'|'||permissive||'|'||cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), E'\\n' ORDER BY policyname)) FROM pg_policies WHERE schemaname='public' AND tablename='partner_orders'"""


def first_err(out):
    """Structured outcome: SQLSTATE for errors (VERBOSITY verbose), otherwise the last result line (counts)."""
    m = re.search(r'ERROR:\s+([0-9A-Z]{5}):', out)
    if m: return 'SQLSTATE=' + m.group(1)
    if 'ERROR' in out: return 'ERR_UNPARSED'
    return out.strip().splitlines()[-1] if out.strip() else ''


def state():
    return pg.sql("SELECT md5(string_agg(to_jsonb(o)::text, ',' ORDER BY id)) FROM public.partner_orders o")


def snapshot(order_json):
    """Per actor: SELECT count per partner and DML outcomes (each inside BEGIN/ROLLBACK)."""
    res = {}
    for k, uid in U.items():
        r = {}
        for lab, pid in (('sel_PART', PART), ('sel_PART2', PART2)):
            rc, out = attempt(uid, "\\set VERBOSITY verbose\n" + f"SELECT 'N='||count(*) FROM public.partner_orders WHERE partner_id='{pid}';")
            r[lab] = first_err(out)
        new = json.loads(order_json); new['id'] = 'e0000000-0000-4000-8000-0000000000ff'; new['numero'] = 'PB-SYN-FF'
        lit = json.dumps(new).replace("'", "''")
        rc, out = attempt(uid, "\\set VERBOSITY verbose\n" + f"BEGIN; INSERT INTO public.partner_orders SELECT * FROM jsonb_populate_record(NULL::public.partner_orders, '{lit}'::jsonb); SELECT 'INSERTED'; ROLLBACK;")
        r['insert'] = first_err(out)
        rc, out = attempt(uid, "\\set VERBOSITY verbose\n" + f"BEGIN; WITH u AS (UPDATE public.partner_orders SET updated_at=updated_at WHERE id='{O1}' RETURNING 1) SELECT 'U='||count(*) FROM u; ROLLBACK;")
        r['update'] = first_err(out)
        rc, out = attempt(uid, "\\set VERBOSITY verbose\n" + f"BEGIN; WITH u AS (UPDATE public.partner_orders SET partner_id='{PART2}' WHERE id='{O1}' RETURNING 1) SELECT 'U='||count(*) FROM u; ROLLBACK;")
        r['update_move'] = first_err(out)
        rc, out = attempt(uid, "\\set VERBOSITY verbose\n" + f"BEGIN; WITH d AS (DELETE FROM public.partner_orders WHERE id='{O1}' RETURNING 1) SELECT 'D='||count(*) FROM d; ROLLBACK;")
        r['delete'] = first_err(out)
        res[k] = r
    res['anon'] = {'sel_all': first_err(pg.sql("SET ROLE anon; SELECT 'N='||count(*) FROM public.partner_orders;"))}
    return res


def dml_only(s):
    return {k: {x: y for x, y in v.items() if not x.startswith('sel')} for k, v in s.items()}


def main():
    j = T.restore_stack.merge_supplement(json.loads((INC / 'capture/stack-metadata-2028.json').read_text()))
    res = T.restore_stack.restore(j)
    check('restoration has zero unresolved objects', {k: 0 for k in res}, {k: len(v) for k, v in res.items()})
    check('restored partner_orders policies equal hosted capture (md5)', '8e07ffe28764e18b6b9b5b0f13df8410', pg.sql(POL_Q))

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
    order_json = pg.sql(f"SELECT to_jsonb(o) FROM public.partner_orders o WHERE id='{O1}'")

    lit0 = json.dumps({**json.loads(order_json), 'id': 'e0000000-0000-4000-8000-0000000000fe', 'numero': 'PB-SYN-FE'}).replace("'", "''")

    ctl = pg.sql(f"SET session_replication_role=replica; BEGIN; INSERT INTO public.partner_orders SELECT * FROM jsonb_populate_record(NULL::public.partner_orders, '{lit0}'::jsonb); SELECT 'INS_OK'; ROLLBACK;")
    check('fixture control: INSERT payload is structurally valid (privileged, rolled back)', 'INS_OK', ctl.strip().splitlines()[-1])
    s0 = state()
    base = snapshot(order_json)
    check('baseline matrix persisted nothing', s0, state())
    bad_dml = {k: v for k, v in base.items() for x, y in v.items() if y in ('ERR_UNPARSED',) or (y.startswith('SQLSTATE=') and y not in ('SQLSTATE=42501',))}
    check('baseline DML outcomes are only RLS denial (42501) or zero-row counts, never fixture errors', {}, bad_dml)
    check('RED baseline: ARBio admin (owner, no partner_account_id) sees zero own-partner orders', 'N=0', base['arbio_admin']['sel_PART'])

    install = (H / 'install.sql.review').read_text().replace('__PRE_POLICIES_MD5__', '8e07ffe28764e18b6b9b5b0f13df8410')
    pins = json.loads((H / 'pins.json').read_text()) if (H / 'pins.json').exists() else {}
    # Postflight drift test with wrong pins: whole transaction must roll back.
    bad = install.replace('__HELPER_MD5__', '0' * 32).replace('__POST_POLICIES_MD5__', '0' * 32)
    r = pg.sql(bad, False)
    check('wrong POST pin aborts atomically (helper absent, policies unchanged)', ('POST_HELPER_BODY_DRIFT', 'f', '8e07ffe28764e18b6b9b5b0f13df8410'),
          ('POST_HELPER_BODY_DRIFT' if 'POST_HELPER_BODY_DRIFT' in r else r[-200:], pg.sql("SELECT to_regprocedure('platform_private.b2b_owner_internal_partner_readable(uuid)') IS NOT NULL"), pg.sql(POL_Q)))
    r = pg.sql(install.replace('8e07ffe28764e18b6b9b5b0f13df8410', 'f' * 32, 1).replace('__HELPER_MD5__', '0' * 32).replace('__POST_POLICIES_MD5__', '0' * 32), False)
    check('wrong PRE pin aborts before change', True, 'PRE_POLICIES_DRIFT' in r)
    if not pins:
        # discovery: install in a rolled-back transaction to read the exact POST pins, then re-run with them.
        body = install.split('-- ---------- POSTFLIGHT ----------')[0].replace('COMMIT;', '')
        out = pg.sql(body + "\nSELECT md5(pg_get_functiondef('platform_private.b2b_owner_internal_partner_readable(uuid)'::regprocedure))||' '||(" + POL_Q + ");\nROLLBACK;")
        h, p = out.splitlines()[-1].split()
        pins = {'helper_md5': h, 'post_policies_md5': p}
        (H / 'pins.json').write_text(json.dumps(pins, indent=2) + '\n')
    final = install.replace('__HELPER_MD5__', pins['helper_md5']).replace('__POST_POLICIES_MD5__', pins['post_policies_md5'])
    (H / 'install.sql.final.review').write_text(final)
    rb = (H / 'rollback.sql.review').read_text().replace('__PRE_POLICIES_MD5__', '8e07ffe28764e18b6b9b5b0f13df8410').replace('__POST_POLICIES_MD5__', pins['post_policies_md5'])
    (H / 'rollback.sql.final.review').write_text(rb)
    pre_ro = 'BEGIN READ ONLY;\n' + final.split('-- ---------- PREFLIGHT')[1].split('-- ---------- CHANGE')[0].split('\n',1)[1] + 'ROLLBACK;\n'
    post_ro = 'BEGIN READ ONLY;\n' + final.split('-- ---------- POSTFLIGHT ----------')[1].replace('COMMIT;', 'ROLLBACK;')
    (H / 'preflight.sql.readonly').write_text(pre_ro); (H / 'postflight.sql.readonly').write_text(post_ro)
    pg.sql(pre_ro); check('read-only preflight passes on baseline', True, True)
    r = pg.sql(post_ro, False); check('read-only postflight fails before install', True, 'POST_HELPER' in r or 'does not exist' in r)
    pg.sql(final)
    pg.sql(post_ro); check('read-only postflight passes after install', True, True)
    check('installer COMMIT with exact POST pins', pins['post_policies_md5'], pg.sql(POL_Q))
    r = pg.sql(final, False)
    check('rerun refused (PRE drift / already installed)', True, 'PRE_' in r)
    check('helper ACL: no PUBLIC/anon execute', 'postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres',
          pg.sql("SELECT array_to_string(proacl,',') FROM pg_proc WHERE oid='platform_private.b2b_owner_internal_partner_readable(uuid)'::regprocedure"))
    src = pg.sql("SELECT prosrc FROM pg_proc WHERE oid='platform_private.b2b_owner_internal_partner_readable(uuid)'::regprocedure")
    code = re.sub(r'--[^\n]*', '', src)
    refs = sorted(set(re.findall(r'public\.(\w+)|platform_private\.(\w+)', code)))
    check('helper SQL (comments stripped) references only profiles-free scope tables/functions, never partner_orders',
          [('', 'h15_actor_organization'), ('organizations', ''), ('partner_accounts', ''), ('partner_users', ''), ('user_roles', '')], refs)
    nested = pg.sql("SELECT string_agg(DISTINCT n, ',') FROM (SELECT unnest(regexp_matches(prosrc, 'partner_orders', 'g')) n FROM pg_proc WHERE oid IN ('platform_private.h15_actor_organization()'::regprocedure, 'platform_private.platform_actor_access_ready(uuid)'::regprocedure)) x")
    check('transitive helpers (h15, access_ready) do not read partner_orders', '', nested)

    s1 = state()
    post = snapshot(order_json)
    check('post-install matrix persisted nothing', s1, state())
    check('DML matrix identical to baseline for every actor (INSERT/UPDATE/move/DELETE)', dml_only(base), dml_only(post))
    exp_sel = {k: base[k]['sel_PART'] for k in U}
    exp_sel.update({'arbio_admin': 'N=1', 'arbio_fin': 'N=1', 'arbio_gc': 'N=1'})
    check('SELECT own partner: only ARBio internal admin/financeiro/gestor_comercial newly see; others unchanged',
          exp_sel, {k: post[k]['sel_PART'] for k in U})
    check('SELECT other-tenant partner unchanged for ARBio actors (cross-tenant denied)',
          {k: base[k]['sel_PART2'] for k in U if k != 'fsf_admin'}, {k: post[k]['sel_PART2'] for k in U if k != 'fsf_admin'})
    check('ARBio internal actors still see zero of PART2', ['N=0'] * 3, [post[k]['sel_PART2'] for k in ('arbio_admin', 'arbio_fin', 'arbio_gc')])
    for k in ('fsf_admin', 'arbio_cum_admin_parceiro', 'arbio_norole', 'arbio_admin_inactive', 'arbio_gestor', 'superadmin'):
        check(f'negative: {k} sees zero ARBio partner orders', 'N=0', post[k]['sel_PART'])
    check('B2B external path preserved (same as baseline)', base['ext_partner_part']['sel_PART'], post['ext_partner_part']['sel_PART'])
    check('anon still zero', 'N=0', post['anon']['sel_all'])
    sel = lambda: first_err(attempt(U['arbio_admin'], "\\set VERBOSITY verbose\n" + f"SELECT 'N='||count(*) FROM public.partner_orders WHERE partner_id='{PART}';")[1])
    pg.sql(f"SET session_replication_role=replica; UPDATE public.organizations SET ativo=false WHERE id='{ORG_A}';")
    check('inactive owner org denies', 'N=0', sel())
    pg.sql(f"SET session_replication_role=replica; UPDATE public.organizations SET ativo=true WHERE id='{ORG_A}'; UPDATE public.partner_accounts SET ativo=false WHERE id='{PART}';")
    check('inactive partner denies', 'N=0', sel())
    pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_accounts SET ativo=true WHERE id='{PART}'; UPDATE public.profiles SET ativo=false WHERE user_id='{U['arbio_admin']}';")
    check('inactive profile denies', 'N=0', sel())
    pg.sql(f"SET session_replication_role=replica; UPDATE public.profiles SET ativo=true WHERE user_id='{U['arbio_admin']}';")
    fill('partner_users', {'user_id': U['arbio_admin'], 'partner_id': PART2, 'tenant_id': ORG_F, 'revoked_at': None})
    check('active external partner link denies internal read', 'N=0', sel())
    pg.sql(f"SET session_replication_role=replica; DELETE FROM public.partner_users WHERE user_id='{U['arbio_admin']}';")
    check('positive restored after fixture reset', 'N=1', sel())
    pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_accounts SET deleted_at=now() WHERE id='{PART}';")
    check('deleted partner denies', 'N=0', sel())
    pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_accounts SET deleted_at=NULL WHERE id='{PART}';")
    pg.sql(f"SET session_replication_role=replica; UPDATE public.organizations SET status='suspensa' WHERE id='{ORG_A}';")
    check('owner org status not ativa denies', 'N=0', sel())
    pg.sql(f"SET session_replication_role=replica; UPDATE public.organizations SET status='ativa' WHERE id='{ORG_A}';")
    rc, out = attempt(U['arbio_admin'], f"SELECT 'N='||count(*) FROM public.partner_orders o JOIN public.partner_accounts pa ON pa.id=o.partner_id WHERE o.partner_id='{PART}';")
    check('hook embed shape (orders + partner_accounts) readable for owner admin', 'N=1', first_err(out))
    rc, out = attempt(U['arbio_admin'], f"SELECT platform_private.b2b_owner_internal_partner_readable('{PART}');")
    check('helper is not a write capability: approve path untouched (function only returns boolean)', 't', out.splitlines()[-1].strip())

    pg.sql(rb)
    check('rollback restores exact original policies', '8e07ffe28764e18b6b9b5b0f13df8410', pg.sql(POL_Q))
    check('rollback neutralizes helper (false body, no authenticated EXECUTE)', 'postgres=X/postgres,service_role=X/postgres',
          pg.sql("SELECT array_to_string(proacl,',') FROM pg_proc WHERE oid='platform_private.b2b_owner_internal_partner_readable(uuid)'::regprocedure"))
    after_rb = snapshot(order_json)
    check('matrix after rollback equals baseline (deny-safe)', base, after_rb)
    r = pg.sql(rb, False)
    check('rollback rerun refused', True, 'ROLLBACK_PRE_DRIFT' in r)

    (OUT / 'results.json').write_text(json.dumps({'rows': rows, 'pins': pins, 'baseline': base, 'post': post}, indent=2, ensure_ascii=False) + '\n')
    p = sum(r['status'] == 'PASS' for r in rows)
    print(json.dumps({'pass': p, 'fail': len(rows) - p}))
    return 0 if p == len(rows) else 1


if __name__ == '__main__':
    sys.exit(main())
