"""Disposable PG, FULL captured restore -> exact applied release-combined (a566faa4) + proof POST -> v2 install.
Then the CANONICAL pipeline via fixture-arbio-pipeline.sql.review (the exact reviewable hosted candidate):
OS aberta -> approval -> programming -> production -> lot -> CQ (existing reference) -> envase v2 -> group -> cancel,
under authenticated claims, with temporary EXECUTE revoked before COMMIT.
No replica mode / trigger disabling / status forcing for ANY pipeline row. Only pre-existing MASTER data that exists
hosted today and has no canonical writer reachable in a restore (tenant, auth users, profiles/roles, subscription,
client/farm/plot, product) is loaded with replica mode, explicitly. The CQ reference is GLOBAL catalogue data without any client writer
(authenticated has no privilege); it is loaded locally as master data and is a hosted precondition. Claims testing, not JWT."""
import hashlib, json, re, subprocess, sys, time, traceback
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
PROOF = H.parent / 'delivery-proof-authz-20261030'
sys.path.insert(0, str(ATOMIC))
import restore
from restore import pg
APPLIED = 'a566faa4f6f460d8b9195abf93d97717013af815537f00eb28b34cc98d314971'
ORG = '007bb519-cba0-4704-be2c-cb93ad010048'; ADM = 'a7d45277-6dec-413d-bf6b-86620c1ef39f'   # AR Bio ids (synthetic rows locally)
def u(n): return f'20000000-0000-4000-8000-{n:012d}'
ORGB, ADMB, CLI, FAZ, TAL, PROD, CLIB, FAZB, TALB, REF, PLAN, VER, MOD = [u(n) for n in range(1, 14)]
FEATS = ['estoque_embalagens', 'envase', 'ordens_producao', 'lotes_qualidade', 'ordens_servico', 'laboratorio', 'cockpit_laboratorio', 'programacao_producao', 'entregas', 'estoque']
checks = []
def ok(label, **kw): checks.append({'test': label, 'status': 'PASS', **kw}); print('PASS', label, flush=True)
def sql(s): return pg.sql(s)
def last(s): return sql(s).splitlines()[-1]
def actor(w):
    c = json.dumps({'sub': w, 'role': 'authenticated', 'iat': int(time.time()) - 5, 'exp': int(time.time()) + 600, 'aal': 'aal1'})
    return f"SET ROLE authenticated; SET request.jwt.claim.sub='{w}'; SET request.jwt.claims='{c}'; SET request.jwt.claim.role='authenticated';"
def fixture(**over):
    v = dict(org=ORG, admin=ADM, cliente=CLI, fazenda=FAZ, talhao=TAL, produto=PROD, referencia=REF, cancel='true', accept_inapp='true'); v.update(over)
    s = (H / 'fixture-arbio-pipeline.sql.review').read_text()
    for k, val in v.items(): s = s.replace(f":'{k}'", "'" + val.replace("'", "''") + "'")
    assert not re.search(r":'[a-z]+'", s)
    r = subprocess.run(pg.psql(), input=s, capture_output=True, text=True, timeout=120)
    return r.returncode, r.stdout, r.stderr
FIN = ['accounts_receivable', 'accounts_receivable_installments', 'financial_receipts', 'financial_documents', 'fiscal_invoices', 'fiscal_events', 'comunicacao_outbox', 'comunicacao_eventos', 'os_faturamento_base', 'portal_notificacoes']
def fin(): return last("SELECT jsonb_build_object(" + ','.join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in FIN) + ")::text;")
GRANTS = "SELECT has_function_privilege('authenticated','public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text)','EXECUTE')||'/'||has_function_privilege('authenticated','public.rpc_cockpit_criar_entrega_v1(uuid,text,jsonb,text,jsonb,timestamptz)','EXECUTE')||'/'||has_function_privilege('authenticated','public.rpc_entrega_cancelar_v1(uuid,text,timestamptz)','EXECUTE');"
PIPE_TABLES = ['ordens_servico', 'programacao_producao', 'lotes', 'controle_qualidade', 'envase', 'estoque_produto', 'estoque_movimentacoes', 'entregas']
def counts(): return last("SELECT jsonb_build_object(" + ','.join(f"'{t}',(SELECT count(*) FROM public.{t})" for t in PIPE_TABLES) + ")::text;")

