"""Positive-limit and formal-already-approved branch; fixtures synthetic, no formal-credit RPC certification."""
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=999999999999.99,billing_trigger='na_entrega',credit_limit_action='block' WHERE partner_id='{P}'; SET session_replication_role=origin;")
for formal in [False,True]:
    oid=json.loads(val(G,create(G,'positive-window-'+str(formal))+';'))['id']
    if formal:
        # Explicit setup only: captured approve_b2b_credit body is absent from snapshot; do NOT substitute a grant/RPC.
        pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_orders SET credit_approved_at=now(),credit_approved_by='{ADMIN}' WHERE id='{oid}'; SET session_replication_role=origin;")
    key=pg.sql(f"SELECT hashtext('b2b_credit:'||'{P}')");b,pid=barrier(key)
    a=spawn(ADMIN,f"SELECT public.approve_partner_order('{oid}',NULL,NULL)",'c2_positive_approve')
    assert wait_lock('c2_positive_approve','advisory')
    c=spawn(G,create(G,'positive-concurrent-'+str(formal)),'c2_positive_create')
    # Approve holds row before its explicit credit lock. Create's distinct lock proceeds during the barrier.
    rc=done(c);assert rc[0]==0,rc[2]
    release(b,pid);ra=done(a)
    ok('positive credit intermediate create versus approve formal='+str(formal),ra[0]==0 and pg.sql(f"SELECT status||'|'||receivable_generated FROM public.partner_orders WHERE id='{oid}'")=='aprovado|false')
    exposure=json.loads(pg.sql(f"SELECT public.fn_b2b_credit_exposure('{P}',0,NULL)"))
    ok('positive credit exposure bounded no premature title formal='+str(formal),exposure['exposicao_projetada']<=exposure['credit_limit'] and pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{oid}'")=='0')
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=0 WHERE partner_id='{P}'; SET session_replication_role=origin;")
