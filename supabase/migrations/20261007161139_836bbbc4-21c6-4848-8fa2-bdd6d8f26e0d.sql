DO $$ DECLARE f text; BEGIN
 SELECT pg_get_functiondef('public.platform_claim_admin_access(uuid,uuid,uuid,text)'::regprocedure) INTO STRICT f;
 IF strpos(f,'p_kind text)')=0 OR strpos(f,'IF j.access_operation_id=p_operation_id THEN')=0 THEN RAISE EXCEPTION 'access_anchor_missing'; END IF;
 f:=replace(f,'p_kind text)','p_kind text, p_confirm_ambiguous boolean)');
 f:=replace(f,'IF j.access_operation_id=p_operation_id THEN',E'IF j.access_operation_status IN (''ambiguous'',''processing'') AND j.access_operation_id IS DISTINCT FROM p_operation_id AND NOT coalesce(p_confirm_ambiguous,false) THEN RAISE EXCEPTION ''access_ambiguous_requires_confirmation'' USING ERRCODE=''55P03''; END IF;\n IF j.access_operation_id=p_operation_id THEN');
 f:=replace(f,'jsonb_build_object(''kind'',p_kind)','jsonb_build_object(''kind'',p_kind,''ambiguous_retry_confirmed'',coalesce(p_confirm_ambiguous,false))');
 EXECUTE f;
END $$;
REVOKE ALL ON FUNCTION public.platform_claim_admin_access(uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_claim_admin_access(uuid,uuid,uuid,text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.platform_claim_admin_access(p_actor_id uuid,p_invite_id uuid,p_operation_id uuid,p_kind text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO '' AS $$ SELECT public.platform_claim_admin_access(p_actor_id,p_invite_id,p_operation_id,p_kind,false); $$;
REVOKE ALL ON FUNCTION public.platform_claim_admin_access(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_claim_admin_access(uuid,uuid,uuid,text) TO service_role;