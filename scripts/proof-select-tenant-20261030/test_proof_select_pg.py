"""Disposable PostgreSQL only. Full restore -> exact applied release-combined (a566faa4) + proof POST -> stock/envase
install-v2 (4390ef16) + POST -> fixtures -> BEFORE (cross-tenant read demonstrated) -> generate PRE/POST/installer ->
drift refusal -> install -> AFTER matrix -> proof writers -> rerun refused -> deny-safe rollback.
Synthetic claims; not hosted JWT proof."""
import hashlib, json, sys, time, traceback
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
PROOF = H.parent / 'delivery-proof-authz-20261030'
V2 = H.parent / 'stock-envase-recovery-20261027'
sys.path.insert(0, str(ATOMIC))
import restore
from restore import pg
import test_pg as T
APPLIED = 'a566faa4f6f460d8b9195abf93d97717013af815537f00eb28b34cc98d314971'
V2_INSTALL = '4390ef16cd763292e76847b0d3b7ff113a81bd4e3ea0920a5b00cf2d09175cd2'
POL = 'entrega_comprovantes_parent_visible_r'
checks = []
def sql(s): return pg.sql(s)
def last(s): return sql(s).splitlines()[-1]
def ok(label, **kw): checks.append({'test': label, 'status': 'PASS', **kw}); print('PASS', label, flush=True)
def fails(label, s, code):
    e = pg.sql(s, False); assert code in e, (label, e[-900:]); ok(label, expected=code)
u = T.u
A, B, U, V, C, D, O, P = T.A, T.B, T.U, T.V, T.C, T.D, T.O, T.P
FF, FP, CL, CO, CN, IN, EX = u(601), u(602), u(603), u(604), u(605), u(606), u(607)
EA, EA2, EB = u(611), u(612), u(613)
FIN = ['accounts_receivable', 'accounts_receivable_installments', 'financial_receipts', 'financial_documents', 'fiscal_invoices', 'fiscal_events', 'comunicacao_outbox', 'comunicacao_eventos', 'os_faturamento_base']
def actor(w): return f"SET ROLE authenticated; SET request.jwt.claim.sub='{w}'; SET request.jwt.claims='{json.dumps({'sub': w, 'role': 'authenticated'})}';"
def see(w, ids): return int(last(actor(w) + "SELECT count(*) FROM public.entrega_comprovantes WHERE id IN (%s);" % ','.join(f"'{i}'" for i in ids)))
def gen(ent, key, w): return actor(w) + f"SELECT public.rpc_entrega_formulario_gerar_v1('{ent}','{key}');"
def obj(path, owner): sql(f"INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('entrega-documentos','{path}','{owner}','{owner}');")

STATE = """SELECT jsonb_build_object(
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text) FROM pg_class WHERE oid='public.entrega_comprovantes'::regclass),
 'policies',(SELECT jsonb_agg(jsonb_build_array(policyname,permissive,roles::text,cmd,qual,with_check) ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename='entrega_comprovantes'),
 'parent',(SELECT jsonb_agg(jsonb_build_array(policyname,permissive,roles::text,cmd,qual,with_check) ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename='entregas'),
 'parent_rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.entregas'::regclass),
 'writers',(SELECT jsonb_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid))||'|'||coalesce(p.proacl::text,'')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname='public' AND p.proname IN ('rpc_entrega_formulario_gerar_v1','rpc_entrega_assinatura_coletar_v1','rpc_entrega_comprovante_anexar_v1','rpc_entrega_comprovacao_preflight_v1','rpc_gerar_formulario_entrega','rpc_coletar_assinatura_digital_entrega','rpc_anexar_comprovante_entrega','get_cliente_ids_for_user','is_delivery_staff','is_financial_staff'))
      OR (n.nspname='platform_private' AND p.proname IN ('delivery_proof_apply_20261030','h15_actor_organization','has_role'))))"""
