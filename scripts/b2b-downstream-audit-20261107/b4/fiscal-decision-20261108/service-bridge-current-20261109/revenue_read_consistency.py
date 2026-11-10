"""Leitor V2: consistência de LEITURA em duas+ conexões reais (revisão 95e8c3b).

Sondas DESCARTÁVEIS: cópias do corpo antigo (95e8c3b) e do candidato, renomeadas e com UMA linha
`PERFORM pg_advisory_xact_lock_shared(770011)` inserida entre o laço de títulos e a soma do residual.
A barreira só é aceita quando pg_stat_activity/pg_blocking_pids/pg_locks provam a espera no holder;
a mutação é o writer canônico real da cadeia (callback NF / pagamento / cancelamento), confirmado em
outra conexão enquanto as sondas esperam. Nunca prova por tempo; aborta sem PASS se não esperou.
"""
import concurrent.futures, hashlib, json, uuid
from pathlib import Path
from lifecycle_lock_barrier import poll

KEY = 770011
ANCHOR = ' -- Previsão não exigível: residual vivo com pedido/parceiro/emissor coerentes.'
REAL = 'public.rpc_b2b_revenue_forecast_tenant_v2('

def _pkg():
    return Path(__file__).resolve().parents[4] / 'b2b-revenue-forecast-tenant-20261110' / 'v2'

def probe_sql(body, name):
    assert body.count(ANCHOR) == 1 and body.count(REAL) == 1, 'ANCHOR_OR_NAME_NOT_UNIQUE'
    out = body.replace(REAL, f'public.{name}(').replace(ANCHOR, f' PERFORM pg_advisory_xact_lock_shared({KEY});\n' + ANCHOR)
    diff = [l for l in out.splitlines() if l not in body.splitlines()]
    assert len(diff) == 2, diff  # nome + barreira, nada mais
    return out, diff

def install_probes(B):
    d = _pkg(); meta = {}
    for name, path in (('local_probe_rv2_old', d / 'history-95e8c3b' / 'reader.sql'), ('local_probe_rv2_new', d / 'reader.sql')):
        body = path.read_text(); sql, diff = probe_sql(body, name)
        B.sql(sql + f"\nREVOKE ALL ON FUNCTION public.{name}(uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.{name}(uuid) TO authenticated;")
        meta[name] = dict(source=str(path.relative_to(d.parents[1])), source_sha256=hashlib.sha256(body.encode()).hexdigest(), injected_lines=diff)
    return meta

def drop_probes(B):
    B.sql("DROP FUNCTION IF EXISTS public.local_probe_rv2_old(uuid);DROP FUNCTION IF EXISTS public.local_probe_rv2_new(uuid);")

def _ctx(uid):
    claims = json.dumps({'sub': uid, 'role': 'authenticated', 'iat': 1, 'exp': 4102444800}).replace("'", "''")
    return f"SELECT set_config('request.jwt.claim.sub','{uid}',true);SELECT set_config('request.jwt.claims','{claims}',true);SET LOCAL ROLE authenticated;"

def _call(B, uid, fn, app):
    r = B.run_raw(f"SET application_name='{app}';BEGIN;{_ctx(uid)}SELECT public.{fn}(NULL);COMMIT;")
    js = [x for x in r.stdout.strip().splitlines() if x.strip().startswith('{')]
    return r, (json.loads(js[-1]) if r.returncode == 0 and js else None)

def tot(d): return round(float(d['confirmed_titles']['total_aberto']) + float(d['forecast_residual']['amount']), 2)

def race(B, Q, OUT, label, mutation, expect_old_mix=False, real_fn='rpc_b2b_revenue_forecast_tenant_v2'):
    """pre (real) -> sondas bloqueadas provadas -> mutação canônica commit -> libera -> post (real)."""
    out = Path(OUT) / 'revenue-tenant-v2'; out.mkdir(exist_ok=True)
    _, pre = _call(B, Q.UFIN, real_fn, 'rv2_pre_' + label)
    tag = 'rv2rc_' + uuid.uuid4().hex[:10]
    holder = B.T.session(f"SET application_name='{tag}_h';BEGIN;SELECT pg_advisory_xact_lock({KEY});")
    released = False
    try:
        h = poll(B, f"SELECT coalesce((SELECT jsonb_build_object('pid',a.pid,'state',a.state) FROM pg_stat_activity a WHERE a.application_name='{tag}_h'),'{{}}')::text;",
                 lambda r: r.get('state') == 'idle in transaction')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futs = {fn: pool.submit(_call, B, Q.UFIN, fn, f'{tag}_{fn}') for fn in ('local_probe_rv2_old', 'local_probe_rv2_new')}
            waits = {}
            for fn in futs:
                waits[fn] = poll(B, f"""SELECT coalesce((SELECT jsonb_build_object('pid',a.pid,'wait_event_type',a.wait_event_type,
                  'blocking',to_jsonb(pg_blocking_pids(a.pid)),'ungranted',(SELECT jsonb_agg(l.locktype||':'||l.mode) FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted))
                  FROM pg_stat_activity a WHERE a.application_name='{tag}_{fn}'),'{{}}')::text;""",
                  lambda r: r.get('wait_event_type') == 'Lock' and int(h['pid']) in (r.get('blocking') or []) and 'advisory:ShareLock' in (r.get('ungranted') or []),
                  deadline_seconds=20)
            mres = mutation()  # writer canônico real, outra conexão, COMMIT enquanto as sondas esperam
            still = json.loads(B.last(f"SELECT jsonb_agg(application_name)::text FROM pg_stat_activity WHERE application_name LIKE '{tag}_local%' AND wait_event_type='Lock';") or 'null')
            assert still and len(still) == 2, ('PROBES_NOT_WAITING_AT_COMMIT', still)
            B.T.finish(holder, 'COMMIT;'); released = True
            got = {fn: f.result(timeout=60) for fn, f in futs.items()}
    finally:
        if not released:
            B.last(f"SELECT coalesce(bool_and(pg_terminate_backend(pid)),true)::text FROM pg_stat_activity WHERE application_name LIKE '{tag}_local%';")
            B.T.finish(holder, 'ROLLBACK;')
    _, post = _call(B, Q.UFIN, real_fn, 'rv2_post_' + label)
    old, new = got['local_probe_rv2_old'][1], got['local_probe_rv2_new'][1]
    assert pre is not None and post is not None, ('REFERENCE_READER_UNAVAILABLE', real_fn)
    rec = dict(label=label, waiter_proof=waits, holder=h, pre=pre, post=post, old_probe=old, new_probe=new,
               old_classification=('MIXED' if old not in (pre, post) else ('PRE' if old == pre else 'POST')),
               new_classification=('MIXED' if new not in (pre, post) else ('PRE' if new == pre else 'POST')),
               changed=pre != post, reference_reader=real_fn, hosted=False, timing_only_proof=False)
    assert got['local_probe_rv2_new'][0].returncode == 0 and new in (pre, post), ('NEW_READER_MIXED', rec)
    assert new == post, ('NEW_READER_EXPECTED_POST_AFTER_RETRY', rec)  # 1ª tentativa vê mudança na impressão digital e recalcula
    if expect_old_mix:
        assert rec['old_classification'] == 'MIXED', ('OLD_MIX_NOT_REPRODUCED', rec)
    f = out / 'read-consistency.json'
    prev = json.loads(f.read_text()) if f.exists() else []
    f.write_text(json.dumps(prev + [rec], indent=1, default=str) + '\n')
    return mres, rec
