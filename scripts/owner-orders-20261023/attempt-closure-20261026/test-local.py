"""PostgreSQL DESCARTAVEL apenas. Auth sintetica (request.jwt.claims); NAO e JWT/RLS hospedado.
Reaproveita a cadeia capturada do pacote accounting-pending (create LIVE byte-exato, prosrc
7a634235...) e aplica o candidato de fechamento duravel de tentativa."""
from pathlib import Path
import json, subprocess, sys, time, hashlib
D = Path(__file__).resolve().parent
AP = D.parent / 'accounting-pending-request-20261024' / 'test-local.py'
src = AP.read_text()
setup = src[:src.index("r1=json.loads(val(G,create(P,'pend-1'")]
G0 = {'__file__': str(AP), '__name__': 'harness'}
exec(compile(setup, str(AP), 'exec'), G0)
pg, ok, val, actor, snapshot, create, jwt = (G0[k] for k in ('pg', 'ok', 'val', 'actor', 'snapshot', 'create', 'jwt'))
G, GT, T, PR, GB, ADMIN, ADMIN_B, P, Q, hA, items = (G0[k] for k in ('G', 'GT', 'T', 'PR', 'GB', 'ADMIN', 'ADMIN_B', 'P', 'Q', 'hA', 'items'))
U = G0['U']
print('==== attempt-closure-20261026 ====', flush=True)
BASE = len(G0['checks'])
PINS = json.loads((D / 'live-pins.json').read_text())
EXP = json.loads((D / 'expected.json').read_text())
H = EXP['candidate_prosrc_md5']
import os
q = lambda s: pg.sql(s)
pmd5 = lambda sig: q(f"SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('{sig}')")
CREATE = 'public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'
ok('harness create equals LIVE prosrc md5 7a634235 and LIVE ACL',
   pmd5(CREATE) == PINS['create_prosrc_md5'] and q(f"SELECT proacl::text FROM pg_proc WHERE oid=to_regprocedure('{CREATE}')") == PINS['create_acl'])
ok('harness c2_order_actor_scope equals LIVE functiondef/ACL',
   q("SELECT md5(pg_get_functiondef(oid))||' '||proacl::text FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_order_actor_scope(uuid,uuid)')") == PINS['scope'])

# Pins que o harness (schema reduzido) não reproduz são substituídos SÓ na cópia de teste e reportados.
harness = {
 'has_role_prosrc_md5': pmd5('public.has_role(uuid,public.app_role)'),
 'get_user_partner_id_prosrc_md5': pmd5('public.get_user_partner_id()'),
 'poi_cols': q("SELECT md5(string_agg(attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull,',' ORDER BY attnum)) FROM pg_attribute WHERE attrelid='public.partner_order_idempotency'::regclass AND attnum>0 AND NOT attisdropped"),
 'poi_policies': q("SELECT md5(string_agg(policyname||'|'||permissive||'|'||cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),'#' ORDER BY policyname)) FROM pg_policies WHERE schemaname='public' AND tablename='partner_order_idempotency'"),
}
subst = {k: (PINS[k], v) for k, v in harness.items() if v != PINS[k]}
print('HARNESS_PIN_SUBSTITUTIONS', json.dumps(subst), flush=True)
def h(text):
    for _, (live, local) in subst.items(): text = text.replace(live, local)
    return text
