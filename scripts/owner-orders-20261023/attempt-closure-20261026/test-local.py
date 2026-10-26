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
PINS = json.loads((D / 'live-pins.json').read_text())
EXP = json.loads((D / 'expected.json').read_text())
H = EXP['candidate_prosrc_md5']
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
q(pre); ok('preflight READ ONLY passes on captured LIVE state')
ok('preflight left no objects', q("SELECT to_regclass('platform_private.partner_order_idempotency_closures') IS NULL") == 't')
# drift: preflight must fail
bad = pre.replace(PINS['create_prosrc_md5'], '0' * 32)
ok('preflight fails closed on create drift', 'C2AC_DRIFT:create_partner_order_secure' in pg.sql(bad, ok=False))
# atomicity: POST failure rolls back DDL
inj = cand.replace('DO $c2ac_cand_post$', "DO $x$ BEGIN RAISE EXCEPTION 'C2AC_INJECTED_POST'; END $x$;\nDO $c2ac_cand_post$", 1)
ok('injected POST failure aborts', 'C2AC_INJECTED_POST' in pg.sql(inj, ok=False))
ok('after aborted candidate: no table, create still LIVE', q("SELECT to_regclass('platform_private.partner_order_idempotency_closures') IS NULL") == 't' and pmd5(CREATE) == PINS['create_prosrc_md5'])
injpre = cand.replace(PINS['create_acl'], '{x}', 1)
ok('candidate PRE drift aborts before any DDL', 'C2AC_DRIFT:create_partner_order_secure' in pg.sql(injpre, ok=False) and q("SELECT to_regclass('platform_private.partner_order_idempotency_closures') IS NULL") == 't')
q(cand); ok('candidate applies in one transaction')
q(post); ok('postflight READ ONLY passes')
ok('core proconfig exact', q("SELECT proconfig::text FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_close_partner_order_attempt_core(uuid,text)')") == '{"search_path=\\"\\"",lock_timeout=5s}')
ok('candidate hashes match expected.json', all(pmd5(k) == v for k, v in H.items()))
# Full rollback with ZERO closures restores LIVE exactly; then reinstall.
q(rbfull); ok('full rollback (no closed keys) restores LIVE create and drops objects',
              pmd5(CREATE) == PINS['create_prosrc_md5'] and q("SELECT to_regclass('platform_private.partner_order_idempotency_closures') IS NULL") == 't')
q(pre); q(cand); q(post); ok('preflight→candidate→postflight again after full rollback')

def close(u, p, k): return json.loads(val(u, f"SELECT public.close_partner_order_attempt_v1('{p}','{k}');"))
def err(u, sql):
    c = jwt(u)
    return pg.sql(f"\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{c}',true); {sql}; COMMIT;", ok=False)
orders = lambda: q("SELECT count(*) FROM public.partner_orders")
closures = lambda: q("SELECT count(*) FROM platform_private.partner_order_idempotency_closures")

# 1) Fechar chave nunca usada => closed; envio tardio dessa chave é recusado sem criar pedido.
n0 = orders()
ok('close unused key => closed', close(G, P, 'k-late-1')['state'] == 'closed')
ok('close is idempotent', close(G, P, 'k-late-1')['state'] == 'closed' and closures() == '1')
e = err(G, create(P, 'k-late-1', hA))
ok('late create of closed key refused (idempotency_key_closed), no order', 'idempotency_key_closed' in e and orders() == n0)
# 2) Chave criada => close responde committed com o número; nenhum fechamento gravado.
r = json.loads(val(G, create(P, 'k-ok-1', hA) + ';'))
c = close(G, P, 'k-ok-1')
ok('close after commit => committed with order id/numero', c['state'] == 'committed' and c['order_id'] == r['id'] and c['numero'] == r['numero'] and closures() == '1')
ok('replay of committed key still returns same order', json.loads(val(G, create(P, 'k-ok-1', hA) + ';'))['id'] == r['id'])
ok('cumulative manager/technician of same partner sees committed', close(GT, P, 'k-ok-1')['state'] == 'committed')

