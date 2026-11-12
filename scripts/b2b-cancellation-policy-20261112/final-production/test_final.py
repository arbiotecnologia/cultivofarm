"""Exact final byte roundtrip and concrete original forecast-state regressions."""
import hashlib
import json
from pathlib import Path
import db

H = Path(__file__).resolve().parent
OUT = H / 'evidence'
rows = []
marker = "SET b2b_cancel_final.review_project_ref='swzpzcwiasxmjutrmvkm';"


def check(name, condition, detail=None):
    rows.append({'test': name, 'status': 'PASS' if condition else 'FAIL', 'detail': detail})
    print(rows[-1]['status'], name, flush=True)


def history(d):
    return d.last("SELECT md5(jsonb_build_object('orders',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM partner_orders x),'titles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable x),'installments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable_installments x),'payments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM receivable_payments x),'forecast',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM platform_private.b2b_financial_forecasts x),'events',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM platform_private.b2b_financial_forecast_events x),'stock',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM estoque_produto x),'delivery',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM entregas x))::text)")


try:
    d = db.DB('final_closed')
    before = history(d)
    for file in ['03-post.sql.readonly', '04-rollback-deny.sql.review', '05-post-rollback.sql.readonly']:
        result = d.raw(marker + (H / file).read_text())
        check('bytes exatos ' + file, result.returncode == 0, {'sha256': hashlib.sha256((H / file).read_bytes()).hexdigest(), 'stderr': result.stderr})
    check('rollback preserva histórico original financeiro/pedido/físico', history(d) == before)
    check('gate e escopo de instalação permanecem fechados', d.last('SELECT NOT enabled AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_allowlist_v1) FROM platform_private.b2b_cancel_policy_gate_v1') == 't')
    for role in ['anon', 'authenticated', 'service_role']:
        check('instalação não concede writer/capacidade/helper a ' + role, d.last(f"SELECT NOT has_function_privilege('{role}','public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text)','EXECUTE') AND NOT has_function_privilege('{role}','public.rpc_b2b_cancel_residual_capability_v1(uuid)','EXECUTE') AND NOT has_function_privilege('{role}','platform_private.b2b_cancel_confirmed_fiscal_v1(uuid)','EXECUTE')") == 't')
    # Marker absence/wrong project fails before any DDL. It is not an auth bypass.
    for value in ['', 'not-the-original']:
        result = d.raw(f"SET b2b_cancel_final.review_project_ref='{value}';" + (H / '01-pre.sql.readonly').read_text())
        check('destino ausente/divergente falha fechado ' + repr(value), result.returncode != 0 and 'FINAL_ORIGINAL_REF_NOT_VERIFIED' in result.stderr and history(d) == before)
    result = d.raw(marker + (H / '02-install-closed.sql.review').read_text())
    check('reinstalação não duplica objetos/histórico', result.returncode != 0 and history(d) == before)
    # Use original core transition on an existing synthetic aggregate, NOT SQL final state insertion.
    functional = db.DB()
    order = functional.last("SELECT partner_order_id FROM fiscal_invoices WHERE id='00000000-0000-0000-0000-000000000900'")
    forecast = functional.last(f"SELECT id FROM platform_private.b2b_financial_forecasts WHERE order_id='{order}'")
    clone = 'final_awaiting'
    db.DB('postgres').sql(f'CREATE DATABASE {clone} TEMPLATE c2')
    d = db.DB(clone)
    # A canonically emitted/rejected intent resets the original forecast to awaiting,
    # preserving the existing 10 residual and 10 confirmed fiscal amount.
    f = json.loads(d.last(f"SELECT to_jsonb(f) FROM platform_private.b2b_financial_forecasts f WHERE id='{forecast}'"))
    core = d.body('platform_private.b2b_financial_forecast_transition_v1(uuid,integer,text,text,jsonb)')
    (OUT / 'transition-canonical-body.sql').write_text(core)
    check('estado aguardando_fiscal é contrato da previsão, não enum do pedido', 'aguardando_fiscal' not in json.loads(d.last("SELECT jsonb_agg(enumlabel) FROM pg_enum WHERE enumtypid='public.partner_order_status'::regtype")))
    capability = d.body('public.rpc_b2b_cancel_residual_capability_v1(uuid)')
    writer = d.body('public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text)')
    check('capacidade reconhece exatamente awaiting/partial, sem estado fictício', "f.state NOT IN ('aguardando_fiscal','faturado_parcial')" in capability and 'aprovado_previsto' not in capability)
    check('writer exige residual positivo e awaiting/partial', "f.residual_amount<=0 OR f.state NOT IN ('aguardando_fiscal','faturado_parcial')" in writer)
except Exception as error:
    check('harness final', False, repr(error))
(OUT / 'final-checks.json').write_text(json.dumps(rows, indent=2, ensure_ascii=False) + '\n')
raise SystemExit(int(any(row['status'] == 'FAIL' for row in rows)))