pre, cand, post = (h((D / f).read_text()) for f in ('preflight.sql', 'candidate.sql.review', 'postflight.sql'))
rb, rbfull = (h((D / f).read_text()) for f in ('rollback.sql.review', 'rollback-full-if-empty.sql.review'))
print('HARNESS_POI_INDEXES', q("SELECT string_agg(c.relname||':'||i.indisunique||':'||(SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum)::text, ' ') FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.partner_order_idempotency'::regclass"), flush=True)
if not q("SELECT count(*) FROM pg_index WHERE indrelid='public.partner_order_idempotency'::regclass")=='0': raise SystemExit('unexpected harness indexes')
# Réplica reduzida não traz índices; recria os DOIS índices LIVE capturados (pkey id; único partner_id+key) — fidelidade, reportado.
q("ALTER TABLE public.partner_order_idempotency ADD CONSTRAINT partner_order_idempotency_pkey PRIMARY KEY (id); CREATE UNIQUE INDEX ux_partner_order_idempotency_key ON public.partner_order_idempotency USING btree (partner_id, idempotency_key);")
print('HARNESS_FIDELITY_FIX LIVE indexes recreated on reduced replica', flush=True)
PREV_REV = '457951ca'
def git_show(rel):
    return subprocess.run(['git', 'show', f'{PREV_REV}:scripts/owner-orders-20261023/attempt-closure-20261026/{rel}'],
                          cwd=str(D), capture_output=True, text=True, check=True).stdout
prev_cand, prev_rbfull = git_show('candidate.sql.review'), git_show('rollback-full-if-empty.sql.review')
ok('previous reviewed package 457951ca loaded by exact sha256 (control "antes")',
   hashlib.sha256(prev_cand.encode()).hexdigest() == '7613248eee2bded563ca30aef30645e02a414fc4a227e6318d3ed06d8c60500a'
   and hashlib.sha256(prev_rbfull.encode()).hexdigest() == '92dfa2d9741355e3cb20ff62b4ed388d042cd1b80fb64a89579d95b252259e93')
prev_cand, prev_rbfull = h(prev_cand), h(prev_rbfull)

CORE_SIG = 'platform_private.c2_close_partner_order_attempt_core(uuid,text)'
def jwtc(u): return jwt(u)
def err(u, sql, extra=''):
    return pg.sql(f"\\set VERBOSITY verbose\nBEGIN; {extra}SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{jwtc(u)}',true); {sql}; COMMIT;", ok=False)
def close(u, p, k): return json.loads(val(u, f"SELECT public.close_partner_order_attempt_v1('{p}','{k}');"))
orders = lambda: q("SELECT count(*) FROM public.partner_orders")
closures = lambda: q("SELECT count(*) FROM platform_private.partner_order_idempotency_closures") if q("SELECT to_regclass('platform_private.partner_order_idempotency_closures') IS NOT NULL") == 't' else '0'
def state():
    """Estado observável para provar 'nenhuma escrita': pedidos, filhos, idempotência, fechamentos, notificações, auditoria."""
    c = q("SELECT coalesce(md5(string_agg(partner_id||'/'||idempotency_key||'/'||closed_by,',' ORDER BY partner_id,idempotency_key)),'-') FROM platform_private.partner_order_idempotency_closures") if closures() != '0' or q("SELECT to_regclass('platform_private.partner_order_idempotency_closures') IS NOT NULL") == 't' else '-'
    return (orders(), q("SELECT count(*) FROM public.partner_order_items"), q("SELECT count(*) FROM public.partner_order_payment_terms"),
            q("SELECT coalesce(md5(string_agg(partner_id||'/'||idempotency_key||'/'||order_id,',' ORDER BY partner_id,idempotency_key)),'-') FROM public.partner_order_idempotency"),
            c, q("SELECT count(*) FROM public.notificacoes_operacionais"), q("SELECT count(*) FROM public.partner_order_audit_logs"))
def first_error(text): return next((l.strip() for l in text.splitlines() if l.startswith('ERROR:')), '')
def expect_error(label, text, sqlstate, msg, before):
    e = first_error(text)
    ok(f"{label} [{e[:100]}]", e == f"ERROR:  {sqlstate}: {msg}" and state() == before and 'committed' not in text and '"closed"' not in text)

