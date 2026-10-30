"""Disposable PostgreSQL only. Restore -> applied release-combined a566faa4 + install-v2 4390ef16 + proof-select-tenant
+ evidence install 36b238e9 (all as applied hosted) -> fixtures -> BEFORE -> generated exact PRE/POST installers for
(1) produto_etiquetas tenant root barrier and (2) checklist/occurrence writer authorization -> drift/POST-fail/rerun ->
AFTER matrices with exact SQLSTATEs -> revocation during lock wait -> proof generate/sign/attach -> deny-safe rollbacks.
Synthetic claims; not hosted JWT proof."""
import hashlib, json, re, subprocess, sys, time, traceback
from pathlib import Path
H = Path(__file__).resolve().parent
CK = H.parent / 'delivery-checklist-occurrence-authz-20261030'
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
PROOF = H.parent / 'delivery-proof-authz-20261030'
V2 = H.parent / 'stock-envase-recovery-20261027'
PSEL = H.parent / 'proof-select-tenant-20261030'
EVID = H.parent / 'delivery-evidence-tenant-20261030'
sys.path.insert(0, str(ATOMIC))
import restore
from restore import pg
import test_pg as T
PINS = {PROOF / 'release-combined.sql.review': 'a566faa4f6f460d8b9195abf93d97717013af815537f00eb28b34cc98d314971',
        V2 / 'install-v2.sql.review': '4390ef16cd763292e76847b0d3b7ff113a81bd4e3ea0920a5b00cf2d09175cd2',
        EVID / 'install.sql.review': '36b238e965d14207c3b11c046e1b07b4bdc94393cd0a20d310e0267bb4526d6b'}
checks, RAW = [], []
def sql(s): return pg.sql(s)
def last(s): return sql(s).splitlines()[-1]
def ok(label, **kw): checks.append({'test': label, 'status': 'PASS', **kw}); print('PASS', label, flush=True)
def fails(label, s, code):
    e = pg.sql(s, False); assert code in e, (label, e[-900:]); ok(label, expected=code)
u = T.u
A, B, U, V, C, D, O, P, L, M = T.A, T.B, T.U, T.V, T.C, T.D, T.O, T.P, T.L, T.M
FA, FB = u(18), u(19)
FF, CL, IN = u(1001), u(1002), u(1003)
EA, EA2, EB, EN, EX = u(1011), u(1012), u(1013), u(1014), u(1015)   # EX: AR Bio delivery cancelada
LB, LN = u(1021), u(1022)
VA, VB, MA, MB = u(1031), u(1032), u(1033), u(1034)
SB = T.T   # existing stock item of the other AR Bio lote M
PA, PB = u(1041), u(1042)
MIX = {'entrega_foreign': u(1051), 'cliente_foreign': u(1052), 'envase_foreign': u(1053), 'embalagem_foreign': u(1054),
       'estoque_item_other_lote': u(1055), 'fazenda_foreign': u(1056), 'no_lote': u(1057), 'lote_org_null': u(1058), 'lote_ghost': u(1059)}
CHA, CHB, CHX = u(1061), u(1062), u(1063)
def actor(w): return f"SET ROLE authenticated; SET request.jwt.claim.sub='{w}'; SET request.jwt.claims='{json.dumps({'sub': w, 'role': 'authenticated'})}';"
def cls(out):
    if 'ERROR' not in out: return 'ok:' + out.strip().splitlines()[-1]
    m = re.search(r'ERROR:\s+([0-9A-Z]{5}):\s+(.*)', out); assert m, 'NO_SQLSTATE ' + out[-300:]
    RAW.append(m.group(0)); return 'E42501' if m.group(1) == '42501' else f'E{m.group(1)}:{m.group(2).strip()}'
def probe(w, stmt, role=True, lt='2s'):
    pre = actor(w) if role else ''
    r = subprocess.run(pg.psql(), input="\\set VERBOSITY verbose\nSET lock_timeout='" + lt + "'; SET statement_timeout='30s';\nBEGIN;" + pre + stmt + "\nROLLBACK;", capture_output=True, text=True, timeout=40)
    return cls(r.stdout.replace('ROLLBACK', '').strip() if r.returncode == 0 else r.stderr)