def state(): return json.loads(last(STATE + "::text;"))
def check_sql(expected, code):
    lit = json.dumps(expected).replace("'", "''")
    return f"DO $c$ BEGIN\n IF ({STATE}) IS DISTINCT FROM '{lit}'::jsonb THEN RAISE EXCEPTION '{code}'; END IF;\nEND $c$;\n"

def fixtures():
    T.setup()
    sql("SET session_replication_role=replica;" + f"""
    INSERT INTO auth.users(id) VALUES('{FF}'),('{FP}'),('{CL}'),('{CO}'),('{CN}'),('{IN}'),('{EX}');
    INSERT INTO public.profiles(user_id,organization_id,nome,ativo,senha_provisoria) VALUES
     ('{FF}','{B}','LOCAL FSF FIN',true,false),('{FP}','{B}','LOCAL FSF PROD',true,false),('{CL}','{A}','LOCAL ARB CLIENTE',true,false),
     ('{CO}','{A}','LOCAL ARB CONSULTOR',true,false),('{CN}','{A}','LOCAL ARB CLIENTE SEM VINCULO',true,false),('{IN}','{A}','LOCAL ARB INATIVO',false,false),('{EX}','{A}','LOCAL ARB EXTERNO',true,false);
    INSERT INTO public.user_roles(user_id,role) VALUES('{FF}','financeiro'),('{FP}','producao'),('{CL}','cliente_produtor'),('{CO}','consultor_tecnico'),
     ('{CN}','cliente_produtor'),('{IN}','administrador'),('{EX}','parceiro_b2b');
    INSERT INTO public.user_clientes(user_id,cliente_id,is_active) VALUES('{CL}','{C}',true),('{CO}','{C}',true);
    INSERT INTO public.entregas(id,organization_id,ordem_servico_id,cliente_id,status,financial_status,assinatura_obrigatoria) VALUES
     ('{EA}','{A}','{O}','{C}','separado','PENDING_BILLING',true),('{EA2}','{A}','{O}','{C}','separado','PENDING_BILLING',true),('{EB}','{B}','{P}','{D}','separado','PENDING_BILLING',true);
    INSERT INTO storage.buckets(id,name,public) VALUES('entrega-documentos','entrega-documentos',false) ON CONFLICT DO NOTHING;
    SET session_replication_role=origin;""")

