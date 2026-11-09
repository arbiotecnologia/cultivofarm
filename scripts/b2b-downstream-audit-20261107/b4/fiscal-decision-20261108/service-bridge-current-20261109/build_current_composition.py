#!/usr/bin/env python3
"""Deriva compose_current.py da composição 47/47, preservando a fonte histórica."""
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[4]
SOURCE = ROOT / "scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/compose.py"
OUT = SOURCE.with_name("compose_current.py")
OLD_RESPOND = "4926a99c3fa3086b34ff25bb4b4038bb"
NEW_RESPOND = "97bcdb9884b54adb3bd4aae4915e32d0"


def edit(s, old, new, count=1):
    assert s.count(old) == count, (old[:160], s.count(old), count)
    return s.replace(old, new, count)


def main():
    s = SOURCE.read_text()
    s = edit(s, "checks=[]\n", "checks=[]\nSTRICT_FISCAL=True\n")
    s = edit(s, "  Q=commercial.apply(B,load,ROOT,OUT)",
                """  Q=commercial.apply(B,load,ROOT,OUT)
  customer_id=Q.u(301)
  B.sql(f"SET session_replication_role=replica;INSERT INTO public.clientes(id,organization_id,nome,codigo_cliente) VALUES('{customer_id}','{Q.A}','CLIENTE FISCAL SINTETICO LOCAL','LOCAL-FISCAL-301') ON CONFLICT(id) DO NOTHING;UPDATE public.partner_accounts SET client_id='{customer_id}' WHERE id='{Q.P}' AND commercial_owner_organization_id='{Q.A}';SET session_replication_role=origin;")
  assert B.last(f"SELECT client_id FROM public.partner_accounts WHERE id='{Q.P}' AND commercial_owner_organization_id='{Q.A}';")==customer_id
  (OUT/'financial-customer-fixture.json').write_text(json.dumps(dict(customer_id=customer_id,partner_id=Q.P,organization_id=Q.A,synthetic=True,hosted=False,reason='B4 requires partner_accounts.client_id; same fixture seam as strict battery'),indent=2)+'\\n')
  forecast_dir=ROOT/'scripts/b2b-downstream-audit-20261107/b4/fiscal-decision-20261108/service-bridge-current-20261109/forecast-pre-nf-20261109'
  forecast_pre=B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'01-pre.sql.readonly').read_text())
  B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'02-install.sql.review').read_text())
  forecast_post=B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'03-post.sql.readonly').read_text())""")
    s = edit(s, "  assert accepted['ready_for_production'] is False,'external resale must not open biological production'\n  (OUT/'seller-acceptance.json')",
                """  assert accepted['ready_for_production'] is False,'external resale must not open biological production'
  forecast_read=Q.as_user(Q.UADM,f"SELECT public.get_b2b_financial_forecast_secure('{order_id}');")
  assert forecast_read.returncode==0,forecast_read.stderr
  forecast=json.loads(forecast_read.stdout.strip().splitlines()[-1])
  assert forecast['state']=='aguardando_fiscal' and forecast['due_dates_estimated'] is True and float(forecast['residual_amount'])==float(accepted['final_amount_with_interest']),forecast
  assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order_id}';")=='0'
  forecast_replay=json.loads(B.last(f"SELECT platform_private.b2b_financial_forecast_after_approval_v1('{order_id}',(SELECT credit_decision_snapshot FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}'))::text;"))
  assert forecast_replay['replayed'] is True and forecast_replay['forecast_id']==forecast['forecast_id'],forecast_replay
  forecast_denied=Q.as_user(Q.UB2,f"SELECT public.get_b2b_financial_forecast_secure('{order_id}');")
  assert forecast_denied.returncode!=0 and 'B2B_FORECAST_READ_DENIED' in forecast_denied.stderr,forecast_denied.stderr
  forecast_private_denied=Q.as_user(Q.UADM,f"SELECT platform_private.b2b_financial_forecast_transition_v1('{forecast['forecast_id']}',1,'EMISSION_STARTED','{Q.u(950)}','{{}}'::jsonb);")
  assert forecast_private_denied.returncode!=0 and 'permission denied' in forecast_private_denied.stderr,forecast_private_denied.stderr
  intent_id=Q.u(950)
  def forecast_event(event,version,attempt,error_code=None):
   payload=json.dumps({'attempt':str(attempt),'error_code':error_code} if error_code else {'attempt':str(attempt)}).replace("'","''")
   return B.run_raw(f"RESET ROLE;SELECT platform_private.b2b_financial_forecast_transition_v1('{forecast['forecast_id']}',{version},'{event}','{intent_id}','{payload}'::jsonb);")
  started=forecast_event('EMISSION_STARTED',1,1);assert started.returncode==0,started.stderr
  started_replay=forecast_event('EMISSION_STARTED',1,1);assert started_replay.returncode==0 and 'true' in started_replay.stdout,started_replay.stdout
  failed=forecast_event('EMISSION_FAILED',2,1,'LOCAL_REJECT');assert failed.returncode==0,failed.stderr
  restarted=forecast_event('EMISSION_STARTED',3,2);assert restarted.returncode==0,restarted.stderr
  timeout=forecast_event('EMISSION_TIMEOUT',4,2,'LOCAL_TIMEOUT');assert timeout.returncode==0,timeout.stderr
  premature=forecast_event('EMISSION_STARTED',5,3);assert premature.returncode!=0 and 'B2B_FORECAST_STATE_CONFLICT' in premature.stderr,premature.stderr
  consulted=forecast_event('CONSULTATION_NOT_AUTHORIZED',5,2);assert consulted.returncode==0,consulted.stderr
  restarted=forecast_event('EMISSION_STARTED',6,3);assert restarted.returncode==0,restarted.stderr
  failed=forecast_event('EMISSION_FAILED',7,3,'LOCAL_RETRY_CLOSED');assert failed.returncode==0,failed.stderr
  forecast_final=json.loads(Q.as_user(Q.UADM,f"SELECT public.get_b2b_financial_forecast_secure('{order_id}');").stdout.strip())
  assert forecast_final['state']=='aguardando_fiscal' and forecast_final['version']==8,forecast_final
  assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order_id}';")=='0'
  (OUT/'forecast-pre-nf.json').write_text(json.dumps(dict(forecast=forecast_final,replay=forecast_replay,cross_tenant_denied=forecast_denied.stderr,receivables_before_nf=0),indent=2)+'\\n')
  checks.append(dict(test='forecast separate after commercial and valid credit; idempotent scoped no receivable and failure retry timeout consultation preserve one forecast',status='PASS',forecast_id=forecast['forecast_id']))
  (OUT/'seller-acceptance.json')""")
    s = edit(s, "  checks.append(dict(test='plan tenant candidate PRE POST in same DB; seller positive FSF read write negative and cross tenant same code',status='PASS'))",
                """  checks.append(dict(test='plan tenant candidate PRE POST in same DB; seller positive FSF read write negative and cross tenant same code',status='PASS'))
  strict_dir=ROOT/'scripts/b2b-downstream-audit-20261107/b4/fiscal-decision-20261108/service-bridge-current-20261109'
  B.sql((strict_dir/'respond.seller91.sql').read_text())
  assert B.last("SELECT md5(pg_get_functiondef('public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)'::regprocedure));")=='97bcdb9884b54adb3bd4aae4915e32d0'
  (OUT/'seller91-current.json').write_text(json.dumps(dict(executed=True,md5='97bcdb9884b54adb3bd4aae4915e32d0',source=str(strict_dir/'respond.seller91.sql'),overlay_only=False),indent=2)+'\\n')
  checks.append(dict(test='Seller91 real body installed before canonical order creation; current MD5 97bcdb98',status='PASS'))""")
    s = edit(s, "  expected_diagnostic=composed_manifest['post_composition_baseline']['b4_dependency_md5']",
                "  expected_diagnostic=dict(composed_manifest['post_composition_baseline']['b4_dependency_md5'],**{'public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)':'97bcdb9884b54adb3bd4aae4915e32d0'})")
    s = edit(s, "  b4_pre=B.sql((composed_dir/'stages/01-b4-pre-post-composition.sql.readonly').read_text())\n  B.sql((composed_dir/'stages/02-b4-install-post-composition.sql.review').read_text())",
                """  b4_pre_text=(composed_dir/'stages/01-b4-pre-post-composition.sql.readonly').read_text().replace('4926a99c3fa3086b34ff25bb4b4038bb','97bcdb9884b54adb3bd4aae4915e32d0')
  b4_install_text=(composed_dir/'stages/02-b4-install-post-composition.sql.review').read_text().replace('4926a99c3fa3086b34ff25bb4b4038bb','97bcdb9884b54adb3bd4aae4915e32d0')
  (OUT/'current-b4-pre.sql.readonly').write_text(b4_pre_text)
  (OUT/'current-b4-install.sql.review').write_text(b4_install_text)
  b4_pre=B.sql(b4_pre_text)
  B.sql(b4_install_text)""")
    s = edit(s, "  composed_post=B.sql(\"SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';\"+(composed_dir/'03-post.sql.readonly').read_text())",
                "  composed_post=B.sql(\"SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';\"+(composed_dir/'03-post.sql.readonly').read_text().replace('4926a99c3fa3086b34ff25bb4b4038bb','97bcdb9884b54adb3bd4aae4915e32d0'))")
    s = edit(s, "  (OUT/'canonical-composition-manifest.json').write_text(json.dumps(composed_manifest,indent=2)+'\\n')",
                """  composed_manifest['current_seller91_reconciliation']={'old_md5':'4926a99c3fa3086b34ff25bb4b4038bb','executed_md5':'97bcdb9884b54adb3bd4aae4915e32d0','frozen_sources_modified':False,'stage_pin_reconciled_in_output_only':True}
  (OUT/'canonical-composition-manifest.json').write_text(json.dumps(composed_manifest,indent=2)+'\\n')""")
    s = edit(s, "  checks.append(dict(test='composed PRE post-plans reconciles five dependencies then B4 bridge and composed POST pass without changing B4 body or always-deny',status='PASS'))",
                "  checks.append(dict(test='composed PRE reconciles Seller91 and five dependencies then B4 bridge POST pass before strict fiscal stage',status='PASS'))")
    s = edit(s, "  assert dependency.returncode!=0 and 'B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN' in dependency.stderr,dependency.stderr\n  client_bridge=",
                """  assert dependency.returncode!=0 and 'B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN' in dependency.stderr,dependency.stderr
  strict_pre=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(strict_dir/'01-pre.sql.readonly').read_text())
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(strict_dir/'02-install.sql.review').read_text())
  strict_post=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(strict_dir/'03-post.sql.readonly').read_text())
  forecast_reconcile_pre=B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'05-pre-fiscal-reconcile.sql.readonly').read_text())
  B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'06-install-fiscal-reconcile.sql.review').read_text())
  forecast_reconcile_post=B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'07-post-fiscal-reconcile.sql.readonly').read_text())
  audit_dir=strict_dir/'bridge-audit-action'
  bridge_before_md5=B.last("SELECT md5(pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure));")
  bridge_before_body=B.run_raw("SELECT pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure);").stdout.rstrip('\\n')
  (OUT/'bridge-before-audit-body.sql').write_text(bridge_before_body+'\\n')
  (OUT/'bridge-before-audit-md5.json').write_text(json.dumps(dict(actual=bridge_before_md5,expected='8905212e276f6bb43be32423ee48abc8'),indent=2)+'\\n')
  bridge_audit_pre=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(audit_dir/'01-pre.sql.readonly').read_text())
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(audit_dir/'02-install.sql.review').read_text())
  bridge_audit_post=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(audit_dir/'03-post.sql.readonly').read_text())
  h7_dir=strict_dir/'h7-receivable-link'
  h7_pre=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(h7_dir/'01-pre.sql.readonly').read_text())
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(h7_dir/'02-install.sql.review').read_text())
  h7_post=B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(h7_dir/'03-post.sql.readonly').read_text())
  legacy_denied=B.run_raw(B.T.actor(Q.UFIN)+f"SELECT public.generate_b2b_receivable_secure('{order_id}');")
  assert legacy_denied.returncode!=0 and 'B2B_AUTHORIZED_FISCAL_DOCUMENT_REQUIRED' in legacy_denied.stderr,legacy_denied.stderr
  assert B.last('SELECT count(*) FROM public.accounts_receivable;')==str(effect_baseline['receivables'])
  (OUT/'legacy-writer-closed.json').write_text(json.dumps(dict(wrapper_denied=legacy_denied.stderr,receivables=effect_baseline['receivables'],approval_delivery_production_trigger='B4_NO_OP_MD5_d179755ea3701a723338d08283d42fe5'),indent=2)+'\\n')
  checks.append(dict(test='strict permit validator PRE INSTALL POST and old integral writer denied without title',status='PASS'))
  client_bridge=""")
    s = edit(s, "  assert callback_data['outcome']=='AUTHORIZED' and callback_data['cStat']=='104' and callback_data['protocolCStat']=='100' and callback_data['reconciliationPending'] is True and callback_data['reconciliationCode']=='FISCAL_AUTHORIZATION_CLOSE_PENDING',callback_data",
                "  assert callback_data['outcome']=='AUTHORIZED' and callback_data['cStat']=='104' and callback_data['protocolCStat']=='100' and callback_data['reconciliationPending'] is False and callback_data['reconciliationCode'] is None,callback_data")
    s = edit(s, "  assert replay_data['reconciliationPending'] is True,replay_data",
                "  assert replay_data['reconciliationPending'] is False,replay_data")
    s = edit(s, "  assert callback_data['outcome']=='AUTHORIZED' and callback_data['cStat']=='104' and callback_data['protocolCStat']=='100' and callback_data['reconciliationPending'] is False and callback_data['reconciliationCode'] is None,callback_data",
                """  close_debug=json.loads(B.last("SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT * FROM platform_private.fiscal_close_pending LIMIT 3) q;"))
  direct_close=B.run_raw(f"SET ROLE service_role;SELECT public.rpc_fiscal_invoice_apply_authorization_v1('{invoice_id}','{access_key}','LOCAL-INTEGRATED-PROTOCOL',now(),'100','LOTE PROCESSADO; PROTOCOLO AUTORIZADO','{transmission_id}');")
  (OUT/'integrated-close-debug.json').write_text(json.dumps(dict(callback=callback_data,close_pending=close_debug,direct_close_stdout=direct_close.stdout,direct_close_stderr=direct_close.stderr,direct_close_returncode=direct_close.returncode),indent=2)+'\\n')
  assert callback_data['outcome']=='AUTHORIZED' and callback_data['cStat']=='104' and callback_data['protocolCStat']=='100' and callback_data['reconciliationPending'] is False and callback_data['reconciliationCode'] is None,(callback_data,close_debug,direct_close.stdout,direct_close.stderr)""")
    old_expected = "  assert blocked=={'invoice_status':invoice_initial['normalized_status'],'invoice_receivable':None,'transmission_outcome':'AUTHORIZED','transmission_c_stat':'104','transmission_protocol_c_stat':'100','transmission_error':None,'close_pending':'FISCAL_AUTHORIZATION_CLOSE_PENDING','close_pending_attempts':2,'transmissions':1,'invoices':1,'xml_runs':1,'transmission_idempotency':transmission_idem,'transmission_fingerprint':transmission_fingerprint,'documents':0,'allocations':0,'snapshots':0,'receivables':0},blocked"
    new_expected = """  assert blocked['transmission_outcome']=='AUTHORIZED' and blocked['transmission_c_stat']=='104' and blocked['transmission_protocol_c_stat']=='100',blocked
  assert blocked['invoice_status']=='AUTHORIZED' and blocked['invoice_receivable'] and blocked['transmission_error'] is None,blocked
  assert blocked['close_pending'] is None and blocked['close_pending_attempts'] is None,blocked
  assert {k:blocked[k] for k in ('transmissions','invoices','xml_runs','documents','allocations','snapshots','receivables')}==dict(transmissions=1,invoices=1,xml_runs=1,documents=1,allocations=1,snapshots=1,receivables=1),blocked
  assert blocked['transmission_idempotency']==transmission_idem and blocked['transmission_fingerprint']==transmission_fingerprint,blocked
  receivable_id=blocked['invoice_receivable']
  forecast_after=json.loads(B.last(f"SELECT jsonb_build_object('state',state,'residual_amount',residual_amount,'version',version)::text FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';"))
  assert forecast_after['state']=='faturado_total' and float(forecast_after['residual_amount'])==0 and forecast_after['version']==9,forecast_after
  credit_claims="'"+json.dumps(json.dumps({'sub':Q.UADM,'role':'authenticated','iat':1,'exp':4102444800})).replace("'","''")+"'"
  credit_after=json.loads(B.last(f"RESET ROLE;SET request.jwt.claim.sub='{Q.UADM}';SET request.jwt.claims={credit_claims};SELECT public.fn_b2b_credit_exposure('{Q.P}',0,NULL);"))
  assert abs(float(credit_after['exposicao_atual'])-float(credit['exposicao_atual']))<0.01,(credit,credit_after)
  assert B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{invoice_id}';")=='1'
  (OUT/'forecast-post-nf.json').write_text(json.dumps(dict(forecast=forecast_after,credit_before=credit,credit_after=credit_after,one_title_for_invoice=True),indent=2)+'\\n')"""
    s = edit(s, old_expected, new_expected)
    s = edit(s, "  (OUT/'integrated-always-deny-callback.json').write_text(json.dumps(dict(callback=callback_data,replay=replay_data,blocked=blocked,schema_and_fiscal_events_synthetic=True,dependency_substituted=False),indent=2)+'\\n')\n  checks.append(dict(test='real H13 authorized callback and replay preserve one durable transmission with close pending; always-deny yields zero B4 document allocation snapshot or receivable',status='PASS'))",
                """  (OUT/'integrated-strict-fiscal-callback.json').write_text(json.dumps(dict(callback=callback_data,replay=replay_data,confirmed=blocked,schema_and_fiscal_events_synthetic=True,always_allow_substitution=False,strict_permit_required=True),indent=2)+'\\n')
  checks.append(dict(test='real H13 envelope 104 protocol 100 generates one receivable and replay preserves one document allocation snapshot and title without close pending',status='PASS',receivable_id=receivable_id))""")
    old_json = """  (OUT/'integrated-b4-fiscal-bridge.json').write_text(json.dumps(dict(
   status='COMPOSED_BUT_FISCAL_RECEIVABLE_BLOCKED_BY_REAL_ALWAYS_DENY',hosted=False,
   b4_pre=b4_pre,b4_post=b4_post,bridge_pre=bridge_pre,bridge_post=bridge_post,composed_post=composed_post,
   dependency_denial=dependency.stderr,client_bridge_denial=client_bridge.stderr,
   original_ten_triggers_preserved=True,current_trigger_count=len(current_triggers),
   effect_baseline=effect_baseline,current_counts=current_counts,credit=credit,h13_always_deny=blocked,
   positive_fiscal_receivable='NOT_RUN_BLOCKED',always_allow_substitution=False),indent=2)+'\\n')
  checks.append(dict(test='same fresh DB installs B4 and service bridge PRE POST after buyer seller logistics and plan controls; real always-deny preserved and positive fiscal receivable BLOCKED',status='PASS'))"""
    new_json = """  (OUT/'integrated-b4-fiscal-bridge.json').write_text(json.dumps(dict(
   status='STRICT_FISCAL_CONFIRMED_TO_ONE_RECEIVABLE_REVIEW_ONLY',hosted=False,
   b4_pre=b4_pre,b4_post=b4_post,bridge_pre=bridge_pre,bridge_post=bridge_post,composed_post=composed_post,
   forecast_pre=forecast_pre,forecast_post=forecast_post,forecast_reconcile_pre=forecast_reconcile_pre,forecast_reconcile_post=forecast_reconcile_post,strict_pre=strict_pre,strict_post=strict_post,bridge_audit_pre=bridge_audit_pre,bridge_audit_post=bridge_audit_post,h7_pre=h7_pre,h7_post=h7_post,seller91_md5='97bcdb9884b54adb3bd4aae4915e32d0',
   old_dependency_denial=dependency.stderr,legacy_writer_denial=legacy_denied.stderr,client_bridge_denial=client_bridge.stderr,
   original_ten_triggers_preserved=True,current_trigger_count=len(current_triggers),
   effect_baseline=effect_baseline,current_counts=current_counts,credit=credit,h13_confirmed=blocked,
   positive_fiscal_receivable=receivable_id,always_allow_substitution=False),indent=2)+'\\n')
  checks.append(dict(test='same fresh DB executes Seller91 buyer seller logistics B4 strict bridge and positive confirmed fiscal receivable',status='PASS'))"""
    s = edit(s, old_json, new_json)
    s = edit(s, "  B.sql(\"SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';\"+(composed_dir/'04-rollback-deny.sql.review').read_text())",
                """  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(h7_dir/'04-rollback-deny.sql.review').read_text())
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(audit_dir/'04-rollback-deny.sql.review').read_text())
  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(strict_dir/'04-rollback-deny.sql.review').read_text())
  assert 'B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN' in B.last("SELECT pg_get_functiondef('platform_private.b2b_integration_dependencies()'::regprocedure);")
  B.sql("SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(composed_dir/'04-rollback-deny.sql.review').read_text())
  B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'08-rollback-fiscal-reconcile-deny.sql.review').read_text())
  B.sql("SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';"+(forecast_dir/'04-rollback-deny.sql.review').read_text())""")
    s = edit(s, "  assert B.last(\"SELECT count(*) FROM platform_private.b2b_fiscal_invoice_snapshots;\")=='0'\n  assert B.last(f\"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_id}';\")==invoice_initial['normalized_status']",
                "  assert B.last(\"SELECT count(*) FROM platform_private.b2b_fiscal_invoice_snapshots;\")=='1'\n  assert B.last(f\"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_id}';\")=='AUTHORIZED'\n  assert B.last(f\"SELECT receivable_id FROM public.fiscal_invoices WHERE id='{invoice_id}';\")==receivable_id\n  assert B.last(f\"SELECT count(*) FROM public.accounts_receivable WHERE id='{receivable_id}' AND b2b_document_id='{invoice_id}';\")=='1'")
    s = edit(s, "  assert B.last(f\"SELECT count(*) FROM platform_private.fiscal_close_pending WHERE transmission_id='{transmission_id}' AND error_code='FISCAL_AUTHORIZATION_CLOSE_PENDING' AND attempts=2;\")=='1'",
                "  assert B.last(f\"SELECT count(*) FROM platform_private.fiscal_close_pending WHERE transmission_id='{transmission_id}';\")=='0'")
    s = edit(s, "  checks.append(dict(test='composed reverse deny-only rollback closes bridge B4 and plans without stale B4 POST; preserves plans fiscal evidence deterministic idempotency close pending and all original ten receivable triggers',status='PASS'))",
                "  checks.append(dict(test='strict then composed deny-only rollback closes writers; preserves confirmed NF snapshot title idempotency and all original ten receivable triggers',status='PASS'))")
    # Captura 22:27: caso econômico exato 2×10 com 10% e juros zero = 18.
    s = edit(s, "  data,error=Q.sim(Q.UB,Q.P3,[Q.S(2)],choice);assert data is not None,error",
                """  published,publish_error=Q.publish(Q.UFIN,Q.P3,'boleto',Q.M_BOL,30,1,'0',1);assert published is not None,publish_error
  assigned,assign_error=Q.assign(Q.UADM,Q.P,Q.P3,'boleto',2);assert assigned is not None,assign_error
  B.sql(f"UPDATE public.commercial_payment_plans SET discount_percent=10,requires_financial_approval=true WHERE id='{Q.P3}';BEGIN;UPDATE public.catalogo_precos_embalagem SET valid_until=current_date-1 WHERE id='{Q.SP.PR25}';INSERT INTO public.catalogo_precos_embalagem(id,produto_id,owner_organization_id,packaging_id,preco_brl,valid_from) SELECT '{Q.u(970)}',produto_id,owner_organization_id,packaging_id,10,current_date FROM public.catalogo_precos_embalagem WHERE id='{Q.SP.PR25}';COMMIT;")
  choice=Q.ch('boleto',2,30)
  data,error=Q.sim(Q.UB,Q.P3,[Q.S(2)],choice);assert data is not None,error""")
    s = edit(s, "  data,error=Q.create(Q.UB,Q.P3,[Q.S(2)],data['cart_hash'],journal['key'],choice);assert data is not None,error",
                "  data,error=Q.create(Q.UB,Q.P3,[Q.S(2)],data['cart_hash'],journal['key'],choice);assert data is not None,error")
    s = edit(s, "  replay,replay_error=Q.create(Q.UB,Q.P3,[Q.S(2)],data['cart_hash'],journal['key'],choice)",
                "  replay,replay_error=Q.create(Q.UB,Q.P3,[Q.S(2)],data['cart_hash'],journal['key'],choice)")
    s = edit(s, "  forecast_post=B.sql(\"SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';\"+(forecast_dir/'03-post.sql.readonly').read_text())",
                "  forecast_post=B.sql(\"SET b2b_forecast.review_project_ref='swzpzcwiasxmjutrmvkm';\"+(forecast_dir/'03-post.sql.readonly').read_text())\n  forecast_extra=load('forecast_residual_scenario',forecast_dir.parent/'forecast_residual_scenario.py')")
    s = edit(s, "  assert accepted['status']=='aprovado' and accepted['internal_economic_snapshot'] is not None,accepted\n  assert accepted['ready_for_production'] is False,'external resale must not open biological production'",
                """  assert accepted['status']=='aprovado' and accepted['internal_economic_snapshot'] is not None,accepted
  assert accepted['ready_for_production'] is False,'external resale must not open biological production'
  assert float(accepted['final_amount_with_interest'])==18.0 and accepted['credit_approved_at'] is None,accepted
  assert accepted['financial_approval_status']=='pending',accepted
  assert B.last(f"SELECT count(*) FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';")=='0'
  terms_approved=Q.as_user(Q.UADM,f"SELECT public.approve_b2b_payment_terms_secure('{order_id}','LOCAL TERMS APPROVAL');")
  assert terms_approved.returncode==0,terms_approved.stderr
  accepted=json.loads(Q.psql(f"SELECT to_jsonb(o)::text FROM public.partner_orders o WHERE id='{order_id}'").stdout.strip())
  assert accepted['financial_approval_status']=='approved' and accepted['payment_condition_status']=='approved',accepted""")
    s = edit(s, "  checks.append(dict(test='synthetic accounting CAS promotion and canonical seller acceptance; biological production stays closed',status='PASS'))",
                """  checks.append(dict(test='synthetic accounting CAS promotion and canonical seller acceptance; biological production stays closed',status='PASS'))
  override=forecast_extra.run_override(B,Q,OUT)
  checks.append(dict(test='credit OK without override creates 18 only after commercial and payment terms; separate manual override and cross tenant scope use real canonical approvals',status='PASS',override_order=override['order_id'],seller_scope=override['seller_scope']))""")
    s = edit(s, "  company_settings_id=accepted['internal_economic_snapshot']['origin']['company_settings_id']",
                "  company_settings_id=accepted['internal_economic_snapshot']['origin']['company_settings_id']\n  partial_amount=round(float(accepted['final_amount_with_interest'])/2,2)\n  assert partial_amount==9.0,partial_amount")
    s = edit(s, "'{Q.P}','2027-02-01','{accepted['total']}','{Q.UADM}'", "'{Q.P}','2027-02-01','{partial_amount}','{Q.UADM}'")
    s = edit(s, "'{item['quantidade']}','UN','{float(item['quantidade'])*float(item['packaging_peso_liquido_kg_snapshot'])}','KG','{accepted['total']}')",
                "1,'UN',25,'KG','{partial_amount}')")
    s = edit(s, "  assert forecast_after['state']=='faturado_total' and float(forecast_after['residual_amount'])==0 and forecast_after['version']==9,forecast_after",
                "  assert forecast_after['state']=='faturado_parcial' and float(forecast_after['residual_amount'])==9 and forecast_after['version']==9,forecast_after")
    s = edit(s, "  checks.append(dict(test='real H13 envelope 104 protocol 100 generates one receivable and replay preserves one document allocation snapshot and title without close pending',status='PASS',receivable_id=receivable_id))",
                """  checks.append(dict(test='real H13 envelope 104 protocol 100 generates one receivable and replay preserves one document allocation snapshot and title without close pending',status='PASS',receivable_id=receivable_id))
  partial_completion=forecast_extra.run_partial_completion(B,Q,OUT,order_id,accepted,item,invoice_id,receivable_id,credit)
  checks.append(dict(test='two authorized NF 9 plus residual 9 preserve exposure 18; replay race H7 and payment 4 leave exposure 14 without reopening residual',status='PASS',second_receivable=partial_completion['second_receivable']))""")
    s = edit(s, "  assert B.last(\"SELECT count(*) FROM platform_private.b2b_fiscal_invoice_snapshots;\")=='1'",
                "  assert B.last(\"SELECT count(*) FROM platform_private.b2b_fiscal_invoice_snapshots;\")=='2'")
    OUT.write_text(s)
    runner_source = SOURCE.with_name("rebuild.py").read_text()
    assert runner_source.count("order-e2e-new-20261108/compose.py'") == 1
    runner_source = runner_source.replace("order-e2e-new-20261108/compose.py'", "order-e2e-new-20261108/compose_current.py'")
    runner_source = edit(runner_source, "    attempt = next_attempt()\n    attempt.mkdir()",
                        "    attempt = Path(os.environ['NEW_E2E_RUN_OUT']) if os.environ.get('NEW_E2E_RUN_OUT') else next_attempt()\n    attempt.mkdir(exist_ok=False)")
    SOURCE.with_name("rebuild_current.py").write_text(runner_source)
    print(f"generated {OUT} ({len(s.splitlines())} lines) and rebuild_current.py")


if __name__ == "__main__":
    main()
