-- Standalone synthetic fixture. Mirrors hosted service guard, core definitions and role ACLs.
CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
CREATE SCHEMA platform_private; CREATE SCHEMA storage;
REVOKE ALL ON SCHEMA platform_private FROM PUBLIC,service_role,authenticated,anon;
CREATE TABLE platform_private.product_dossier_uploads(id uuid,state text,updated_at timestamptz,sha256 text,size_bytes bigint,mime text,storage_path text);
CREATE TABLE storage.objects(bucket_id text,name text);
CREATE FUNCTION platform_private.require_service_role() RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$ DECLARE v_role text; BEGIN
v_role:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
IF v_role<>'service_role' THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF; END $$;
CREATE FUNCTION platform_private.product_dossier_upload_attest(p_upload_id uuid,p_sha256 text,p_size bigint,p_mime text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
PERFORM platform_private.require_service_role(); UPDATE platform_private.product_dossier_uploads SET state='VERIFIED',updated_at=clock_timestamp() WHERE id=p_upload_id AND state IN ('RESERVED','VERIFIED') AND sha256=p_sha256 AND size_bytes=p_size AND mime=p_mime;
IF NOT FOUND THEN RAISE EXCEPTION 'REGULATORY_UPLOAD_INTEGRITY' USING ERRCODE='22023'; END IF; END $$;
CREATE FUNCTION platform_private.product_dossier_upload_cancel(p_upload_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
PERFORM platform_private.require_service_role(); UPDATE platform_private.product_dossier_uploads SET state='CANCELLED',updated_at=clock_timestamp() WHERE id=p_upload_id AND state='CANCELLING' AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='fiscal-regulatorio' AND o.name=storage_path);
IF NOT FOUND THEN RAISE EXCEPTION 'REGULATORY_UPLOAD_CLEANUP_PENDING' USING ERRCODE='55006'; END IF; END $$;
REVOKE ALL ON FUNCTION platform_private.product_dossier_upload_attest(uuid,text,bigint,text),platform_private.product_dossier_upload_cancel(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.product_dossier_upload_attest(uuid,text,bigint,text),platform_private.product_dossier_upload_cancel(uuid) TO service_role;