#!/usr/bin/env python3
"""Cenários adicionais do plano aprovado; somente PostgreSQL descartável."""
import concurrent.futures
import hashlib
import json


def exposure(B, Q):
    claims = "'" + json.dumps(json.dumps({'sub': Q.UADM, 'role': 'authenticated', 'iat': 1, 'exp': 4102444800})).replace("'", "''") + "'"
    return json.loads(B.last(f"RESET ROLE;SET request.jwt.claim.sub='{Q.UADM}';SET request.jwt.claims={claims};SELECT public.fn_b2b_credit_exposure('{Q.P}',0,NULL);"))


def run_override(B, Q, OUT):
    """Crédito manual é exceção; crédito OK sem override já foi coberto pelo caso principal."""
    choice = Q.ch('boleto', 2, 30)
    baseline = json.loads(B.last(f"SELECT to_jsonb(s)::text FROM public.partner_financial_settings s WHERE partner_id='{Q.PC}';"))
    fields = ['billing_trigger','payment_terms_days','default_payment_method','credit_limit','block_if_overdue','auto_generate_receivable','active','credit_limit_action','overdue_tolerance_days','credit_alert_threshold_1','credit_alert_threshold_2']
    values = {k: baseline[k] for k in fields}
    values.update(credit_limit=1, credit_limit_action='approval_required', block_if_overdue=False)
    expected_sql = json.dumps(baseline).replace("'", "''")
    values_sql = json.dumps(values).replace("'", "''")
    configured = Q.as_user(Q.UFIN, f"SELECT public.rpc_update_partner_financial_settings('{Q.PC}','{expected_sql}'::jsonb,'{values_sql}'::jsonb);")
    assert configured.returncode == 0, configured.stderr
    simulated, error = Q.sim(Q.UBC, Q.P3, [Q.S(2)], choice, partner=Q.PC)
    assert simulated is not None, error
    created, error = Q.create(Q.UBC, Q.P3, [Q.S(2)], simulated['cart_hash'], 'LOCAL-FORECAST-MANUAL-CREDIT-18', choice, partner=Q.PC)
    assert created is not None, error
    order_id = created['id']
    before = json.loads(B.last(f"SELECT jsonb_build_object('status',status,'credit_approved_at',credit_approved_at,'credit_approved_by',credit_approved_by)::text FROM public.partner_orders WHERE id='{order_id}';"))
    assert before == {'status': 'aguardando_aprovacao_credito', 'credit_approved_at': None, 'credit_approved_by': None}, before
    assert B.last(f"SELECT count(*) FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';") == '0'
    seller_scope = Q.as_user(Q.UFIN, f"SELECT public.b2b_phase1_order_visible('{order_id}');")
    foreign = Q.as_user(Q.UADMF, f"SELECT public.approve_b2b_credit('{order_id}','FOREIGN DENIED');")
    assert foreign.returncode != 0 and 'b2b_phase1_scope_denied' in foreign.stderr, foreign.stderr
    unchanged = json.loads(B.last(f"SELECT jsonb_build_object('status',status,'credit_approved_at',credit_approved_at,'credit_approved_by',credit_approved_by)::text FROM public.partner_orders WHERE id='{order_id}';"))
    assert unchanged == before, unchanged
    approved_credit = Q.as_user(Q.UFIN, f"SELECT public.approve_b2b_credit('{order_id}','LOCAL MANUAL OVERRIDE');")
    assert approved_credit.returncode == 0, approved_credit.stderr
    terms = Q.as_user(Q.UFIN, f"SELECT public.approve_b2b_payment_terms_secure('{order_id}','LOCAL TERMS BEFORE COMMERCIAL');")
    assert terms.returncode == 0, terms.stderr
    assert B.last(f"SELECT count(*) FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';") == '0'
    approved = Q.as_user(Q.UADM, f"SELECT public.approve_partner_order('{order_id}',NULL,NULL);")
    assert approved.returncode == 0, approved.stderr
    row = json.loads(B.last(f"SELECT jsonb_build_object('status',status,'credit_approved_at',credit_approved_at,'credit_approved_by',credit_approved_by,'residual',(SELECT residual_amount FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}'),'total',(SELECT total_amount FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}'))::text FROM public.partner_orders WHERE id='{order_id}';"))
    assert row['status'] == 'aprovado' and row['credit_approved_at'] and row['credit_approved_by'] == Q.UFIN, row
    assert float(row['residual']) == float(row['total']) > 0, row
    assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order_id}';") == '0'
    (OUT/'forecast-manual-credit-override.json').write_text(json.dumps(dict(order_id=order_id, seller_scope_stdout=seller_scope.stdout, seller_scope_stderr=seller_scope.stderr, foreign_denied=foreign.stderr, before=before, after=row, receivables=0, hosted=False), indent=2)+'\n')
    return dict(order_id=order_id, seller_scope=seller_scope.returncode == 0 and seller_scope.stdout.strip().endswith('t'))


