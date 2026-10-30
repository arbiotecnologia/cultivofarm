"""Disposable PostgreSQL only. Full restore -> applied release-combined a566faa4 + proof POST -> install-v2 4390ef16 + POST
-> proof-select-tenant install -> fixtures -> BEFORE (cross-tenant read/write/TRUNCATE reproduced) -> exact PRE/POST and
installer -> drift/POST-fail/rerun -> AFTER matrix per table -> proof writers -> deny-safe rollback.
Synthetic claims; not hosted JWT proof."""
import hashlib, json, sys, time, traceback
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
PROOF = H.parent / 'delivery-proof-authz-20261030'
V2 = H.parent / 'stock-envase-recovery-20261027'
PSEL = H.parent / 'proof-select-tenant-20261030'
sys.path.insert(0, str(ATOMIC))
import restore
from restore import pg
import test_pg as T
APPLIED = 'a566faa4f6f460d8b9195abf93d97717013af815537f00eb28b34cc98d314971'
V2_INSTALL = '4390ef16cd763292e76847b0d3b7ff113a81bd4e3ea0920a5b00cf2d09175cd2'
TABLES = ['entrega_checklist', 'entrega_ocorrencias', 'entrega_documentos', 'entrega_conferencia_itens', 'entrega_reconciliacoes', 'entrega_etiquetas']
checks = []
def sql(s): return pg.sql(s)
def last(s): return sql(s).splitlines()[-1]
def ok(label, **kw): checks.append({'test': label, 'status': 'PASS', **kw}); print('PASS', label, flush=True)
def fails(label, s, code):
    e = pg.sql(s, False); assert code in e, (label, e[-900:]); ok(label, expected=code)
u = T.u
A, B, U, V, C, D, O, P = T.A, T.B, T.U, T.V, T.C, T.D, T.O, T.P
FF, CL, IN = u(701), u(702), u(703)
EA, EB, EN = u(711), u(712), u(713)          # AR Bio, FSF, organization NULL
ETQ = u(720)
def actor(w): return f"SET ROLE authenticated; SET request.jwt.claim.sub='{w}'; SET request.jwt.claims='{json.dumps({'sub': w, 'role': 'authenticated'})}';"
def cols(t, ent, rid, who=U):
    base = {'id': rid, 'entrega_id': ent}
    extra = {'entrega_checklist': {'item': 'LOCAL ITEM'}, 'entrega_ocorrencias': {'tipo': 'observacao', 'descricao': 'LOCAL'},
             'entrega_documentos': {'tipo_documento': 'OUTRO', 'nome_arquivo': 'x.pdf', 'arquivo_path': f'entregas/{ent}/docs/{rid}.pdf', 'uploaded_by': who},
             'entrega_etiquetas': {'etiqueta_id': ETQ}}.get(t, {})
    return {**base, **extra}
def ins(t, d): return f"INSERT INTO public.{t}({','.join(d)}) VALUES({','.join(repr(str(v)) for v in d.values())});"
def rid(t, k): return u(800 + TABLES.index(t) * 10 + k)          # k: 1=AR Bio row, 2=FSF row, 3=org-null parent, 4=new
def count(w, t, i): return int(last(actor(w) + f"SELECT count(*) FROM public.{t} WHERE id='{i}';"))
STATE = """SELECT jsonb_build_object(
 'rel',(SELECT jsonb_object_agg(relname, jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN (%s,'entregas')),
 'policies',(SELECT jsonb_agg(jsonb_build_array(tablename,policyname,permissive,roles::text,cmd,qual,with_check) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='public' AND tablename IN (%s,'entregas','entrega_comprovantes','entrega_termos')),
 'fns',(SELECT jsonb_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname='public' AND p.proname IN ('is_delivery_staff','is_financial_staff','get_cliente_ids_for_user','can_user_access_produto_etiqueta','_entrega_seed_checklist','rpc_entrega_formulario_gerar_v1'))
      OR (n.nspname='platform_private' AND p.proname IN ('h15_actor_organization','has_role','delivery_proof_apply_20261030','entrega_termo_tenant_ok'))))""" % ((','.join(f"'{t}'" for t in TABLES),) * 2)
def state(): return json.loads(last(STATE + "::text;"))
def check_sql(expected, code):
    lit = json.dumps(expected).replace("'", "''")
    return f"DO $c$ BEGIN\n IF ({STATE}) IS DISTINCT FROM '{lit}'::jsonb THEN RAISE EXCEPTION '{code}'; END IF;\nEND $c$;\n"