# Concorrência real: duas/três conexões. Um "holder" segura o lock b2b_idem; os demais enfileiram.
def bg(u, sql, name, hold=None):
    c = jwt(u) if u else None
    pre_ = f"SET application_name='{name}';\nBEGIN;\n" + (f"SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{c}',true);\n" if u else '')
    body = pre_ + sql + ";\n" + (f"SELECT 'HOLDING'; SELECT pg_sleep({hold});\n" if hold else '') + "COMMIT;\n"
    p = subprocess.Popen(pg.psql(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write(body); p.stdin.close()
    if hold:
        while True:
            line = p.stdout.readline()
            if 'HOLDING' in line: break
            if not line: raise AssertionError(p.stderr.read())
    return p
def done(p):
    out, er = p.stdout.read(), p.stderr.read(); p.wait(timeout=30); return out, er
def waiting(name):
    for _ in range(80):
        if q(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{name}' AND wait_event_type='Lock' AND wait_event='advisory'") == '1': return True
        time.sleep(.05)
    return False
lock = lambda k: f"SELECT pg_advisory_xact_lock(hashtextextended('b2b_idem:'||'{P}'||':'||'{k}',0))"

# 3) Ordem A: envio K chega ANTES (enfileirado no lock), fechamento depois => committed; sem duplicata.
holder = bg(None, lock('k-race-a'), 'holder-a', hold=2)
cr = bg(G, create(P, 'k-race-a', hA), 'create-a'); ok('race A: create queued on b2b_idem lock', waiting('create-a'))
cl = bg(G, "SELECT public.close_partner_order_attempt_v1('%s','k-race-a')" % P, 'close-a'); ok('race A: close queued behind create', waiting('close-a'))
done(holder); o1, e1 = done(cr); o2, e2 = done(cl)
ok('race A: create committed and close answered committed', '"numero"' in o1 and 'committed' in o2 and '"closed"' not in o2)
ok('race A: exactly one order for key and no closure', q("SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key='k-race-a'") == '1' and q("SELECT count(*) FROM platform_private.partner_order_idempotency_closures WHERE idempotency_key='k-race-a'") == '0')

# 4) Ordem B: fechamento enfileirado ANTES, envio tardio K1 depois => closed; K1 recusado.
n1 = orders()
holder = bg(None, lock('k-race-b'), 'holder-b', hold=2)
cl = bg(G, "SELECT public.close_partner_order_attempt_v1('%s','k-race-b')" % P, 'close-b'); ok('race B: close queued first', waiting('close-b'))
cr = bg(G, create(P, 'k-race-b', hA), 'create-b'); ok('race B: late create queued after close', waiting('create-b'))
done(holder); o2, e2 = done(cl); o1, e1 = done(cr)
ok('race B: close answered closed, late K1 refused, no order', 'closed' in o2 and 'idempotency_key_closed' in e1 and orders() == n1)
# K2 nova depois do fechamento cria normalmente; K1 tardio continua recusado => sem duplicata.
r2 = json.loads(val(G, create(P, 'k-race-b-2', hA) + ';'))
ok('after closing K1, K2 creates once', r2['id'] and orders() == str(int(n1) + 1))
ok('K1 arriving even later is still refused', 'idempotency_key_closed' in err(G, create(P, 'k-race-b', hA)) and orders() == str(int(n1) + 1))

# 5) Envio em voo que não libera o lock dentro do prazo => in_progress, sem gravação (desconhecido).
holder = bg(None, lock('k-slow'), 'holder-slow', hold=7)
t0 = time.time(); c = close(G, P, 'k-slow'); dt = time.time() - t0
ok('lock held past lock_timeout => in_progress (unknown), ~5s', c['state'] == 'in_progress' and 4 <= dt < 7.5)
ok('in_progress wrote no closure', q("SELECT count(*) FROM platform_private.partner_order_idempotency_closures WHERE idempotency_key='k-slow'") == '0')
done(holder)

# 6) Autorização canônica atual antes de revelar estado (nada gravado nas negativas).
def denied(u, p, k, needle, label):
    b = closures(); e = err(u, f"SELECT public.close_partner_order_attempt_v1('{p}','{k}')")
    ok(label, needle in e and closures() == b and 'committed' not in e)
denied(GB, P, 'k-ok-1', 'ERROR', 'B partner manager cannot probe/close A key (no state revealed)')
denied(G, Q, 'k-x', 'ERROR', 'A manager cannot close for B partner')
denied(T, P, 'k-ok-1', 'ERROR', 'isolated technician cannot close')
denied(PR, P, 'k-ok-1', 'ERROR', 'producer cannot close')
denied(G, P, '   ', 'idempotency_key_required', 'blank key rejected')
denied(G, P, 'x' * 121, 'invalid_idempotency_key', 'oversized key rejected')
ok('anon has no EXECUTE on wrapper/core', q("SELECT has_function_privilege('anon','public.close_partner_order_attempt_v1(uuid,text)','EXECUTE') OR has_function_privilege('anon','platform_private.c2_close_partner_order_attempt_core(uuid,text)','EXECUTE')") == 'f')
ok('authenticated cannot read/write closures directly', 'permission denied' in err(G, "SELECT * FROM platform_private.partner_order_idempotency_closures") and 'permission denied' in err(G, f"INSERT INTO platform_private.partner_order_idempotency_closures VALUES('{P}','z','{G}',NULL,now())"))
q(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=now(),revoked_by='{ADMIN}',revoke_reason='Synthetic revocation' WHERE user_id='{G}'; SET session_replication_role=origin;")
denied(G, P, 'k-ok-1', 'ERROR', 'revoked partner link cannot close/probe')
ok('revocation did NOT reopen closed key (protection independent of actor auth)', 'idempotency_key_closed' in err(GT, create(P, 'k-late-1', hA)))
q(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=NULL,revoked_by=NULL,revoke_reason=NULL WHERE user_id='{G}'; SET session_replication_role=origin;")
q(f"SET session_replication_role=replica; UPDATE public.profiles SET ativo=false WHERE user_id='{G}'; SET session_replication_role=origin;")
denied(G, P, 'k-ok-1', 'ERROR', 'inactive profile cannot close/probe')
q(f"SET session_replication_role=replica; UPDATE public.profiles SET ativo=true WHERE user_id='{G}'; SET session_replication_role=origin;")
q(f"SET session_replication_role=replica; UPDATE public.partner_accounts SET ativo=false WHERE id='{P}'; SET session_replication_role=origin;")
denied(G, P, 'k-ok-1', 'ERROR', 'inactive partner cannot close/probe')
q(f"SET session_replication_role=replica; UPDATE public.partner_accounts SET ativo=true WHERE id='{P}'; SET session_replication_role=origin;")
ok('restored actor closes again normally', close(G, P, 'k-after-restore')['state'] == 'closed')

# 7) Imutabilidade: nem o owner apaga/edita/trunca fechamentos.
for stmt in ["UPDATE platform_private.partner_order_idempotency_closures SET closed_at=now()",
             "DELETE FROM platform_private.partner_order_idempotency_closures",
             "TRUNCATE platform_private.partner_order_idempotency_closures"]:
    ok('owner blocked: ' + stmt.split()[0], 'C2_ATTEMPT_CLOSURE_IMMUTABLE' in pg.sql(stmt + ';', ok=False))

# 8) Rollback por contenção: para novos fechamentos, NÃO reabre chaves fechadas.
ok('full rollback refused while closed keys exist', 'C2AC_FULL_ROLLBACK_REFUSED:closed_keys_exist' in pg.sql(rbfull, ok=False) and pmd5(CREATE) == H[CREATE])
q(rb)
ok('containment rollback: no new closures possible', 'permission denied' in err(G, f"SELECT public.close_partner_order_attempt_v1('{P}','k-new')"))
ok('containment rollback: closed keys still refused by create', 'idempotency_key_closed' in err(G, create(P, 'k-race-b', hA)))
ok('containment rollback: normal create/replay unaffected', json.loads(val(G, create(P, 'k-ok-1', hA) + ';'))['id'] == r['id'])
print(f"TOTAL {sum(1 for c in G0['checks'] if c)} PASS (inclui {len(G0['checks'])} do harness base); Auth sintética, PostgreSQL descartável, sem JWT/RLS hospedado", flush=True)
