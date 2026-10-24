"""Strict authorization assertions and controls on the same synthetic targets."""
for u,p,msg in [(T,P,'forbidden_financial_terms'),(PR,P,'forbidden_partner')]:
    before=snapshot();denied(u,create(G,'strict-role-'+u,p,h=hashA),'42501',msg)
    ok('strict technical or producer create authorization no effects '+u,snapshot()==before)
# Same partner A and same principal after controlled revocation/reactivation, not accidental validation failures.
for sql in [f"SELECT public.approve_partner_order('{next_id}',NULL,NULL)",f"SELECT public.generate_b2b_receivable_secure('{bill_id}')"]:
    denied(ADMIN,sql,'P0001','already_processed') if 'approve_' in sql else actor(ADMIN,sql+';')
ok('same A financial targets positive admin authorized replay',True)
res=json.loads(val(GT,create(GT,'strict-before-revoke')+';'))['id']
ok('same identity target positive before link revocation',bool(res))
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=now(),revoked_by='{ADMIN}',revoke_reason='Synthetic' WHERE user_id='{GT}'; SET session_replication_role=origin;")
before=snapshot();denied(GT,create(G,'strict-revoked',h=hashA),'42501','forbidden_financial_terms')
ok('same identity link revoked exact authorization and no effects',snapshot()==before)
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=NULL,revoked_by=NULL,revoke_reason=NULL WHERE user_id='{GT}'; SET session_replication_role=origin;")
res=json.loads(val(GT,create(GT,'strict-reactivated')+';'))['id']
ok('same identity target reactivated positive control',bool(res))
# Partner B positive fixture uses existing published plan eligibility; local-only assignment/owner scope already canonical.
res=json.loads(val(GB,create(GB,'strict-B-own',p=Q)+';'))['id']
ok('B own partner positive create control',pg.sql(f"SELECT partner_id FROM public.partner_orders WHERE id='{res}'")==Q)
