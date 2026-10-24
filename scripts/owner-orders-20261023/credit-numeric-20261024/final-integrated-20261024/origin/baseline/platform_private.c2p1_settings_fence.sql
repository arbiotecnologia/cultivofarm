CREATE OR REPLACE FUNCTION platform_private.c2p1_settings_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP='DELETE' OR NOT platform_private.c2p1_settings_allowed(NEW.partner_id,true)
 OR NOT platform_private.has_ticket('c2p1_settings_write',NEW.partner_id) THEN
 RAISE EXCEPTION 'C2P1_SETTINGS_WRITE_CLOSED' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
 OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
 RAISE EXCEPTION 'C2P1_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM public.payment_methods WHERE active IS TRUE AND name=NEW.default_payment_method)<>1
 THEN RAISE EXCEPTION 'C2P1_PAYMENT_METHOD_INVALID' USING ERRCODE='22023'; END IF;
 IF NEW.credit_limit::text IN ('NaN','Infinity','-Infinity') OR NEW.credit_limit<0
 OR NEW.credit_alert_threshold_1::text IN ('NaN','Infinity','-Infinity')
 OR NEW.credit_alert_threshold_2::text IN ('NaN','Infinity','-Infinity')
 OR NEW.credit_alert_threshold_1 NOT BETWEEN 0 AND 100 OR NEW.credit_alert_threshold_2 NOT BETWEEN 0 AND 100
 OR NEW.credit_alert_threshold_1>NEW.credit_alert_threshold_2
 THEN RAISE EXCEPTION 'C2P1_FINANCIAL_VALUES_INVALID' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $function$
