DO $$ DECLARE b text; f record; guard text; BEGIN
b:=pg_get_functiondef('platform_private.product_dossier_upload_finalize(uuid)'::regprocedure);
b:=replace(b,'INSERT INTO platform_private.product_dossier_write_permits', $s$IF NOT ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(u.intent->'microorganism_ids','[]'::jsonb))) <@ platform_private.product_dossier_coverage(d.id) THEN RAISE EXCEPTION 'REGULATORY_DOCUMENT_COVERAGE_CONFLICT' USING ERRCODE='PT409'; END IF;
INSERT INTO platform_private.product_dossier_write_permits$s$); EXECUTE b;
b:=pg_get_functiondef('platform_private.product_dossier_management_create(uuid,uuid)'::regprocedure); b:=replace(b,'WHERE microorganism_id=p_microorganism_id','WHERE product_id=p_product_id'); EXECUTE b;
FOR f IN SELECT p.oid,p.proname,pg_get_function_identity_arguments(p.oid) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('rpc_regulatory_checklist_set','rpc_regulatory_document_register','rpc_regulatory_document_soft_delete','rpc_regulatory_dossier_new_version','rpc_regulatory_dossier_submit','rpc_regulatory_dossier_update_draft','rpc_regulatory_ncm_candidate_add','rpc_regulatory_ncm_candidate_decide','rpc_regulatory_presentation_upsert') LOOP
b:=pg_get_functiondef(f.oid);
IF position('p_dossier_id uuid' in f.args)>0 THEN guard:='IF NOT platform_private.product_dossier_row_read(p_dossier_id) THEN RAISE EXCEPTION ''REGULATORY_FORBIDDEN'' USING ERRCODE=''42501''; END IF;';
ELSIF position('p_document_id uuid' in f.args)>0 THEN guard:='IF NOT platform_private.product_dossier_row_read((SELECT dossier_id FROM public.microorganism_regulatory_documents WHERE id=p_document_id)) THEN RAISE EXCEPTION ''REGULATORY_FORBIDDEN'' USING ERRCODE=''42501''; END IF;';
ELSIF position('p_candidate_id uuid' in f.args)>0 THEN guard:='IF NOT platform_private.product_dossier_row_read((SELECT dossier_id FROM public.microorganism_ncm_candidates WHERE id=p_candidate_id)) THEN RAISE EXCEPTION ''REGULATORY_FORBIDDEN'' USING ERRCODE=''42501''; END IF;';
ELSE guard:='PERFORM platform_private.regulatory_product_scope(p_microorganism_id);'; END IF;
b:=regexp_replace(b,'BEGIN','BEGIN '||guard); EXECUTE b;
END LOOP; END $$;