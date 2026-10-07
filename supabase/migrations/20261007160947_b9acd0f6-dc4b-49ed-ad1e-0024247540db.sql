CREATE OR REPLACE FUNCTION platform_private.require_provisioned_admin_target(p_actor uuid,p_invite uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE j public.platform_org_admin_invites%ROWTYPE;
BEGIN
 PERFORM platform_private.require_service_role();
 IF p_actor IS NULL OR NOT public.is_platform_superadmin(p_actor) THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=p_invite;
 IF NOT FOUND OR j.user_id IS NULL OR j.user_id=p_actor OR public.is_platform_superadmin(j.user_id) OR j.status NOT IN ('ativo','pendente') OR NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id WHERE p.user_id=j.user_id AND p.organization_id=j.organization_id AND p.ativo IS TRUE AND o.ativo IS TRUE) OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=j.user_id AND r.role='administrador'::public.app_role) OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=j.user_id AND u.raw_app_meta_data->>'provisioning_request_id'=j.request_id::text) THEN RAISE EXCEPTION 'platform_target_denied' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.require_provisioned_admin_target(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.require_provisioned_admin_target(uuid,uuid) TO service_role;
DO $$
DECLARE f text; v_name text;
BEGIN
 FOREACH v_name IN ARRAY ARRAY['platform_begin_org_admin_email_change','platform_claim_admin_access','platform_org_admin_access_state'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO STRICT f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_name;
  IF strpos(f,'BEGIN')=0 THEN RAISE EXCEPTION 'required_anchor_missing'; END IF;
  IF strpos(f,'require_provisioned_admin_target')=0 THEN f:=replace(f,'BEGIN',E'BEGIN\n PERFORM platform_private.require_provisioned_admin_target(p_actor_id,p_invite_id);'); END IF;
  EXECUTE f;
 END LOOP;
 SELECT pg_get_functiondef('public.platform_claim_email_confirmation(uuid,uuid,boolean)'::regprocedure) INTO f;
 IF strpos(f,'IF NOT FOUND OR c.status')=0 THEN RAISE EXCEPTION 'required_anchor_missing'; END IF;
 f:=replace(f,'IF NOT FOUND OR c.status',E'IF FOUND THEN PERFORM platform_private.require_provisioned_admin_target(p_actor_id,c.invite_id); END IF;\n IF NOT FOUND OR c.status');
 f:=replace(f,'  RETURN t;', '  RETURN t;');
 IF strpos(f,'  RETURN t;')=0 AND strpos(f,' RETURN t;')=0 THEN RAISE EXCEPTION 'required_anchor_missing'; END IF;
 f:=replace(f,'RETURN t;',E'INSERT INTO public.platform_org_admin_audit(organization_id,target_user_id,invite_id,actor_user_id,action,status,reason,origin,idempotency_key,new_values) VALUES(c.organization_id,c.user_id,c.invite_id,p_actor_id,''email_change_requested'',''requested'',''Reenvio de confirmação pelo titular'',''email_confirmation_claim'',c.idempotency_key,jsonb_build_object(''ambiguous_retry_confirmed'',coalesce(p_confirm_ambiguous,false),''attempt'',c.attempt_count+1));\n RETURN t;');
 EXECUTE f;
 SELECT pg_get_functiondef('public.platform_complete_org_admin_email_change(uuid,uuid)'::regprocedure) INTO f;
 IF strpos(f,'IF c.status=''completed''')=0 THEN RAISE EXCEPTION 'required_anchor_missing'; END IF;
 f:=replace(f,'IF c.status=''completed''',E'PERFORM platform_private.require_provisioned_admin_target(p_actor_id,c.invite_id);\n IF c.status=''completed''');
 EXECUTE f;
 SELECT pg_get_functiondef('public.platform_finalize_org_admin_provisioning(uuid,uuid,uuid)'::regprocedure) INTO f;
 IF strpos(f,'senha_provisoria = true,')=0 THEN RAISE EXCEPTION 'required_anchor_missing'; END IF;
 f:=replace(f,E'senha_provisoria = true,\n           updated_at = now()', 'senha_provisoria = true');
 f:=regexp_replace(f,'senha_provisoria = true,[[:space:]]+updated_at = now\(\)','senha_provisoria = true','g');
 f:=replace(f,'SET desde = now(), pwd_digest = NULL','SET desde = now(), expires_at = now()+interval ''24 hours'', pwd_digest = NULL');
 IF strpos(f,'updated_at = now()')>0 AND strpos(f,'senha_provisoria = true,')>0 THEN RAISE EXCEPTION 'profile_anchor_not_replaced'; END IF;
 EXECUTE f;
END $$;
-- Only a verified JWT issuance timestamp can authorize the password finalizer.
CREATE OR REPLACE FUNCTION public.platform_first_access_valid(p_user_id uuid,p_recovery boolean,p_session_issued_at bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT p_session_issued_at IS NOT NULL AND p_session_issued_at>0 AND to_timestamp(p_session_issued_at)<=clock_timestamp()+interval '1 minute' AND EXISTS(SELECT 1 FROM public.profiles p JOIN platform_private.provisional_password_state s ON s.user_id=p.user_id WHERE p.user_id=p_user_id AND p.ativo IS TRUE AND p.senha_provisoria IS TRUE AND (s.expires_at>now() OR (p_recovery AND to_timestamp(p_session_issued_at)>s.desde))) AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_user_id AND (i.access_operation_status='processing' OR i.status='processando' OR (i.access_valid_after IS NOT NULL AND to_timestamp(p_session_issued_at)<=i.access_valid_after)));
$$;
REVOKE ALL ON FUNCTION public.platform_first_access_valid(uuid,boolean,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_first_access_valid(uuid,boolean,bigint) TO service_role;
CREATE OR REPLACE FUNCTION public.platform_first_access_valid(p_user_id uuid,p_recovery boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$ SELECT false; $$;
REVOKE ALL ON FUNCTION public.platform_first_access_valid(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_first_access_valid(uuid,boolean) TO service_role;
DO $$
DECLARE r record; f text;
BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='platform_claim_org_admin_provisioning' LOOP
  f:=pg_get_functiondef(r.oid);
  IF strpos(f,'IF FOUND THEN')=0 THEN RAISE EXCEPTION 'provisioning_anchor_missing'; END IF;
  f:=replace(f,'IF FOUND THEN',E'IF FOUND THEN\n IF EXISTS(SELECT 1 FROM public.platform_org_admin_email_changes c WHERE c.invite_id='||CASE WHEN strpos(f,'v_row.status')>0 THEN 'v_row.id' ELSE 'j.id' END||E' AND c.status IN (''requested'',''auth_updated'',''failed'')) THEN RAISE EXCEPTION ''email_change_pending'' USING ERRCODE=''55P03''; END IF;');
  EXECUTE f;
 END LOOP;
END $$;