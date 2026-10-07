-- Canonical swzpzcwiasxmjutrmvkm. Fresh receivable has no installments.
DO $fix$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.generate_b2b_receivable_secure_impl(uuid)'::regprocedure);
 IF position('  DELETE FROM public.accounts_receivable_installments WHERE receivable_id = v_receivable_id;' IN d)=0 THEN RETURN; END IF;
 d:=replace(d,'  DELETE FROM public.accounts_receivable_installments WHERE receivable_id = v_receivable_id;','  -- b2b_f1_fresh_title: no deletion; formal financial history protection preserved.');
 EXECUTE d;
END $fix$;
REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) TO service_role;
-- Reversible by restoring the single prior DELETE statement, but this reopens
-- the proven FINANCIAL deletion guard failure; never disable the global guard.