def run_partial_completion(B, Q, OUT, order_id, accepted, item, first_invoice, first_receivable, credit_before):
    """Duas NFs de 9, replay/corrida, H7 e pagamento canônico de 9."""
    assert float(accepted['final_amount_with_interest']) == 18.0, accepted['final_amount_with_interest']
    first_credit = exposure(B, Q)
    assert float(first_credit['saldo_em_aberto']) == 9 and float(first_credit['comprometido_nao_faturado']) == 9 and float(first_credit['exposicao_atual']) == 18, first_credit

    def bridge_race(_):
        return B.run_raw(f"SET ROLE service_role;SELECT platform_private.b2b_fiscal_invoice_bridge_v1('{first_invoice}');")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        races = list(pool.map(bridge_race, range(2)))
    assert all(r.returncode == 0 for r in races), [r.stderr for r in races]
    assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{first_invoice}';") == '1'
    assert B.last(f"SELECT count(*) FROM platform_private.b2b_financial_forecast_events WHERE event_type='FISCAL_CONFIRMED' AND event_reference='{first_invoice}';") == '1'

    invoice_id, transmission_id, xml_run_id = Q.u(910), Q.u(911), Q.u(912)
    access_key = '35261111111111111111111111111111111111111112'
    company_settings_id = accepted['internal_economic_snapshot']['origin']['company_settings_id']
    xml_payload = '{}'
    xml_sha256 = hashlib.sha256(xml_payload.encode()).hexdigest()
    endpoint_url = 'https://hnfe.fazenda.mg.gov.br/LOCAL-SYNTHETIC-NO-NETWORK'
    fingerprint = hashlib.sha256(f'NFeAutorizacao4|{endpoint_url}|{xml_sha256}'.encode()).hexdigest()
    B.sql(f"""SET ROLE service_role;
 INSERT INTO public.fiscal_invoices(id,invoice_type,document_model,idempotency_key,status,normalized_status,environment,company_settings_id,organization_id,
   partner_order_id,debtor_partner_id,issue_date,total_amount,created_by,provider_reference,access_key)
  VALUES('{invoice_id}','NFE','NFE','integrated-fiscal-invoice:{order_id}:v2','PENDING','PENDING','HOMOLOGATION','{company_settings_id}','{Q.A}','{order_id}','{Q.P}','2027-02-02',9,'{Q.UADM}','LOCAL-INTEGRATED-SECOND','{access_key}');
 INSERT INTO public.fiscal_invoice_items(fiscal_invoice_id,partner_order_item_id,item_sequence,item_kind,quantity,commercial_unit,taxable_quantity,taxable_unit,net_value)
  VALUES('{invoice_id}','{item['id']}',1,'PRODUCT',1,'UN',25,'KG',9);
 INSERT INTO public.fiscal_xml_runs(id,fiscal_invoice_id,idempotency_key,run_version,schema_version,environment_code,access_key,state,payload,payload_sha256,signed_sha256,signed_path,signed_at,validation,signature_metadata,created_by,updated_at)
  VALUES('{xml_run_id}','{invoice_id}','integrated-fiscal-xml:{invoice_id}:v1',1,'LOCAL-NFE-4.00','2','{access_key}','SIGNED','{xml_payload}'::jsonb,'{xml_sha256}','{xml_sha256}','local/{invoice_id}.xml',now(),'{{"synthetic":true,"network":false}}'::jsonb,'{{"synthetic":true,"adapter":"LOCAL_FIXTURE_ONLY"}}'::jsonb,'{Q.UADM}',now());
 INSERT INTO public.fiscal_sefaz_transmissions(id,fiscal_invoice_id,xml_run_id,service,environment_code,endpoint_host,endpoint_url,idempotency_key,request_fingerprint,state,outcome,c_stat,x_motivo,ch_nfe,n_prot,ambiente_retorno,dh_recbto,completed_at,created_by)
  VALUES('{transmission_id}','{invoice_id}','{xml_run_id}','NFeAutorizacao4','2','hnfe.fazenda.mg.gov.br','{endpoint_url}','integrated-sefaz-authorize:{invoice_id}:v1','{fingerprint}','SENT','PENDING','103','PROCESSANDO','{access_key}','PENDING','2',now(),now(),'{Q.UADM}');""")
    patch = json.dumps({'cStat':'104','protocolCStat':'100','nProt':'LOCAL-INTEGRATED-PROTOCOL-2','chNFe':access_key,'xMotivo':'LOTE PROCESSADO; PROTOCOLO AUTORIZADO','tpAmb':'2','dhRecbto':'2027-02-02T12:00:00Z'}).replace("'", "''")
    second = B.run_raw(f"SET ROLE service_role;SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{transmission_id}','SUCCEEDED','{patch}'::jsonb);")
    assert second.returncode == 0, second.stderr
    second_data = json.loads(second.stdout.strip().splitlines()[-1])
    assert second_data['outcome'] == 'AUTHORIZED' and second_data['reconciliationPending'] is False, second_data
    second_receivable = B.last(f"SELECT receivable_id FROM public.fiscal_invoices WHERE id='{invoice_id}';")
    assert second_receivable and second_receivable != first_receivable
    forecast = json.loads(B.last(f"SELECT jsonb_build_object('state',state,'residual_amount',residual_amount,'version',version)::text FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';"))
    assert forecast == {'state':'faturado_total','residual_amount':0.0,'version':10}, forecast
    second_credit = exposure(B, Q)
    assert float(second_credit['saldo_em_aberto']) == 18 and float(second_credit['comprometido_nao_faturado']) == 0 and float(second_credit['exposicao_atual']) == 18, second_credit
    totals = json.loads(B.last(f"SELECT jsonb_build_object('titles',count(*),'total',sum(total_amount))::text FROM public.accounts_receivable WHERE origin_id='{order_id}' AND b2b_document_id IS NOT NULL;"))
    assert totals['titles'] == 2 and float(totals['total']) == 18, totals

    h7 = B.run_raw(f"BEGIN;UPDATE public.fiscal_invoices SET receivable_id='{second_receivable}' WHERE id='{first_invoice}';ROLLBACK;")
    assert h7.returncode != 0 and 'FISCAL_DOCUMENT_LOCKED' in h7.stderr, h7.stderr
    h7_same = B.run_raw(f"BEGIN;UPDATE public.fiscal_invoices SET receivable_id=receivable_id WHERE id='{first_invoice}';ROLLBACK;")
    assert h7_same.returncode == 0, h7_same.stderr

    projection = B.run_raw(f"RESET ROLE;SELECT public.rpc_receivable_money_projection_v1('{first_receivable}',0,1000);")
    assert projection.returncode == 0, projection.stderr
    installment = json.loads(projection.stdout.strip().splitlines()[-1])[0]['id']
    payment = json.dumps({'amount_received':9,'payment_method_id':Q.M_BOL,'idempotency_key':'LOCAL-FORECAST-PAY-9'}).replace("'", "''")
    paid = Q.as_user(Q.UFIN, f"SELECT public.rpc_register_receivable_payment('{installment}','{payment}'::jsonb);")
    assert paid.returncode == 0, paid.stderr
    paid_credit = exposure(B, Q)
    assert float(paid_credit['saldo_em_aberto']) == 9 and float(paid_credit['comprometido_nao_faturado']) == 0 and float(paid_credit['exposicao_atual']) == 9, paid_credit
    forecast_after_payment = json.loads(B.last(f"SELECT jsonb_build_object('state',state,'residual_amount',residual_amount,'version',version)::text FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';"))
    assert forecast_after_payment == forecast, (forecast_after_payment, forecast)
    result = dict(first_invoice=first_invoice, first_receivable=first_receivable, second_invoice=invoice_id, second_receivable=second_receivable,
                  credit_before=credit_before, credit_after_first=first_credit, credit_after_second=second_credit, credit_after_payment=paid_credit,
                  forecast_after_second=forecast, forecast_after_payment=forecast_after_payment, titles=totals, payment_amount=9,
                  concurrent_replay_one_title=True, h7_receivable_id_immutable=True, synthetic=True, hosted=False)
    (OUT/'forecast-two-partial-nf-and-payment.json').write_text(json.dumps(result, indent=2)+'\n')
    return result