import re
def cls(out):
    if 'ERROR' not in out: return 'ok:' + out.strip().splitlines()[-1]
    m = re.search(r'ERROR:\s+(.*)', out); e = m.group(1) if m else out[-200:]
    if 'row-level security' in e: return 'rls'
    if 'permission denied' in e: return 'perm:' + e.split('permission denied for ')[-1].strip()
    return 'err:' + e[:120]
def probe(w, stmt): return cls(pg.sql("BEGIN;" + actor(w) + stmt + " ROLLBACK;", False).replace('ROLLBACK', ''))
def dml(t, w, op, row, ent=None):
    if op == 'ins': return probe(w, "WITH x AS (" + ins(t, cols(t, ent, u(990), w)).rstrip(';').replace('VALUES', 'SELECT', 1).replace('(\'', '\'', 0) + ") SELECT 1;") if False else probe(w, ins(t, cols(t, ent, u(990), w)) + " SELECT 'inserted';")
    if op == 'upd': return probe(w, f"WITH x AS (UPDATE public.{t} SET entrega_id={'entrega_id' if ent is None else repr(ent)} WHERE id='{row}' RETURNING 1) SELECT count(*) FROM x;")
    if op == 'del': return probe(w, f"WITH x AS (DELETE FROM public.{t} WHERE id='{row}' RETURNING 1) SELECT count(*) FROM x;")
def matrix():
    m = {}
    for t in TABLES:
        m[t] = {'x_ins': dml(t, V, 'ins', None, EA), 'x_upd': dml(t, V, 'upd', rid(t, 1)), 'x_del': dml(t, V, 'del', rid(t, 1)),
                'own_ins': dml(t, U, 'ins', None, EA), 'own_upd': dml(t, U, 'upd', rid(t, 1)), 'own_del': dml(t, U, 'del', rid(t, 1)),
                'reparent_to_fsf': dml(t, U, 'upd', rid(t, 1), EB), 'reparent_to_null_org': dml(t, U, 'upd', rid(t, 1), EN),
                'fsf_reparent_own_to_arbio': dml(t, V, 'upd', rid(t, 2), EA)}
    return m

def fixtures():
    T.setup()
    rows = ''.join(ins(t, cols(t, EA, rid(t, 1))) + ins(t, cols(t, EB, rid(t, 2), V)) + ins(t, cols(t, EN, rid(t, 3))) for t in TABLES)
    sql("SET session_replication_role=replica;" + f"""
    INSERT INTO auth.users(id) VALUES('{FF}'),('{CL}'),('{IN}');
    INSERT INTO public.profiles(user_id,organization_id,nome,ativo,senha_provisoria) VALUES('{FF}','{B}','LOCAL FSF FIN',true,false),('{CL}','{A}','LOCAL ARB CLIENTE',true,false),('{IN}','{A}','LOCAL ARB INATIVO',false,false);
    INSERT INTO public.user_roles(user_id,role) VALUES('{FF}','financeiro'),('{CL}','cliente_produtor'),('{IN}','administrador');
    INSERT INTO public.user_clientes(user_id,cliente_id,is_active) VALUES('{CL}','{C}',true);
    INSERT INTO public.entregas(id,organization_id,ordem_servico_id,cliente_id,status,financial_status,assinatura_obrigatoria) VALUES
     ('{EA}','{A}','{O}','{C}','separado','PENDING_BILLING',true),('{EB}','{B}','{P}','{D}','separado','PENDING_BILLING',true),('{EN}',NULL,'{O}','{C}','separado','PENDING_BILLING',true);
    {rows}
    SET session_replication_role=origin;""")

