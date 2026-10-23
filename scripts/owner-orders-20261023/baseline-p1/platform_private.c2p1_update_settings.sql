CREATE OR REPLACE FUNCTION platform_private.c2p1_update_settings(p_partner_id uuid, p_expected jsonb, p_values jsonb)
 RETURNS partner_financial_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE oldrow public.partner_financial_settings; newrow public.partner_financial_settings; result public.partner_financial_settings; k text;
BEGIN
 IF NOT platform_private.c2p1_settings_allowed(p_partner_id,true) THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Serialize absence and updates by canonical partner; lock actor/roles/organizations against revocation.
 PERFORM 1 FROM public.profiles WHERE user_id=auth.uid() FOR SHARE NOWAIT;
 PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() ORDER BY role FOR SHARE NOWAIT;
 PERFORM 1 FROM public.organizations WHERE id=public.h15_actor_organization() FOR SHARE NOWAIT;
 PERFORM 1 FROM public.partner_accounts WHERE id=p_partner_id FOR UPDATE;
 IF NOT platform_private.c2p1_settings_allowed(p_partner_id,true) THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object' THEN RAISE EXCEPTION 'C2P1_INVALID_PAYLOAD' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_values) LOOP
 IF k NOT IN ('billing_trigger','payment_terms_days','default_payment_method','credit_limit','block_if_overdue','auto_generate_receivable','active','credit_limit_action','overdue_tolerance_days','credit_alert_threshold_1','credit_alert_threshold_2')
 THEN RAISE EXCEPTION 'C2P1_INVALID_PAYLOAD' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(p_values))<>11 THEN RAISE EXCEPTION 'C2P1_INVALID_PAYLOAD' USING ERRCODE='22023'; END IF;
 SELECT * INTO oldrow FROM public.partner_financial_settings WHERE partner_id=p_partner_id FOR UPDATE;
 IF FOUND THEN
 IF p_expected IS NULL OR p_expected<>to_jsonb(oldrow) THEN RAISE EXCEPTION 'settings_conflict' USING ERRCODE='40001'; END IF;
 ELSE
 IF p_expected IS NOT NULL THEN RAISE EXCEPTION 'settings_conflict' USING ERRCODE='40001'; END IF;
 END IF;
 newrow=jsonb_populate_record(NULL::public.partner_financial_settings,p_values);
 -- Exact canonical name; method row lock prevents concurrent deactivation through commit.
 PERFORM 1 FROM public.payment_methods WHERE name=newrow.default_payment_method AND active IS TRUE FOR SHARE;
 IF (SELECT count(*) FROM public.payment_methods WHERE name=newrow.default_payment_method AND active IS TRUE)<>1
 THEN RAISE EXCEPTION 'C2P1_PAYMENT_METHOD_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM platform_private.issue_ticket('c2p1_settings_write',p_partner_id);
 IF oldrow.id IS NULL THEN
 INSERT INTO public.partner_financial_settings(partner_id,billing_trigger,payment_terms_days,default_payment_method,credit_limit,block_if_overdue,auto_generate_receivable,active,credit_limit_action,overdue_tolerance_days,credit_alert_threshold_1,credit_alert_threshold_2)
 VALUES(p_partner_id,newrow.billing_trigger,newrow.payment_terms_days,newrow.default_payment_method,newrow.credit_limit,newrow.block_if_overdue,newrow.auto_generate_receivable,newrow.active,newrow.credit_limit_action,newrow.overdue_tolerance_days,newrow.credit_alert_threshold_1,newrow.credit_alert_threshold_2) RETURNING * INTO result;
 ELSE
 UPDATE public.partner_financial_settings SET billing_trigger=newrow.billing_trigger,payment_terms_days=newrow.payment_terms_days,default_payment_method=newrow.default_payment_method,credit_limit=newrow.credit_limit,block_if_overdue=newrow.block_if_overdue,auto_generate_receivable=newrow.auto_generate_receivable,active=newrow.active,credit_limit_action=newrow.credit_limit_action,overdue_tolerance_days=newrow.overdue_tolerance_days,credit_alert_threshold_1=newrow.credit_alert_threshold_1,credit_alert_threshold_2=newrow.credit_alert_threshold_2 WHERE id=oldrow.id RETURNING * INTO result;
 END IF;
 DELETE FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope='c2p1_settings_write' AND target=p_partner_id;
 RETURN result;
END $function$

