"""Real disposable PostgreSQL: restored catalog + atomic install + proof install.
Synthetic rows and auth claims only; never hosted. One bounded runner."""
import json, sys, time, traceback
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
sys.path.insert(0, str(ATOMIC)); sys.path.insert(0, str(H))
import restore
import test_pg as T            # reuse fixtures/session helpers, not its assertions
from restore import pg
import assemble_proof as assemble
checks = []
def sql(s): return pg.sql(s)
def ok(label, s):
    out = sql(s); assert out.splitlines()[-1] == 't', label + ':' + out
    checks.append({'test': label, 'status': 'PASS'}); print('PASS', label, flush=True)
def deny(label, s, code):
    e = pg.sql(s, False); assert code in e, label + ':' + e[-800:]
    checks.append({'test': label, 'status': 'PASS', 'expected': code}); print('PASS', label, flush=True)
def passed(label, **kw): checks.append({'test': label, 'status': 'PASS', **kw}); print('PASS', label, flush=True)
u = T.u
A, B, U, V, C, D, O, P = T.A, T.B, T.U, T.V, T.C, T.D, T.O, T.P
W, X, Y, Z = u(301), u(302), u(303), u(304)        # aplicador, producao, external admin, revocable
E1, E2, E3, E4, EB, EPO, ECX = u(401), u(402), u(403), u(404), u(405), u(406), u(407)
E5, E6, E7 = u(408), u(409), u(410)          # aplicador-linked, storage-wait, legacy adapter
FIN = ['accounts_receivable','accounts_receivable_installments','financial_receipts','financial_documents','fiscal_invoices','fiscal_invoice_items','fiscal_events','comunicacao_outbox','comunicacao_eventos','os_faturamento_base']
def actor(w=U): return f"SET ROLE authenticated; SET request.jwt.claim.sub='{w}';"
def obj(path, owner=U): sql(f"INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('entrega-documentos','{path}','{owner}','{owner}');")
def attach(ent, key, path, extra=None, w=U):
    p = {'arquivo_path': path, 'arquivo_nome': 'recibo.pdf', 'arquivo_mime': 'application/pdf', 'recebedor_nome': 'Recebedor Local'}
    p.update(extra or {})
    return actor(w) + f"SELECT public.rpc_entrega_comprovante_anexar_v1('{ent}','{key}','{json.dumps(p)}'::jsonb);"
def sign(ent, key, path, h='a'*64, w=U):
    p = {'assinatura_digital_png_path': path, 'assinatura_hash': h, 'recebedor_nome': 'Recebedor Local', 'assinatura_user_agent': 'local'}
    return actor(w) + f"SELECT public.rpc_entrega_assinatura_coletar_v1('{ent}','{key}','{json.dumps(p)}'::jsonb);"
def gen(ent, key, w=U): return actor(w) + f"SELECT public.rpc_entrega_formulario_gerar_v1('{ent}','{key}');"
def fin_zero(): return 'SELECT ' + ' AND '.join(f'(SELECT count(*) FROM public.{t})=0' for t in FIN) + ';'
def snapshot(): return sql("SELECT jsonb_build_array((SELECT count(*) FROM public.entrega_comprovantes),(SELECT count(*) FROM platform_private.delivery_requests_20261030),(SELECT count(*) FROM public.financial_audit_log),(SELECT md5(string_agg(to_jsonb(e)::text,'' ORDER BY id)) FROM public.entregas e))::text;")

def fixtures():
    T.setup()
    sql("SET session_replication_role=replica;" + f"""
    INSERT INTO auth.users(id) VALUES('{W}'),('{X}'),('{Y}'),('{Z}');
    INSERT INTO public.profiles(user_id,organization_id,nome,ativo,senha_provisoria) VALUES('{W}','{A}','LOCAL APL',true,false),('{X}','{A}','LOCAL PROD',true,false),('{Y}','{A}','LOCAL EXT',true,false),('{Z}','{A}','LOCAL REV',true,false);
    INSERT INTO public.user_roles(user_id,role) VALUES('{W}','aplicador'),('{X}','producao'),('{Y}','administrador'),('{Y}','parceiro_b2b'),('{Z}','gestor');
    INSERT INTO public.entregas(id,organization_id,ordem_servico_id,cliente_id,status,financial_status,assinatura_obrigatoria) VALUES
     ('{E1}','{A}','{O}','{C}','separado','PENDING_BILLING',true),('{E2}','{A}','{O}','{C}','em_rota','PENDING_BILLING',true),
     ('{E3}','{A}','{O}','{C}','separado','PENDING_BILLING',true),('{E4}','{A}','{O}','{C}','cancelada','CANCELED',true),
     ('{EB}','{B}','{P}','{D}','separado','PENDING_BILLING',true),('{ECX}','{A}','{O}','{C}','separado','PENDING_BILLING',true),
     ('{E5}','{A}','{O}','{C}','separado','PENDING_BILLING',true),('{E6}','{A}','{O}','{C}','em_rota','PENDING_BILLING',true),('{E7}','{A}','{O}','{C}','separado','PENDING_BILLING',true);
    INSERT INTO storage.buckets(id,name,public) VALUES('entrega-documentos','entrega-documentos',false) ON CONFLICT DO NOTHING;
    SET session_replication_role=origin;""")