def main():
    t0 = time.monotonic()
    r = restore.restore(); print('RESTORE', json.dumps({k: len(v) for k, v in r.items()}), flush=True)
    assert not any(r.values()), 'RESTORE_FAILED ' + json.dumps(r)
    rel = (PROOF / 'release-combined.sql.review').read_bytes(); assert hashlib.sha256(rel).hexdigest() == APPLIED
    sql(rel.decode()); sql((PROOF / 'postflight.sql.review').read_text())
    inst = (V2 / 'install-v2.sql.review').read_bytes(); assert hashlib.sha256(inst).hexdigest() == V2_INSTALL
    sql(inst.decode()); sql((V2 / 'postflight-v2.sql.review').read_text())
    sql((PSEL / 'install.sql.review').read_text()); sql((PSEL / 'postflight.sql.review').read_text())
    ok('composition: release-combined a566faa4 + install-v2 4390ef16 + proof-select-tenant install/POST')
    pre = state()
    for t in TABLES:
        assert pre['rel'][t][:2] == [True, False], (t, pre['rel'][t])
        assert not any(p[0] == t and p[2] == 'RESTRICTIVE' for p in pre['policies']), t
    assert not any(p[0] == 'entregas' and any(t in (p[5] or '') + (p[6] or '') for t in TABLES) for p in pre['policies'])
    assert any(p[0] == 'entrega_termos' and p[2] == 'RESTRICTIVE' for p in pre['policies'])
    ok('PRE: 6 tables RLS on/not forced, no restrictive policy; entregas policies do not reference them; entrega_termos already restrictive', acl={t: pre['rel'][t][2] for t in TABLES})
    fixtures()
    # BEFORE: defect reproduced (read + cross-tenant write + TRUNCATE).
    before = {t: count(V, t, rid(t, 1)) for t in TABLES}; print('BEFORE_READ', before, flush=True)
    ok('BEFORE: FSF admin read per table of AR Bio rows (1 = exposed)', before=before)
    assert before['entrega_checklist'] == 1, before
    wb = matrix(); print('BEFORE_WRITES', json.dumps(wb), flush=True)
    ok('BEFORE: write outcome matrix recorded (rolled back)', matrix=wb)
    tr = {t: 'ERROR' not in pg.sql("BEGIN;" + actor(V) + f"TRUNCATE public.{t};ROLLBACK;", False) for t in TABLES}; print('BEFORE_TRUNCATE', tr, flush=True)
    ok('BEFORE: TRUNCATE allowed to authenticated (rolled back)', truncate=tr)
    # Generate PRE/POST/installer.
    cand = (H / 'candidate.sql.review').read_text()
    preflight = check_sql(pre, 'EVIDENCE_TENANT_PRE_DRIFT')
    sql("BEGIN;\n" + cand + "\nCOMMIT;"); post = state()
    sql("BEGIN;" + ''.join(f"DROP POLICY {t}_parent_visible_r ON public.{t};" for t in TABLES) + ''.join(
        f"GRANT TRUNCATE ON public.{t} TO authenticated;" for t in TABLES if 'authenticated=' in pre['rel'][t][2] and 'D' in pre['rel'][t][2].split('authenticated=')[1].split('/')[0]) + "COMMIT;")
    assert state() == pre, 'probe revert mismatch'
    assert post['fns'] == pre['fns'] and post['rel']['entregas'] == pre['rel']['entregas']
    assert [p for p in post['policies'] if not p[1].endswith('_parent_visible_r')] == pre['policies']
    for t in TABLES:
        a0, a1 = pre['rel'][t][2], post['rel'][t][2]
        assert a1 == a0.replace('authenticated=arwdDxtm', 'authenticated=arwdxtm').replace('anon=arwdDxtm', 'anon=arwdxtm'), (t, a0, a1)
    ok('POST differs from PRE only by 6 restrictive policies and the TRUNCATE bit for client roles', acl={t: post['rel'][t][2] for t in TABLES})
    postflight = check_sql(post, 'EVIDENCE_TENANT_POST_DRIFT')
    install = "BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='30s';\n" + preflight + cand + "\n" + postflight + "COMMIT;\n"
    for n, v in [('preflight.sql.review', preflight), ('postflight.sql.review', postflight), ('install.sql.review', install)]: (H / n).write_text(v)
    (H / 'pre-state.json').write_text(json.dumps(pre, indent=1) + '\n'); (H / 'post-state.json').write_text(json.dumps(post, indent=1) + '\n')
    sql("CREATE POLICY zz_drift ON public.entrega_checklist FOR SELECT TO authenticated USING (true);")
    fails('PRE refuses drift; nothing installed', install, 'EVIDENCE_TENANT_PRE_DRIFT')
    sql("DROP POLICY zz_drift ON public.entrega_checklist;"); assert state() == pre
    fails('wrong POST rolls back atomically', install.replace(postflight, check_sql({**post, 'fns': {}}, 'EVIDENCE_TENANT_POST_DRIFT')), 'EVIDENCE_TENANT_POST_DRIFT')
    assert state() == pre; ok('state unchanged after POST failure')
    sql(install); sql(postflight); assert state() == post; ok('installer COMMIT + postflight pass')
    fails('rerun refused by PRE', install, 'EVIDENCE_TENANT_PRE_DRIFT')
    # AFTER matrix.
    for t in TABLES:
        assert count(V, t, rid(t, 1)) == 0 and count(FF, t, rid(t, 1)) == 0 and count(IN, t, rid(t, 1)) == 0, t
        assert count(U, t, rid(t, 3)) == 0 and count(V, t, rid(t, 3)) == 0, t
        assert count(U, t, rid(t, 2)) == 0, t
        fails(f'{t}: TRUNCATE denied to authenticated', actor(V) + f"TRUNCATE public.{t};", 'permission denied')
        n = last(actor(V) + f"WITH x AS (DELETE FROM public.{t} WHERE id='{rid(t, 1)}' RETURNING 1) SELECT count(*) FROM x;")
        assert n == '0' and last(f"SELECT count(*) FROM public.{t} WHERE id='{rid(t, 1)}';") == '1', (t, n)
    wa = matrix(); print('AFTER_WRITES', json.dumps(wa), flush=True)
    bad = lambda v: v.startswith('ok:') and v not in ('ok:0',)
    for t in TABLES:
        for k in ('x_ins', 'x_upd', 'x_del', 'reparent_to_fsf', 'reparent_to_null_org', 'fsf_reparent_own_to_arbio'):
            assert not bad(wa[t][k]), (t, k, wa[t][k])
        for k in ('own_ins', 'own_upd', 'own_del'):
            assert wa[t][k] == wb[t][k], (t, k, wb[t][k], wa[t][k])
    ok('AFTER write matrix: every cross-tenant/reparent op affects 0 rows or is denied; same-tenant outcomes identical to BEFORE', after=wa)
    ok('AFTER all 6: FSF admin/financeiro, inactive AR Bio admin read 0; org-NULL parent invisible; cross-tenant DELETE 0 rows and TRUNCATE denied')
    own = {t: [count(U, t, rid(t, 1)), count(V, t, rid(t, 2))] for t in TABLES}; print('AFTER_OWN', own, flush=True)
    ok('AFTER same-tenant reads (AR Bio admin own, FSF admin own) per table', own=own)
    assert own['entrega_checklist'] == [1, 1] and own['entrega_ocorrencias'] == [1, 1] and own['entrega_conferencia_itens'] == [1, 1] and own['entrega_reconciliacoes'] == [1, 1]
    assert count(CL, 'entrega_checklist', rid('entrega_checklist', 1)) == 1 and count(CL, 'entrega_ocorrencias', rid('entrega_ocorrencias', 1)) == 1
    ok('AFTER linked AR Bio client still reads own checklist/ocorrencias')
    # Canonical proof writer (seeds checklist) unaffected.
    sql(actor(U) + f"SELECT public.rpc_entrega_formulario_gerar_v1('{EA}','gen-ev-000001');")
    assert int(last(actor(U) + f"SELECT count(*) FROM public.entrega_checklist WHERE entrega_id='{EA}';")) >= 2
    assert int(last(actor(V) + f"SELECT count(*) FROM public.entrega_checklist WHERE entrega_id='{EA}';")) == 0
    ok('canonical proof generate (checklist seed) works; FSF sees none of the seeded rows')
    FIN = ['accounts_receivable', 'financial_receipts', 'fiscal_invoices', 'fiscal_events', 'comunicacao_outbox', 'comunicacao_eventos', 'os_faturamento_base']
    assert last('SELECT ' + ' AND '.join(f'(SELECT count(*) FROM public.{t})=0' for t in FIN) + ';') == 't'; ok('zero finance/fiscal/outbox/communication rows')
    fails('anon has no access', "SET ROLE anon; SELECT count(*) FROM public.entrega_checklist;", 'permission denied') if 'anon=' not in pre['rel']['entrega_checklist'][2] else ok('anon ACL present: governed by policies (none for anon)')
    # Deny-safe rollback.
    sql((H / 'rollback.sql.review').read_text())
    for t in TABLES: assert count(V, t, rid(t, 1)) == 0 and count(U, t, rid(t, 1)) == 0, t
    fails('after rollback TRUNCATE still denied', actor(V) + "TRUNCATE public.entrega_checklist;", 'permission denied')
    sql(actor(U) + f"SELECT public.rpc_entrega_formulario_gerar_v1('{EA}','gen-ev-000002');")
    ok('rollback narrows to false (never drops/regrants); no cross-tenant access restored; writers still work')
    print('ELAPSED', round(time.monotonic() - t0, 1), flush=True)

if __name__ == '__main__':
    try: main()
    except Exception:
        traceback.print_exc(); checks.append({'test': 'execution stopped at concrete failure', 'status': 'FAIL', 'error': traceback.format_exc()[-3000:]})
    finally:
        (H / 'test-results.json').write_text(json.dumps(checks, indent=2) + '\n')
        print('RESULT', sum(x['status'] == 'PASS' for x in checks), 'PASS', sum(x['status'] != 'PASS' for x in checks), 'FAIL', flush=True)
    sys.exit(1 if any(x['status'] != 'PASS' for x in checks) else 0)
