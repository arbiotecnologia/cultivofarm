"""Executed inside the captured chain fixture namespace; not a standalone harness."""
sig='public.fn_b2b_credit_exposure(uuid,numeric,uuid)'
baseline=(N/'baseline/function.sql').read_text()
expected=json.loads((N/'expected.json').read_text())
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=1,credit_limit_action='block',billing_trigger='na_entrega' WHERE partner_id='{Q}'; SET session_replication_role=origin;")
before=snapshot()
pg.sql(f"DO $$ BEGIN PERFORM {sig.split('(')[0]}('{Q}',180,NULL); RAISE EXCEPTION 'overflow_missing'; EXCEPTION WHEN numeric_value_out_of_range THEN IF SQLSTATE<>'22003' THEN RAISE; END IF; END $$;")
actor(GB,create(GB,'numeric-before',p=Q)+';',err='numeric field overflow')
ok('captured overflow180 limit1 and original create atomic rollback',snapshot()==before)
# Both candidate and rollback reject drift before any function replacement.
pg.sql(baseline.replace('BEGIN\n','BEGIN\n -- deliberate local drift\n',1))
failure=pg.sql((N/'candidate.sql.review').read_text(),ok=False)
ok('numeric candidate rejects body drift no data effects','C2_CREDIT_NUMERIC_DRIFT' in failure and snapshot()==before)
pg.sql(baseline)
pg.sql(f'GRANT EXECUTE ON FUNCTION {sig} TO authenticated;')
failure=pg.sql((N/'candidate.sql.review').read_text(),ok=False)
ok('numeric candidate rejects ACL drift','C2_CREDIT_NUMERIC_DRIFT' in failure)
pg.sql(f'REVOKE EXECUTE ON FUNCTION {sig} FROM authenticated;')
pg.sql((N/'candidate.sql.review').read_text());pg.sql((N/'postflight.sql').read_text())
got=pg.sql(f"SELECT pg_get_functiondef('{sig}'::regprocedure)")+'\n'
ok('one declaration only byte-exact remainder ROUND2 ACL retained',got.replace('v_pct numeric;','v_pct numeric(6,2);')==baseline and hashlib.md5(got.encode()).hexdigest()==expected['patched_md5'])
pg.sql(f'GRANT EXECUTE ON FUNCTION {sig} TO anon;')
failure=pg.sql((N/'rollback.sql.review').read_text(),ok=False)
ok('numeric rollback rejects ACL drift atomically','C2_CREDIT_NUMERIC_DRIFT' in failure and pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")==expected['patched_md5'])
pg.sql(f'REVOKE EXECUTE ON FUNCTION {sig} FROM anon;')
pg.sql((N/'rollback.sql.review').read_text());pg.sql((N/'postflight-rollback.sql').read_text())
ok('guarded numeric rollback restores exact baseline without data effects',snapshot()==before)
pg.sql((N/'candidate.sql.review').read_text())
def settings(limit,action='block',block=False,tolerance=0):
    pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit={limit},credit_limit_action='{action}',block_if_overdue={str(block).lower()},overdue_tolerance_days={tolerance} WHERE partner_id='{Q}'; SET session_replication_role=origin;")
def credit(amount='180',partner=Q,exclude='NULL'):
    target='NULL' if partner is None else "'"+partner+"'"
    return json.loads(pg.sql(f'SELECT public.fn_b2b_credit_exposure({target},{amount},{exclude})'))
for name,limit,amount,reason,pct,available in [
 ('no limit',0,180,'NO_LIMIT_DEFINED',0,0),
 ('within',200,180,'OK',90,20),('equal',180,180,'OK',100,0),
 ('above',100,180,'LIMIT_EXCEEDED_BLOCK',180,0),
 ('overflow fixed',1,180,'LIMIT_EXCEEDED_BLOCK',18000,0),
 ('small limit large exposure',0.01,999999999999.99,'LIMIT_EXCEEDED_BLOCK',9999999999999900,0),
 ('ROUND2',200,1.235,'OK',0.62,198.76)]:
    settings(limit);r=credit(str(amount));value=round(amount,2) if name!='ROUND2' else 1.24
    ok('credit '+name,r['reason_code']==reason and r['percentual_utilizado']==pct and r['credito_disponivel']==available and r['exposicao_projetada']==value)
settings(1,'approval_required');r=credit()
ok('approval_required limit1 exposure180 exactly18000',r['reason_code']=='LIMIT_EXCEEDED_APPROVAL' and r['percentual_utilizado']==18000)
# Compare unchanged baseline behavior for unusual/invalid direct calculator arguments.
settings(200)
for amount,partner in [('NULL',Q),('-1',Q),('0',Q),('180',None),('180',U(9999)),("'NaN'::numeric",Q)]:
    patched_result=credit(amount,partner)
    pg.sql((N/'rollback.sql.review').read_text());original_result=credit(amount,partner)
    pg.sql((N/'candidate.sql.review').read_text())
    ok('invalid/direct input acceptance unchanged '+amount+' '+str(partner),patched_result==original_result)
for amount in ['1000000000000',"'Infinity'::numeric","'-Infinity'::numeric"]:
    sql=f"DO $$ BEGIN PERFORM public.fn_b2b_credit_exposure('{Q}',{amount},NULL); RAISE EXCEPTION 'expected_22003'; EXCEPTION WHEN numeric_value_out_of_range THEN IF SQLSTATE<>'22003' THEN RAISE; END IF; END $$;"
    pg.sql(sql);pg.sql((N/'rollback.sql.review').read_text());pg.sql(sql);pg.sql((N/'candidate.sql.review').read_text())
    ok('numeric14 invalid input retains22003 '+amount)
# Overdue fixtures local only, copied from an actual title produced by the captured approval chain.
title=U(800);installment=U(801)
pg.sql(f"SET session_replication_role=replica; INSERT INTO public.accounts_receivable SELECT (jsonb_populate_record(NULL::public.accounts_receivable,to_jsonb(t)||jsonb_build_object('id','{title}','origin_id','{title}','partner_id','{Q}','organization_id','{B}'))).* FROM public.accounts_receivable t LIMIT 1; INSERT INTO public.accounts_receivable_installments SELECT (jsonb_populate_record(NULL::public.accounts_receivable_installments,to_jsonb(t)||jsonb_build_object('id','{installment}','receivable_id','{title}','original_amount',10,'received_amount',0,'due_date',current_date-3,'status','OPEN','organization_id','{B}'))).* FROM public.accounts_receivable_installments t LIMIT 1; SET session_replication_role=origin;")
for limit,action in [(0,'block'),(200,'block'),(1,'approval_required')]:
    settings(limit,action,True);r=credit()
    ok('OVERDUE_BLOCK precedence '+str(limit)+' '+action,r['reason_code']=='OVERDUE_BLOCK' and r['saldo_vencido']==10 and r['exposicao_projetada']==190)
settings(200,block=False);ok('overdue nonblocking retainsOK',credit()['reason_code']=='OK')
settings(200,block=True,tolerance=3);ok('overdue strict threshold equal excluded',credit()['saldo_vencido']==0)
settings(200,block=True,tolerance=2);ok('overdue one day before threshold included',credit()['saldo_vencido']==10)
pg.sql(f"SET session_replication_role=replica; DELETE FROM public.accounts_receivable_installments WHERE id='{installment}'; DELETE FROM public.accounts_receivable WHERE id='{title}'; SET session_replication_role=origin;")
# Exact rebased post accepts the numeric-only change, without opening writer.
saved_writer=pg.sql("SELECT pg_get_functiondef('platform_private.c2_owner_order_create_allowed(uuid,uuid)'::regprocedure)")+'\n'
pg.sql((H/'baseline/platform_private.c2_owner_order_create_allowed.sql').read_text())
pg.sql((N/'origin-rebase/postflight.sql').read_text())
ok('rebased POST full dependencies RLS ACL writerfalse',pg.sql(f"SELECT platform_private.c2_owner_order_create_allowed('{G}','{P}')")=='f')
pg.sql(saved_writer)
settings(1);before=snapshot();actor(GB,create(GB,'numeric-after-block',p=Q)+';',err='credit_limit_exceeded')
ok('fixed overflow create financial block no partial effects',snapshot()==before)
settings(1,'approval_required');call=create(GB,'numeric-approval',p=Q);result=json.loads(val(GB,call+';'));oid=result['id']
ok('real create approval_required pending no title180',pg.sql(f"SELECT status FROM public.partner_orders WHERE id='{oid}'")=='aguardando_aprovacao_credito' and pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{oid}'")=='0')
before=snapshot();again=json.loads(val(GB,call+';'));ok('numeric create replay idempotent sameID unchanged',again==result and snapshot()==before)
before=snapshot();actor(GB,create(GB,'numeric-approval',p=Q,obs='Changed')+';',err='idempotency_conflict');ok('numeric conflict atomic unchanged',snapshot()==before)
r=credit('0');excluded=credit('0',exclude="'"+oid+"'")
ok('pending consumes credit exclude order exact180',r['comprometido_pendente']==180 and excluded['comprometido_pendente']==0)
before=snapshot();actor(ADMIN_B,f"SELECT public.approve_partner_order('{oid}',NULL,NULL);",err='credit_pending')
ok('approval_required stays pending cannot bypass credit approval',snapshot()==before)
settings(1000);oid=json.loads(val(GB,create(GB,'numeric-delivery',p=Q)+';'))['id']
actor(ADMIN_B,f"SELECT public.approve_partner_order('{oid}',NULL,NULL);")
ok('numeric na_entrega approval no title no planning',pg.sql(f"SELECT status||'|'||ready_for_production||'|'||receivable_generated FROM public.partner_orders WHERE id='{oid}'")=='aprovado|false|false' and pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{oid}'")=='0')
before=snapshot();actor(ADMIN_B,f"SELECT public.generate_b2b_receivable_secure('{oid}');",err='C2_EXTERNAL_DELIVERY_REQUIRED');ok('numeric na_entrega premature billing denied all effects',snapshot()==before)
settings(0)
before=snapshot()
pg.sql("CREATE FUNCTION public.numeric_test_fail_create() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'NUMERIC_TEST_LATE_CREATE'; END $$; CREATE TRIGGER zz_numeric_late_create BEFORE INSERT ON public.partner_order_idempotency FOR EACH ROW EXECUTE FUNCTION public.numeric_test_fail_create();")
actor(GB,create(GB,'late-create',p=Q)+';',err='NUMERIC_TEST_LATE_CREATE')
ok('numeric late create failure rollback order children audits key',snapshot()==before)
pg.sql('DROP TRIGGER zz_numeric_late_create ON public.partner_order_idempotency;')
for qty in [0,-1]:
    bad=items.replace('"quantidade": 1','"quantidade": '+str(qty));before=snapshot()
    actor(GB,create(GB,'invalid-'+str(qty),p=Q).replace(items,bad)+';',err='')
    ok('create invalid quantity denied unchanged '+str(qty),snapshot()==before)
# Final original containment scenarios run against the rebased rollback and new credit body.