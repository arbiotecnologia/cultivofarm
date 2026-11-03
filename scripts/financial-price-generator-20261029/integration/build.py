"""Exact captured-source deltas; inactive SQL only, never hosted connectivity."""
import hashlib, json, pathlib
H=pathlib.Path(__file__).resolve().parent
ROOT=H.parents[2]
CAP=ROOT/'scripts/financial-installments-initial-20261024/receivable-recursive-live-20261029.json'
def one(s,old,new):
    if s.count(old)!=1: raise ValueError(f'Exact delta seam mismatch: {old[:100]} count={s.count(old)}')
    return s.replace(old,new,1)
def build():
    if hashlib.sha256(CAP.read_bytes()).hexdigest()!='33bbe2abe605544b38c56cef50ac05ebc6ee035b4d02c0daf1da1b295d3ad56d': raise ValueError('CAPTURE_FILE_DRIFT')
    cap=json.loads(CAP.read_text()); used=[]
    def body(name,md5):
        f=next(f for f in cap['functions'] if f['name']==name)
        if hashlib.md5(f['body'].encode()).hexdigest()!=md5: raise ValueError('CAPTURE_DRIFT '+name)
        used.append({'name':name,'md5':md5}); return f['body']
    create=body('create_partner_order_secure','7ec41e17ca6cca8cd4ef1404a9edc936')
    sim=body('simulate_b2b_payment_plan_secure','37d4f45e388ed7b38f6f397b672629ee')
    for name,source in [('create',create),('simulate',sim)]:
        source=one(source,')\n RETURNS jsonb',", p_payment_choice jsonb DEFAULT NULL::jsonb)\n RETURNS jsonb")
        source=one(source,'DECLARE\n','DECLARE\n  v_condition jsonb; v_choice jsonb; v_rows jsonb; v_calendar platform_private.holiday_calendars; v_anchor jsonb;\n')
        source=one(source,"  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;", "  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;\n  PERFORM platform_private.b2b_integration_dependencies();\n  v_choice:=platform_private.b2b_choice(p_payment_choice);\n  v_condition:=platform_private.b2b_resolve_condition(p_partner_id,p_payment_plan_id,v_choice);")
        # Pure amortization consumed by BOTH captured RPC bodies; due dates remain fiscal-relative.
        start=source.index('  v_final '); end=source.index('  v_interest :=',start)
        source=source[:start]+"  SELECT c.* INTO v_calendar FROM platform_private.holiday_calendars c WHERE c.version=v_condition->>'calendar_version';\n  IF NOT FOUND THEN RAISE EXCEPTION 'CALENDAR_VERSION_UNAVAILABLE' USING ERRCODE='23514'; END IF;\n  v_anchor:=jsonb_build_object('kind','PROVISIONAL_ISSUE_DATE','date',CURRENT_DATE,'calendar_version',v_calendar.version,'fiscal_due_dates_final',false);\n  v_rows:=CASE WHEN v_quote THEN '[]'::jsonb ELSE platform_private.b2b_schedule(v_net,(v_condition->>'monthly_rate')::numeric,(v_condition->>'installment_count')::int,CURRENT_DATE,(v_choice->>'payment_deadline_days')::int,v_calendar) END;\n  v_final:=CASE WHEN v_quote THEN 0 ELSE (SELECT sum((r->>'amount')::numeric) FROM jsonb_array_elements(v_rows) r) END;\n"+source[end:]
        source=source.replace('public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final)',"encode(sha256(convert_to(jsonb_build_object('cart',v_cart,'plan',p_payment_plan_id,'choice',v_choice,'condition',v_condition,'total',v_final)::text,'UTF8')),'hex')")
        # Remove legacy due override and synthetic 30-day scheduling; chosen deadline is anchored on issue.
        start=source.index('  IF p_first_due_date IS NOT NULL');end=source.index('  IF v_plan.requires_financial_approval',start)
        if name=='create':
            source=source[:start]+"  IF p_first_due_date IS NOT NULL THEN RAISE EXCEPTION 'FISCAL_ANCHOR_ONLY' USING ERRCODE='23514'; END IF;\n  v_first_due:=(v_rows->0->>'due_date')::date;\n  v_installments:=(v_condition->>'installment_count')::int;\n"+source[end:]
            a=source.index('  IF v_first_due > current_date');b=source.index('  IF v_quote THEN',a)
            source=source[:a]+"  v_hash:=encode(sha256(convert_to(jsonb_build_object('cart',v_cart,'plan',p_payment_plan_id,'choice',v_choice,'condition',v_condition,'total',v_final)::text,'UTF8')),'hex');\n  IF v_hash IS DISTINCT FROM p_expected_cart_hash THEN RAISE EXCEPTION 'cart_hash_mismatch' USING ERRCODE='PT409'; END IF;\n"+source[b:]
            a=source.index('    IF v_installments = 1 THEN');b=source.index('\n  END IF;',a)
            source=source[:a]+"    FOR v_line IN SELECT r FROM jsonb_array_elements(v_rows) r LOOP\n      INSERT INTO public.partner_order_payment_schedule(partner_order_id,payment_terms_id,installment_number,due_date,amount,principal_amount,interest_amount)\n      VALUES(v_order_id,v_terms_id,(v_line->>'installment_number')::int,(v_line->>'due_date')::date,(v_line->>'amount')::numeric,(v_line->>'principal_amount')::numeric,(v_line->>'interest_amount')::numeric);\n    END LOOP;"+source[b:]
            source=one(source,"      || '|partner='", "      || '|choice=' || v_choice::text || '|condition=' || v_condition::text\n      || '|partner='")
            source=one(source,'  v_result := jsonb_build_object(',"  v_result := jsonb_build_object('schedule_anchor',v_anchor,'first_due_date',v_first_due,'payment_choice',v_choice,'organization_id',public.h15_actor_organization(),'actor_id',v_uid,'partner_id',p_partner_id,")
            source=one(source,'  INSERT INTO public.partner_order_idempotency(',"  IF NOT v_quote THEN\n   INSERT INTO platform_private.b2b_order_condition_snapshots VALUES(v_order_id,public.h15_actor_organization(),p_partner_id,v_uid,p_payment_plan_id,v_choice,v_condition,v_req_fp,v_rows,v_net,v_interest,v_final);\n  END IF;\n\n  INSERT INTO public.partner_order_idempotency(")
            source=one(source,'    v_credit := public.fn_b2b_credit_exposure(p_partner_id, v_final, NULL);',"    PERFORM platform_private.b2b_integration_actor(p_partner_id);\n    v_condition:=platform_private.b2b_resolve_condition(p_partner_id,p_payment_plan_id,v_choice);\n    v_credit := public.fn_b2b_credit_exposure(p_partner_id, v_final, NULL);")
            a=source.index('  FOR v_admin IN'); b=source.index('  v_result :=',a)
            source=source[:a]+'  -- External and in-app communication remain OFF.\n'+source[b:]
            source=one(source,'  v_installments:=(v_condition->>\'installment_count\')::int;',"  IF p_installment_count IS NOT NULL AND p_installment_count<>(v_condition->>'installment_count')::int THEN RAISE EXCEPTION 'payment_choice_configuration_mismatch' USING ERRCODE='23514'; END IF;\n  v_installments:=(v_condition->>'installment_count')::int;")
            # Terms snapshot uses the accepted version, not mutable legacy plan economics.
            source=one(source,'v_plan.discount_percent, v_plan.monthly_interest_percent, v_plan.months_count,',"v_plan.discount_percent, (v_condition->>'monthly_rate')::numeric, (v_condition->>'installment_count')::numeric,")
            create=source
        else:
            source=source[:start]+"  IF p_first_due_date IS NOT NULL THEN RAISE EXCEPTION 'FISCAL_ANCHOR_ONLY' USING ERRCODE='23514'; END IF;\n  v_first_due:=(v_rows->0->>'due_date')::date;\n  v_installments:=(v_condition->>'installment_count')::int; v_schedule:=v_rows;\n"+source[end:]
            source=one(source,"  EXCEPTION WHEN OTHERS THEN v_credit := NULL; END;",'  EXCEPTION WHEN OTHERS THEN RAISE; END;')
            source=one(source,"  RETURN jsonb_build_object(","  RETURN jsonb_build_object('schedule_anchor',v_anchor,'payment_choice',v_choice,'organization_id',public.h15_actor_organization(),'actor_id',v_uid,")
            source=one(source,"'monthly_interest_percent', v_plan.monthly_interest_percent,","'monthly_interest_percent', (v_condition->>'monthly_rate')::numeric,")
            source=one(source,"'months_count', v_plan.months_count,","'months_count', (v_condition->>'installment_count')::int,")
            sim=source
    credit=body('fn_b2b_credit_exposure','213ac31f3a30816ead75365b0d1fed18')
    a=credit.index('  -- (a) recebiveis');b=credit.index('  v_proj :=',a)
    credit=credit[:a]+"  v_settings_json:=platform_private.b2b_credit_balances(p_partner_id,p_exclude_order_id);\n  v_open:=(v_settings_json->>'saldo_em_aberto')::numeric;\n  v_overdue:=(v_settings_json->>'saldo_vencido')::numeric;\n  v_committed:=(v_settings_json->>'comprometido_nao_faturado')::numeric;\n  v_pending:=(v_settings_json->>'comprometido_pendente')::numeric;\n"+credit[b:]
    credit=one(credit,'DECLARE\n','DECLARE\n  v_settings_json jsonb;\n')
    credit=one(credit,'BEGIN\n',"BEGIN\n  PERFORM platform_private.b2b_integration_actor(p_partner_id);\n  IF p_new_order_amount IS NULL OR p_new_order_amount<0 OR p_new_order_amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'CREDIT_AMOUNT_INVALID' USING ERRCODE='23514'; END IF;\n  IF platform_private.b2b_credit_config_block(p_partner_id) IS NOT NULL THEN RAISE EXCEPTION 'CREDIT_SETTINGS_INCOMPLETE' USING ERRCODE='PT409'; END IF;\n")
    credit=one(credit,' STABLE SECURITY DEFINER',' VOLATILE SECURITY DEFINER')
    # Existing payment RPC: validate projection under the installment lock before replay, canonical balance.
    money=json.loads((ROOT/'scripts/financial-installments-initial-20261024/receivable-semantics-live-20261028.json').read_text())
    pf=next(f for f in money['functions'] if f['signature']=='rpc_register_receivable_payment(uuid,jsonb)'); pay=pf['body']
    if hashlib.md5(pay.encode()).hexdigest()!='db41f7e2cfcb196ef64536f62746f365': raise ValueError('CAPTURE_PAYMENT_DRIFT')
    used.append({'name':'rpc_register_receivable_payment','md5':'db41f7e2cfcb196ef64536f62746f365'})
    pay=one(pay,'DECLARE\n','DECLARE\n  v_proven jsonb;\n')
    pay=one(pay,'  SELECT id, request_fingerprint INTO v_existing FROM public.receivable_payments\n   WHERE installment_id = p_installment_id AND idempotency_key = v_idem;',"  IF auth.uid() IS DISTINCT FROM v_uid OR public.h15_actor_organization() IS DISTINCT FROM v_org OR public.is_financial_staff(v_uid) IS NOT TRUE THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;\n  SELECT r INTO v_proven FROM jsonb_array_elements(public.rpc_receivable_money_projection_v1(v_inst.receivable_id,0,1000)) r WHERE r->>'id'=v_inst.id::text;\n  IF v_proven IS NULL THEN RAISE EXCEPTION 'MONEY_ORIGIN_UNPROVEN' USING ERRCODE='23514'; END IF;\n  SELECT id, request_fingerprint INTO v_existing FROM public.receivable_payments\n   WHERE installment_id = p_installment_id AND idempotency_key = v_idem;")
    pay=one(pay,'COALESCE(v_inst.interest_amount,0)',"((v_proven->>'interest_amount')::numeric-(v_proven->>'financed_interest_amount')::numeric)")
    generator=(ROOT/'scripts/financial-installments-initial-20261024/fn_generate_receivable_installments.sql.review').read_text()
    if hashlib.sha256(generator.encode()).hexdigest()!='3e0a1601b22bbf39bb5d05dae51a497c163a4a094d9765706ace4ffd4c1e2176': raise ValueError('GENERATOR_DRIFT')
    generator=one(generator,'  v_inst jsonb;','  v_inst jsonb;\n  v_fiscal platform_private.b2b_title_permits;')
    generator=one(generator,'  DELETE FROM platform_private.financial_initial_installments',"  DELETE FROM platform_private.b2b_title_permits WHERE transaction_id=txid_current() AND title_id=NEW.id RETURNING * INTO v_fiscal;\n  IF FOUND THEN\n    IF NEW.origin_type<>'B2B_ORDER' OR NEW.origin_id IS DISTINCT FROM v_fiscal.order_id OR NEW.organization_id IS DISTINCT FROM v_fiscal.organization_id OR auth.uid() IS DISTINCT FROM v_fiscal.actor_id THEN RAISE EXCEPTION 'B2B_GENERATOR_PERMIT_INVALID' USING ERRCODE='42501'; END IF;\n    PERFORM platform_private.b2b_integration_actor(v_fiscal.partner_id,true);\n    FOR v_inst IN SELECT r FROM jsonb_array_elements(v_fiscal.rows) r LOOP\n      INSERT INTO public.accounts_receivable_installments(organization_id,receivable_id,installment_number,due_date,original_amount,net_amount,status) VALUES(NEW.organization_id,NEW.id,(v_inst->>'installment_number')::int,(v_inst->>'due_date')::date,(v_inst->>'amount')::numeric,(v_inst->>'amount')::numeric,'OPEN');\n    END LOOP;\n    RETURN NEW;\n  END IF;\n  IF NEW.origin_type='B2B_ORDER' THEN RAISE EXCEPTION 'B2B_GENERATOR_PERMIT_REQUIRED' USING ERRCODE='42501'; END IF;\n  DELETE FROM platform_private.financial_initial_installments")
    result='-- GENERATED INACTIVE; exact captured bodies with reviewed deltas. NO INSTALL.\n'+create+';\n'+sim+';\n'+credit+';\n'+pay+';\n'+generator+'\n'
    # Existing broad shared guard denies a second B2B title. Only a fiscal permit may
    # net its own partial amount; all other branches remain unchanged and fenced.
    shared=(H.parent/'shared-credit-guard.sql.review').read_text()
    if hashlib.sha256(shared.encode()).hexdigest()!='540d47070562b86c619b87bd0950908296e38c092a546437bccd835dbf0da9d5': raise ValueError('SHARED_GUARD_DRIFT')
    a=shared.index('CREATE FUNCTION platform_private.b2b_shared_receivable_credit_guard()');b=shared.index('REVOKE ALL ON FUNCTION platform_private.b2b_shared_receivable_credit_guard()',a)
    shared=shared[a:b].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
    shared=one(shared,'BEGIN\n',"BEGIN\n  IF EXISTS(SELECT 1 FROM platform_private.b2b_title_permits p WHERE p.transaction_id=txid_current() AND p.title_id=NEW.id) THEN\n    PERFORM platform_private.b2b_integration_actor(NEW.partner_id,true);\n    IF NEW.total_amount>platform_private.b2b_order_residual(NEW.origin_id) THEN RAISE EXCEPTION 'CREDIT_OVERALLOCATED' USING ERRCODE='PT409'; END IF;\n    RETURN NEW;\n  END IF;\n")
    result+=shared
    result+="REVOKE ALL ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,int,text,text,jsonb),public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date,jsonb) FROM PUBLIC,anon,authenticated,service_role;\n"
    (H/'captured-deltas.sql.review').write_text(result)
    (H/'source-pins.json').write_text(json.dumps({'capture_sha256':hashlib.sha256(CAP.read_bytes()).hexdigest(),'functions':used,'candidate_sha256':hashlib.sha256(result.encode()).hexdigest()},indent=2)+'\n')
if __name__=='__main__':build()