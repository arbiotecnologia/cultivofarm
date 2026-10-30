"""Disposable PG: FULL captured restore -> EXACT applied release-combined (a566faa4) + proof POST
-> stock/envase v2 candidate. Actors are `authenticated` with synthetic claims (never service_role).
Static baseline rows are loaded with replica mode only for upstream stages already contained/LIVE;
every tested writer runs with all triggers enabled. Not hosted JWT/RLS/Storage proof."""
import hashlib, json, sys, time, traceback
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
PROOF = H.parent / 'delivery-proof-authz-20261030'
sys.path.insert(0, str(ATOMIC)); sys.path.insert(0, str(H))
import restore
from restore import pg
import test_pg as T
import assemble_v2
APPLIED = 'a566faa4f6f460d8b9195abf93d97717013af815537f00eb28b34cc98d314971'
checks = []
def ok(label, **kw): checks.append({'test': label, 'status': 'PASS', **kw}); print('PASS', label, flush=True)
def sql(s): return pg.sql(s)
def last(s): return sql(s).splitlines()[-1]
def fails(label, s, code):
    e = pg.sql(s, False); assert code in e, label + ':' + e[-900:]; ok(label, expected=code); return e
u = T.u
A, B, U, V, C = T.A, T.B, T.U, T.V, T.C
PROD = T.PROD
W = u(40)  # producao-only actor A
O2, PP2, L2 = u(41), u(42), u(43)   # eligible OS (em_cq, CQ aprovado)
O3, PP3, L3 = u(44), u(45), u(46)   # latest CQ reprovado
O5, PP5, L5 = u(47), u(48), u(49)   # concurrency/rollback target
O6, PP6, L6 = u(50), u(51), u(52)   # partial envase
RX = u(53)                          # stock reserved for ANOTHER OS
O7, PP7, L7 = u(54), u(55), u(56)   # replay matrix (reserved-only / free-only / cancel)
O8, L8, S8, S9, L9 = u(57), u(58), u(59), u(64), u(63)
S10, S11 = u(90), u(91)  # frontend-emitted / free-format metadata roundtrip  # metadata roundtrip (pronto_entrega, free stock)
FEATS = {'envase': u(60), 'ordens_producao': u(61), 'lotes_qualidade': u(62)}
TABLES = ['accounts_receivable', 'accounts_receivable_installments', 'financial_receipts', 'financial_documents', 'fiscal_invoices', 'fiscal_invoice_items', 'fiscal_events', 'comunicacao_outbox', 'comunicacao_eventos', 'os_faturamento_base']
def zero(): return last("SELECT jsonb_build_object(" + ','.join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in TABLES) + ")::text;")
def actor(w=U):
    claims = json.dumps({'sub': w, 'role': 'authenticated', 'iat': int(time.time()) - 5, 'exp': int(time.time()) + 3600, 'aal': 'aal1'})
    return f"SET ROLE authenticated; SET request.jwt.claim.sub='{w}'; SET request.jwt.claims='{claims}'; SET request.jwt.claim.role='authenticated';"
def envase(os, prog, lote, linhas, key, origem='manual', parcial='false', motivo='NULL'):
    return f"SELECT public.rpc_cockpit_registrar_envase_v1('{lote}','{os}','{origem}','{prog}','{json.dumps(linhas)}'::jsonb,current_date+180,'LOCAL','{key}',{parcial},{motivo});"
def os_status(os): return last(f"SELECT status::text FROM public.ordens_servico WHERE id='{os}';")
def group(os, items, key, dados=None):
    obs = last(f"SELECT updated_at FROM public.ordens_servico WHERE id='{os}';")
    its = [dict(i, observed_updated_at=last(f"SELECT updated_at FROM public.estoque_produto WHERE id='{i['item_id']}';")) for i in items]
    return "SELECT public.rpc_cockpit_criar_entrega_v1('%s','manual','%s'::jsonb,'%s','%s'::jsonb,'%s'::timestamptz);" % (os, json.dumps(its), key, json.dumps(dados or {}).replace("'", "''"), obs)