def main():
    t0 = time.monotonic()
    r = restore.restore(); print('RESTORE', json.dumps({k: len(v) for k, v in r.items()}), flush=True)
    assert not any(r.values()), 'RESTORE_FAILED ' + json.dumps(r)
    rel = (PROOF / 'release-combined.sql.review').read_bytes(); assert hashlib.sha256(rel).hexdigest() == APPLIED
    sql(rel.decode()); sql((PROOF / 'postflight.sql.review').read_text())
    inst = (V2 / 'install-v2.sql.review').read_bytes(); assert hashlib.sha256(inst).hexdigest() == V2_INSTALL
    sql(inst.decode()); sql((V2 / 'postflight-v2.sql.review').read_text())
    ok('hosted composition reproduced: release-combined a566faa4 + proof POST + install-v2 4390ef16 + POST')
    pre = state()
    names = [p[0] for p in pre['policies']]
    assert names == ['Cliente read own entrega_comprovantes', 'Consultor read linked entrega_comprovantes', 'Financeiro read entrega_comprovantes', 'Staff manage entrega_comprovantes'], names
    assert pre['rls'][:2] == [True, False] and 'authenticated=rxtm/postgres' in pre['rls'][2] and 'anon' not in pre['rls'][2]
    assert any(p[0] == 'tenant_isolation_d51_5' and p[1] == 'RESTRICTIVE' for p in pre['parent'])
    assert not any('entrega_comprovantes' in (p[4] or '') + (p[5] or '') for p in pre['parent'])
    ok('PRE state matches hosted audit: 4 permissive policies, RLS on/not forced, ACL authenticated=rxtm, parent tenant restrictive, no recursion path', acl=pre['rls'][2])
    fixtures()
    # Proofs created by the canonical writers (no direct DML).
    sql(gen(EA, 'gen-ea-000001', U)); sql(gen(EB, 'gen-eb-000001', V))
    pa = last(f"SELECT id FROM public.entrega_comprovantes WHERE entrega_id='{EA}';"); pb = last(f"SELECT id FROM public.entrega_comprovantes WHERE entrega_id='{EB}';")
    # BEFORE: the hosted defect reproduced.
    before = {'FSF admin': see(V, [pa]), 'FSF financeiro': see(FF, [pa]), 'FSF producao': see(FP, [pa])}
    print('BEFORE', before, flush=True)
    assert before == {'FSF admin': 1, 'FSF financeiro': 1, 'FSF producao': 1}, before
    ok('BEFORE: FSF admin/financeiro/producao read the AR Bio proof id (defect reproduced)', before=before)
    # Generate exact PRE/POST and the installer.
    cand = (H / 'candidate.sql.review').read_text()
    preflight = check_sql(pre, 'PROOF_SELECT_PRE_DRIFT')
    sql("BEGIN;\n" + preflight + cand + "\nCOMMIT;")
    post = state(); sql(f"DROP POLICY {POL} ON public.entrega_comprovantes;")
    assert state() == pre
    assert post['rls'] == pre['rls'] and post['writers'] == pre['writers'] and post['parent'] == pre['parent']
    assert [p for p in post['policies'] if p[0] != POL] == pre['policies']
    mine = [p for p in post['policies'] if p[0] == POL][0]
    assert mine[1] == 'RESTRICTIVE' and mine[2] == '{authenticated}' and mine[3] == 'SELECT' and mine[5] is None, mine
    ok('POST differs from PRE only by the restrictive SELECT policy (ACL/RLS/writers/parent unchanged)', policy=mine)
    postflight = check_sql(post, 'PROOF_SELECT_POST_DRIFT')
    install = "BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='30s';\n" + preflight + cand + "\n" + postflight + "COMMIT;\n"
    (H / 'preflight.sql.review').write_text(preflight); (H / 'postflight.sql.review').write_text(postflight); (H / 'install.sql.review').write_text(install)
    (H / 'pre-state.json').write_text(json.dumps(pre, indent=1) + '\n'); (H / 'post-state.json').write_text(json.dumps(post, indent=1) + '\n')
    # Drift refused atomically.
    sql("CREATE POLICY zz_drift ON public.entrega_comprovantes FOR SELECT TO authenticated USING (true);")
    fails('PRE refuses policy drift; nothing installed', install, 'PROOF_SELECT_PRE_DRIFT')
    sql("DROP POLICY zz_drift ON public.entrega_comprovantes;"); assert state() == pre
    bad = install.replace(postflight, check_sql(dict(post, rls=[True, True, post['rls'][2]]), 'PROOF_SELECT_POST_DRIFT'))
    fails('wrong POST rolls back atomically', bad, 'PROOF_SELECT_POST_DRIFT'); assert state() == pre; ok('state unchanged after POST failure')
    sql(install); assert state() == post; sql(postflight); ok('installer COMMIT + postflight pass')
    fails('rerun refused by PRE', install, 'PROOF_SELECT_PRE_DRIFT')
    # AFTER matrix.
    m = {'FSF admin': see(V, [pa]), 'FSF financeiro': see(FF, [pa]), 'FSF producao': see(FP, [pa]), 'AR Bio inactive admin': see(IN, [pa]),
         'AR Bio external parceiro_b2b': see(EX, [pa]), 'AR Bio unlinked client': see(CN, [pa])}
    print('AFTER_DENY', m, flush=True); assert set(m.values()) == {0}, m
    ok('AFTER: FSF admin/financeiro/producao, inactive, external and unlinked client read 0 AR Bio proofs', matrix=m)
    pos = {'AR Bio admin own': see(U, [pa]), 'AR Bio linked client': see(CL, [pa]), 'AR Bio linked consultant': see(CO, [pa]), 'FSF admin own': see(V, [pb])}
    print('AFTER_ALLOW', pos, flush=True); assert set(pos.values()) == {1}, pos
    ok('AFTER: AR Bio admin, linked client, linked consultant and FSF own proof still readable', matrix=pos)
    assert see(U, [pb]) == 0; ok('AR Bio admin cannot read the FSF proof')
    fails('anon has no SELECT on entrega_comprovantes', "SET ROLE anon; SELECT count(*) FROM public.entrega_comprovantes;", 'permission denied')
    # Proof writers unaffected (generate/sign/attach) with readback by the owner.
    sql(gen(EA2, 'gen-ea2-00001', U))
    s = f'entregas/{EA2}/assinaturas/{u(620)}.png'; obj(s, U)
    sql(actor(U) + f"SELECT public.rpc_entrega_assinatura_coletar_v1('{EA2}','sig-ea2-00001','{json.dumps({'assinatura_digital_png_path': s, 'assinatura_hash': 'a' * 64, 'recebedor_nome': 'Recebedor Local', 'assinatura_user_agent': 'local'})}'::jsonb);")
    f = f'entregas/{EA2}/comprovantes/{u(621)}.pdf'; obj(f, U)
    out = sql(actor(U) + f"SELECT public.rpc_entrega_comprovante_anexar_v1('{EA2}','att-ea2-00001','{json.dumps({'arquivo_path': f, 'arquivo_nome': 'recibo.pdf', 'arquivo_mime': 'application/pdf', 'recebedor_nome': 'Recebedor Local'})}'::jsonb);")
    assert last(actor(U) + f"SELECT assinatura_digital_png_path='{s}' AND arquivo_path='{f}' FROM public.entrega_comprovantes WHERE entrega_id='{EA2}';") == 't', out[-800:]
    out = sql(actor(U) + f"SELECT public.rpc_entrega_comprovante_anexar_v1('{EA2}','att-ea2-00001','{json.dumps({'arquivo_path': f, 'arquivo_nome': 'recibo.pdf', 'arquivo_mime': 'application/pdf', 'recebedor_nome': 'Recebedor Local'})}'::jsonb);")
    assert '"replayed": true' in out, out[-500:]
    ok('generate/sign/attach + replay still work for AR Bio admin; owner reads the result')
    fails('FSF admin generate on AR Bio delivery still denied by writer', gen(EA2, 'gen-x-0000001', V), 'DELIVERY_PROOF_SCOPE_DENIED')
    assert see(V, [last(f"SELECT id FROM public.entrega_comprovantes WHERE entrega_id='{EA2}';")]) == 0; ok('FSF admin cannot read the new AR Bio proof')
    assert last('SELECT ' + ' AND '.join(f'(SELECT count(*) FROM public.{t})=0' for t in FIN) + ';') == 't'; ok('zero finance/fiscal/outbox/communication rows')
    # Deny-safe rollback.
    sql((H / 'rollback.sql.review').read_text())
    assert see(V, [pa]) == 0 and see(FF, [pa]) == 0 and see(U, [pa]) == 0; ok('rollback narrows (never drops): no cross-tenant read restored; direct reads closed')
    assert last(f"SELECT count(*) FROM pg_policies WHERE tablename='entrega_comprovantes' AND policyname='{POL}';") == '1'
    sql(gen(EA, 'gen-ea-000002', U)); ok('writers still work after rollback')
    print('ELAPSED', round(time.monotonic() - t0, 1), flush=True)

if __name__ == '__main__':
    try: main()
    except Exception:
        traceback.print_exc(); checks.append({'test': 'execution stopped at concrete failure', 'status': 'FAIL', 'error': traceback.format_exc()[-3000:]})
    finally:
        (H / 'test-results.json').write_text(json.dumps(checks, indent=2) + '\n')
        print('RESULT', sum(x['status'] == 'PASS' for x in checks), 'PASS', sum(x['status'] != 'PASS' for x in checks), 'FAIL', flush=True)
    sys.exit(1 if any(x['status'] != 'PASS' for x in checks) else 0)
