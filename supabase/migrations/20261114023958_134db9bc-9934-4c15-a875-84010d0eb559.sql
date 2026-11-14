DO $$ DECLARE f record; b text; BEGIN
FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('rpc_regulatory_review_decide','rpc_regulatory_dossier_publish','rpc_regulatory_dossier_block','rpc_regulatory_sod_override') LOOP
b:=pg_get_functiondef(f.oid);
IF position('BEGIN' in b)=0 THEN RAISE EXCEPTION 'REGULATORY_FORMAL_DRIFT'; END IF;
b:=regexp_replace(b,'BEGIN', $s$BEGIN IF NOT platform_private.product_dossier_row_read(p_dossier_id) THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;$s$);
b:=replace(b,'UPDATE public.microorganism_regulatory_dossiers', $s$IF NOT platform_private.product_dossier_row_read(p_dossier_id) THEN RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501'; END IF;
INSERT INTO platform_private.product_dossier_write_permits(txid,dossier_id) SELECT txid_current(),p_dossier_id WHERE EXISTS(SELECT 1 FROM public.microorganism_regulatory_dossiers WHERE id=p_dossier_id AND product_id IS NOT NULL) ON CONFLICT DO NOTHING;
UPDATE public.microorganism_regulatory_dossiers$s$);
b:=replace(b,'RETURN ', 'DELETE FROM platform_private.product_dossier_write_permits WHERE txid=txid_current() AND dossier_id=p_dossier_id; RETURN ');
EXECUTE b;
END LOOP; END $$;