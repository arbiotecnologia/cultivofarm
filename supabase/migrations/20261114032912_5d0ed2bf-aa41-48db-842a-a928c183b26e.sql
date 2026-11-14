DO $$ DECLARE body text; BEGIN
body:=pg_get_functiondef('public.fn_microorganism_regulatory_facts(uuid)'::regprocedure);
IF position('AND (SELECT ok FROM g)' in body)=0 THEN RAISE EXCEPTION 'REGULATORY_FACTS_GUARD_DRIFT'; END IF;
body:=replace(body,'AND (SELECT ok FROM g)','AND (SELECT ok FROM g) AND platform_private.product_dossier_row_read(id)');
EXECUTE body;
END $$;