# ---- processos concorrentes reais (psql) -------------------------------------------------
def bg(u, sql, name, hold=None, end='COMMIT', extra=''):
    pre_ = f"\\set VERBOSITY verbose\nSET application_name='{name}';\nBEGIN;\n{extra}" + (f"SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{jwtc(u)}',true);\n" if u else '')
    body = pre_ + sql + ";\n" + (f"SELECT 'HOLDING'; SELECT pg_sleep({hold});\n" if hold else '') + f"{end};\n"
    p = subprocess.Popen(pg.psql(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write(body); p.stdin.close()
    if hold:
        while True:
            line = p.stdout.readline()
            if 'HOLDING' in line: break
            if not line: raise AssertionError(p.stderr.read())
    return p
def done(p):
    out, er = p.stdout.read(), p.stderr.read(); p.wait(timeout=60); return out, er
def waiting(name, event='advisory'):
    for _ in range(120):
        if q(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{name}' AND wait_event_type='Lock'" + (f" AND wait_event='{event}'" if event else '')) == '1': return True
        time.sleep(.05)
    return False
lock = lambda k: f"SELECT pg_advisory_xact_lock(hashtextextended('b2b_idem:'||'{P}'||':'||'{k}',0))"
STALL_KEY = 4242424242
def replica(sql): q(f"SET session_replication_role=replica; {sql}; SET session_replication_role=origin;")
revoke_G = lambda: replica(f"UPDATE public.partner_users SET revoked_at=now(),revoked_by='{ADMIN}',revoke_reason='Synthetic revocation' WHERE user_id='{G}'")
restore_G = lambda: replica(f"UPDATE public.partner_users SET revoked_at=NULL,revoked_by=NULL,revoke_reason=NULL WHERE user_id='{G}'")

# ---- Instrumentação SOMENTE do harness: pausa PRÉ-lock de um create antigo em voo -----------
# assert_b2b_partner_scope é chamado pelo create LIVE (via c2_order_actor_scope) ANTES do lock
# b2b_idem. A pausa só ocorre na sessão que define c2ac.test_stall=on; o corpo do create
# permanece byte-exato LIVE. A função é restaurada e verificada por md5 em seguida.
ASSERT_SIG = 'platform_private.assert_b2b_partner_scope(uuid,uuid)'
assert_def = q(f"SELECT pg_get_functiondef('{ASSERT_SIG}'::regprocedure)")
assert_md5 = pmd5(ASSERT_SIG)
first_begin = assert_def.index('\nBEGIN')
stall_def = assert_def[:first_begin] + f"\nBEGIN\n  IF current_setting('c2ac.test_stall', true) = 'on' THEN PERFORM pg_advisory_xact_lock({STALL_KEY}); END IF;" + assert_def[first_begin + len('\nBEGIN'):]
def instrument(on):
    pg.sql(stall_def if on else assert_def)
STALL = "SELECT set_config('c2ac.test_stall','on',true);\n"

def rollout(cand_sql, key, label):
    """Create LIVE já em execução e pausado ANTES do lock b2b_idem; aplica candidato; fecha K; libera."""
    before_orders = orders()
    holder = bg(None, f"SELECT pg_advisory_xact_lock({STALL_KEY})", f'stall-{key}', hold=30)
    old = bg(G, create(P, key, hA), f'old-{key}', extra='')
    # a pausa é definida dentro da transação do create antigo
    return holder, old, before_orders

# ======================= 0) Preflight / atomicidade / timeouts ============================
q(pre); ok('preflight READ ONLY passes on captured LIVE state')
ok('preflight left no objects', q("SELECT to_regclass('platform_private.partner_order_idempotency_closures') IS NULL") == 't')
bad = pre.replace(PINS['create_prosrc_md5'], '0' * 32)
ok('preflight fails closed on create drift', first_error(pg.sql("\\set VERBOSITY verbose\n" + bad, ok=False)) == 'ERROR:  P0001: C2AC_DRIFT:create_partner_order_secure')
inj = cand.replace('DO $c2ac_cand_post$', "DO $x$ BEGIN RAISE EXCEPTION 'C2AC_INJECTED_POST'; END $x$;\nDO $c2ac_cand_post$", 1)
ok('injected POST failure aborts', first_error(pg.sql("\\set VERBOSITY verbose\n" + inj, ok=False)) == 'ERROR:  P0001: C2AC_INJECTED_POST')
ok('after aborted candidate: no table/trigger, create still LIVE', q("SELECT to_regclass('platform_private.partner_order_idempotency_closures') IS NULL") == 't' and pmd5(CREATE) == PINS['create_prosrc_md5']
   and q("SELECT count(*) FROM pg_trigger WHERE tgname='c2_attempt_closure_guard'") == '0')
injpre = cand.replace(PINS['create_acl'], '{x}', 1)
ok('candidate PRE drift aborts before any DDL', first_error(pg.sql("\\set VERBOSITY verbose\n" + injpre, ok=False)) == 'ERROR:  P0001: C2AC_DRIFT:create_partner_order_secure' and q("SELECT to_regclass('platform_private.partner_order_idempotency_closures') IS NULL") == 't')

# Candidato com lock_timeout: create AUTORIZADO segurando a tabela de idempotência => 55P03 limitado, nada instalado.
st0 = state()
hold_cr = bg(G, create(P, 'k-cand-contention', hA), 'cand-contention', hold=12)
t0 = time.time(); ec = pg.sql("\\set VERBOSITY verbose\n" + cand, ok=False); dt = time.time() - t0
ok(f'candidate under contention fails with lock_timeout 55P03 in bounded time ({dt:.1f}s)',
   first_error(ec).startswith('ERROR:  55P03: canceling statement due to lock timeout') and 4.5 <= dt < 9)
ok('timed-out candidate installed nothing (atomic)', q("SELECT to_regclass('platform_private.partner_order_idempotency_closures') IS NULL") == 't' and pmd5(CREATE) == PINS['create_prosrc_md5']
   and q("SELECT count(*) FROM pg_trigger WHERE tgname='c2_attempt_closure_guard'") == '0')
o, e = done(hold_cr); print("HOLD_CR", o[-300:], e[-300:], flush=True); ok('authorized create holding the table committed normally', '"numero"' in o and orders() == str(int(st0[0]) + 1))

# ======================= 1) Rollout: create ANTIGO em voo antes do lock ====================
instrument(True)
ok('harness-only stall instrumentation installed (create body still LIVE)', pmd5(CREATE) == PINS['create_prosrc_md5'] and pmd5(ASSERT_SIG) != assert_md5)

def rollout_case(cand_sql, key, label):
    n0 = orders()
    holder = bg(None, f"SELECT pg_advisory_xact_lock({STALL_KEY})", f'stall-{key}', hold=40)
    old = bg(G, create(P, key, hA), f'old-{key}', extra=STALL)
    ok(f'{label}: LIVE create in flight, paused BEFORE b2b_idem (waiting on stall lock)', waiting(f'old-{key}'))
    ok(f'{label}: in-flight create does not hold b2b_idem yet',
       q(f"SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted AND objid=(hashtextextended('b2b_idem:'||'{P}'||':'||'{key}',0) & x'ffffffff'::bigint)::oid") == '0')
    t0 = time.time(); q(cand_sql); dt = time.time() - t0
    ok(f'{label}: candidate applied while old create is in flight ({dt:.1f}s, not blocked)', dt < 4.5)
    c = close(G, P, key)
    ok(f'{label}: close K answered closed (old create not yet at lock)', c['state'] == 'closed')
    q(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='stall-{key}'")
    done(holder)
    o, e = done(old)
    rows = q(f"SELECT count(*) FROM public.partner_order_idempotency WHERE partner_id='{P}' AND idempotency_key='{key}'")
    return o, e, rows, n0

o, e, rows, n0 = rollout_case(prev_cand, 'k-rollout-prev', 'ANTES (457951ca)')
ok('ANTES (457951ca): REPRODUCED — old body ignored tombstone and created order for CLOSED key',
   '"numero"' in o and rows == '1' and orders() == str(int(n0) + 1) and q(f"SELECT count(*) FROM platform_private.partner_order_idempotency_closures WHERE idempotency_key='k-rollout-prev'") == '1')
print('ROLLOUT_PREV_OLD_CREATE_OUTPUT', (o.strip().splitlines() or [''])[-1][:160], flush=True)
# reset SOMENTE do harness para voltar ao LIVE (fechamentos são imutáveis por desenho)
q("ALTER TABLE platform_private.partner_order_idempotency_closures DISABLE TRIGGER USER; DELETE FROM platform_private.partner_order_idempotency_closures; ALTER TABLE platform_private.partner_order_idempotency_closures ENABLE TRIGGER USER;")
q(prev_rbfull)
ok('harness reset to LIVE after control (create LIVE md5, no objects)', pmd5(CREATE) == PINS['create_prosrc_md5'] and q("SELECT to_regclass('platform_private.partner_order_idempotency_closures') IS NULL") == 't')
q(pre)

st_before = None
o, e, rows, n0 = rollout_case(cand, 'k-rollout-new', 'DEPOIS (barreira)')
ok(f"DEPOIS: old in-flight body refused by write-barrier trigger [{first_error(e)}]",
   first_error(e) == 'ERROR:  P0001: idempotency_key_closed' and '"numero"' not in o)
ok('DEPOIS: no order, no idempotency row, closure kept (no duplicate after rollout)',
   rows == '0' and orders() == n0 and q("SELECT count(*) FROM platform_private.partner_order_idempotency_closures WHERE idempotency_key='k-rollout-new'") == '1')
ok('DEPOIS: barrier error came from c2_attempt_closure_guard (old body has no closure check)', 'c2_attempt_closure_guard' in e)
instrument(False)
ok('stall instrumentation removed, assert_b2b_partner_scope md5 restored', pmd5(ASSERT_SIG) == assert_md5)
q(post); ok('postflight READ ONLY passes')
ok('core proconfig exact', q(f"SELECT proconfig::text FROM pg_proc WHERE oid=to_regprocedure('{CORE_SIG}')") == '{"search_path=\\"\\"",lock_timeout=5s}')
ok('candidate hashes match expected.json', all(pmd5(k) == v for k, v in H.items()))
# k-rollout-new já criou um fechamento; full rollback deve recusar e nada mudar
ok('full rollback refused while closed keys exist (exact error, nothing changed)',
   first_error(pg.sql("\\set VERBOSITY verbose\n" + rbfull, ok=False)) == 'ERROR:  P0001: C2AC_FULL_ROLLBACK_REFUSED:closed_keys_exist' and pmd5(CREATE) == H[CREATE])

# ======================= 2) Fluxo normal =================================================
s0 = state()
ok('close unused key => closed', close(G, P, 'k-late-1')['state'] == 'closed')
ok('close is idempotent', close(G, P, 'k-late-1')['state'] == 'closed' and q("SELECT count(*) FROM platform_private.partner_order_idempotency_closures WHERE idempotency_key='k-late-1'") == '1')
b = state(); expect_error('late create of closed key refused, no order', err(G, create(P, 'k-late-1', hA)), 'P0001', 'idempotency_key_closed', b)
r = json.loads(val(G, create(P, 'k-ok-1', hA) + ';'))
nclos = closures(); c = close(G, P, 'k-ok-1')
ok('close after commit => committed with order id/numero, nothing written', c['state'] == 'committed' and c['order_id'] == r['id'] and c['numero'] == r['numero'] and closures() == nclos)
ok('replay of committed key still returns same order', json.loads(val(G, create(P, 'k-ok-1', hA) + ';'))['id'] == r['id'])
ok('cumulative manager/technician of same partner sees committed', close(GT, P, 'k-ok-1')['state'] == 'committed')

# ======================= 3) Corridas nas duas ordens =====================================
holder = bg(None, lock('k-race-a'), 'holder-a', hold=2)
cr = bg(G, create(P, 'k-race-a', hA), 'create-a'); ok('race A: create queued on b2b_idem lock', waiting('create-a'))
cl = bg(G, "SELECT public.close_partner_order_attempt_v1('%s','k-race-a')" % P, 'close-a'); ok('race A: close queued behind create', waiting('close-a'))
done(holder); o1, e1 = done(cr); o2, e2 = done(cl)
ok('race A: create committed and close answered committed', '"numero"' in o1 and 'committed' in o2 and '"closed"' not in o2)
ok('race A: exactly one order for key and no closure', q("SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key='k-race-a'") == '1' and q("SELECT count(*) FROM platform_private.partner_order_idempotency_closures WHERE idempotency_key='k-race-a'") == '0')
n1 = orders()
holder = bg(None, lock('k-race-b'), 'holder-b', hold=2)
cl = bg(G, "SELECT public.close_partner_order_attempt_v1('%s','k-race-b')" % P, 'close-b'); ok('race B: close queued first', waiting('close-b'))
cr = bg(G, create(P, 'k-race-b', hA), 'create-b'); ok('race B: late create queued after close', waiting('create-b'))
done(holder); o2, e2 = done(cl); o1, e1 = done(cr)
ok(f'race B: close closed, late K1 refused exactly [{first_error(e1)}], no order', 'closed' in o2 and first_error(e1) == 'ERROR:  P0001: idempotency_key_closed' and orders() == n1)
r2 = json.loads(val(G, create(P, 'k-race-b-2', hA) + ';'))
ok('after closing K1, K2 creates once', r2['id'] and orders() == str(int(n1) + 1))
b = state(); expect_error('K1 arriving even later is still refused', err(G, create(P, 'k-race-b', hA)), 'P0001', 'idempotency_key_closed', b)

# ======================= 4) Timeout => in_progress =======================================
holder = bg(None, lock('k-slow'), 'holder-slow', hold=7)
b = state(); t0 = time.time(); c = close(G, P, 'k-slow'); dt = time.time() - t0
ok(f'lock held past lock_timeout => in_progress (unknown) ({dt:.1f}s)', c['state'] == 'in_progress' and 4 <= dt < 7.5)
ok('in_progress wrote nothing', state() == b)
done(holder)

# ======================= 5) Revogação DURANTE a espera no lock ============================
def revoke_while_waiting(label, u, sql, key, revoke, restore, sqlstate, msg):
    holder = bg(None, lock(key), f'holder-{label}', hold=30)
    w = bg(u, sql, f'wait-{label}'); ok(f'{label}: authorized call passed pre-lock checks and is waiting on b2b_idem', waiting(f'wait-{label}'))
    revoke(); b = state()
    q(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='holder-{label}'"); done(holder)
    o, e = done(w)
    expect_error(f'{label}: revalidated after lock, denied without reveal/write', e + o, sqlstate, msg, b)
    restore()
inactive_G = lambda: replica(f"UPDATE public.profiles SET ativo=false WHERE user_id='{G}'")
active_G = lambda: replica(f"UPDATE public.profiles SET ativo=true WHERE user_id='{G}'")
inactive_P = lambda: replica(f"UPDATE public.partner_accounts SET ativo=false WHERE id='{P}'")
active_P = lambda: replica(f"UPDATE public.partner_accounts SET ativo=true WHERE id='{P}'")
CL = lambda k: f"SELECT public.close_partner_order_attempt_v1('{P}','{k}')"
revoke_while_waiting('close-unused-revoked', G, CL('k-rw-1'), 'k-rw-1', revoke_G, restore_G, '42501', 'forbidden_partner')
revoke_while_waiting('close-committed-revoked', G, CL('k-ok-1'), 'k-ok-1', revoke_G, restore_G, '42501', 'forbidden_partner')
revoke_while_waiting('close-profile-inactive', G, CL('k-rw-2'), 'k-rw-2', inactive_G, active_G, '42501', 'inactive_scope')
revoke_while_waiting('close-partner-inactive', G, CL('k-rw-3'), 'k-rw-3', inactive_P, active_P, '42501', 'partner_not_found')
revoke_while_waiting('create-new-revoked', G, create(P, 'k-rw-4', hA), 'k-rw-4', revoke_G, restore_G, '42501', 'forbidden_partner')
revoke_while_waiting('create-replay-revoked', G, create(P, 'k-ok-1', hA), 'k-ok-1', revoke_G, restore_G, '42501', 'forbidden_partner')
ok('keys denied during wait were NOT attributed/closed (can still be closed by authorized actor)', close(G, P, 'k-rw-1')['state'] == 'closed' and close(G, P, 'k-rw-4')['state'] == 'closed')

# ======================= 6) Negativas com SQLSTATE/mensagem exatos e sem escrita ===========
def denied(u, p, k, sqlstate, msg, label):
    b = state(); expect_error(label, err(u, CL(k).replace(f"'{P}'", f"'{p}'", 1)), sqlstate, msg, b)
denied(GB, P, 'k-ok-1', '42501', 'forbidden_partner', 'B partner manager cannot probe/close A key')
denied(G, Q, 'k-x', '42501', 'forbidden_partner', 'A manager cannot close for B partner')
denied(T, P, 'k-ok-1', 'P0001', 'partner_tech_cannot_create_order', 'isolated technician cannot close')
denied(PR, P, 'k-ok-1', 'P0001', 'PRODUCER_DIRECT_NOT_ENABLED', 'producer cannot close')
denied(G, P, '   ', 'P0001', 'idempotency_key_required', 'blank key rejected')
denied(G, P, 'x' * 121, 'P0001', 'invalid_idempotency_key', 'oversized key rejected')
ok('anon has no EXECUTE on wrapper/core/authz/guard', q("SELECT has_function_privilege('anon','public.close_partner_order_attempt_v1(uuid,text)','EXECUTE') OR has_function_privilege('anon','platform_private.c2_close_partner_order_attempt_core(uuid,text)','EXECUTE') OR has_function_privilege('authenticated','platform_private.c2_partner_order_attempt_authz(uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','platform_private.c2_attempt_closure_guard()','EXECUTE')") == 'f')
b = state(); expect_error('authenticated cannot read closures directly', err(G, "SELECT * FROM platform_private.partner_order_idempotency_closures"), '42501', 'permission denied for table partner_order_idempotency_closures', b)
b = state(); expect_error('authenticated cannot insert closures directly', err(G, f"INSERT INTO platform_private.partner_order_idempotency_closures VALUES('{P}','z','{G}',NULL,now())"), '42501', 'permission denied for table partner_order_idempotency_closures', b)
b = state(); expect_error('authenticated cannot call authz helper directly', err(G, f"SELECT platform_private.c2_partner_order_attempt_authz('{G}','{P}')"), '42501', 'permission denied for function c2_partner_order_attempt_authz', b)
revoke_G(); denied(G, P, 'k-ok-1', '42501', 'forbidden_partner', 'revoked partner link cannot close/probe')
b = state(); expect_error('revocation did NOT reopen closed key', err(GT, create(P, 'k-late-1', hA)), 'P0001', 'idempotency_key_closed', b)
restore_G(); inactive_G(); denied(G, P, 'k-ok-1', '42501', 'inactive_scope', 'inactive profile cannot close/probe'); active_G()
inactive_P(); denied(G, P, 'k-ok-1', '42501', 'partner_not_found', 'inactive partner cannot close/probe'); active_P()
ok('restored actor closes again normally', close(G, P, 'k-after-restore')['state'] == 'closed')
# Barreira direta (qualquer escritor, inclusive owner) recusa chave fechada.
b = state(); e = pg.sql(f"\\set VERBOSITY verbose\nINSERT INTO public.partner_order_idempotency(partner_id,idempotency_key,cart_hash,order_id,result_snapshot,created_by,request_fingerprint) SELECT partner_id,' k-late-1 ',cart_hash,order_id,result_snapshot,created_by,'fp' FROM public.partner_order_idempotency WHERE idempotency_key='k-ok-1';", ok=False)
ok(f'write barrier refuses direct owner INSERT of closed key (btrim-normalized) [{first_error(e)}]', first_error(e) == 'ERROR:  P0001: idempotency_key_closed' and state() == b)

# ======================= 7) Imutabilidade =================================================
for stmt in ["UPDATE platform_private.partner_order_idempotency_closures SET closed_at=now()",
             "DELETE FROM platform_private.partner_order_idempotency_closures",
             "TRUNCATE platform_private.partner_order_idempotency_closures"]:
    b = state(); ok('owner blocked: ' + stmt.split()[0], first_error(pg.sql("\\set VERBOSITY verbose\n" + stmt + ';', ok=False)) == 'ERROR:  42501: C2_ATTEMPT_CLOSURE_IMMUTABLE' and state() == b)

# ======================= 8) Rollbacks com timeout sob contenção ===========================
# Full rollback com fechamento AUTORIZADO em voo (segurando a tabela): 55P03 limitado e nada muda.
b = state()
inflight = bg(G, CL('k-rb-inflight'), 'rb-inflight', hold=12, end='ROLLBACK')
t0 = time.time(); efr = pg.sql("\\set VERBOSITY verbose\n" + rbfull, ok=False); dt = time.time() - t0
ok(f'full rollback under contention: bounded lock_timeout 55P03 ({dt:.1f}s), not indefinite',
   first_error(efr).startswith('ERROR:  55P03: canceling statement due to lock timeout') and 4.5 <= dt < 9)
done(inflight)
ok('timed-out full rollback changed nothing (objects/create/closures intact)', pmd5(CREATE) == H[CREATE] and state() == b and q("SELECT count(*) FROM pg_trigger WHERE tgname='c2_attempt_closure_guard'") == '1')
# Contenção: um fechamento autorizado já passou da checagem e espera o lock; rollback de contenção conclui (limitado)
holder = bg(None, lock('k-rb-wait'), 'holder-rbw', hold=30)
w = bg(G, CL('k-rb-wait'), 'rbw'); ok('authorized close in flight waiting on b2b_idem during containment rollback', waiting('rbw'))
t0 = time.time(); q(rb); dt = time.time() - t0
ok(f'containment rollback completes in bounded time while call in flight ({dt:.1f}s)', dt < 5)
q(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='holder-rbw'"); done(holder)
o, e = done(w)
ok('in-flight authorized close finished closed and its closure is honored after containment',
   '"closed"' in o and first_error(err(G, create(P, 'k-rb-wait', hA))) == 'ERROR:  P0001: idempotency_key_closed')
b = state(); expect_error('containment rollback: no new closures possible', err(G, CL('k-new')), '42501', 'permission denied for function close_partner_order_attempt_v1', b)
b = state(); expect_error('containment rollback: closed keys still refused by create', err(G, create(P, 'k-race-b', hA)), 'P0001', 'idempotency_key_closed', b)
ok('containment rollback: write barrier trigger still enabled', q("SELECT tgenabled FROM pg_trigger WHERE tgname='c2_attempt_closure_guard'") == 'O')
ok('containment rollback: normal create/replay unaffected', json.loads(val(G, create(P, 'k-ok-1', hA) + ';'))['id'] == r['id'])
print(f"TOTAL {len(G0['checks'])-BASE} PASS deste pacote (+{BASE} do harness base); Auth sintética, PostgreSQL descartável, sem JWT/RLS hospedado", flush=True)