def manufactured(os, prog, lote, cq='aprovado', vol=2000, status='em_cq'):
    return f"""
    INSERT INTO public.ordens_servico(id,organization_id,cliente_id,fazenda_id,talhao_id,produto_id,origem,status,numero_os,volume_total_ml) VALUES('{os}','{A}','{C}','{u(18)}','{u(20)}','{PROD}','agronomica','{status}','LOCAL-{os[-4:]}',{vol});
    INSERT INTO public.programacao_producao(id,organization_id,ordem_servico_id,produto_id,volume_necessario,status,data_programada) VALUES('{prog}','{A}','{os}','{PROD}',{vol},'aprovado',current_date);
    INSERT INTO public.lotes(id,organization_id,produto_id,programacao_id,status,codigo_lote,volume_produzido) VALUES('{lote}','{A}','{PROD}','{prog}','aprovado','LOCAL-L-{lote[-4:]}',100000);
    INSERT INTO public.controle_qualidade(lote_id,organization_id,resultado,seq,responsavel,ph,concentracao) VALUES('{lote}','{A}','aprovado',{int(lote[-4:])},'DADOS FICTICIOS SEM VALOR COMERCIAL',7,1e9);
    {"INSERT INTO public.controle_qualidade(lote_id,organization_id,resultado,seq,responsavel,ph,concentracao,created_at) VALUES('"+lote+"','"+A+"','reprovado',"+str(int(lote[-4:])+1000)+",'DADOS FICTICIOS SEM VALOR COMERCIAL',7,1e9,now()+interval '1 second');" if cq!='aprovado' else ''}
    """
def setup_v2():
    T.setup()
    feats = ''.join(f"INSERT INTO public.saas_features(id,module_id,key,name) VALUES('{i}','{T.MOD}','{k}','LOCAL');INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled) VALUES('{T.VER}','{i}',true);" for k, i in FEATS.items())
    sql("SET session_replication_role=replica;" + feats + f"""
    UPDATE public.saas_plan_versions SET features_snapshot='["estoque_embalagens","envase","ordens_producao","lotes_qualidade"]' WHERE id='{T.VER}';
    INSERT INTO auth.users(id) VALUES('{W}');
    INSERT INTO public.profiles(user_id,organization_id,nome,ativo,senha_provisoria) VALUES('{W}','{A}','LOCAL PROD',true,false);
    INSERT INTO public.user_roles(user_id,role) VALUES('{W}','producao');
    """ + manufactured(O2, PP2, L2) + manufactured(O3, PP3, L3, cq='reprovado') + manufactured(O5, PP5, L5) + manufactured(O6, PP6, L6, vol=5000) + manufactured(O7, PP7, L7) + f"""
    INSERT INTO public.ordens_servico(id,organization_id,cliente_id,fazenda_id,talhao_id,produto_id,origem,status,numero_os) VALUES('{O8}','{A}','{C}','{u(18)}','{u(20)}','{PROD}','agronomica','pronto_entrega','LOCAL-META');
    INSERT INTO public.lotes(id,organization_id,produto_id,status,codigo_lote,volume_produzido) VALUES('{L8}','{A}','{PROD}','aprovado','LOCAL-META',100000),('{L9}','{A}','{PROD}','aprovado','LOCAL-META2',100000);
    INSERT INTO public.estoque_produto(id,lote_id,produto_id,quantidade,volume_total,status) VALUES('{S8}','{L8}','{PROD}',2,2,'disponivel'),('{S9}','{L9}','{PROD}',2,2,'disponivel'),('{S10}','{L8}','{PROD}',2,2,'disponivel'),('{S11}','{L9}','{PROD}',2,2,'disponivel');
    INSERT INTO public.estoque_produto(id,lote_id,produto_id,quantidade,volume_total,status,reservado_para_os_id,reservado_para_os_tipo,reservado_para_cliente_id,quantidade_reservada) VALUES('{RX}','{T.L}','{PROD}',2,2,'reservado','{T.O}','manual','{C}',2);
    SET session_replication_role=origin;""")
def fn_state():
    names = ['public.rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb)', 'public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)', 'public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text)', 'public.fn_envase_material_imutavel()', 'public.fn_validate_envase_volume()', 'platform_private.guard_manual_cq_parent_v1()', 'public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)']
    return last("SELECT jsonb_build_object(" + ','.join(f"'{n}',md5(pg_get_functiondef('{n}'::regprocedure))" for n in names) + ",'scope',to_regprocedure('platform_private.stock_envase_scope_v1(uuid,uuid,uuid,text)') IS NOT NULL,'complete',to_regprocedure('platform_private.stock_envase_complete_v1(uuid,uuid,uuid,text)') IS NOT NULL)::text;")

