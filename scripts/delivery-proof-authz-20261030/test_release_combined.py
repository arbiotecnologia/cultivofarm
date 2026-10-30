"""Coordinated release rehearsal on disposable PG: atomic + proof in ONE transaction.
Forced failure in the LAST (proof) POST must roll back the atomic part too; COMMIT +
exact proof POST; rerun refused; cached-frontend legacy adapters callable. Never hosted."""
import json, sys, time, traceback
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
def state(): return sql("SELECT jsonb_build_array(to_regclass('platform_private.delivery_context_20261030') IS NULL, to_regprocedure('public.rpc_entrega_comprovante_anexar_v1(uuid,text,jsonb)') IS NULL, (SELECT count(*) FROM pg_trigger WHERE tgname='zz_delivery_mutation_closed'), md5(pg_get_functiondef('public.rpc_anexar_comprovante_entrega(uuid,jsonb)'::regprocedure)), has_table_privilege('authenticated','public.entregas','UPDATE'))::text;")
def main():
    t0 = time.monotonic()
    r = restore.restore(); assert not any(r.values()), json.dumps(r)
    import assemble_install; assemble_install.build()
    assert (H / 'capture/post-expected.json').exists(), 'exact POST missing: run test_proof_pg first'
    assemble.build(); rel = (H / 'release-combined.sql.review').read_text()
    assert rel.count('\nCOMMIT;') == 1 and rel.count("BEGIN; SET LOCAL lock_timeout") == 1
    passed('combined release has exactly one BEGIN and one COMMIT', bytes=len(rel))
    base = state(); print('BASE', base, flush=True)
    assert json.loads(base)[0] is True and json.loads(base)[2] == 0
    broken = rel.replace("'DELIVERY_PROOF_POST_DRIFT: 0'", "'DELIVERY_PROOF_POST_DRIFT: 0'; END IF; IF true THEN RAISE EXCEPTION 'LOCAL_POST_FORCED_FAIL'", 1)
    assert broken != rel
    fails(broken, 'LOCAL_POST_FORCED_FAIL'); assert state() == base
    passed('forced failure in final proof POST rolls back the atomic part too (no barrier-without-proof window)')
    sql(rel); after = state(); a = json.loads(after)
    assert a[0] is False and a[1] is False and a[2] == 1 and a[4] is False, after
    passed('combined COMMIT: barrier, proof RPCs and adapters installed together')
    sql((H / 'postflight.sql.review').read_text()); passed('standalone exact proof POST passes after combined install')
    fails(rel, 'ALREADY_INSTALLED'); assert state() == after; passed('combined rerun refused without changes')
    out = pg.sql("SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000999'; SELECT public.rpc_gerar_formulario_entrega(gen_random_uuid());", False)
    assert 'DELIVERY_PROOF_ACTOR_DENIED' in out, out
    passed('legacy adapter reachable by authenticated and fails closed for unknown actor (not permission denied)')
    print('ELAPSED', round(time.monotonic() - t0, 1), flush=True)
if __name__ == '__main__':
    try: main()
    except Exception:
        traceback.print_exc(); checks.append({'test': 'execution stopped at concrete failure', 'status': 'FAIL', 'error': traceback.format_exc()[-3000:]})
    finally:
        (H / 'test-release-combined-results.json').write_text(json.dumps(checks, indent=2) + '\n')
        print('RESULT', sum(x['status'] == 'PASS' for x in checks), 'PASS', sum(x['status'] == 'FAIL' for x in checks), 'FAIL', flush=True)
    sys.exit(1 if any(x['status'] != 'PASS' for x in checks) else 0)
