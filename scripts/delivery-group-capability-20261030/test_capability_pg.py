"""Disposable PG: full restore -> EXACT applied release-combined (a566faa4) -> capability delta.
Actors are `authenticated` with synthetic sub claims; service_role is never used as an actor.
Synthetic claims on real bodies/ACL/triggers are not hosted JWT/RLS/Storage proof."""
import hashlib, json, sys, time, traceback
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
PROOF = H.parent / 'delivery-proof-authz-20261030'
sys.path.insert(0, str(ATOMIC)); sys.path.insert(0, str(H))
import restore
from restore import pg
import test_pg as T
import assemble_capability as assemble
APPLIED = 'a566faa4f6f460d8b9195abf93d97717013af815537f00eb28b34cc98d314971'
checks = []
def ok(label, **kw): checks.append({'test': label, 'status': 'PASS', **kw}); print('PASS', label, flush=True)
def sql(s): return pg.sql(s)
def fails(label, s, code):
    e = pg.sql(s, False); assert code in e, label + ':' + e[-600:]; ok(label, expected=code)
def is_true(label, s):
    out = sql(s); assert out.splitlines()[-1] == 't', label + ':' + out; ok(label)
def cap(who): return json.loads(sql(T.actor(who) + 'SELECT public.rpc_entrega_operacoes_capability_v1();').splitlines()[-1])
def state(): return sql("SELECT jsonb_build_array(to_regprocedure('public.rpc_entrega_operacoes_capability_v1()') IS NULL, has_function_privilege('authenticated','public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)','EXECUTE'), has_function_privilege('authenticated','public.rpc_entrega_cancelar_v1(uuid,text,timestamptz)','EXECUTE'));")
TABLES = ['accounts_receivable', 'accounts_receivable_installments', 'financial_receipts', 'financial_documents', 'fiscal_invoices', 'fiscal_invoice_items', 'fiscal_events', 'comunicacao_outbox', 'comunicacao_eventos', 'os_faturamento_base']
def with_role(role, fn, drop_admin=True):
    U = T.U
    if drop_admin: sql(f"DELETE FROM public.user_roles WHERE user_id='{U}' AND role='administrador';")
    sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{U}','{role}');")
    try: return fn()
    finally:
        sql(f"DELETE FROM public.user_roles WHERE user_id='{U}' AND role='{role}';")
        if drop_admin: sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{U}','administrador');")

