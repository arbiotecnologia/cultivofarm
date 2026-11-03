CREATE OR REPLACE FUNCTION platform_private.global_product_fiscal_statement_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_WHEN<>'BEFORE' OR TG_LEVEL<>'STATEMENT' OR TG_OP NOT IN ('INSERT','UPDATE') OR TG_RELID<>'public.product_fiscal_profiles'::regclass THEN RAISE EXCEPTION 'invalid_fiscal_guard_context' USING ERRCODE='42501'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS NULL THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_GATE_UNAVAILABLE' USING ERRCODE='PT503'; END IF;
 RETURN NULL;
END $function$
