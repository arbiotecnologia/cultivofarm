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
  (OUT/'integrated-close-debug.json').write_text(json.dumps(dict(callback=callback_data,close_pending=close_debug),indent=2)+'\\n')
  assert callback_data['outcome']=='AUTHORIZED' and callback_data['cStat']=='104' and callback_data['protocolCStat']=='100' and callback_data['reconciliationPending'] is False and callback_data['reconciliationCode'] is None,(callback_data,close_debug)""")
    old_expected = "  assert blocked=={'invoice_status':invoice_initial['normalized_status'],'invoice_receivable':None,'transmission_outcome':'AUTHORIZED','transmission_c_stat':'104','transmission_protocol_c_stat':'100','transmission_error':None,'close_pending':'FISCAL_AUTHORIZATION_CLOSE_PENDING','close_pending_attempts':2,'transmissions':1,'invoices':1,'xml_runs':1,'transmission_idempotency':transmission_idem,'transmission_fingerprint':transmission_fingerprint,'documents':0,'allocations':0,'snapshots':0,'receivables':0},blocked"
    new_expected = """  assert blocked['transmission_outcome']=='AUTHORIZED' and blocked['transmission_c_stat']=='104' and blocked['transmission_protocol_c_stat']=='100',blocked
  assert blocked['invoice_status']=='AUTHORIZED' and blocked['invoice_receivable'] and blocked['transmission_error'] is None,blocked
  assert blocked['close_pending'] is None and blocked['close_pending_attempts'] is None,blocked
  assert {k:blocked[k] for k in ('transmissions','invoices','xml_runs','documents','allocations','snapshots','receivables')}==dict(transmissions=1,invoices=1,xml_runs=1,documents=1,allocations=1,snapshots=1,receivables=1),blocked
  assert blocked['transmission_idempotency']==transmission_idem and blocked['transmission_fingerprint']==transmission_fingerprint,blocked
  receivable_id=blocked['invoice_receivable']"""
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
   strict_pre=strict_pre,strict_post=strict_post,seller91_md5='97bcdb9884b54adb3bd4aae4915e32d0',
   old_dependency_denial=dependency.stderr,legacy_writer_denial=legacy_denied.stderr,client_bridge_denial=client_bridge.stderr,
   original_ten_triggers_preserved=True,current_trigger_count=len(current_triggers),
   effect_baseline=effect_baseline,current_counts=current_counts,credit=credit,h13_confirmed=blocked,
   positive_fiscal_receivable=receivable_id,always_allow_substitution=False),indent=2)+'\\n')
  checks.append(dict(test='same fresh DB executes Seller91 buyer seller logistics B4 strict bridge and positive confirmed fiscal receivable',status='PASS'))"""
    s = edit(s, old_json, new_json)
    s = edit(s, "  B.sql(\"SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';\"+(composed_dir/'04-rollback-deny.sql.review').read_text())",
                """  B.sql("SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(strict_dir/'04-rollback-deny.sql.review').read_text())
  assert 'B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN' in B.last("SELECT pg_get_functiondef('platform_private.b2b_integration_dependencies()'::regprocedure);")
  B.sql("SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';SET b2b_fiscal_bridge.review_project_ref='swzpzcwiasxmjutrmvkm';"+(composed_dir/'04-rollback-deny.sql.review').read_text())""")
    s = edit(s, "  assert B.last(\"SELECT count(*) FROM platform_private.b2b_fiscal_invoice_snapshots;\")=='0'\n  assert B.last(f\"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_id}';\")==invoice_initial['normalized_status']",
                "  assert B.last(\"SELECT count(*) FROM platform_private.b2b_fiscal_invoice_snapshots;\")=='1'\n  assert B.last(f\"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{invoice_id}';\")=='AUTHORIZED'\n  assert B.last(f\"SELECT receivable_id FROM public.fiscal_invoices WHERE id='{invoice_id}';\")==receivable_id\n  assert B.last(f\"SELECT count(*) FROM public.accounts_receivable WHERE id='{receivable_id}' AND b2b_document_id='{invoice_id}';\")=='1'")
    s = edit(s, "  assert B.last(f\"SELECT count(*) FROM platform_private.fiscal_close_pending WHERE transmission_id='{transmission_id}' AND error_code='FISCAL_AUTHORIZATION_CLOSE_PENDING' AND attempts=2;\")=='1'",
                "  assert B.last(f\"SELECT count(*) FROM platform_private.fiscal_close_pending WHERE transmission_id='{transmission_id}';\")=='0'")
    s = edit(s, "  checks.append(dict(test='composed reverse deny-only rollback closes bridge B4 and plans without stale B4 POST; preserves plans fiscal evidence deterministic idempotency close pending and all original ten receivable triggers',status='PASS'))",
                "  checks.append(dict(test='strict then composed deny-only rollback closes writers; preserves confirmed NF snapshot title idempotency and all original ten receivable triggers',status='PASS'))")
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
