CREATE OR REPLACE FUNCTION platform_private.product_dossier_upload_cancel_begin(p_upload_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE u platform_private.product_dossier_uploads; d public.microorganism_regulatory_dossiers; BEGIN
SELECT * INTO u FROM platform_private.product_dossier_uploads WHERE id=p_upload_id;
PERFORM platform_private.product_dossier_manage_scope(u.product_id);
SELECT * INTO d FROM public.microorganism_regulatory_dossiers WHERE id=u.dossier_id FOR UPDATE;
SELECT * INTO u FROM platform_private.product_dossier_uploads WHERE id=p_upload_id FOR UPDATE;
PERFORM platform_private.product_dossier_manage_scope(u.product_id,d.microorganism_id);
IF u.actor_id IS DISTINCT FROM auth.uid() OR u.state NOT IN ('RESERVED','VERIFIED','CANCELLING') OR d.status NOT IN ('DRAFT','PENDING_REVIEW') THEN RAISE EXCEPTION 'REGULATORY_CANCEL_DENIED' USING ERRCODE='42501'; END IF;
UPDATE platform_private.product_dossier_uploads SET state='CANCELLING',updated_at=clock_timestamp() WHERE id=u.id;
RETURN jsonb_build_object('id',u.id,'product_id',u.product_id,'storage_path',u.storage_path,'state','CANCELLING'); END $$;
REVOKE ALL ON FUNCTION platform_private.product_dossier_upload_cancel_begin(uuid) FROM PUBLIC,anon,service_role; GRANT EXECUTE ON FUNCTION platform_private.product_dossier_upload_cancel_begin(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.platform_product_dossier_upload_cancel_begin(p_upload_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.product_dossier_upload_cancel_begin(p_upload_id) $$;
REVOKE ALL ON FUNCTION public.platform_product_dossier_upload_cancel_begin(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.platform_product_dossier_upload_cancel_begin(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION platform_private.product_dossier_upload_cancel(p_upload_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN PERFORM platform_private.require_service_role();
UPDATE platform_private.product_dossier_uploads SET state='CANCELLED',updated_at=clock_timestamp() WHERE id=p_upload_id AND state='CANCELLING' AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='fiscal-regulatorio' AND o.name=storage_path);
IF NOT FOUND THEN RAISE EXCEPTION 'REGULATORY_UPLOAD_CLEANUP_PENDING' USING ERRCODE='55006'; END IF; END $$;
DO $$ DECLARE b text; BEGIN
b:=pg_get_functiondef('platform_private.product_dossier_upload_access(uuid)'::regprocedure);b:=replace(b,$s$u.state='CANCELLED'$s$,$s$u.state IN ('CANCELLED','CANCELLING')$s$);EXECUTE b;
b:=pg_get_functiondef('platform_private.product_dossier_upload_pending(uuid)'::regprocedure);b:=replace(b,$s$state IN ('RESERVED','VERIFIED')$s$,$s$state IN ('RESERVED','VERIFIED','CANCELLING')$s$);EXECUTE b;
b:=pg_get_functiondef('platform_private.product_dossier_management_submit(uuid,uuid,timestamptz)'::regprocedure);b:=replace(b,$s$state IN ('RESERVED','VERIFIED')$s$,$s$state IN ('RESERVED','VERIFIED','CANCELLING')$s$);EXECUTE b;
b:=pg_get_functiondef('platform_private.product_dossier_upload_prepare(uuid,uuid,timestamptz,uuid,jsonb)'::regprocedure);
b:=replace(b,'RETURN to_jsonb(u)-''actor_id''-''intent''; END IF;', 'IF u.state IN (''CANCELLING'',''CANCELLED'') THEN RAISE EXCEPTION ''REGULATORY_UPLOAD_CANCELLED'' USING ERRCODE=''55006''; END IF; RETURN to_jsonb(u)-''actor_id''-''intent''; END IF;');
b:=replace(b,'sz:=(p_intent', 'PERFORM nullif(p_intent->>''issued_at'','''')::date; PERFORM nullif(p_intent->>''valid_until'','''')::date; IF nullif(p_intent->>''valid_until'','''')::date < nullif(p_intent->>''issued_at'','''')::date THEN RAISE EXCEPTION ''REGULATORY_DATE_INVALID'' USING ERRCODE=''22023''; END IF; sz:=(p_intent');EXECUTE b;
END $$;