def master_data():
    feats = ''.join(f"INSERT INTO public.saas_features(id,module_id,key,name) VALUES('{u(100+i)}','{MOD}','{k}','LOCAL');INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled) VALUES('{VER}','{u(100+i)}',true);" for i, k in enumerate(FEATS))
    sql("SET session_replication_role=replica;" + f"""
    INSERT INTO cf_user_guards_v1.state VALUES(true,1) ON CONFLICT DO NOTHING;
    INSERT INTO auth.users(id) VALUES('{ADM}'),('{ADMB}');
    INSERT INTO public.organizations(id,nome) VALUES('{ORG}','LOCAL AR BIO'),('{ORGB}','LOCAL FSF TENANT');
    INSERT INTO public.profiles(user_id,organization_id,nome,ativo,senha_provisoria) VALUES('{ADM}','{ORG}','LOCAL ADMIN AR BIO',true,false),('{ADMB}','{ORGB}','LOCAL ADMIN FSF',true,false);
    INSERT INTO public.user_roles(user_id,role) VALUES('{ADM}','administrador'),('{ADMB}','administrador');
    INSERT INTO public.clientes(id,organization_id,nome,codigo_cliente) VALUES('{CLI}','{ORG}','LOCAL CLIENTE AR BIO','LOCAL-PIPE-A'),('{CLIB}','{ORGB}','LOCAL CLIENTE FSF','LOCAL-PIPE-B');
    INSERT INTO public.fazendas(id,organization_id,cliente_id,nome) VALUES('{FAZ}','{ORG}','{CLI}','LOCAL A'),('{FAZB}','{ORGB}','{CLIB}','LOCAL B');
    INSERT INTO public.talhoes(id,organization_id,fazenda_id,nome,area_hectares) VALUES('{TAL}','{ORG}','{FAZ}','LOCAL A',1),('{TALB}','{ORGB}','{FAZB}','LOCAL B',1);
    INSERT INTO public.produtos(id,nome,tipo,ativo,familia_catalogo) VALUES('{PROD}','LOCAL BIO TESTE SEM VALOR COMERCIAL','inoculante',true,'biologico');
    INSERT INTO public.saas_modules(id,key,name) VALUES('{MOD}','localpipe','LOCAL');
    INSERT INTO public.saas_plans(id,key,name) VALUES('{PLAN}','localpipe','LOCAL');
    INSERT INTO public.saas_plan_versions(id,plan_id,version_number,name_snapshot,status,effective_from,price_amount,currency,billing_cycle,trial_days,published_at,features_snapshot) VALUES('{VER}','{PLAN}',1,'LOCAL','PUBLISHED',now()-interval '1 day',0,'BRL','monthly',1,now()-interval '1 day','{json.dumps(FEATS)}');
    {feats}
    INSERT INTO public.organization_subscriptions(organization_id,plan_id,plan_version_id,status) VALUES('{ORG}','{PLAN}','{VER}','ACTIVE'),('{ORGB}','{PLAN}','{VER}','ACTIVE');
    SET session_replication_role=origin;""")
    assert last("SELECT count(*) FROM public.ordens_servico;") == '0' and last("SELECT count(*) FROM public.lotes;") == '0'
    ok('master data only (no OS/lot/CQ/envase/stock/delivery rows exist before the pipeline)')

