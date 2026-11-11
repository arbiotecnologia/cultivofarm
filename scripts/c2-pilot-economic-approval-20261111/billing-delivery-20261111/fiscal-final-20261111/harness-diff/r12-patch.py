from pathlib import Path
R=Path('/tmp/r12/scripts/b2b-downstream-audit-20261107')
c=R/'order-e2e-new-20261108/compose_current.py'; s=c.read_text()
anchor="  published,publish_error=Q.publish(Q.UFIN,Q.P3,'boleto',Q.M_BOL,30,1,'0',1);assert published is not None,publish_error\n"
assert s.count(anchor)==1
hook='''  # R12 hook (mirror only): install fiscal-eligibility 02 (af435182) BEFORE the order flow; seam: review_project_ref GUC set in mirror session.
  _f02=Path('/tmp/r12/02-install.sql.review');_sha=hashlib.sha256(_f02.read_bytes()).hexdigest();assert _sha=='18275b2793c92c613b9cc5625b2564adecd17b125e210e823bb93802d6c9b001',_sha
  _pre=B.last("SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))::text FROM pg_proc p WHERE p.proname='fn_fiscal_invoice_eligibility';")
  _g=B.run_raw("SET fiscal_elig_fix.review_project_ref='swzpzcwiasxmjutrmvkm';\\\\set ON_ERROR_STOP on\\n"+_f02.read_text());assert _g.returncode==0,_g.stderr
  _p=B.run_raw("SET fiscal_elig_fix.review_project_ref='swzpzcwiasxmjutrmvkm';\\\\set ON_ERROR_STOP on\\n"+Path('/tmp/r12/03-post.sql.readonly').read_text());assert _p.returncode==0,_p.stderr
  _post=B.last("SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))::text FROM pg_proc p WHERE p.proname='fn_fiscal_invoice_eligibility';")
  (OUT/'r12-fiscal-eligibility-02.json').write_text(json.dumps(dict(file='scripts/fiscal-eligibility-delivery-enum-20261111/02-install.sql.review',revision='af435182215e8a1c9c1e83e5951f501dfaa9cc1b',sha256=_sha,pre=json.loads(_pre),post=json.loads(_post),post_exit=_p.returncode,applied_before_order_flow=True,seam='review_project_ref GUC set in mirror session'),indent=2)+'\\n')
  checks.append(dict(test='R12 fiscal eligibility 02 af435182 installed before order flow and 03 POST passed',status='PASS',sha256=_sha))
'''
s=s.replace(anchor,hook+anchor); c.write_text(s)
f=R/'b4/fiscal-decision-20261108/service-bridge-current-20261109/forecast_residual_scenario.py'; s=f.read_text()
a1="    second_intent_denied = denied(sync_raw(Q, Q.UFIN, Z['tx'], started['version']), 'B2B_FORECAST_INTENT_CONFLICT')\n"
assert s.count(a1)==1
rec='''    # R12 mid-order fiscal recovery: real H13 callback for NF2(A) inside a transaction intentionally rolled back.
    def _snap(tag):
        return dict(tag=tag,
          titles=B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order_id}' AND b2b_document_id IS NOT NULL;"),
          title_ids=B.last(f"SELECT coalesce(string_agg(id::text,',' ORDER BY id),'') FROM public.accounts_receivable WHERE origin_id='{order_id}' AND b2b_document_id IS NOT NULL;"),
          inst_ids=B.last(f"SELECT coalesce(string_agg(i.id::text||':'||i.amount::text,',' ORDER BY i.id),'') FROM public.accounts_receivable_installments i JOIN public.accounts_receivable r ON r.id=i.receivable_id WHERE r.origin_id='{order_id}' AND r.b2b_document_id IS NOT NULL;"),
          confirmed_events=B.last(f"SELECT count(*) FROM platform_private.b2b_financial_forecast_events e JOIN platform_private.b2b_financial_forecasts f ON f.id=e.forecast_id WHERE f.order_id='{order_id}' AND e.event_type='FISCAL_CONFIRMED';"),
          residual=B.last(f"SELECT residual_amount FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';"),
          nf2_titles=B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{A['invoice']}';"),
          nf2_alloc=B.last(f"SELECT count(*) FROM platform_private.b2b_document_allocations WHERE document_id='{A['invoice']}';"),
          nf2_status=B.last(f"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{A['invoice']}';"),
          nf2_tx=B.last(f"SELECT outcome FROM public.fiscal_sefaz_transmissions WHERE id='{A['tx']}';"))
    rec_before=_snap('before-rolled-back-callback')
    body=json.dumps({'cStat':'104','protocolCStat':'100','nProt':'LOCAL-INTEGRATED-PROTOCOL-2A','chNFe':A['access_key'],'xMotivo':'LOTE PROCESSADO; PROTOCOLO AUTORIZADO','tpAmb':'2','dhRecbto':'2027-02-02T12:00:00Z'}).replace("'","''")
    inside=B.run_raw(f"\\\\set ON_ERROR_STOP on\\nBEGIN;SET LOCAL ROLE service_role;SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{A['tx']}','SUCCEEDED','{body}'::jsonb);RESET ROLE;SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{A['invoice']}';SELECT residual_amount FROM platform_private.b2b_financial_forecasts WHERE order_id='{order_id}';ROLLBACK;")
    assert inside.returncode==0,(inside.stdout,inside.stderr)
    inside_lines=[l for l in inside.stdout.splitlines() if l.strip()]
    rec_after=_snap('new-connection-after-rollback')
    assert rec_after==dict(rec_before,tag=rec_after['tag']),(rec_before,rec_after)
    assert rec_after['titles']=='1' and rec_after['confirmed_events']=='1' and float(rec_after['residual'])==10 and rec_after['nf2_titles']=='0' and rec_after['nf2_alloc']=='0',rec_after
    (OUT/'r12-midorder-recovery-rollback.json').write_text(json.dumps(dict(nf2=A,inside_tx_output_tail=inside_lines[-6:],before=rec_before,after=rec_after,rolled_back_intentionally=True,hosted=False),indent=2)+'\\n')
'''
s=s.replace(a1,a1+rec)
a2="    assert forecast_row(B, order_id) == forecast\n\n    # H7 negative"
assert s.count(a2)==1
rep='''    assert forecast_row(B, order_id) == forecast
    # R12: explicit re-delivery of BOTH authorized NFs after recovery; ids must be unchanged.
    rec_done=_snap('after-reprocess')
    r1=authorize(B, first_doc, first_tx, 'LOCAL-INTEGRATED-PROTOCOL', '2027-02-01T12:00:00Z')
    r2=authorize(B, winner, winner['tx'], 'LOCAL-INTEGRATED-PROTOCOL-2A' if winner is A else 'LOCAL-INTEGRATED-PROTOCOL-2Z')
    assert r1.returncode==0 and r2.returncode==0 and _last(r1)['reconciliationPending'] is False and _last(r2)['reconciliationPending'] is False,(r1.stderr,r2.stderr)
    rec_final=_snap('after-explicit-replay-nf1-nf2')
    assert {k:v for k,v in rec_final.items() if k not in('tag','nf2_titles','nf2_alloc','nf2_status','nf2_tx')}=={k:v for k,v in rec_done.items() if k not in('tag','nf2_titles','nf2_alloc','nf2_status','nf2_tx')},(rec_done,rec_final)
    amounts=B.last(f"SELECT string_agg(total_amount::text,',' ORDER BY total_amount) FROM public.accounts_receivable WHERE origin_id='{order_id}' AND b2b_document_id IS NOT NULL;")
    assert rec_final['titles']=='2' and rec_final['confirmed_events']=='2' and float(rec_final['residual'])==0 and [float(x) for x in amounts.split(',')]==[10.0,10.0],(rec_final,amounts)
    assert len(rec_final['inst_ids'].split(','))==2
    (OUT/'r12-midorder-recovery-replay.json').write_text(json.dumps(dict(winner=winner['invoice'],after_reprocess=rec_done,after_replay=rec_final,title_amounts=amounts,replay_nf1=_last(r1),replay_nf2=_last(r2),hosted=False),indent=2)+'\\n')

    # H7 negative'''
s=s.replace(a2,rep); f.write_text(s)