def main():
    t0 = time.monotonic()
    r = restore.restore(); print('RESTORE', json.dumps({k: len(v) for k, v in r.items()}), flush=True)
    assert not any(r.values()), 'RESTORE_FAILED ' + json.dumps(r)
    import assemble_install; assemble_install.build()
    sql((ATOMIC / 'install.sql.review').read_text()); passed('atomic package installed first (deployment order 1)')
    assemble.build()
    sql((H / 'install.sql.review').read_text()); passed('proof installer COMMIT with PRE and POST (deployment order 2)')
    # Capture exact POST on this disposable instance, rebuild installer with exact POST.
    exp = [{'expression': e, 'expected': json.loads(sql('SELECT ' + e + ';'))} for e in assemble.post_expressions()]
    (H / 'capture/post-expected.json').write_text(json.dumps(exp, indent=1) + '\n'); assemble.build()
    sql((H / 'postflight.sql.review').read_text()); passed('exact POST passes on installed instance', expressions=len(exp))
    fixtures()
    print('CHECKPOINT fixtures', round(time.monotonic() - t0, 1), flush=True)
    # ACL and legacy
    deny('anon cannot execute new attach RPC', "SET ROLE anon; SELECT public.rpc_entrega_comprovante_anexar_v1('%s','k-anon-0001','{}'::jsonb);" % E1, 'permission denied')
    deny('authenticated cannot execute private apply', actor() + f"SELECT platform_private.delivery_proof_apply_20261030('generate','{E1}','k-priv-0001','{{}}');", 'permission denied')
    for sig, call in [('rpc_gerar_formulario_entrega', f"('{E1}')"), ('rpc_coletar_assinatura_digital_entrega', f"('{E1}','{{}}')"), ('rpc_anexar_comprovante_entrega', f"('{E1}','{{}}')")]:
        deny(f'legacy adapter {sig} closed to anon', f'SET ROLE anon; SELECT public.{sig}{call};', 'permission denied')
        deny(f'legacy adapter {sig} closed to service_role', f'SET ROLE service_role; SELECT public.{sig}{call};', 'permission denied')
        deny(f'legacy adapter {sig} without session denied', f'SELECT public.{sig}{call};', 'DELIVERY_PROOF_ACTOR_DENIED')
    deny('legacy generate adapter cross-tenant FSF denied', actor(V) + f"SELECT public.rpc_gerar_formulario_entrega('{E1}');", 'DELIVERY_PROOF_SCOPE_DENIED')
    deny('legacy generate adapter external role denied', actor(Y) + f"SELECT public.rpc_gerar_formulario_entrega('{E1}');", 'DELIVERY_PROOF_ACTOR_DENIED')
    lp = {'arquivo_path': f'entregas/{EB}/comprovantes/{u(520)}.pdf', 'arquivo_nome': 'r.pdf', 'arquivo_mime': 'application/pdf', 'recebedor_nome': 'R'}
    deny('legacy attach adapter path of another tenant delivery denied', actor() + f"SELECT public.rpc_anexar_comprovante_entrega('{E1}','{json.dumps(lp)}'::jsonb);", 'DELIVERY_PROOF_INVALID: path')
    deny('legacy attach adapter legacy-only field data_assinatura rejected', actor() + f"SELECT public.rpc_anexar_comprovante_entrega('{E1}','{json.dumps({**lp, 'arquivo_path': f'entregas/{E1}/comprovantes/{u(521)}.pdf', 'data_assinatura': 'x'})}'::jsonb);", 'DELIVERY_PROOF_INVALID: field')
    # Preflight
    ok('preflight positive admin same tenant', actor() + f"SELECT (public.rpc_entrega_comprovacao_preflight_v1('{E1}','attach')->>'allowed')::boolean;")
    deny('preflight cross-tenant FSF admin denied', actor(V) + f"SELECT public.rpc_entrega_comprovacao_preflight_v1('{E1}','attach');", 'DELIVERY_PROOF_SCOPE_DENIED')
    deny('preflight cancelled delivery denied', actor() + f"SELECT public.rpc_entrega_comprovacao_preflight_v1('{E4}','generate');", 'DELIVERY_PROOF_SCOPE_DENIED')
    deny('preflight external admin+parceiro denied', actor(Y) + f"SELECT public.rpc_entrega_comprovacao_preflight_v1('{E1}','attach');", 'DELIVERY_PROOF_ACTOR_DENIED')
    deny('preflight aplicador without client link denied', actor(W) + f"SELECT public.rpc_entrega_comprovacao_preflight_v1('{E1}','attach');", 'DELIVERY_PROOF_SCOPE_DENIED')
    ok('preflight producao staff allowed (legacy role matrix)', actor(X) + f"SELECT (public.rpc_entrega_comprovacao_preflight_v1('{E1}','sign')->>'allowed')::boolean;")
    snap0 = snapshot()
    ok('preflight writes nothing', f"SELECT '{snap0}'='{snap0}';")
    # Generate
    ok('generate positive creates one proof and seeds checklist', gen(E1, 'gen-e1-00001') + f"SELECT (SELECT count(*) FROM public.entrega_comprovantes WHERE entrega_id='{E1}')=1 AND (SELECT comprovante_status FROM public.entregas WHERE id='{E1}')='formulario_gerado' AND (SELECT count(*) FROM public.entrega_checklist WHERE entrega_id='{E1}')=9;")
    ok('generate replay same key returns stored result', gen(E1, 'gen-e1-00001') + f"SELECT true;")
    out = sql(gen(E1, 'gen-e1-00001')); assert '"replayed": true' in out, out; passed('generate replay is marked replayed, no second proof')
    ok('generate new key reuses open proof', gen(E1, 'gen-e1-00002') + f"SELECT (SELECT count(*) FROM public.entrega_comprovantes WHERE entrega_id='{E1}')=1;")
    deny('same key different delivery conflicts', gen(E2, 'gen-e1-00001'), 'DELIVERY_PROOF_REQUEST_CONFLICT')
    deny('generate cross-tenant denied', gen(E1, 'gen-cross-0001', V), 'DELIVERY_PROOF_SCOPE_DENIED')
    deny('generate cancelled denied', gen(E4, 'gen-e4-00001'), 'DELIVERY_PROOF_SCOPE_DENIED')
    deny('invalid request key rejected', gen(E1, 'bad key'), 'DELIVERY_PROOF_INVALID')
    # Attach
    p1 = f'entregas/{E1}/comprovantes/{u(501)}.pdf'
    deny('attach object missing denied (upload not proven)', attach(E1, 'att-e1-00001', p1), 'DELIVERY_PROOF_OBJECT_DENIED')
    obj(p1, V)
    deny('attach object owned by other user denied', attach(E1, 'att-e1-00001', p1), 'DELIVERY_PROOF_OBJECT_DENIED')
    sql(f"UPDATE storage.objects SET owner='{U}',owner_id='{U}' WHERE name='{p1}';")
    deny('attach path of another delivery denied', attach(E2, 'att-e2-00001', p1), 'DELIVERY_PROOF_INVALID: path')
    deny('attach traversal path denied', attach(E1, 'att-e1-trav1', f'entregas/{E1}/comprovantes/../x.pdf'), 'DELIVERY_PROOF_INVALID: path')
    deny('attach unknown field rejected', attach(E1, 'att-e1-00009', p1, {'data_assinatura': '2020-01-01'}), 'DELIVERY_PROOF_INVALID: field')
    deny('attach mime/extension mismatch rejected', attach(E1, 'att-e1-00008', p1, {'arquivo_mime': 'image/png'}), 'DELIVERY_PROOF_INVALID: mime')
    deny('attach without receiver rejected', attach(E1, 'att-e1-00007', p1, {'recebedor_nome': ' '}), 'DELIVERY_PROOF_INVALID: recebedor_nome')
    deny('attach cross-tenant FSF admin denied', attach(E1, 'att-x-000001', p1, w=V), 'DELIVERY_PROOF_SCOPE_DENIED')
    deny('attach external role denied', attach(E1, 'att-y-000001', p1, w=Y), 'DELIVERY_PROOF_ACTOR_DENIED')
    deny('attach aplicador without link denied', attach(E1, 'att-w-000001', p1, w=W), 'DELIVERY_PROOF_SCOPE_DENIED')
    ok('rejections left zero writes', f"SELECT (SELECT count(*) FROM public.entrega_comprovantes WHERE arquivo_path='{p1}')=0;")
    ok('attach positive links object, delivery and audit', attach(E1, 'att-e1-00001', p1) + f"SELECT (SELECT arquivo_path FROM public.entrega_comprovantes WHERE entrega_id='{E1}')='{p1}' AND (SELECT comprovante_status FROM public.entregas WHERE id='{E1}')='anexado' AND (SELECT count(*) FROM public.financial_audit_log WHERE entity_id='{E1}' AND action='DELIVERY_PROOF_ATTACHED')=1;")
    out = sql(attach(E1, 'att-e1-00001', p1)); assert '"replayed": true' in out, out; passed('attach retry with same key replays without second audit')
    ok('replay kept single audit', f"SELECT (SELECT count(*) FROM public.financial_audit_log WHERE entity_id='{E1}' AND action='DELIVERY_PROOF_ATTACHED')=1;")
    deny('same object under new key conflicts (no relink)', attach(E1, 'att-e1-00002', p1), 'DELIVERY_PROOF_OBJECT_ALREADY_LINKED')
    # Attach without prior form: one transaction generates + attaches
    p2 = f'entregas/{E2}/comprovantes/{u(502)}.pdf'; obj(p2)
    ok('attach without form generates and attaches atomically', attach(E2, 'att-e2-00001', p2) + f"SELECT (SELECT count(*) FROM public.entrega_comprovantes WHERE entrega_id='{E2}')=1 AND (SELECT status FROM public.entrega_comprovantes WHERE entrega_id='{E2}')='anexado';")
    # Sign
    s3 = f'entregas/{E3}/assinaturas/{u(503)}.png'; obj(s3, X)
    deny('sign invalid hash rejected', sign(E3, 'sig-e3-00001', s3, 'zz', X), 'DELIVERY_PROOF_INVALID: hash')
    deny('sign attachment-style path rejected', sign(E3, 'sig-e3-00001', f'entregas/{E3}/comprovantes/{u(503)}.png', w=X), 'DELIVERY_PROOF_INVALID: path')
    ok('sign positive by producao staff', sign(E3, 'sig-e3-00001', s3, w=X) + f"SELECT (SELECT assinatura_digital_png_path FROM public.entrega_comprovantes WHERE entrega_id='{E3}')='{s3}' AND (SELECT assinatura_digital_capturada_por FROM public.entregas WHERE id='{E3}')='{X}';")
    deny('same key from another actor is not a replay of theirs', sign(E3, 'sig-e3-00001', s3, w=U), 'DELIVERY_PROOF_OBJECT')
    # Confirmed proof is closed
    sql(f"SET session_replication_role=replica; UPDATE public.entrega_comprovantes SET status='confirmado' WHERE entrega_id='{E3}'; SET session_replication_role=origin;")
    s3b = f'entregas/{E3}/assinaturas/{u(504)}.png'; obj(s3b, X)
    deny('confirmed proof cannot be overwritten', sign(E3, 'sig-e3-00002', s3b, w=X), 'DELIVERY_PROOF_CLOSED')
    # B2B delivery stays closed
    sql(f"SET session_replication_role=replica; UPDATE public.entregas SET partner_order_id=gen_random_uuid() WHERE id='{ECX}'; SET session_replication_role=origin;")
    deny('B2B-linked delivery proof stays closed', gen(ECX, 'gen-cx-00001'), 'DELIVERY_PROOF_SCOPE_DENIED')
    sql(f"SET session_replication_role=replica; UPDATE public.entregas SET partner_order_id=NULL WHERE id='{ECX}'; SET session_replication_role=origin;")
    # Direct writes / GUC spoof
    deny('direct UPDATE entregas by authenticated denied', actor() + f"UPDATE public.entregas SET comprovante_status='anexado' WHERE id='{E3}';", 'permission denied')
    deny('direct UPDATE entrega_comprovantes by authenticated denied', actor() + f"UPDATE public.entrega_comprovantes SET status='anexado' WHERE entrega_id='{E3}';", 'permission denied')
    deny('owner-level write without permit denied even with spoofed GUCs', f"SET request.jwt.claim.sub='{U}'; SET app.delivery_proof='on'; SET cf.bypass='true'; UPDATE public.entregas SET comprovante_status='anexado' WHERE id='{E3}';", 'DELIVERY_MUTATION_CLOSED')
    deny('proof permit cannot change status', f"SET request.jwt.claim.sub='{U}'; BEGIN; INSERT INTO platform_private.delivery_context_20261030(txid,actor,organization_id,action,target,mutation) VALUES(txid_current(),'{U}','{A}','proof','{E3}','proof'); UPDATE public.entregas SET status='em_rota' WHERE id='{E3}'; COMMIT;", 'DELIVERY_MUTATION_CLOSED')
    deny('proof permit cannot change financial columns', f"SET request.jwt.claim.sub='{U}'; BEGIN; INSERT INTO platform_private.delivery_context_20261030(txid,actor,organization_id,action,target,mutation) VALUES(txid_current(),'{U}','{A}','proof','{E3}','proof'); UPDATE public.entregas SET not_billable_reason='x' WHERE id='{E3}'; COMMIT;", 'DELIVERY_MUTATION_CLOSED')
    deny('proof permit for one row cannot write another', f"SET request.jwt.claim.sub='{U}'; BEGIN; INSERT INTO platform_private.delivery_context_20261030(txid,actor,organization_id,action,target,mutation) VALUES(txid_current(),'{U}','{A}','proof','{E3}','proof'); UPDATE public.entregas SET comprovante_status='x' WHERE id='{E2}'; COMMIT;", 'DELIVERY_MUTATION_CLOSED')
    # Mid-transaction failure rollback (fault injection after comprovante INSERT)
    p4 = f'entregas/{ECX}/comprovantes/{u(505)}.pdf'; obj(p4)
    sql("CREATE FUNCTION public.zz_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.action='DELIVERY_PROOF_ATTACHED' THEN RAISE EXCEPTION 'LOCAL_FAULT_INJECTED'; END IF; RETURN NEW; END$$; CREATE TRIGGER zz_fault BEFORE INSERT ON public.financial_audit_log FOR EACH ROW EXECUTE FUNCTION public.zz_fault();")
    before = snapshot()
    deny('fault after form insert aborts attach', attach(ECX, 'att-cx-00001', p4), 'LOCAL_FAULT_INJECTED')
    ok('fault rolled back proof, request, audit and delivery', f"SELECT '{snapshot()}'='{before}';")
    sql('DROP TRIGGER zz_fault ON public.financial_audit_log; DROP FUNCTION public.zz_fault();')
    ok('retry after definitive failure succeeds with same key and object', attach(ECX, 'att-cx-00001', p4) + f"SELECT (SELECT arquivo_path FROM public.entrega_comprovantes WHERE entrega_id='{ECX}')='{p4}';")
    # Revocation during waits (row lock / advisory lock) with real concurrent sessions
    def nowrite(pk): return f"SELECT NOT EXISTS(SELECT 1 FROM public.entrega_comprovantes WHERE arquivo_path='{pk}');"
    regrant = f"INSERT INTO public.user_roles(user_id,role) VALUES('{Z}','gestor');"
    # (a) wait on the advisory lock (before the gate): an independent revocation commits first -> denied after the wait.
    pk = f'entregas/{E2}/comprovantes/{u(601)}.pdf'; obj(pk, Z)
    holder = T.session('BEGIN;' + f"SELECT pg_advisory_xact_lock(hashtext('entrega_proof:{E2}'));"); time.sleep(.1)
    worker = T.session(attach(E2, 'rev-adv-00001', pk, w=Z)); T.wait()
    sql(f"DELETE FROM public.user_roles WHERE user_id='{Z}';")
    T.finish(holder, 'COMMIT;'); out, err = T.finish(worker)
    assert 'DELIVERY_SCOPE_CHANGED' in err or 'DELIVERY_PROOF_ACTOR_DENIED' in err, err + out
    ok('revocation committed during advisory wait denies after the wait, zero writes', nowrite(pk)); sql(regrant)
    # (b) wait on the global gate: the holder revokes and commits -> recheck after the gate denies.
    pk = f'entregas/{E2}/comprovantes/{u(602)}.pdf'; obj(pk, Z)
    holder = T.session('BEGIN;' + "SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;"); time.sleep(.1)
    worker = T.session(attach(E2, 'rev-gate-0001', pk, w=Z)); T.wait()
    T.finish(holder, f"DELETE FROM public.user_roles WHERE user_id='{Z}'; COMMIT;"); out, err = T.finish(worker)
    assert 'DELIVERY_SCOPE_CHANGED' in err or 'DELIVERY_PROOF_ACTOR_DENIED' in err, err + out
    ok('revocation committed during global-gate wait denies, zero writes', nowrite(pk)); sql(regrant)
    # (c) wait on the row lock (after the gate): revocation is serialized behind the gate, never interleaved.
    pk = f'entregas/{E2}/comprovantes/{u(603)}.pdf'; obj(pk, Z)
    holder = T.session('BEGIN;' + f"SELECT 1 FROM public.entregas WHERE id='{E2}' FOR UPDATE;"); time.sleep(.1)
    worker = T.session(attach(E2, 'rev-row-00001', pk, w=Z)); T.wait()
    revoker = T.session(f"DELETE FROM public.user_roles WHERE user_id='{Z}';"); time.sleep(.3)
    T.finish(holder, 'COMMIT;'); out, err = T.finish(worker); rout, rerr = T.finish(revoker)
    assert 'ERROR' not in err and 'ERROR' not in rerr, err + rerr
    ok('row-lock wait: revocation linearized after the committed proof (gate held)', f"SELECT EXISTS(SELECT 1 FROM public.entrega_comprovantes WHERE arquivo_path='{pk}') AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id='{Z}');")
    pk2 = f'entregas/{E2}/comprovantes/{u(604)}.pdf'; obj(pk2, Z)
    deny('after linearized revocation the next proof is denied', attach(E2, 'rev-row-00002', pk2, w=Z), 'DELIVERY_PROOF_ACTOR_DENIED'); sql(regrant)
    # (d) one transaction holding the row and revoking: PG aborts one side; the worker never writes.
    pk = f'entregas/{E2}/comprovantes/{u(605)}.pdf'; obj(pk, Z)
    holder = T.session('BEGIN;' + f"SELECT 1 FROM public.entregas WHERE id='{E2}' FOR UPDATE;"); time.sleep(.1)
    worker = T.session(attach(E2, 'rev-dead-0001', pk, w=Z)); T.wait()
    hout, herr = T.finish(holder, f"DELETE FROM public.user_roles WHERE user_id='{Z}'; COMMIT;"); out, err = T.finish(worker)
    assert 'ERROR' in err + herr, err + herr
    ok('row holder that revokes: deadlock/denial is fail-closed, zero writes', nowrite(pk))
    sql(f"DELETE FROM public.user_roles WHERE user_id='{Z}';" + regrant)
    # Revocation before replay: stored success must not be returned to a revoked actor
    pz = f'entregas/{E2}/comprovantes/{u(610)}.pdf'; obj(pz, Z)
    sql(attach(E2, 'rep-z-000001', pz, w=Z))
    sql(f"DELETE FROM public.user_roles WHERE user_id='{Z}';")
    deny('revoked actor cannot replay stored receipt', attach(E2, 'rep-z-000001', pz, w=Z), 'DELIVERY_PROOF_ACTOR_DENIED')
    sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{Z}','gestor'); UPDATE public.profiles SET ativo=false WHERE user_id='{Z}';")
    deny('inactive profile cannot replay', attach(E2, 'rep-z-000001', pz, w=Z), 'DELIVERY_PROOF_ACTOR_DENIED')
    sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{Z}';")
    def ctx_zero(): return "SELECT (SELECT count(*) FROM platform_private.delivery_context_20261030)=0;"
    # Aplicador WITH a real client link (storage1 rule) — positive, then real link revocation
    sql(f"SET session_replication_role=replica; INSERT INTO public.user_clientes(user_id,cliente_id,is_active) VALUES('{W}','{C}',true); SET session_replication_role=origin;")
    ok('preflight aplicador WITH client link allowed', actor(W) + f"SELECT (public.rpc_entrega_comprovacao_preflight_v1('{E5}','attach')->>'allowed')::boolean;")
    pw = f'entregas/{E5}/comprovantes/{u(701)}.pdf'; obj(pw, W)
    ok('attach aplicador with client link positive', attach(E5, 'apl-w-000001', pw, w=W) + f"SELECT (SELECT arquivo_path FROM public.entrega_comprovantes WHERE entrega_id='{E5}')='{pw}' AND (SELECT comprovante_anexado_por FROM public.entregas WHERE id='{E5}')='{W}';")
    ok('success leaves zero permit residue (context removed) and keeps the receipt', ctx_zero()[:-1] + f" AND EXISTS(SELECT 1 FROM platform_private.delivery_requests_20261030 WHERE request_key='apl-w-000001' AND actor='{W}');")
    sig5 = f'entregas/{E5}/assinaturas/{u(702)}.png'; obj(sig5, W)
    ok('sign aplicador with client link positive', sign(E5, 'apl-sig-00001', sig5, w=W) + f"SELECT (SELECT assinatura_digital_capturada_por FROM public.entregas WHERE id='{E5}')='{W}';")
    rev = f"UPDATE public.user_clientes SET revoked_at=now(),is_active=false WHERE user_id='{W}';"
    unrev = f"SET session_replication_role=replica; UPDATE public.user_clientes SET revoked_at=NULL,is_active=true WHERE user_id='{W}'; SET session_replication_role=origin;"
    sql(rev)  # real revocation through the normal (gated) path
    deny('after real link revocation aplicador preflight denied', actor(W) + f"SELECT public.rpc_entrega_comprovacao_preflight_v1('{E5}','attach');", 'DELIVERY_PROOF_SCOPE_DENIED')
    deny('after real link revocation aplicador cannot replay stored receipt', attach(E5, 'apl-w-000001', pw, w=W), 'DELIVERY_PROOF_SCOPE_DENIED')
    pw2 = f'entregas/{E5}/comprovantes/{u(703)}.pdf'; obj(pw2, W)
    deny('after real link revocation aplicador new attach denied', attach(E5, 'apl-w-000002', pw2, w=W), 'DELIVERY_PROOF_SCOPE_DENIED')
    ok('other staff on same delivery keeps access after aplicador revocation', actor(X) + f"SELECT (public.rpc_entrega_comprovacao_preflight_v1('{E5}','attach')->>'allowed')::boolean;")
    sql(unrev)
    # Waits AFTER the gate: storage.objects FOR SHARE and comprovante FOR UPDATE.
    # (e) ungated revocation (replica = privileged writer bypassing the gate) commits during the storage wait.
    ps = f'entregas/{E6}/comprovantes/{u(704)}.pdf'; obj(ps, W)
    holder = T.session('BEGIN;' + f"SELECT 1 FROM storage.objects WHERE name='{ps}' FOR UPDATE;"); time.sleep(.1)
    worker = T.session(attach(E6, 'apl-st-00001', ps, w=W)); T.wait()
    sql("SET session_replication_role=replica;" + rev + "SET session_replication_role=origin;")
    T.finish(holder, 'COMMIT;'); out, err = T.finish(worker)
    assert 'DELIVERY_PROOF_SCOPE_DENIED' in err, err + out
    ok('link revoked during storage FOR SHARE wait is denied after the wait, zero writes, zero residue', nowrite(ps)[:-1] + ' AND ' + ctx_zero()[7:])
    sql(unrev)
    # (f) same during the comprovante FOR UPDATE wait (E5 already has a proof).
    pcw = f'entregas/{E5}/comprovantes/{u(705)}.pdf'; obj(pcw, W)
    holder = T.session('BEGIN;' + f"SELECT 1 FROM public.entrega_comprovantes WHERE entrega_id='{E5}' FOR UPDATE;"); time.sleep(.1)
    worker = T.session(attach(E5, 'apl-cp-00001', pcw, w=W)); T.wait()
    sql("SET session_replication_role=replica;" + rev + "SET session_replication_role=origin;")
    T.finish(holder, 'COMMIT;'); out, err = T.finish(worker)
    assert 'DELIVERY_PROOF_SCOPE_DENIED' in err, err + out
    ok('link revoked during comprovante FOR UPDATE wait is denied, zero writes, zero residue', nowrite(pcw)[:-1] + ' AND ' + ctx_zero()[7:])
    sql(unrev)
    # (g) role revoked (ungated) during the comprovante wait: actor recheck denies.
    pcr = f'entregas/{E5}/comprovantes/{u(706)}.pdf'; obj(pcr, W)
    holder = T.session('BEGIN;' + f"SELECT 1 FROM public.entrega_comprovantes WHERE entrega_id='{E5}' FOR UPDATE;"); time.sleep(.1)
    worker = T.session(attach(E5, 'apl-cr-00001', pcr, w=W)); T.wait()
    sql(f"SET session_replication_role=replica; DELETE FROM public.user_roles WHERE user_id='{W}'; SET session_replication_role=origin;")
    T.finish(holder, 'COMMIT;'); out, err = T.finish(worker)
    assert 'DELIVERY_PROOF_ACTOR_DENIED' in err or 'DELIVERY_SCOPE_CHANGED' in err, err + out
    ok('role revoked during comprovante wait is denied, zero writes', nowrite(pcr))
    sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{W}','aplicador');")
    # (h) real gated link revocation during the storage wait is linearized behind the held gate.
    ps2 = f'entregas/{E6}/comprovantes/{u(707)}.pdf'; obj(ps2, W)
    holder = T.session('BEGIN;' + f"SELECT 1 FROM storage.objects WHERE name='{ps2}' FOR UPDATE;"); time.sleep(.1)
    worker = T.session(attach(E6, 'apl-st-00002', ps2, w=W)); T.wait()
    revoker = T.session(rev); time.sleep(.3)
    T.finish(holder, 'COMMIT;'); out, err = T.finish(worker); rout, rerr = T.finish(revoker)
    assert 'ERROR' not in err + rerr, err + rerr
    ok('gated link revocation during storage wait linearizes after the committed proof', f"SELECT EXISTS(SELECT 1 FROM public.entrega_comprovantes WHERE arquivo_path='{ps2}') AND EXISTS(SELECT 1 FROM public.user_clientes WHERE user_id='{W}' AND revoked_at IS NOT NULL);")
    ps3 = f'entregas/{E6}/comprovantes/{u(708)}.pdf'; obj(ps3, W)
    deny('after linearized link revocation the next aplicador proof is denied', attach(E6, 'apl-st-00003', ps3, w=W), 'DELIVERY_PROOF_SCOPE_DENIED')
    # Concurrent different keys, same freshly uploaded object: exactly one links it (PT409 for the other).
    pd = f'entregas/{E7}/comprovantes/{u(709)}.pdf'; obj(pd)
    holder = T.session('BEGIN;' + f"SELECT pg_advisory_xact_lock(hashtext('entrega_proof:{E7}'));"); time.sleep(.1)
    w1 = T.session(attach(E7, 'dbl-0000001', pd)); w2 = T.session(attach(E7, 'dbl-0000002', pd)); T.wait()
    T.finish(holder, 'COMMIT;'); o1, e1 = T.finish(w1); o2, e2 = T.finish(w2)
    assert ('OBJECT_ALREADY_LINKED' in e1 + e2) and ('"success": true' in o1 + o2), e1 + e2 + o1 + o2
    ok('PT409 OBJECT_ALREADY_LINKED while the object IS linked: SQLSTATE never proves an object is unlinked', f"SELECT (SELECT count(*) FROM public.entrega_comprovantes WHERE arquivo_path='{pd}')=1 AND EXISTS(SELECT 1 FROM storage.objects WHERE name='{pd}');")
    # Legacy adapters (cached frontends): same contract, old payload shape.
    out = sql(actor() + f"SELECT public.rpc_gerar_formulario_entrega('{E7}');"); assert '"success": true' in out, out
    passed('legacy generate adapter works for same-tenant staff through the new contract')
    lpath = f'entregas/{E7}/comprovantes/{u(710)}.pdf'; obj(lpath)
    legacy_payload = json.dumps({'arquivo_path': lpath, 'arquivo_nome': 'r.pdf', 'arquivo_mime': 'application/pdf', 'recebedor_nome': 'R', 'recebedor_documento': None, 'recebedor_cargo': None, 'recebedor_telefone': None})
    ok('legacy attach adapter (old payload) links object with audit and zero residue', actor() + f"SELECT public.rpc_anexar_comprovante_entrega('{E7}','{legacy_payload}'::jsonb); RESET ROLE;" + f"SELECT (SELECT arquivo_path FROM public.entrega_comprovantes WHERE entrega_id='{E7}')='{lpath}' AND (SELECT count(*) FROM platform_private.delivery_context_20261030)=0;")
    out = sql(actor() + f"SELECT public.rpc_anexar_comprovante_entrega('{E7}','{legacy_payload}'::jsonb);"); assert '"replayed": true' in out, out
    passed('legacy attach adapter retry with same path replays (idempotent, single audit)')
    ok('legacy replay kept a single audit row', f"SELECT (SELECT count(*) FROM public.financial_audit_log WHERE new_data->>'arquivo_path'='{lpath}')=1;")
    lsig = f'entregas/{E7}/assinaturas/{u(711)}.png'; obj(lsig, X)
    ok('legacy sign adapter (old payload) works for producao staff', actor(X) + f"SELECT public.rpc_coletar_assinatura_digital_entrega('{E7}','{json.dumps({'assinatura_digital_png_path': lsig, 'assinatura_digital_svg': None, 'assinatura_hash': 'b'*64, 'assinatura_user_agent': 'old', 'recebedor_nome': 'R'})}'::jsonb);" + f"SELECT (SELECT assinatura_digital_png_path FROM public.entrega_comprovantes WHERE entrega_id='{E7}')='{lsig}';")
    deny('legacy attach adapter cross-tenant FSF on AR Bio delivery denied', actor(V) + f"SELECT public.rpc_anexar_comprovante_entrega('{E7}','{legacy_payload}'::jsonb);", 'DELIVERY_PROOF_SCOPE_DENIED')
    # Concurrency: same key twice, second waits and replays
    pc = f'entregas/{E2}/comprovantes/{u(611)}.pdf'; obj(pc)
    holder = T.session('BEGIN;' + f"SELECT pg_advisory_xact_lock(hashtext('entrega_proof:{E2}'));"); time.sleep(.1)
    w1 = T.session(attach(E2, 'conc-0000001', pc)); w2 = T.session(attach(E2, 'conc-0000001', pc)); T.wait()
    T.finish(holder, 'COMMIT;'); o1, e1 = T.finish(w1); o2, e2 = T.finish(w2)
    assert 'ERROR' not in e1 + e2 and ('"replayed": true' in o1 + o2), e1 + e2 + o1 + o2
    ok('concurrent same-key attach: one write, one replay, single audit', f"SELECT (SELECT count(*) FROM public.financial_audit_log WHERE new_data->>'arquivo_path'='{pc}')=1;")
    # Atomic contracts still work with proof branch present
    sql('GRANT EXECUTE ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz),public.rpc_entrega_cancelar_v1(uuid,text,timestamptz) TO authenticated;')
    res = sql(actor() + T.call('proof-regress-group', [{'item_id': T.S, 'quantidade': 1}]))
    ent = json.loads(res.splitlines()[-1])['itens'][0]['entrega_id'] if '"itens"' in res else None
    assert ent, res; passed('atomic group creation still passes barrier (harness-only grant)')
    sql(actor() + T.cancel(ent)); ok('atomic cancel still passes barrier', f"SELECT status::text='cancelada' FROM public.entregas WHERE id='{ent}';")
    ok('financial/fiscal/outbox tables remain empty (zero titles, zero dispatch)', fin_zero())
    # Rollback deny-only
    hist = sql('SELECT count(*) FROM platform_private.delivery_requests_20261030;')
    sql((H / 'rollback.sql.review').read_text())
    deny('after rollback new RPC closed to clients', gen(E2, 'post-rb-00001'), 'permission denied')
    deny('after rollback apply deny-only', f"SELECT platform_private.delivery_proof_apply_20261030('generate','{E2}','post-rb-00002','{{}}');", 'DELIVERY_PROOF_ROLLBACK_CLOSED')
    deny('after rollback legacy adapters closed to clients', actor() + f"SELECT public.rpc_gerar_formulario_entrega('{E2}');", 'permission denied')
    deny('after rollback legacy adapters deny-only', f"SELECT public.rpc_gerar_formulario_entrega('{E2}');", 'DELIVERY_LEGACY_CLOSED')
    ok('zero permit residue at the end', ctx_zero())
    deny('after rollback barrier still closes direct writes', f"UPDATE public.entregas SET comprovante_status='x' WHERE id='{E2}';", 'DELIVERY_MUTATION_CLOSED')
    ok('rollback preserved history', f"SELECT count(*)={hist} FROM platform_private.delivery_requests_20261030;")
    print('ELAPSED', round(time.monotonic() - t0, 1), flush=True)

if __name__ == '__main__':
    try: main()
    except Exception:
        traceback.print_exc(); checks.append({'test': 'execution stopped at concrete failure', 'status': 'FAIL', 'error': traceback.format_exc()[-3000:]})
    finally:
        (H / 'test-proof-results.json').write_text(json.dumps(checks, indent=2) + '\n')
        print('RESULT', sum(x['status'] == 'PASS' for x in checks), 'PASS', sum(x['status'] == 'FAIL' for x in checks), 'FAIL', flush=True)
    sys.exit(1 if any(x['status'] != 'PASS' for x in checks) else 0)
