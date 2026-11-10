"""Disposable PG lock evidence: deadlines bound polling, never attest a wait by delay."""
import concurrent.futures
import json
import time
import uuid


def poll(B, query, predicate, deadline_seconds=2):
    until = time.monotonic() + deadline_seconds
    last = None
    while time.monotonic() < until:
        last = json.loads(B.last(query))
        if predicate(last):
            return last
        time.sleep(.01)
    raise AssertionError({'barrier': 'NOT_PROVEN_ABORT_NO_PASS', 'last_observation': last})


def revoke_after_proven_wait(B, lock_sql, caller_sql, mutation_sql):
    """Caller must block on this specific holder before mutation is sent to PG.

    Both sessions use unique application_name; pg_blocking_pids + an ungranted
    pg_locks row prove the relationship. Holder remains open until explicit COMMIT.
    On any failed barrier, terminate caller and roll back holder without revocation.
    """
    tag = 'forecast_review_' + uuid.uuid4().hex
    holder_name, waiter_name = tag + '_holder', tag + '_waiter'
    holder = B.T.session(f"SET application_name='{holder_name}';BEGIN;{lock_sql}")
    completed_holder = False
    try:
        ready = poll(B, f"""SELECT coalesce((SELECT jsonb_build_object('pid',a.pid,'state',a.state,
            'granted',EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND l.granted))
          FROM pg_stat_activity a WHERE a.application_name='{holder_name}'),'{{}}'::jsonb)::text;""",
                     lambda r: r.get('state') == 'idle in transaction' and r.get('granted') is True)
        holder_pid = int(ready['pid'])
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(B.run_raw, f"SET application_name='{waiter_name}';" + caller_sql)
            try:
                evidence = poll(B, f"""SELECT coalesce((SELECT jsonb_build_object(
                  'waiter_pid',a.pid,'holder_pid',{holder_pid},'wait_event_type',a.wait_event_type,
                  'blocking_pids',to_jsonb(pg_blocking_pids(a.pid)),
                  'ungranted_locks',(SELECT coalesce(jsonb_agg(jsonb_build_object('locktype',l.locktype,
                    'mode',l.mode,'granted',l.granted,'relation',l.relation,'transactionid',l.transactionid::text)),'[]')
                    FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted))
                  FROM pg_stat_activity a WHERE a.application_name='{waiter_name}'),'{{}}'::jsonb)::text;""",
                                lambda r: r.get('wait_event_type') == 'Lock'
                                and holder_pid in r.get('blocking_pids', [])
                                and len(r.get('ungranted_locks', [])) > 0)
            except Exception:
                B.last(f"SELECT coalesce(bool_and(pg_terminate_backend(pid)),true)::text FROM pg_stat_activity WHERE application_name='{waiter_name}';")
                raise
            stdout, stderr = B.T.finish(holder, mutation_sql + 'COMMIT;')
            completed_holder = True
            assert not stderr, {'holder_stderr': stderr, 'holder_stdout': stdout}
            called = future.result(timeout=10)
        return called, dict(holder_ready=ready, waiter_before_revocation=evidence,
                            mutation_sent_after_waiter=True, timing_only_proof=False)
    finally:
        if not completed_holder:
            B.T.finish(holder, 'ROLLBACK;')


def assert_authorization_control(operation, result):
    """Authorization success may correctly stop at an independent business gate."""
    if operation == 'forecast_cancel':
        assert result.returncode != 0 and 'PT409' in result.stderr and 'B2B_FORECAST_FISCAL_IN_FLIGHT' in result.stderr, result.stderr
        return 'AUTHORIZATION_PASSED_BUSINESS_IN_FLIGHT_DENIED_NOT_CANCEL_SUCCESS'
    assert result.returncode == 0, result.stderr
    return 'AUTHORIZATION_PASSED_SYNC_ROLLBACK'