def main():
    t0 = time.monotonic()
    r = restore.restore(); print('RESTORE', json.dumps({k: len(v) for k, v in r.items()}), flush=True)
    assert not any(r.values()), 'RESTORE_FAILED ' + json.dumps(r)
    rel = (PROOF / 'release-combined.sql.review').read_bytes()
    assert hashlib.sha256(rel).hexdigest() == APPLIED
    sql(rel.decode()); sql((PROOF / 'postflight.sql.review').read_text())
    ok('exact applied release-combined a566faa4 + proof POST (hosted state reproduced on full restore)')
    pins = assemble_v2.build()
    pre = (H / 'preflight-v2.sql.review').read_text(); cand = (H / 'candidate-v2.sql.review').read_text()
    STRICT = ["endereco_cep' AND v_dv !~", "endereco_uf' AND v_dv !~", "{8,20}"]
    assert not any(x in cand for x in STRICT) and "v_dv ~ '[[:cntrl:]]'" in cand, 'GENERATED_CANDIDATE_NOT_FINAL_CONTRACT'
    ok('generated candidate: free-text UF/CEP/phones (no strict regex), controls/length/date/time checks kept')
    base = fn_state()
    for k, p in pins.items(): assert json.loads(base)[p['regprocedure']] == p['pre_md5'], ('PRE pin vs restored', k)
    ok('PRE pins equal restored post-release bodies (motor 44b150bf keeps split delta)')
    names = json.loads(base).keys()
    probe = "SELECT 'POSTJSON'||jsonb_build_object(" + ','.join(f"'{n}',md5(pg_get_functiondef('{n}'::regprocedure))" for n in names if n not in ('scope', 'complete')) + ")::text;"
    res = sql("BEGIN;\n" + pre + cand + "\n" + probe + "\nROLLBACK;")
    post = json.loads([l for l in res.splitlines() if l.startswith('POSTJSON')][-1][8:])
    assert fn_state() == base; ok('post-hash probe transaction rolled back (state unchanged)')
    postsql = "DO $post$ BEGIN\n IF " + ' OR '.join(f"md5(pg_get_functiondef('{n}'::regprocedure))<>'{m}'" for n, m in post.items()) + \
        " OR to_regprocedure('platform_private.stock_envase_complete_v1(uuid,uuid,uuid,text)') IS NULL OR has_function_privilege('authenticated','platform_private.stock_envase_complete_v1(uuid,uuid,uuid,text)','EXECUTE') OR has_function_privilege('authenticated','platform_private.stock_envase_scope_v1(uuid,uuid,uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text)','EXECUTE') THEN RAISE EXCEPTION 'STOCK_V2_POST_DRIFT'; END IF;\nEND $post$;\n"
    (H / 'postflight-v2.sql.review').write_text(postsql)
    (H / 'v2-post-hashes.json').write_text(json.dumps(post, indent=2) + '\n')
    install = "BEGIN;\nSET LOCAL lock_timeout='3s';\n" + pre + cand + "\n-- POST\n" + postsql + "COMMIT;\n"
    (H / 'install-v2.sql.review').write_text(install)
    assert not any(x in install for x in STRICT) and cand in install, 'GENERATED_INSTALLER_NOT_FINAL_CONTRACT'
    ok('generated installer embeds exactly the final candidate (no strict UF/CEP/phone branches)')
    # Drift refusal
    sql("CREATE OR REPLACE FUNCTION public.fn_validate_envase_volume() RETURNS trigger LANGUAGE plpgsql AS $x$ BEGIN RETURN NEW; END $x$;")
    fails('PRE refuses body drift', install, 'STOCK_V2_PRE_DRIFT')
    restored = [f for f in assemble_v2.bodies()[0]['public.fn_validate_envase_volume']][0]['body']
    sql(restored + ';'); assert fn_state() == base; ok('drift fixture reverted to exact LIVE body')
    broken = install.replace("-- POST\n", "-- POST\nDO $f$ BEGIN RAISE EXCEPTION 'LOCAL_POST_FORCED_FAIL'; END $f$;\n", 1)
    fails('forced POST failure', broken, 'LOCAL_POST_FORCED_FAIL'); assert fn_state() == base; ok('POST failure rolled back atomically')
    sql(install); ok('install COMMIT with exact POST'); sql(postsql); ok('standalone POST passes')
    after = fn_state(); fails('rerun refused', install, 'STOCK_V2_ALREADY_INSTALLED'); assert fn_state() == after
    setup_v2()
    # Harness-only grants (candidate grants nothing; LIVE envase is service-only).
    sql("GRANT EXECUTE ON FUNCTION public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text),public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz),public.rpc_entrega_cancelar_v1(uuid,text,timestamptz) TO authenticated;")
    z0 = zero()
    fails('authenticated cannot call transition helper', actor() + f"SELECT platform_private.stock_envase_complete_v1('{O2}','{PP2}','{L2}','completed');", 'permission denied')
    fails('authenticated cannot mint authz ticket', actor() + f"INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(txid_current(),'manual_envase_transition_v1','{O2}');", 'permission denied')
    fails('direct em_cq->envase without ticket denied even as table owner', f"UPDATE public.ordens_servico SET status='envase' WHERE id='{O2}';", 'CQ_MANUAL_PARENT_REQUIRES_REVIEWED_RPC')
    fails('GUC spoof does not open the transition', f"SET app.estoque_purge_fixture='on'; SET app.manual_envase_transition='on'; UPDATE public.ordens_servico SET status='envase' WHERE id='{O2}';", 'CQ_MANUAL_PARENT_REQUIRES_REVIEWED_RPC')
    fails('tenant B actor cannot envase AR Bio lot', actor(V) + envase(O2, PP2, L2, [{'tipo_embalagem': 'frasco_1L', 'quantidade': 3}], 'env-b-tenant-1'), 'DENIED')
    fails('latest CQ reprovado keeps envase closed (existing criterion)', actor() + envase(O3, PP3, L3, [{'tipo_embalagem': 'frasco_1L', 'quantidade': 2}], 'env-reprov-1'), 'COCKPIT_ENVASE_EXIGE_CQ_APROVADO')
    assert os_status(O3) == 'em_cq'; ok('reprovado OS unchanged')
    fails('NaN/invalid line rejected', actor() + envase(O2, PP2, L2, [{'tipo_embalagem': 'frasco_1L'}], 'env-badline-1'), 'COCKPIT_QUANTIDADE_INVALIDA')
    # Partial (need 5000, 2000 packed) does not transition.
    res = json.loads(last(actor() + envase(O6, PP6, L6, [{'tipo_embalagem': 'frasco_1L', 'quantidade': 2}], 'env-partial-1')))
    assert res['estado'] == 'partial' and res['avanco']['success'] is False and os_status(O6) == 'em_cq', res; ok('partial envase stores stock but keeps OS em_cq')
    # Positive: producao actor, 3 x 1L with need 2000 -> 2 reserved for the OS + 1 free, OS -> pronto_entrega.
    res = json.loads(last(actor(W) + envase(O2, PP2, L2, [{'tipo_embalagem': 'frasco_1L', 'quantidade': 3}], 'env-ok-0001')))
    assert res['success'] and res['estado'] == 'completed' and res['avanco'] == {'success': True, 'replay': False, 'status': 'pronto_entrega', 'status_anterior': 'em_cq'}, res
    assert os_status(O2) == 'pronto_entrega'; ok('envase completes and OS em_cq->envase->pronto_entrega via reviewed transition (producao role)')
    assert last(f"SELECT count(*) FROM platform_private.authz_tickets WHERE target='{O2}';") == '0'; ok('transition ticket consumed (none left)')
    assert last(f"SELECT status::text||'/'||(SELECT string_agg(resultado::text,',' ORDER BY seq) FROM public.controle_qualidade WHERE lote_id='{L2}') FROM public.lotes WHERE id='{L2}';") == 'aprovado/aprovado'; ok('lot/CQ rows untouched')
    rep = json.loads(last(actor(W) + envase(O2, PP2, L2, [{'tipo_embalagem': 'frasco_1L', 'quantidade': 3}], 'env-ok-0001')))
    assert rep['replay'] is True and last(f"SELECT count(*) FROM public.envase WHERE lote_id='{L2}';") == '1'; ok('envase replay: no duplicate envase/stock')
    owned = last(f"SELECT id FROM public.estoque_produto WHERE lote_id='{L2}' AND status='reservado' AND reservado_para_os_id='{O2}';")
    free = last(f"SELECT id FROM public.estoque_produto WHERE lote_id='{L2}' AND status='disponivel';")
    fails('reservation of ANOTHER OS is never consumed', actor() + group(O2, [{'item_id': RX, 'quantidade': 2}], 'grp-foreign-0001'), 'DELIVERY_RESERVATION_NOT_OWNED')
    fails('partial consumption of owned reservation refused (no artificial split)', actor() + group(O2, [{'item_id': owned, 'quantidade': 1}], 'grp-partial-0001'), 'DELIVERY_RESERVATION_NOT_OWNED')
    fails('tenant B cannot deliver AR Bio reserved stock', actor(V) + group(O2, [{'item_id': owned, 'quantidade': 2}], 'grp-b-000001'), 'DELIVERY')
    # Concurrency on the same owned reservation: two keys, one wins.
    obs = last(f"SELECT updated_at FROM public.ordens_servico WHERE id='{O2}';")
    its = lambda: json.dumps([{'item_id': owned, 'quantidade': 2, 'observed_updated_at': last(f"SELECT updated_at FROM public.estoque_produto WHERE id='{owned}';")}, {'item_id': free, 'quantidade': 1, 'observed_updated_at': last(f"SELECT updated_at FROM public.estoque_produto WHERE id='{free}';")}])
    stmt = lambda k: actor() + "SELECT public.rpc_cockpit_criar_entrega_v1('%s','manual','%s'::jsonb,'%s','{}'::jsonb,'%s'::timestamptz);" % (O2, its(), k, obs)
    stA, stB = stmt('grp-race-A-0001'), stmt('grp-race-B-0001')
    s1 = T.session("BEGIN;" + stA)
    s2 = T.session("BEGIN;" + stB)
    o1 = T.finish(s1, 'COMMIT;'); o2 = T.finish(s2, 'COMMIT;')
    joined = o1[0] + o1[1] + o2[0] + o2[1]
    n_ok = joined.count('"success": true')
    assert n_ok == 1, joined[-2000:]; ok('concurrent deliveries on the same owned reservation: exactly one commits (no oversell)')
    assert last(f"SELECT count(*) FROM public.entregas WHERE ordem_servico_id='{O2}' AND status::text<>'cancelada';") == '2'; ok('mixed owned+free group delivered once (2 deliveries)')
    assert last(f"SELECT string_agg(status::text,',' ORDER BY quantidade) FROM public.estoque_produto WHERE id IN ('{owned}','{free}') OR (lote_id='{L2}' AND status='expedido');").count('expedido') >= 2; ok('both items expedited through the canonical motor')
    assert last(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE lote_id='{L2}' AND acao='expedicao';") == '2'; ok('ledger: exactly two expedition movements')
    assert last(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE lote_id='{L2}' AND acao='reserva';") == '1'; ok('only the free item was reserved; owned reservation consumed without release/re-reserve')
    # ---- Exact replay after commit (state legitimately moved: reserved->expedido, free->expedido) ----
    snap = lambda: last("SELECT md5(string_agg(t,'|' ORDER BY t)) FROM (SELECT 'E'||id||status||updated_at AS t FROM public.entregas UNION ALL SELECT 'S'||id||status||updated_at||coalesce(reservado_para_os_id::text,'') FROM public.estoque_produto UNION ALL SELECT 'M'||id FROM public.estoque_movimentacoes UNION ALL SELECT 'R'||request_key FROM platform_private.delivery_requests_20261030 UNION ALL SELECT 'B'||request_key FROM platform_private.stock_batch_requests UNION ALL SELECT 'O'||id||status||updated_at FROM public.ordens_servico) x;")
    ids = lambda r: sorted((i['entrega_id'], i['estoque_produto_id'], i['movimentacao_id']) for i in r['itens'])
    win = stA if '"success": true' in (o1[0] + o1[1]) else stB
    first = json.loads([l for l in (o1[0] + o1[1] + o2[0] + o2[1]).splitlines() if '"success": true' in l][0].strip())
    before = snap(); rep = json.loads(last(win))
    assert rep['replay'] is True and ids(rep) == ids(first) and snap() == before; ok('exact replay of committed MIXED group (owned+free now expedido) returns same IDs, zero mutations')
    sql(f"SET session_replication_role=replica; UPDATE public.ordens_servico SET updated_at=updated_at+interval '1 second' WHERE id='{O2}'; SET session_replication_role=origin;")
    before = snap(); rep = json.loads(last(win))
    assert rep['replay'] is True and ids(rep) == ids(first) and snap() == before; ok('exact replay still answers after the OS revision changed post-commit (receipt precedes fresh CAS)')
    fails('same key, changed payload -> replay conflict', win.replace("'{}'::jsonb", '\'{"motorista":"X"}\'::jsonb', 1), 'DELIVERY_REPLAY_CONFLICT')
    fails('tenant B replaying the same key/args is denied', actor(V) + win[win.index('SELECT public.rpc_cockpit_criar_entrega_v1'):], 'DELIVERY_SCOPE_DENIED')
    sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{U}';")
    fails('revoked actor replay denied (no receipt disclosure)', win, 'ERROR:')
    sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{U}';")
    assert snap() == before; ok('denied replays left no mutation')
    # Reserved-only and free-only groups on a fresh manufactured OS.
    json.loads(last(actor(W) + envase(O7, PP7, L7, [{'tipo_embalagem': 'frasco_1L', 'quantidade': 3}], 'env-o7-00001')))
    assert os_status(O7) == 'pronto_entrega'
    own7 = last(f"SELECT id FROM public.estoque_produto WHERE lote_id='{L7}' AND status='reservado' AND reservado_para_os_id='{O7}';")
    free7 = last(f"SELECT id FROM public.estoque_produto WHERE lote_id='{L7}' AND status='disponivel';")
    g_res = group(O7, [{'item_id': own7, 'quantidade': 2}], 'grp-o7-res-01'); r1 = json.loads(last(actor() + g_res))
    before = snap(); rp = json.loads(last(actor() + g_res))
    assert rp['replay'] is True and ids(rp) == ids(r1) and snap() == before; ok('exact replay of RESERVED-only group: same IDs, zero mutations')
    g_free = group(O7, [{'item_id': free7, 'quantidade': 1}], 'grp-o7-free-1'); r2 = json.loads(last(actor() + g_free))
    before = snap(); rp = json.loads(last(actor() + g_free))
    assert rp['replay'] is True and ids(rp) == ids(r2) and snap() == before; ok('exact replay of FREE-only group: same IDs, zero mutations')
    # Cancellation: commit, exact replay, then the group replay still answers from its receipt without re-creating.
    e7 = r1['itens'][0]['entrega_id']
    obs7 = last(f"SELECT updated_at FROM public.entregas WHERE id='{e7}';")
    cst = actor() + f"SELECT public.rpc_entrega_cancelar_v1('{e7}','LOCAL teste','{obs7}'::timestamptz);"
    c1 = json.loads(last(cst)); assert c1['replay'] is False
    before = snap(); c2 = json.loads(last(cst))
    assert c2['replay'] is True and snap() == before; ok('cancellation exact replay: replay=true, zero mutations')
    fails('cancellation same entrega, changed motivo -> conflict', cst.replace('LOCAL teste', 'LOCAL outro'), 'DELIVERY_REPLAY_CONFLICT')
    before = snap(); rp = json.loads(last(actor() + g_res))
    assert rp['replay'] is True and ids(rp) == ids(r1) and snap() == before; ok('group replay after cancellation returns the original receipt; nothing re-created')
    # Lock uniformity: gate held -> envase waits and fails 55P03 atomically.
    hold = T.session("BEGIN; SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; SELECT pg_sleep(5);")
    time.sleep(0.4)
    e = pg.sql(actor(W) + envase(O5, PP5, L5, [{'tipo_embalagem': 'frasco_1L', 'quantidade': 2}], 'env-lock-0001'), False)
    T.finish(hold, 'ROLLBACK;')
    assert '55P03' in e or 'lock timeout' in e or 'canceling statement due to lock timeout' in e, e[-800:]
    assert last(f"SELECT count(*) FROM public.envase WHERE lote_id='{L5}';") == '0' and os_status(O5) == 'em_cq'; ok('gate held: envase waits on the gate first and aborts with lock timeout, zero partial rows')
    # Deadlock attempt: s1 locks a stock row then wants the gate; s2 (motor) takes gate then waits the row.
    tgt = T.S
    s1 = T.session(f"BEGIN; SELECT 1 FROM public.estoque_produto WHERE id='{tgt}' FOR UPDATE;")
    time.sleep(0.3)
    s2 = T.session(actor() + f"BEGIN; SELECT public.rpc_estoque_operar_v1('reserva','{tgt}',1,'deadlock-probe-0001','{{\"os_id\":\"{T.O}\",\"os_tipo\":\"manual\",\"cliente_id\":\"{C}\"}}'::jsonb);")
    time.sleep(0.5)
    def fin(p, c):
        # The deadlock victim's psql exits (ON_ERROR_STOP); writing to it raises EPIPE — collect its output instead.
        try: return T.finish(p, c)
        except BrokenPipeError:
            try: p.stdin.close()
            except Exception: pass
            p.stdin = None
            out, err = p.communicate(timeout=30); return (out or '', err or '')
    o1 = fin(s1, "SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE; ROLLBACK;"); o2 = fin(s2, 'ROLLBACK;')
    j = o1[1] + o2[1]
    assert ('deadlock detected' in j or '40P01' in j or 'lock timeout' in j), j[-1500:]
    assert last("SELECT count(*) FROM public.estoque_movimentacoes WHERE idempotency_key='deadlock-probe-0001';") == '0'; ok('inverse-order contender: PostgreSQL resolves (40P01/55P03) and no partial movement remains', detail=('40P01' if 'deadlock' in j else '55P03'))
    # ---- Delivery metadata (exact allowlist of existing columns) ----
    META = {'tipo_entrega': 'motorista', 'data_saida': '2026-11-03', 'motorista': 'LOCAL MOTORISTA', 'veiculo': 'LOCAL CAMINHAO',
            'motorista_telefone': '(38) 99999-0000', 'motorista_documento': 'LOCAL-CNH-1', 'veiculo_placa': 'ABC1D23', 'veiculo_tipo': 'caminhao',
            'hora_saida_prevista': '08:30', 'data_chegada_prevista': '2026-11-04', 'hora_chegada_prevista': '17:45:00',
            'destinatario_nome': 'LOCAL DESTINATARIO', 'destinatario_telefone': '+55 38 3333-0000', 'destinatario_whatsapp': '38999990000',
            'endereco_origem': 'personalizado', 'endereco_logradouro': "Rua D'Agua", 'endereco_numero': '10', 'endereco_complemento': 'Galpao 2',
            'endereco_bairro': 'Centro', 'endereco_cidade': 'Paracatu', 'endereco_uf': 'MG', 'endereco_cep': '38600-000', 'endereco_referencia': 'LOCAL'}
    for k, bad in [('grupo_entrega_id', u(99)), ('cliente_id', C), ('receivable_id', u(98)), ('comprovante_status', 'aprovado'), ('organization_id', B), ('status', 'entregue'), ('foo', 'x')]:
        fails(f'metadata unknown/boundary field {k} rejected', actor() + group(O8, [{'item_id': S8, 'quantidade': 2}], f'meta-unk-{k}'[:60], dict(META, **{k: bad})), 'DELIVERY_DATA_INVALID')
    for k, bad in [('data_saida', '03/11/2026'), ('data_saida', '2026-02-30'), ('data_chegada_prevista', '2026-13-01'), ('hora_saida_prevista', '25:00'),
                   ('hora_chegada_prevista', '8h'), ('endereco_cep', 'abc\n1'), ('tipo_entrega', 'drone'), ('endereco_origem', 'gps'),
                   ('motorista', 7), ('destinatario_nome', {'x': 1}), ('endereco_numero', True), ('endereco_referencia', 'x' * 301), ('motorista', '   ')]:
        fails(f'metadata malformed {k}={str(bad)[:20]} rejected', actor() + group(O8, [{'item_id': S8, 'quantidade': 2}], f'meta-bad-{k}-{abs(hash(str(bad)))%9999}'[:60], dict(META, **{k: bad})), 'DELIVERY_DATA_INVALID')
    assert last(f"SELECT count(*) FROM public.entregas WHERE ordem_servico_id='{O8}';") == '0'; ok('rejected metadata wrote no delivery')
    full = group(O8, [{'item_id': S8, 'quantidade': 2}, {'item_id': S9, 'quantidade': 2}], 'meta-full-0001', META)   # frozen observed args
    out = sql(actor() + full)
    cols = ','.join(META)
    rows = json.loads(last(f"SELECT jsonb_agg(to_jsonb(x))::text FROM (SELECT {cols} FROM public.entregas WHERE ordem_servico_id='{O8}') x;"))
    assert len(rows) == 2
    for r in rows:
        for k, v in META.items():
            got = r[k]
            if k.startswith('hora_'): got = got[:len(v)] if v.count(':') == 1 else got
            assert got == v, (k, got, v)
    ok('all approved metadata persisted on every delivery of the group (PG roundtrip)', fields=len(META))
    assert last(f"SELECT bool_and(cliente_id='{C}' AND organization_id='{A}' AND receivable_id IS NULL AND partner_order_id IS NULL AND status='separado' AND comprovante_status='pendente') FROM public.entregas WHERE ordem_servico_id='{O8}';") == 't'
    ok('server-derived tenant/client/status/proof/finance unchanged by metadata')
    rep = sql(actor() + full)
    assert '"replay": true' in rep; ok('exact replay with identical metadata returns stored receipt')
    fails('divergent replay (metadata changed, same key) conflicts', actor() + full.replace('LOCAL DESTINATARIO', 'OUTRO'), 'DELIVERY_REPLAY_CONFLICT')
    assert last(f"SELECT count(*)||'/'||max(destinatario_nome) FROM public.entregas WHERE ordem_servico_id='{O8}';") == '2/LOCAL DESTINATARIO'; ok('conflict changed nothing')
    # Exact payload emitted by the mounted RegistrarEntregaDialog (written by vitest), against the final emitted SQL.
    FE = json.loads((H / 'frontend-autofill-payload.json').read_text())
    assert FE['endereco_cep'] == '38.600-000' and FE['destinatario_telefone'] == '(38) 3671-1234'
    FREE = {'endereco_uf': 'Minas Gerais', 'endereco_cep': '38600000', 'destinatario_telefone': '+55 (38) 3671-1234 ramal 2', 'motorista_telefone': 'falar com João',
            'destinatario_whatsapp': '38 9 9999-0000', 'endereco_numero': 's/n', 'veiculo_placa': 'abc-1234'}
    for label, sid, key, dados in [('frontend auto-filled', S10, 'meta-fe-0001', FE), ('free-text formats', S11, 'meta-free-0001', dict(FE, **FREE))]:
        out = sql(actor() + group(O8, [{'item_id': sid, 'quantidade': 2}], key, dados))
        assert '"success": true' in out, out[-800:]
        ent = re.findall(r'"entrega_id": "([0-9a-f-]{36})"', out)[-1]
        row = json.loads(last(f"SELECT to_jsonb(x)::text FROM (SELECT {','.join(dados)} FROM public.entregas WHERE id='{ent}') x;"))
        for k, v in dados.items(): assert row[k] == v, (label, k, row[k], v)
        ok(f'{label} metadata: server accepted and every field roundtripped verbatim', fields=len(dados), cep=dados['endereco_cep'], tel=dados['destinatario_telefone'])
    assert zero() == z0; ok('zero financial/fiscal/communication rows across envase, transition, deliveries and contention')
    # Rollback deny-only
    hist = last(f"SELECT (SELECT count(*) FROM public.entregas)||'/'||(SELECT count(*) FROM public.estoque_movimentacoes)||'/'||(SELECT count(*) FROM public.envase)||'/'||(SELECT count(*) FROM public.laboratorio_esteira_eventos);")
    sql((H / 'rollback-v2.sql.review').read_text())
    st = json.loads(fn_state())
    for k, p in pins.items():
        if k in ('motor', 'batch', 'group', 'cqparent'): assert st[p['regprocedure']] == p['pre_md5'], ('rollback', k)
    assert 'estoque_purge_fixture' not in last("SELECT pg_get_functiondef('public.fn_envase_material_imutavel()'::regprocedure);") ; ok('rollback restores exact applied motor/batch/group/guard and never restores the purge escape')
    fails('after rollback the envase transition is closed', actor(W) + envase(O5, PP5, L5, [{'tipo_embalagem': 'frasco_1L', 'quantidade': 2}], 'env-after-rb-01'), 'ENVASE_TRANSITION_CLOSED')
    assert last(f"SELECT (SELECT count(*) FROM public.entregas)||'/'||(SELECT count(*) FROM public.estoque_movimentacoes)||'/'||(SELECT count(*) FROM public.envase)||'/'||(SELECT count(*) FROM public.laboratorio_esteira_eventos);") == hist; ok('rollback preserves history')
    print('ELAPSED', round(time.monotonic() - t0, 1), flush=True)

if __name__ == '__main__':
    try: main()
    except Exception:
        traceback.print_exc(); checks.append({'test': 'execution stopped at concrete failure', 'status': 'FAIL', 'error': traceback.format_exc()[-3000:]})
    finally:
        (H / 'test-v2-results.json').write_text(json.dumps(checks, indent=2) + '\n')
        print('RESULT', sum(x['status'] == 'PASS' for x in checks), 'PASS', sum(x['status'] == 'FAIL' for x in checks), 'FAIL', flush=True)
    sys.exit(1 if any(x['status'] != 'PASS' for x in checks) else 0)
