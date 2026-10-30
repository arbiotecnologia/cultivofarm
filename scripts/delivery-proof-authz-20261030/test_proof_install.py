"""Installer rehearsal on disposable PG: PRE drift (body/ACL), POST failure rollback,
COMMIT + exact POST, rerun refused, deny-only rollback. Never hosted."""
import json, sys, time, traceback, hashlib
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
sys.path.insert(0, str(ATOMIC)); sys.path.insert(0, str(H))
import restore
from restore import pg
import assemble_proof as assemble
checks = []
def passed(label, **kw): checks.append({'test': label, 'status': 'PASS', **kw}); print('PASS', label, flush=True)
def sql(s): return pg.sql(s)
def fails(s, code): e = pg.sql(s, False); assert code in e, e[-800:]; return e
def state(): return sql("SELECT jsonb_build_array(to_regprocedure('public.rpc_entrega_comprovante_anexar_v1(uuid,text,jsonb)') IS NULL, md5(pg_get_functiondef('platform_private.delivery_mutation_guard_20261030()'::regprocedure)), md5(pg_get_functiondef('public.rpc_anexar_comprovante_entrega(uuid,jsonb)'::regprocedure)), (SELECT proacl::text FROM pg_proc WHERE oid='public.rpc_anexar_comprovante_entrega(uuid,jsonb)'::regprocedure))::text;")

def main():
    t0 = time.monotonic()
    r = restore.restore(); assert not any(r.values()), json.dumps(r)
    import assemble_install; assemble_install.build()
    sql((ATOMIC / 'install.sql.review').read_text()); passed('atomic package installed (order 1)')
    assert (H / 'capture/post-expected.json').exists(), 'exact POST missing: run test_proof_pg first'
    assemble.build(); install = (H / 'install.sql.review').read_text()
    assert 'DELIVERY_PROOF_POST_DRIFT: 0' in install; passed('installer contains exact POST pins', pins=install.count('DELIVERY_PROOF_POST_DRIFT'))
    base = state()
    cur = json.loads((ATOMIC / 'capture/current.json').read_text())
    legacy = [f for f in cur['functions'] if f['signature'] == 'public.rpc_anexar_comprovante_entrega(p_entrega_id uuid, p_payload jsonb)'][0]
    # PRE body drift
    sql(legacy['body'].replace("RAISE EXCEPTION 'Sessão inválida'", "RAISE EXCEPTION 'Sessão inválida.'") + ';')
    fails(install, 'DELIVERY_PROOF_PRE_FUNCTION_DRIFT'); sql(legacy['body'] + ';')
    assert state() == base; passed('PRE refuses real legacy body drift; nothing installed')
    # PRE ACL drift
    sql('GRANT EXECUTE ON FUNCTION public.rpc_anexar_comprovante_entrega(uuid,jsonb) TO anon;')
    fails(install, 'DELIVERY_PROOF_PRE_FUNCTION_DRIFT'); sql('REVOKE EXECUTE ON FUNCTION public.rpc_anexar_comprovante_entrega(uuid,jsonb) FROM anon;')
    assert state() == base; passed('PRE refuses ACL drift; nothing installed')
    # PRE guard drift (atomic package not exactly installed)
    g = sql("SELECT pg_get_functiondef('platform_private.delivery_mutation_guard_20261030()'::regprocedure);")
    sql(g.replace("BEGIN\n", "BEGIN\n -- local drift\n", 1) + ';')
    assert state() != base
    fails(install, 'DELIVERY_PROOF_PRE_GUARD_DRIFT'); sql(g + ';'); sql('REVOKE ALL ON FUNCTION platform_private.delivery_mutation_guard_20261030() FROM PUBLIC,anon,authenticated,service_role;')
    assert state() == base; passed('PRE refuses barrier drift; nothing installed')
    # POST failure -> whole transaction rolled back
    broken = install.replace("'DELIVERY_PROOF_POST_DRIFT: 0'", "'DELIVERY_PROOF_POST_DRIFT: 0'; END IF; IF true THEN RAISE EXCEPTION 'LOCAL_POST_FORCED_FAIL'", 1)
    fails(broken, 'LOCAL_POST_FORCED_FAIL'); assert state() == base; passed('forced POST failure rolls back every DDL/ACL change')
    # COMMIT + exact POST
    sql(install); sql((H / 'postflight.sql.review').read_text()); after = state()
    assert after != base; passed('COMMIT and standalone exact POST pass')
    fails(install, 'DELIVERY_PROOF_ALREADY_INSTALLED'); assert state() == after; passed('rerun refused without changes')
    sql((H / 'rollback.sql.review').read_text())
    assert sql("SELECT NOT has_function_privilege('authenticated','public.rpc_entrega_comprovante_anexar_v1(uuid,text,jsonb)','EXECUTE');") == 't'
    fails("SELECT platform_private.delivery_proof_apply_20261030('generate',gen_random_uuid(),'rollback-0001','{}');", 'DELIVERY_PROOF_ROLLBACK_CLOSED')
    fails('SELECT public.rpc_anexar_comprovante_entrega(gen_random_uuid(),\'{}\');', 'DELIVERY_LEGACY_CLOSED')
    assert sql("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='zz_delivery_mutation_closed' AND tgenabled='O');") == 't'
    passed('rollback is deny-only: RPCs closed, legacy stays closed, barrier kept')
    fails(install, 'DELIVERY_PROOF_ALREADY_INSTALLED'); passed('installer still refuses after rollback (no silent reopen)')
    print('ELAPSED', round(time.monotonic() - t0, 1), flush=True)

if __name__ == '__main__':
    try: main()
    except Exception:
        traceback.print_exc(); checks.append({'test': 'execution stopped at concrete failure', 'status': 'FAIL', 'error': traceback.format_exc()[-3000:]})
    finally:
        (H / 'test-proof-install-results.json').write_text(json.dumps(checks, indent=2) + '\n')
        print('RESULT', sum(x['status'] == 'PASS' for x in checks), 'PASS', sum(x['status'] == 'FAIL' for x in checks), 'FAIL', flush=True)
    sys.exit(1 if any(x['status'] != 'PASS' for x in checks) else 0)