NEG = 'E42501'
ALL_LABELS = [PA, PB] + list(MIX.values())
def seen_ids(w):
    out = sql(actor(w) + "SELECT coalesce(string_agg(id::text, ',' ORDER BY id), '-') FROM public.produto_etiquetas;").splitlines()[-1]
    return set() if out == '-' else set(out.split(','))
FNS = ("('rpc_atualizar_checklist_entrega','rpc_registrar_ocorrencia_entrega','can_user_access_produto_etiqueta','is_delivery_staff','rpc_entrega_formulario_gerar_v1',"
       "'rpc_entrega_assinatura_coletar_v1','rpc_entrega_comprovante_anexar_v1','rpc_gerar_etiqueta_produto','rpc_vincular_etiqueta_embalagem','rpc_marcar_etiqueta_impressa','rpc_cancelar_etiqueta_produto')")
STATE = f"""SELECT jsonb_build_object(
 'rel',(SELECT jsonb_object_agg(relname, jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('produto_etiquetas','entrega_etiquetas','entregas','lotes','entrega_checklist','entrega_ocorrencias')),
 'policies',(SELECT jsonb_agg(jsonb_build_array(tablename,policyname,permissive,roles::text,cmd,qual,with_check) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='public' AND tablename IN ('produto_etiquetas','entrega_etiquetas','entregas','lotes','entrega_checklist','entrega_ocorrencias')),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgrelid::regclass::text,tgname,tgenabled) ORDER BY 1,2) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.produto_etiquetas'::regclass,'public.lotes'::regclass,'public.entrega_checklist'::regclass,'public.entrega_ocorrencias'::regclass)),
 'fns',(SELECT jsonb_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid))||'|'||coalesce(p.proacl::text,'')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname='public' AND p.proname IN {FNS}) OR (n.nspname='platform_private' AND p.proname IN ('h15_actor_organization','has_role','produto_etiqueta_root_org_v1'))))"""
def state(): return json.loads(last(STATE + "::text;"))
def check_sql(expected, code):
    lit = json.dumps(expected).replace("'", "''")
    return f"DO $c$ BEGIN\n IF ({STATE}) IS DISTINCT FROM '{lit}'::jsonb THEN RAISE EXCEPTION '{code}'; END IF;\nEND $c$;\n"
def label(i, lote, **k):
    cols = {'id': i, 'codigo_etiqueta': 'LOCAL-' + i[-6:], 'produto_nome': 'LOCAL TESTE', 'lote_codigo': 'LOCAL', 'lote_id': lote, **k}
    cols = {a: b for a, b in cols.items() if b is not None}
    return f"INSERT INTO public.produto_etiquetas({','.join(cols)}) VALUES({','.join(repr(v) for v in cols.values())});"