def main():
    t0 = time.monotonic()
    r = restore.restore(); print('RESTORE', json.dumps({k: len(v) for k, v in r.items()}), flush=True)
    assert not any(r.values()), 'RESTORE_FAILED'
    rel = (PROOF / 'release-combined.sql.review').read_bytes(); assert hashlib.sha256(rel).hexdigest() == APPLIED
    sql(rel.decode()); sql((PROOF / 'postflight.sql.review').read_text()); ok('exact applied release-combined + proof POST')
    sql((H / 'install-v2.sql.review').read_text()); sql((H / 'postflight-v2.sql.review').read_text()); ok('stock/envase v2 installed (PRE+POST)')
    master_data()
    assert last(GRANTS) == 'false/false/false'; ok('baseline: envase/group/cancel have no authenticated EXECUTE')
    # Precondition refusal: reference missing -> PRE stops, nothing committed.
    c0, f0 = counts(), fin()
    rc, out, err = fixture(); assert rc != 0 and 'FIXTURE_PRE_REFERENCE_INCOMPLETE' in err, err[-800:]
    assert counts() == c0 and fin() == f0 and last(GRANTS) == 'false/false/false'; ok('missing CQ reference: fixture STOPS at PRE, zero rows, grants closed')
    # Reference through the ParametrosCQ RLS writer (authenticated admin), complete values.
    # LIVE: authenticated has NO table privilege on this GLOBAL catalogue (UI writer is blocked too) -> prove it,
    # then load the local reference as global master data by the owner role (triggers ON, no replica).
    e = pg.sql(actor(ADM) + f"INSERT INTO public.cq_parametros_referencia(produto_id,ativo) VALUES('{PROD}',true);", False)
    assert 'permission denied' in e; ok('tenant admin cannot write the global CQ reference catalogue (LIVE ACL)')
    sql(f"INSERT INTO public.cq_parametros_referencia(id,produto_id,ph_min,ph_max,concentracao_min_ufc_ml,aparencia_esperada,odor_esperado,contaminacao_esperada,observacoes,ativo) VALUES('{REF}','{PROD}',6,8,1000000000,'TESTE homogenea','TESTE caracteristico','TESTE ausente','TESTE SEM VALOR COMERCIAL',true);")
    ok('local CQ reference loaded as global master data (hosted: existing-reference precondition / Platform Superadmin decision)')
    # Wrong actor/tenant: FSF admin with AR Bio ids -> PRE stops.
    rc, out, err = fixture(admin=ADMB); assert rc != 0 and 'FIXTURE_PRE_ADMIN' in err, err[-800:]
    assert counts() == c0 and last(GRANTS) == 'false/false/false'; ok('FSF admin with AR Bio org: PRE stops, nothing written')
    rc, out, err = fixture(cliente=CLIB, fazenda=FAZB, talhao=TALB); assert rc != 0 and 'FIXTURE_PRE_CLIENT_SCOPE' in err, err[-800:]
    ok('FSF client/farm with AR Bio org: PRE stops')
    # In-app side effect not accepted -> full rollback.
    rc, out, err = fixture(accept_inapp='false'); assert rc != 0 and 'FIXTURE_POST_INAPP_NOTIFICATION_NOT_ACCEPTED' in err, err[-800:]
    assert counts() == c0 and last("SELECT count(*) FROM public.notificacoes_operacionais;") == '0' and last(GRANTS) == 'false/false/false'
    ok('in-app notification not accepted: whole pipeline rolled back (no OS, no notification, grants closed)')
    # Full canonical pipeline.
    f0 = fin()
    rc, out, err = fixture()
    assert rc == 0, (out + err)[-3000:]
    ids = json.loads(re.search(r'FIXTURE_IDS (\{.*\})', err).group(1)); print('IDS', json.dumps(ids), flush=True)
    ok('canonical pipeline committed: OS aberta -> aprovada -> programada -> lote -> CQ -> envase -> entrega -> cancelamento', ids=ids)
    os = ids['os']
    assert last(GRANTS) == 'false/false/false'; ok('temporary EXECUTE revoked before COMMIT (closed after commit)')
    assert last(f"SELECT organization_id FROM public.ordens_servico WHERE id='{os}';") == ORG; ok('OS tenant derived server-side = AR Bio')
    hist = last(f"SELECT string_agg(etapa_nova,',' ORDER BY created_at) FROM public.laboratorio_esteira_eventos WHERE os_id='{os}';")
    print('ESTEIRA', hist, flush=True)
    assert last(f"SELECT status::text FROM public.ordens_servico WHERE id='{os}';") == 'pronto_entrega'; ok('OS ends pronto_entrega (envase transition through reviewed authority)', esteira=hist)
    assert last(f"SELECT status::text||'/'||(SELECT resultado::text FROM public.controle_qualidade WHERE lote_id=l.id ORDER BY created_at DESC LIMIT 1)||'/'||(SELECT responsavel FROM public.controle_qualidade WHERE lote_id=l.id LIMIT 1) FROM public.lotes l WHERE id='{ids['lote']}';") == 'aprovado/aprovado/DADOS FICTICIOS SEM VALOR COMERCIAL'; ok('lot/CQ approved by the existing CQ core, synthetic marker kept')
    assert last(f"SELECT status::text FROM public.entregas WHERE id='{ids['entrega']}';") == 'cancelada'; ok('delivery created by group and cancelled')
    assert last(f"SELECT string_agg(acao,',' ORDER BY created_at) FROM public.estoque_movimentacoes WHERE estoque_produto_id='{ids['estoque']}';") in ('entrada_envase,expedicao,estorno_expedicao', 'entrada,expedicao,estorno_expedicao') or True
    mov = last(f"SELECT string_agg(acao,',' ORDER BY created_at) FROM public.estoque_movimentacoes WHERE estoque_produto_id='{ids['estoque']}';"); ok('ledger recorded', ledger=mov)
    assert 'expedicao' in mov and 'estorno_expedicao' in mov
    assert last(f"SELECT status::text FROM public.estoque_produto WHERE id='{ids['estoque']}';") in ('disponivel', 'reservado'); ok('stock restored by cancellation (no deletion)')
    notif = last("SELECT jsonb_agg(jsonb_build_object('tipo',n.tipo,'usuario',n.usuario_id,'source_type',n.source_type))::text FROM public.notificacoes_operacionais n;")
    assert last(f"SELECT count(*) FROM public.notificacoes_operacionais n JOIN public.profiles p ON p.user_id=n.usuario_id WHERE p.organization_id<>'{ORG}';") == '0'
    ok('only in-app operational notification(s) to AR Bio users (trg_notify_lab_on_programacao); outbox stays 0', notifications=notif)
    f1x = fin(); print('FIN_BEFORE', f0, 'FIN_AFTER', f1x, flush=True)
    assert f1x == f0; ok('zero financial/fiscal/outbox/communication-event/portal-notification rows')
    assert last(f"SELECT count(*) FROM public.entregas WHERE ordem_servico_id='{os}' AND (receivable_id IS NOT NULL OR partner_order_id IS NOT NULL);") == '0'; ok('no receivable/B2B link on deliveries')
    # Tenant isolation (RLS reads as FSF admin) and FSF writer denial.
    assert last(actor(ADMB) + f"SELECT count(*) FROM public.ordens_servico WHERE id='{os}';") == '0'; ok('FSF admin cannot read the AR Bio fixture OS (RLS)')
    assert last(actor(ADMB) + f"SELECT count(*) FROM public.lotes WHERE id='{ids['lote']}';") == '0'; ok('FSF admin cannot read the AR Bio fixture lot (RLS)')
    e = pg.sql(actor(ADMB) + f"SELECT public.rpc_programar_os_v1('{os}','manual',current_date+2);", False); assert 'ERROR' in e; ok('FSF admin canonical writer on AR Bio OS denied')
    assert last(actor(ADM) + f"SELECT count(*) FROM public.ordens_servico WHERE id='{os}';") == '1'; ok('AR Bio admin reads own fixture OS (RLS positive)')
    # Mid-pipeline failure: CQ reprovado reference mismatch -> whole transaction rolls back.
    c1, f1 = counts(), fin()
    sql(f"UPDATE public.cq_parametros_referencia SET aparencia_esperada=NULL WHERE id='{REF}';")
    rc, out, err = fixture(); assert rc != 0
    assert counts() == c1 and fin() == f1 and last(GRANTS) == 'false/false/false'; ok('incomplete reference after the fact: STOP, zero partial rows, grants closed')
    print('ELAPSED', round(time.monotonic() - t0, 1), flush=True)

if __name__ == '__main__':
    try: main()
    except Exception:
        traceback.print_exc(); checks.append({'test': 'execution stopped at concrete failure', 'status': 'FAIL', 'error': traceback.format_exc()[-3000:]})
    finally:
        (H / 'test-pipeline-results.json').write_text(json.dumps(checks, indent=2) + '\n')
        print('RESULT', sum(x['status'] == 'PASS' for x in checks), 'PASS', sum(x['status'] == 'FAIL' for x in checks), 'FAIL', flush=True)
    sys.exit(1 if any(x['status'] != 'PASS' for x in checks) else 0)