def main():
    t0 = time.monotonic()
    r = restore.restore(); print('RESTORE', json.dumps({k: len(v) for k, v in r.items()}), flush=True)
    assert not any(r.values()), 'RESTORE_FAILED ' + json.dumps(r)
    rel = (PROOF / 'release-combined.sql.review').read_bytes()
    assert hashlib.sha256(rel).hexdigest() == APPLIED, 'release-combined differs from the applied artifact'
    sql(rel.decode()); sql((PROOF / 'postflight.sql.review').read_text())
    ok('exact applied release-combined a566faa4 installed + proof POST (hosted state reproduced)')
    assemble.build(); inst = (H / 'install.sql.review').read_text()
    fails('PRE refuses the stale baseline (stock/envase v2 not installed yet)', inst, 'DELIVERY_CAP_PRE_DRIFT')
    V2 = H.parent / 'stock-envase-recovery-20261027'
    sql((V2 / 'install-v2.sql.review').read_text()); sql((V2 / 'postflight-v2.sql.review').read_text())
    ok('stock/envase v2 installed with exact PRE/POST (deployment order 2)')
    T.setup()
    fails('pre-delta: authenticated group writer has no EXECUTE', T.actor() + T.call('pre'), 'permission denied')
    fails('pre-delta: capability RPC absent (frontend stays closed)', T.actor() + 'SELECT public.rpc_entrega_operacoes_capability_v1();', 'does not exist')
    base = state()
    sql("GRANT EXECUTE ON FUNCTION public.rpc_entrega_cancelar_v1(uuid,text) TO authenticated;")
    fails('PRE refuses ACL drift (legacy cancel2 granted)', inst, 'DELIVERY_CAP_PRE_DRIFT'); assert state() == base
    sql("REVOKE EXECUTE ON FUNCTION public.rpc_entrega_cancelar_v1(uuid,text) FROM authenticated;")
    broken = inst.replace("-- POST\n", "-- POST\nRAISE EXCEPTION 'LOCAL_POST_FORCED_FAIL';\n", 1); assert broken != inst
    fails('forced POST failure rolls back grants and capability', broken, 'LOCAL_POST_FORCED_FAIL'); assert state() == base; ok('state unchanged after POST failure')
    sql(inst); ok('install COMMIT'); sql((H / 'postflight.sql.review').read_text()); ok('standalone POST passes')
    after = state(); fails('rerun refused', inst, 'DELIVERY_CAP_ALREADY_INSTALLED'); assert state() == after
    fails('anon cannot probe capability', "SET ROLE anon; SELECT public.rpc_entrega_operacoes_capability_v1();", 'permission denied')
    fails('anon cannot call group writer', "SET ROLE anon;" + T.call('anon'), 'permission denied')
    assert cap(T.U) == {'capability': 'delivery_operations_v1', 'group': True, 'cancel': True}; ok('admin AR Bio capability group+cancel')
    assert with_role('producao', lambda: cap(T.U)) == {'capability': 'delivery_operations_v1', 'group': True, 'cancel': False}; ok('producao: group only')
    assert with_role('administrativo', lambda: cap(T.U)) == {'capability': 'delivery_operations_v1', 'group': False, 'cancel': True}; ok('administrativo: cancel only')
    for role in ['financeiro', 'aplicador', 'consultor_tecnico']:
        assert with_role(role, lambda: cap(T.U))['group'] is False; ok(role + ' alone: closed')
    for role in ['parceiro_b2b', 'parceiro_b2b_tecnico', 'superadmin']:
        assert with_role(role, lambda: cap(T.U), drop_admin=False) == {'capability': 'delivery_operations_v1', 'group': False, 'cancel': False}; ok('admin + ' + role + ': closed')
    sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{T.U}';")
    assert cap(T.U)['group'] is False; ok('inactive profile: closed')
    fails('inactive profile: writer denied', T.actor() + T.call('inactive'), 'DELIVERY_ACTOR_DENIED')
    sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{T.U}';")
    fails('FSF tenant admin cannot use AR Bio OS/stock IDs', T.actor(T.V) + T.call('fsf-cross'), 'DELIVERY_SCOPE_DENIED')
    fails('legacy 5-arg creator still closed to clients', T.actor() + f"SELECT public.rpc_cockpit_criar_entrega_v1('{T.O}','manual','{T.S}',1,'{{}}'::jsonb);", 'permission denied')
    fails('legacy cancel2 still closed', T.actor() + f"SELECT public.rpc_entrega_cancelar_v1('{T.O}','x');", 'permission denied')
    fails('unknown/boundary field rejected server-side', T.actor() + T.call('extra-field-key').replace("'{}'::jsonb", "'{\"grupo_entrega_id\":\"x\"}'::jsonb"), 'DELIVERY_DATA_INVALID')
    is_true('negatives created nothing', "SELECT (SELECT count(*) FROM public.entregas)=0 AND (SELECT count(*) FROM platform_private.delivery_requests_20261030)=0;")
    ack = json.loads(sql(T.actor() + T.call('positive')).splitlines()[-1])
    assert set(ack) == {'success', 'replay', 'organization_id', 'os_id', 'itens'} and ack['success'] is True and ack['replay'] is False and ack['os_id'] == T.O and ack['organization_id'] == T.A and len(ack['itens']) == 2
    assert all(set(i) == {'entrega_id', 'estoque_produto_id', 'movimentacao_id'} for i in ack['itens']); ok('authenticated group: exact ACK envelope (frontend parser contract)', ack=ack)
    rep = json.loads(sql(T.actor() + T.call('positive')).splitlines()[-1]); assert rep['replay'] is True and rep['itens'] == ack['itens']; ok('exact replay returns stored result')
    fails('same key from FSF actor cannot read AR Bio receipt', T.actor(T.V) + T.call('positive'), 'DELIVERY_SCOPE_DENIED')
    is_true('two deliveries, two expeditions, one receipt', "SELECT (SELECT count(*) FROM public.entregas)=2 AND (SELECT count(*) FROM public.estoque_movimentacoes WHERE acao='expedicao')=2 AND (SELECT count(*) FROM platform_private.delivery_requests_20261030)=1;")
    fails('direct client UPDATE on entregas denied', T.actor() + "UPDATE public.entregas SET status='entregue';", 'permission denied')
    ent = ack['itens'][0]['entrega_id']
    fails('FSF cannot cancel AR Bio delivery', T.actor(T.V) + T.cancel(ent), 'DELIVERY_SCOPE_DENIED')
    c = json.loads(sql(T.actor() + T.cancel(ent)).splitlines()[-1])
    assert set(c) == {'success', 'replay', 'organization_id', 'entrega_id', 'estoque_estornado', 'reserva_liberada'} and c['entrega_id'] == ent and c['replay'] is False
    ok('authenticated cancel: exact ACK envelope', ack=c)
    is_true('zero financial/fiscal/outbox effects', 'SELECT ' + ' AND '.join(f'(SELECT count(*) FROM public.{t})=0' for t in TABLES) + ';')
    is_true('proof preflight ACL unchanged', "SELECT has_function_privilege('authenticated','public.rpc_entrega_comprovacao_preflight_v1(uuid,text)','EXECUTE') AND NOT has_function_privilege('anon','public.rpc_entrega_comprovacao_preflight_v1(uuid,text)','EXECUTE');")
    before = sql("SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY e.id)::text)||(SELECT count(*) FROM platform_private.delivery_requests_20261030) FROM public.entregas e;")
    rb = (H / 'rollback.sql.review').read_text(); sql(rb); ok('rollback COMMIT')
    fails('after rollback group writer denied', T.actor() + T.call('after-rb'), 'permission denied')
    fails('after rollback cancel denied', T.actor() + T.cancel(ack['itens'][1]['entrega_id']), 'permission denied')
    assert cap(T.U) == {'capability': 'delivery_operations_v1', 'group': False, 'cancel': False}; ok('after rollback capability closed for admin')
    assert sql("SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY e.id)::text)||(SELECT count(*) FROM platform_private.delivery_requests_20261030) FROM public.entregas e;") == before; ok('rollback preserves deliveries and receipts')
    sql(rb); ok('rollback rerun idempotent')
    print('ELAPSED', round(time.monotonic() - t0, 1), flush=True)

if __name__ == '__main__':
    try: main()
    except Exception:
        traceback.print_exc(); checks.append({'test': 'execution stopped at concrete failure', 'status': 'FAIL', 'error': traceback.format_exc()[-3000:]})
    finally:
        (H / 'test-capability-results.json').write_text(json.dumps(checks, indent=2) + '\n')
        print('RESULT', sum(x['status'] == 'PASS' for x in checks), 'PASS', sum(x['status'] == 'FAIL' for x in checks), 'FAIL', flush=True)
    sys.exit(1 if any(x['status'] != 'PASS' for x in checks) else 0)