def fixtures():
    T.setup()
    ghost = u(1099)
    sql("SET session_replication_role=replica;" + f"""
    INSERT INTO auth.users(id) VALUES('{FF}'),('{CL}'),('{IN}');
    INSERT INTO public.profiles(user_id,organization_id,nome,ativo,senha_provisoria) VALUES('{FF}','{B}','LOCAL FSF FIN',true,false),('{CL}','{A}','LOCAL ARB CLIENTE',true,false),('{IN}','{A}','LOCAL ARB INATIVO',false,false);
    INSERT INTO public.user_roles(user_id,role) VALUES('{FF}','financeiro'),('{CL}','cliente_produtor'),('{IN}','administrador');
    INSERT INTO public.user_clientes(user_id,cliente_id,is_active) VALUES('{CL}','{C}',true);
    INSERT INTO public.lotes(id,organization_id,produto_id,status,codigo_lote,volume_produzido) VALUES('{LB}','{B}','{T.PROD}','aprovado','LOCAL-LB',1000),('{LN}',NULL,'{T.PROD}','aprovado','LOCAL-LN',1000);
    INSERT INTO public.envase(id,lote_id,organization_id,tipo_embalagem,volume_por_unidade,quantidade) VALUES('{VA}','{L}','{A}','frasco_1L',1000,1),('{VB}','{LB}','{B}','frasco_1L',1000,1);
    INSERT INTO public.estoque_embalagens(id,codigo_embalagem,lote_id,volume) VALUES('{MA}','LOCAL-MA','{L}',1),('{MB}','LOCAL-MB','{LB}',1),('{u(1036)}','LOCAL-MB2','{LB}',1);
    INSERT INTO public.entregas(id,organization_id,ordem_servico_id,cliente_id,status,financial_status,assinatura_obrigatoria) VALUES
     ('{EA}','{A}','{O}','{C}','separado','PENDING_BILLING',true),('{EA2}','{A}','{O}','{C}','separado','PENDING_BILLING',true),
     ('{EB}','{B}','{P}','{D}','separado','PENDING_BILLING',true),('{EN}',NULL,'{O}','{C}','separado','PENDING_BILLING',true),
     ('{EX}','{A}','{O}','{C}','cancelada','PENDING_BILLING',true);
    INSERT INTO public.entrega_checklist(id,entrega_id,item) VALUES('{CHA}','{EA}','LOCAL A'),('{CHB}','{EB}','LOCAL B'),('{CHX}','{EX}','LOCAL X');
    {label(PA, L, entrega_id=EA, cliente_id=C, fazenda_id=FA, envase_id=VA, embalagem_id=MA)}
    {label(PB, LB, entrega_id=EB, cliente_id=D, fazenda_id=FB, envase_id=VB, embalagem_id=MB)}
    {label(MIX['entrega_foreign'], L, entrega_id=EB)}
    {label(MIX['cliente_foreign'], L, cliente_id=D)}
    {label(MIX['envase_foreign'], L, envase_id=VB)}
    {label(MIX['embalagem_foreign'], L, embalagem_id=u(1036))}
    {label(MIX['estoque_item_other_lote'], L, estoque_item_id=SB)}
    {label(MIX['fazenda_foreign'], L, fazenda_id=FB)}
    {label(MIX['no_lote'], None, entrega_id=EA, cliente_id=C)}
    {label(MIX['lote_org_null'], LN, entrega_id=EA)}
    {label(MIX['lote_ghost'], ghost, entrega_id=EA)}
    SET session_replication_role=origin;""")

def label_matrix():
    return {'U_update_entrega_to_foreign': probe(U, f"UPDATE public.produto_etiquetas SET entrega_id='{EB}' WHERE id='{PA}'; SELECT 'updated';"),
            'U_update_cliente_to_foreign': probe(U, f"UPDATE public.produto_etiquetas SET cliente_id='{D}' WHERE id='{PA}'; SELECT 'updated';"),
            'U_update_lote_to_foreign': probe(U, f"UPDATE public.produto_etiquetas SET lote_id='{LB}' WHERE id='{PA}'; SELECT 'updated';"),
            'U_update_benign_own': probe(U, f"WITH x AS (UPDATE public.produto_etiquetas SET observacoes='LOCAL' WHERE id='{PA}' RETURNING 1) SELECT count(*) FROM x;"),
            'U_insert_foreign_lote': probe(U, label(u(1091), LB) + " SELECT 'inserted';"),
            'U_insert_own_lote_foreign_cliente': probe(U, label(u(1092), L, cliente_id=D) + " SELECT 'inserted';"),
            'U_insert_own_valid': probe(U, label(u(1093), L, entrega_id=EA, cliente_id=C) + " SELECT 'inserted';"),
            'U_insert_no_lote': probe(U, label(u(1094), None, entrega_id=EA) + " SELECT 'inserted';"),
            'V_update_arbio_label': probe(V, f"WITH x AS (UPDATE public.produto_etiquetas SET observacoes='X' WHERE id='{PA}' RETURNING 1) SELECT count(*) FROM x;"),
            'V_delete_arbio_label': probe(V, f"WITH x AS (DELETE FROM public.produto_etiquetas WHERE id='{PA}' RETURNING 1) SELECT count(*) FROM x;"),
            'V_insert_arbio_lote': probe(V, label(u(1095), L) + " SELECT 'inserted';"),
            'U_delete_own': probe(U, f"WITH x AS (DELETE FROM public.produto_etiquetas WHERE id='{PA}' RETURNING 1) SELECT count(*) FROM x;"),
            'anon_select': probe(None, "SET ROLE anon; SELECT count(*) FROM public.produto_etiquetas;", role=False),
            'anon_truncate': probe(None, "SET ROLE anon; TRUNCATE public.produto_etiquetas; SELECT 'truncated';", role=False),
            'auth_truncate': probe(V, "TRUNCATE public.produto_etiquetas; SELECT 'truncated';")}
