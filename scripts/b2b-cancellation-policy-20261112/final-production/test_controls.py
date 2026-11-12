"""Behavioral control tests, real original writers, synthetic inputs, local socket only."""
import concurrent.futures
import importlib.util
import json
import uuid
from pathlib import Path
import db
from compose_controls import ROOT

H = Path(__file__).resolve().parent
OUT = H / 'evidence'
rows = []
u = lambda n: f'00000000-0000-0000-0000-{n:012d}'


def check(name, condition, detail=None):
    rows.append({'test': name, 'status': 'PASS' if condition else 'FAIL', 'detail': detail})
    print(rows[-1]['status'], name, flush=True)


def history(d):
    return d.last("SELECT md5(jsonb_build_object('orders',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM partner_orders x),'forecast',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM platform_private.b2b_financial_forecasts x),'events',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM platform_private.b2b_financial_forecast_events x),'titles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable x))::text)")


try:
    admin = db.DB('postgres')
    admin.sql('DROP DATABASE IF EXISTS final_controls WITH (FORCE);CREATE DATABASE final_controls TEMPLATE final_closed')
    d = db.DB('final_controls')
    ufin = u(29)
    p = ROOT / 'scripts/c2-pilot-economic-approval-20261111/fixture.py'
    spec = importlib.util.spec_from_file_location('controls_fixture', p)
    if spec is None or spec.loader is None:
        raise RuntimeError('FIXTURE_LOADER')
    X = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(X)
    X.A = u(1)
    m = X.Mirror.__new__(X.Mirror)
    m.d = d
    # Input configuration through normal SQL with every trigger enabled; no replica mode.
    source_plan = X.PLQ
    X.PLQ = str(uuid.uuid4())
    d.sql(f"INSERT INTO public.commercial_payment_plans SELECT (jsonb_populate_record(NULL::public.commercial_payment_plans,to_jsonb(p)||jsonb_build_object('id','{X.PLQ}','organization_id','{X.A}','nome','LOCAL CONTROLS {X.PLQ}','is_default',false))).* FROM public.commercial_payment_plans p WHERE id='{source_plan}'")
    r = m.call(X.UADM, f"public.b2b_payment_condition_publish('{X.PLQ}','boleto','{u(92)}','{u(97)}',30,1,0::numeric,0)")
    check('plano de entrada publicado pelo writer original', r[0] is not None, r)
    r = m.call(X.UADM, f"public.b2b_payment_condition_assign('{X.P}','{X.PLQ}','boleto',1,true)")
    check('condição de entrada atribuída pelo writer original', r[0] is not None, r)
    settings_actor = f"SET request.jwt.claim.sub='{X.UADM}';SET request.jwt.claims='{{\"sub\":\"{X.UADM}\",\"role\":\"authenticated\",\"iat\":1}}';"
    d.sql(settings_actor + f"UPDATE public.company_fiscal_settings SET is_active=false WHERE organization_id='{X.A}' AND is_active")
    # Existing helper would use replica mode around configuration; instead perform
    # normal configuration above and call with pending_accounting=False.
    pending = m.buyer_quote_order(pending_accounting=False)
    quote = m.respond_quote(pending)
    check('C2 criado/cotado por writers originais com todos os controles ativos', quote[0] is not None and d.last(f"SELECT c2_external_origin_snapshot->>'contract' FROM partner_orders WHERE id='{pending}'") == 'C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1', quote)
    snapshot = history(d)
    template = d.last('SELECT id FROM platform_private.b2b_financial_forecasts LIMIT 1')
    # Raw attempt never inserts a final result: own row barrier must reject it.
    attempt = f"INSERT INTO platform_private.b2b_financial_forecasts SELECT (jsonb_populate_record(NULL::platform_private.b2b_financial_forecasts,to_jsonb(f)||jsonb_build_object('id',gen_random_uuid(),'order_id','{pending}'))).* FROM platform_private.b2b_financial_forecasts f WHERE id='{template}'"
    denied = d.raw(attempt)
    check('barreira C2 nega INSERT sem ticket mesmo postgres', denied.returncode != 0 and 'C2_PILOT_FORECAST_ENTRY_DENIED' in denied.stderr and history(d) == snapshot, denied.stderr)
    for role in ['authenticated', 'service_role']:
        r = d.raw(f'SET ROLE {role};' + attempt)
        check('ACL privada nega INSERT direto ' + role, r.returncode != 0 and history(d) == snapshot, r.stderr)
    check('gate piloto OFF nega aprovação explícita sem criar previsão', m.call(X.UGC, f"public.c2_pilot_economic_approve_v1('{pending}','commercial','controls-key-{uuid.uuid4().hex}','{'0'*32}','LOCAL CHECK')")[0] is None and history(d) == snapshot)
    check('C2 normal não ganhou aprovação operacional nem previsão', d.last(f"SELECT approved_at IS NULL AND approved_by IS NULL AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecasts WHERE order_id=po.id) FROM partner_orders po WHERE id='{pending}'") == 't')
    # Two explicit economic approvals use the original core transaction ticket.
    r = d.raw(f"SET c2pilot.expected_ref='swzpzcwiasxmjutrmvkm';SET c2pilot.order_id='{pending}';SET c2pilot.commercial_actor='{X.UGC}';SET c2pilot.credit_actor='{X.UFIN}';SET c2pilot.hours='4';SET c2pilot.reason='LOCAL CONTROL PROOF';" + (ROOT / 'scripts/c2-pilot-economic-approval-20261111/05-pilot-enable.sql.review').read_text())
    check('habilitação exata somente clone sintético', r.returncode == 0, r.stderr)
    ev = json.loads(d.last(f"SELECT platform_private.c2_pilot_econ_evidence_v1('{pending}')"))['evidence_hash']
    r = m.call(X.UGC, f"public.c2_pilot_economic_approve_v1('{pending}','commercial','controls-c-{uuid.uuid4().hex}','{ev}','LOCAL EXPLICIT')")
    check('primeira aprovação explícita não cria previsão', r[0] is not None and d.last(f"SELECT count(*) FROM platform_private.b2b_financial_forecasts WHERE order_id='{pending}'") == '0', r)
    r = m.call(X.UFIN, f"public.c2_pilot_economic_approve_v1('{pending}','credit','controls-k-{uuid.uuid4().hex}','{ev}','LOCAL EXPLICIT')")
    check('segunda aprovação core atravessa barreira com ticket real e cria 20 awaiting', r[0] is not None and d.last(f"SELECT total_amount=20 AND residual_amount=20 AND state='aguardando_fiscal' FROM platform_private.b2b_financial_forecasts WHERE order_id='{pending}'") == 't', r)
    check('ledger explícito preserva bloqueio operacional C2', m.call(X.UGC, f"public.approve_partner_order('{pending}',NULL)")[0] is None and d.last(f"SELECT approved_at IS NULL AND approved_by IS NULL FROM partner_orders WHERE id='{pending}'") == 't')
    d.sql(settings_actor + f"UPDATE public.company_fiscal_settings SET is_active=true WHERE organization_id='{X.A}'")
    # Per-invoice sequence: independent connections, actual prepare endpoint.
    d.sql("INSERT INTO saas_features(module_id,key,name) SELECT id,'emissao_nfe_nfse','LOCAL CONTROL' FROM saas_modules LIMIT 1; INSERT INTO organization_feature_overrides(organization_id,feature_id,mode,reason,created_by) SELECT '" + X.A + "',id,'GRANT','LOCAL ONLY','" + X.UADM + "' FROM saas_features WHERE key='emissao_nfe_nfse'")
    invoice = u(900)
    def prepare():
        return db.DB('final_controls').raw(f"SET ROLE service_role;SET request.jwt.claim.sub='{ufin}';SET request.jwt.claims='{{\"sub\":\"{ufin}\",\"role\":\"service_role\",\"iat\":1}}';SELECT public.rpc_fiscal_event_sefaz_prepare_v1('{invoice}','CANCELLATION','LOCAL CONCURRENT CONTROL','controls-{uuid.uuid4()}','{ufin}')")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: prepare(), range(2)))
    payloads = [json.loads(r.stdout.strip().splitlines()[-1]) for r in results if r.returncode == 0]
    check('duas conexões prepare retornam sucesso', len(payloads) == 2, [r.stderr for r in results])
    seq = d.last(f"SELECT count(*)=count(DISTINCT sefaz_seq_evento) FROM fiscal_events WHERE fiscal_invoice_id='{invoice}' AND event_type='SEFAZ_EVENT_PREPARED'")
    check('duas chaves mesma NF têm sequência única', seq == 't', payloads)
    check('todos os triggers de pedido/previsão seguem habilitados', d.last("SELECT NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid IN ('public.partner_orders'::regclass,'platform_private.b2b_financial_forecasts'::regclass) AND NOT tgisinternal AND tgenabled<>'O')") == 't')
    # Metadata drift is not accepted by an unchanged PRE; no DDL is committed.
    pre = db.DB('final_prepared')
    before = history(pre)
    marker = "SET b2b_cancel_final.review_project_ref='swzpzcwiasxmjutrmvkm';"
    r = pre.raw(marker + 'BEGIN;GRANT TRUNCATE ON public.partner_orders TO anon;' + (H / '01-pre.sql.readonly').read_text())
    check('PRE nega privilégio além do real sem escrita de instalação', r.returncode != 0 and 'FINAL_ORIGINAL_SECURITY_DRIFT' in r.stderr and history(pre) == before, r.stderr)
except Exception as error:
    check('harness controles', False, repr(error))
(OUT / 'control-checks.json').write_text(json.dumps(rows, indent=2, ensure_ascii=False) + '\n')
raise SystemExit(int(any(x['status'] == 'FAIL' for x in rows)))