def ck_matrix():
    up = lambda w, i: probe(w, f"SELECT public.rpc_atualizar_checklist_entrega('{i}', true, 'LOCAL')::text;")
    oc = lambda w, e: probe(w, f"SELECT (public.rpc_registrar_ocorrencia_entrega('{e}', '{{\"tipo\":\"observacao\",\"descricao\":\"LOCAL\"}}'::jsonb)->>'success');")
    return {'U_own_checklist': up(U, CHA), 'V_arbio_checklist': up(V, CHA), 'U_fsf_checklist': up(U, CHB), 'IN_inactive_checklist': up(IN, CHA),
            'FF_financeiro_checklist': up(FF, CHB), 'U_cancelled_checklist': up(U, CHX), 'U_ghost_checklist': up(U, u(1098)),
            'U_own_occurrence': oc(U, EA), 'V_arbio_occurrence': oc(V, EA), 'U_fsf_occurrence': oc(U, EB), 'IN_inactive_occurrence': oc(IN, EA),
            'U_nullorg_occurrence': oc(U, EN), 'U_cancelled_occurrence': oc(U, EX), 'U_ghost_occurrence': oc(U, u(1098))}

def main():
    t0 = time.monotonic()
    r = restore.restore(); assert not any(r.values()), 'RESTORE_FAILED ' + json.dumps(r)
    sql((PROOF / 'release-combined.sql.review').read_text()); sql((PROOF / 'postflight.sql.review').read_text())
    sql((V2 / 'install-v2.sql.review').read_text()); sql((V2 / 'postflight-v2.sql.review').read_text())
    sql((PSEL / 'install.sql.review').read_text()); sql((PSEL / 'postflight.sql.review').read_text())
    sql((EVID / 'install.sql.review').read_text()); sql((EVID / 'postflight.sql.review').read_text())
    for f, h in PINS.items(): assert hashlib.sha256(f.read_bytes()).hexdigest() == h, f
    ok('installed composition: a566faa4 + 4390ef16 + proof-select + evidence 36b238e9 (hash-pinned, POSTs pass)')
    pre = state()
    assert not any(p[0] == 'produto_etiquetas' and p[2] == 'RESTRICTIVE' for p in pre['policies'])
    assert not any(p[0] in ('entregas', 'lotes') and 'produto_etiquetas' in (p[5] or '') + (p[6] or '') for p in pre['policies'])
    ok('PRE: produto_etiquetas has no restrictive policy; entregas/lotes policies do not reference it (no recursion)', acl=pre['rel']['produto_etiquetas'][2])
    fixtures()
    bs = {'U': seen_ids(U), 'V': seen_ids(V), 'FF': seen_ids(FF), 'CL': seen_ids(CL), 'IN': seen_ids(IN)}
    print('BEFORE_SEEN', {k: len(v) for k, v in bs.items()}, flush=True)
    assert PA in bs['V'] and PA in bs['FF'] and len(bs['V']) == len(ALL_LABELS), bs
    ok('BEFORE: FSF admin and FSF financeiro read AR Bio labels (all 11 incl. mixed)', counts={k: len(v) for k, v in bs.items()})
    lb = label_matrix(); print('BEFORE_LABEL', json.dumps(lb, ensure_ascii=False), flush=True)
    assert lb['V_update_arbio_label'] == 'ok:1' and lb['V_delete_arbio_label'] == 'ok:1' and lb['V_insert_arbio_lote'] == 'ok:inserted', lb
    FKT = 'E0A000:cannot truncate a table referenced in a foreign key constraint'
    assert lb['anon_truncate'] == FKT and lb['auth_truncate'] == FKT, lb
    ok('BEFORE: FSF admin could update/delete/insert AR Bio labels; anon/authenticated TRUNCATE passed the privilege check (stopped only by FK 0A000, not by authorization)', matrix=lb)
    cb = ck_matrix(); print('BEFORE_CK', json.dumps(cb, ensure_ascii=False), flush=True)
    assert cb['V_arbio_checklist'].startswith('ok:') and cb['V_arbio_occurrence'] == 'ok:true', cb
    ok('BEFORE: FSF admin could update AR Bio checklist and register AR Bio occurrence via UI RPCs (rolled back)', matrix=cb)
    assert cb['U_own_checklist'].startswith('ok:') and cb['U_own_occurrence'] == 'ok:true', cb
    ok('BEFORE: AR Bio staff own checklist/occurrence via RPC works under the parent no-DML barrier (UI path functional)')
    # Probe-apply each candidate to derive exact POST, then revert exactly to PRE.
    cand_l = (H / 'candidate.sql.review').read_text(); cand_c = (CK / 'candidate.sql.review').read_text()
    pre_l = state()
    sql("BEGIN;\n" + cand_l + "\nCOMMIT;"); post_l = state()
    sql("BEGIN; DROP POLICY produto_etiquetas_tenant_root_r ON public.produto_etiquetas; DROP FUNCTION platform_private.produto_etiqueta_root_org_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid);"
        "GRANT TRUNCATE ON public.produto_etiquetas TO anon, authenticated; COMMIT;")
    assert state() == pre_l, 'label probe revert mismatch'
    pre_c_raw = pre_l
    sql("BEGIN;\n" + cand_c + "\nCOMMIT;"); post_c_raw = state()
    sql(ORIG_CK); assert state() == pre_l, 'checklist probe revert mismatch (original bodies from LIVE capture)'
    # Exact expected deltas.
    assert [p for p in post_l['policies'] if p[1] != 'produto_etiquetas_tenant_root_r'] == pre_l['policies'] and post_l['fns'].keys() - pre_l['fns'].keys() == {'platform_private.produto_etiqueta_root_org_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid)'}
    assert post_l['rel']['produto_etiquetas'][2] == pre_l['rel']['produto_etiquetas'][2].replace('anon=arwdDxtm', 'anon=arwdxtm').replace('authenticated=arwdDxtm', 'authenticated=arwdxtm'), post_l['rel']['produto_etiquetas']
    assert {k: v for k, v in post_l['rel'].items() if k != 'produto_etiquetas'} == {k: v for k, v in pre_l['rel'].items() if k != 'produto_etiquetas'} and post_l['triggers'] == pre_l['triggers']
    ok('labels POST = PRE + 1 restrictive policy + provenance helper + TRUNCATE bit removed (anon/authenticated) only', acl=post_l['rel']['produto_etiquetas'][2])
    changed = {k for k in pre_c_raw['fns'] if pre_c_raw['fns'][k] != post_c_raw['fns'][k]}
    assert changed == {'rpc_atualizar_checklist_entrega(uuid,boolean,text)', 'rpc_registrar_ocorrencia_entrega(uuid,jsonb)'}, changed
    assert all(pre_c_raw['fns'][k].split('|')[1] == post_c_raw['fns'][k].split('|')[1] for k in changed) and {k: v for k, v in post_c_raw.items() if k != 'fns'} == {k: v for k, v in pre_c_raw.items() if k != 'fns'}
    ok('checklist POST = PRE with only the two writer bodies changed; ACLs, policies, triggers unchanged')
    # Label installer (on composition). POST of checklist is computed on top of labels POST.
    preL, postL = check_sql(pre_l, 'LABEL_TENANT_PRE_DRIFT'), check_sql(post_l, 'LABEL_TENANT_POST_DRIFT')
    instL = "BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='30s';\n" + preL + cand_l + "\n" + postL + "COMMIT;\n"
    sql("CREATE POLICY zz_drift ON public.produto_etiquetas FOR SELECT TO authenticated USING (true);")
    fails('labels PRE refuses drift', instL, 'LABEL_TENANT_PRE_DRIFT'); sql("DROP POLICY zz_drift ON public.produto_etiquetas;")
    fails('labels wrong POST rolls back atomically', instL.replace(postL, check_sql({**post_l, 'fns': {}}, 'LABEL_TENANT_POST_DRIFT')), 'LABEL_TENANT_POST_DRIFT')
    assert state() == pre_l
    sql(instL); sql(postL); assert state() == post_l; ok('labels installer COMMIT + postflight')
    fails('labels rerun refused', instL, 'LABEL_TENANT_PRE_DRIFT')
    for n, v in (('preflight.sql.review', preL), ('postflight.sql.review', postL), ('install.sql.review', instL)): (H / n).write_text(v)
    # Checklist installer on top of labels POST.
    sql("BEGIN;\n" + cand_c + "\nCOMMIT;"); post_c = state(); sql(ORIG_CK); assert state() == post_l
    preC, postC = check_sql(post_l, 'CK_AUTHZ_PRE_DRIFT'), check_sql(post_c, 'CK_AUTHZ_POST_DRIFT')
    instC = "BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='30s';\n" + preC + cand_c + "\n" + postC + "COMMIT;\n"
    sql("REVOKE EXECUTE ON FUNCTION public.rpc_registrar_ocorrencia_entrega(uuid,jsonb) FROM authenticated;")
    fails('checklist PRE refuses drift', instC, 'CK_AUTHZ_PRE_DRIFT'); sql("GRANT EXECUTE ON FUNCTION public.rpc_registrar_ocorrencia_entrega(uuid,jsonb) TO authenticated;")
    assert state() == post_l
    fails('checklist wrong POST rolls back atomically', instC.replace(postC, check_sql({**post_c, 'fns': {}}, 'CK_AUTHZ_POST_DRIFT')), 'CK_AUTHZ_POST_DRIFT')
    assert state() == post_l
    sql(instC); sql(postC); assert state() == post_c; ok('checklist installer COMMIT + postflight')
    fails('checklist rerun refused', instC, 'CK_AUTHZ_PRE_DRIFT')
    for n, v in (('preflight.sql.review', preC), ('postflight.sql.review', postC), ('install.sql.review', instC)): (CK / n).write_text(v)
    for d, a, b in ((H, pre_l, post_l), (CK, post_l, post_c)):
        (d / 'pre-state.json').write_text(json.dumps(a, indent=1) + '\n'); (d / 'post-state.json').write_text(json.dumps(b, indent=1) + '\n')
    # AFTER label reads.
    as_ = {'U': seen_ids(U), 'V': seen_ids(V), 'FF': seen_ids(FF), 'CL': seen_ids(CL), 'IN': seen_ids(IN)}
    print('AFTER_SEEN', {k: sorted(x[-4:] for x in v) for k, v in as_.items()}, flush=True)
    assert as_ == {'U': {PA}, 'V': {PB}, 'FF': {PB}, 'CL': {PA}, 'IN': set()}, as_
    ok('AFTER reads: AR Bio admin/client only valid AR Bio label; FSF admin/financeiro only FSF label; inactive none; all 9 mixed/no-root/null-org/ghost hidden from everyone')
    la = label_matrix(); print('AFTER_LABEL', json.dumps(la, ensure_ascii=False), flush=True)
    IMM = 'EP0001:Campos de identificação/emissão da etiqueta são imutáveis'
    EXP = {'U_update_entrega_to_foreign': NEG, 'U_update_cliente_to_foreign': NEG, 'U_update_lote_to_foreign': IMM, 'U_update_benign_own': 'ok:1',
           'U_insert_foreign_lote': NEG, 'U_insert_own_lote_foreign_cliente': NEG, 'U_insert_own_valid': 'ok:inserted', 'U_insert_no_lote': NEG,
           'V_update_arbio_label': 'ok:0', 'V_delete_arbio_label': 'ok:0', 'V_insert_arbio_lote': NEG, 'U_delete_own': 'ok:1',
           'anon_select': 'ok:0', 'anon_truncate': NEG, 'auth_truncate': NEG}
    diff = {k: (lb[k], la[k], EXP[k]) for k in EXP if la[k] != EXP[k]}; assert not diff, diff
    ok('AFTER label writes exact: root swaps/foreign/no-lote 42501, lote swap blocked by existing immutability trigger, own valid insert/update/delete allowed, FSF 0 rows, TRUNCATE 42501', matrix=la)
    assert lb['U_update_lote_to_foreign'] == IMM; ok('lote_id immutability pre-exists (same result before/after), so the root cannot be swapped')
    ca = ck_matrix(); print('AFTER_CK', json.dumps(ca, ensure_ascii=False), flush=True)
    BIZ = 'E23514:As evidências desta entrega estão encerradas e não podem ser alteradas.'
    EXPC = {'U_own_checklist': 'ok:{"success": true}', 'V_arbio_checklist': NEG, 'U_fsf_checklist': NEG, 'IN_inactive_checklist': NEG,
            'FF_financeiro_checklist': NEG, 'U_cancelled_checklist': BIZ, 'U_ghost_checklist': NEG,
            'U_own_occurrence': 'ok:true', 'V_arbio_occurrence': NEG, 'U_fsf_occurrence': NEG, 'IN_inactive_occurrence': NEG,
            'U_nullorg_occurrence': NEG, 'U_cancelled_occurrence': BIZ, 'U_ghost_occurrence': NEG}
    diff = {k: (cb[k], ca[k], EXPC[k]) for k in EXPC if ca[k] != EXPC[k]}; assert not diff, diff
    ok('AFTER checklist/occurrence exact: own works, cross-tenant/inactive/financeiro/null-org/ghost 42501, closed-evidence trigger 23514 preserved', matrix=ca)
    # Persisted own writes + audit, then revocation during lock wait.
    sql(actor(U) + f"SELECT public.rpc_atualizar_checklist_entrega('{CHA}', true, 'LOCAL OK');")
    assert last(f"SELECT concluido AND concluido_por='{U}' AND observacao='LOCAL OK' FROM public.entrega_checklist WHERE id='{CHA}';") == 't'
    assert last(f"SELECT count(*) FROM public.financial_audit_log WHERE entity_id='{EA}' AND action='DELIVERY_CHECKLIST_UPDATED';") == '1'
    ok('own checklist update persisted with actor and existing audit row')
    holder = subprocess.Popen(pg.psql(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    holder.stdin.write(f"BEGIN; SELECT 1 FROM public.entregas WHERE id='{EA}' FOR UPDATE; UPDATE public.profiles SET ativo=false WHERE user_id='{U}'; SELECT pg_sleep(3); COMMIT;\n"); holder.stdin.flush()
    time.sleep(1)
    waited = probe(U, f"SELECT (public.rpc_registrar_ocorrencia_entrega('{EA}', '{{\"tipo\":\"observacao\"}}'::jsonb)->>'success');", lt='15s')
    holder.communicate(timeout=30)
    sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{U}';")
    print('WAIT_REVOKE', waited, flush=True)
    assert waited == NEG, waited
    ok('revocation committed while RPC waited on the delivery lock -> re-authorization after lock denies 42501')
    # Proof writers in full composition.
    sg = f'entregas/{EA2}/assinaturas/{u(1081)}.png'; fp = f'entregas/{EA2}/comprovantes/{u(1082)}.pdf'
    sql("INSERT INTO storage.buckets(id,name,public) VALUES('entrega-documentos','entrega-documentos',false) ON CONFLICT DO NOTHING;" + f"INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('entrega-documentos','{sg}','{U}','{U}'),('entrega-documentos','{fp}','{U}','{U}');")
    sql(actor(U) + f"SELECT public.rpc_entrega_formulario_gerar_v1('{EA2}','gen-lc-000001');")
    sql(actor(U) + f"SELECT public.rpc_entrega_assinatura_coletar_v1('{EA2}','sig-lc-000001','{json.dumps({'assinatura_digital_png_path': sg, 'assinatura_hash': 'a' * 64, 'recebedor_nome': 'Recebedor Local', 'assinatura_user_agent': 'local'})}'::jsonb);")
    att = lambda: sql(actor(U) + f"SELECT public.rpc_entrega_comprovante_anexar_v1('{EA2}','att-lc-000001','{json.dumps({'arquivo_path': fp, 'arquivo_nome': 'recibo.pdf', 'arquivo_mime': 'application/pdf', 'recebedor_nome': 'Recebedor Local'})}'::jsonb);")
    att(); assert '"replayed": true' in att()
    assert last(actor(U) + f"SELECT assinatura_digital_png_path='{sg}' AND arquivo_path='{fp}' FROM public.entrega_comprovantes WHERE entrega_id='{EA2}';") == 't'
    fails('FSF generate on AR Bio delivery still denied', actor(V) + f"SELECT public.rpc_entrega_formulario_gerar_v1('{EA2}','gen-lc-x00001');", 'DELIVERY_PROOF_SCOPE_DENIED')
    ok('generate/sign/attach + replay work in full installed composition')
    assert probe(U, f"INSERT INTO public.entrega_etiquetas(entrega_id,etiqueta_id) VALUES('{EA}','{PA}'); SELECT 'inserted';") == NEG
    ok('entrega_etiquetas link writes remain closed (42501) even for own entrega + own valid label')
    FIN = ['accounts_receivable', 'financial_receipts', 'fiscal_invoices', 'fiscal_events', 'comunicacao_outbox', 'comunicacao_eventos', 'os_faturamento_base']
    assert last('SELECT ' + ' AND '.join(f'(SELECT count(*) FROM public.{t})=0' for t in FIN) + ';') == 't'; ok('zero finance/fiscal/outbox/communication rows')
    # Deny-safe rollbacks.
    sql((CK / 'rollback.sql.review').read_text())
    assert probe(U, f"SELECT public.rpc_atualizar_checklist_entrega('{CHA}', true, NULL)::text;") == NEG and probe(V, f"SELECT public.rpc_atualizar_checklist_entrega('{CHA}', true, NULL)::text;") == NEG
    assert last("SELECT md5(pg_get_functiondef('public.rpc_atualizar_checklist_entrega(uuid,boolean,text)'::regprocedure));") == post_c['fns']['rpc_atualizar_checklist_entrega(uuid,boolean,text)'].split('|')[0]
    ok('checklist rollback: client EXECUTE revoked, hardened bodies kept (never restores unscoped writers)')
    sql((H / 'rollback.sql.review').read_text())
    assert seen_ids(U) == set() and seen_ids(V) == set() and probe(V, "TRUNCATE public.produto_etiquetas; SELECT 'truncated';") == NEG
    ok('labels rollback narrows to false; no cross-tenant read restored; TRUNCATE still denied')
    print('ELAPSED', round(time.monotonic() - t0, 1), flush=True)

ORIG_CK = ''
if __name__ == '__main__':
    try:
        cap = json.loads((ATOMIC / 'capture' / 'current.json').read_text())
        bodies = [x['body'] for x in cap['functions'] if re.search(r'FUNCTION public\.(rpc_atualizar_checklist_entrega|rpc_registrar_ocorrencia_entrega)\(', x.get('body', ''))]
        assert len(bodies) == 2
        ORIG_CK = '\n'.join(b.rstrip().rstrip(';') + ';' for b in bodies)
        main()
    except Exception:
        traceback.print_exc(); checks.append({'test': 'execution stopped at concrete failure', 'status': 'FAIL', 'error': traceback.format_exc()[-3000:]})
    finally:
        (H / 'raw-sqlstates.log').write_text('\n'.join(RAW) + '\n'); (H / 'test-results.json').write_text(json.dumps(checks, indent=2) + '\n')
        print('RESULT', sum(x['status'] == 'PASS' for x in checks), 'PASS', sum(x['status'] != 'PASS' for x in checks), 'FAIL', flush=True)
    sys.exit(1 if any(x['status'] != 'PASS' for x in checks) else 0)
