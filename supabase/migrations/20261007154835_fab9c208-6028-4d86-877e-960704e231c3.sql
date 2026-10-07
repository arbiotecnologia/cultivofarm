ALTER TABLE platform_private.provisional_password_state ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.platform_org_admin_invites ADD COLUMN IF NOT EXISTS access_operation_id uuid, ADD COLUMN IF NOT EXISTS access_operation_kind text, ADD COLUMN IF NOT EXISTS access_operation_status text, ADD COLUMN IF NOT EXISTS access_requested_at timestamptz, ADD COLUMN IF NOT EXISTS access_expires_at timestamptz, ADD COLUMN IF NOT EXISTS access_valid_after timestamptz;
ALTER TABLE public.platform_org_admin_email_changes ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz, ADD COLUMN IF NOT EXISTS confirmation_expires_at timestamptz, ADD COLUMN IF NOT EXISTS confirmation_next_attempt_at timestamptz, ADD COLUMN IF NOT EXISTS confirmation_lease uuid, ADD COLUMN IF NOT EXISTS confirmation_lease_expires_at timestamptz, ADD COLUMN IF NOT EXISTS confirmation_delivery_status text;
ALTER TABLE public.platform_org_admin_audit DROP CONSTRAINT IF EXISTS platform_org_admin_audit_action_check;
ALTER TABLE public.platform_org_admin_audit ADD CONSTRAINT platform_org_admin_audit_action_check CHECK(action IN ('admin_profile_updated','principal_transferred','email_change_requested','email_change_completed','email_change_failed','access_requested','access_completed','access_failed','password_self_completed'));
CREATE OR REPLACE FUNCTION public.platform_actor_access_ready(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE)
 AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_user AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL AND (p_user IS DISTINCT FROM auth.uid() OR to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint,0))<=i.access_valid_after))));
$$;
REVOKE ALL ON FUNCTION public.platform_actor_access_ready(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_actor_access_ready(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
 SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND public.platform_actor_access_ready(p.user_id);
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.ativo IS TRUE AND public.platform_actor_access_ready(p.user_id));
$$;
CREATE OR REPLACE FUNCTION public.platform_claim_admin_access(p_actor_id uuid,p_invite_id uuid,p_operation_id uuid,p_kind text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE j public.platform_org_admin_invites%ROWTYPE; t uuid:=gen_random_uuid();
BEGIN
 PERFORM platform_private.require_service_role();
 IF p_actor_id IS NULL OR NOT public.is_platform_superadmin(p_actor_id) OR p_kind NOT IN ('temporary_password','password_link') OR p_operation_id IS NULL THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=p_invite_id FOR UPDATE;
 IF NOT FOUND OR j.user_id IS NULL OR j.user_id=p_actor_id OR public.is_platform_superadmin(j.user_id) OR j.status NOT IN ('ativo','pendente') OR NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id WHERE p.user_id=j.user_id AND p.organization_id=j.organization_id AND p.ativo AND o.ativo) THEN RAISE EXCEPTION 'platform_target_denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_org_admin_email_changes c WHERE c.invite_id=j.id AND c.status IN ('requested','auth_updated','failed')) THEN RAISE EXCEPTION 'email_change_pending' USING ERRCODE='55P03'; END IF;
 IF j.access_operation_id=p_operation_id THEN
  IF j.access_operation_kind<>p_kind THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='40001'; END IF;
  IF j.access_operation_status IN ('completed','ambiguous') THEN RETURN jsonb_build_object('idempotent',true,'status',j.access_operation_status); END IF;
 END IF;
 IF (j.lease_expires_at>clock_timestamp()) OR j.status='processando' OR j.email_delivery_status='sending' OR (j.access_requested_at>clock_timestamp()-interval '5 minutes') THEN RAISE EXCEPTION 'access_cooldown_or_busy' USING ERRCODE='55P03'; END IF;
 IF (SELECT count(*) FROM public.platform_org_admin_audit WHERE actor_user_id=p_actor_id AND action='access_requested' AND created_at>now()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'access_rate_limit' USING ERRCODE='53400'; END IF;
 UPDATE public.platform_org_admin_invites SET access_operation_id=p_operation_id,access_operation_kind=p_kind,access_operation_status='processing',access_requested_at=clock_timestamp(),lease_token=t,lease_expires_at=clock_timestamp()+interval '2 minutes',updated_at=now() WHERE id=j.id;
 IF p_kind='temporary_password' THEN
  UPDATE public.profiles SET senha_provisoria=true,updated_at=now() WHERE user_id=j.user_id;
  INSERT INTO platform_private.provisional_password_state(user_id,desde,expires_at) VALUES(j.user_id,now(),now()+interval '24 hours') ON CONFLICT(user_id) DO UPDATE SET desde=now(),expires_at=now()+interval '24 hours',pwd_digest=NULL;
 END IF;
 INSERT INTO public.platform_org_admin_audit(organization_id,target_user_id,invite_id,actor_user_id,action,status,reason,origin,idempotency_key,new_values) VALUES(j.organization_id,j.user_id,j.id,p_actor_id,'access_requested','requested','Gestão segura de acesso','platform_invite_org_admin',p_operation_id,jsonb_build_object('kind',p_kind));
 RETURN jsonb_build_object('user_id',j.user_id,'email',j.email,'nome',j.nome,'lease_token',t,'organization_id',j.organization_id,'status',j.status);
END $$;
REVOKE ALL ON FUNCTION public.platform_claim_admin_access(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_claim_admin_access(uuid,uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.platform_finish_admin_access(p_actor_id uuid,p_invite_id uuid,p_operation_id uuid,p_lease_token uuid,p_outcome text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE j public.platform_org_admin_invites%ROWTYPE;
BEGIN
 PERFORM platform_private.require_service_role();
 IF NOT public.is_platform_superadmin(p_actor_id) OR p_outcome NOT IN ('completed','failed','ambiguous') THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=p_invite_id FOR UPDATE;
 IF j.access_operation_id IS DISTINCT FROM p_operation_id OR j.lease_token IS DISTINCT FROM p_lease_token OR j.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'stale_lease' USING ERRCODE='55P03'; END IF;
 UPDATE public.platform_org_admin_invites SET access_operation_status=p_outcome,lease_token=NULL,lease_expires_at=NULL,access_expires_at=CASE WHEN j.access_operation_kind='temporary_password' THEN now()+interval '24 hours' ELSE NULL END,access_valid_after=CASE WHEN j.access_operation_kind='temporary_password' AND p_outcome='completed' THEN clock_timestamp() ELSE access_valid_after END,email_last_attempt_at=CASE WHEN j.access_operation_kind='password_link' THEN j.access_requested_at ELSE email_last_attempt_at END,email_next_attempt_at=j.access_requested_at+interval '5 minutes',email_accepted_at=CASE WHEN j.access_operation_kind='password_link' AND p_outcome='completed' THEN now() ELSE email_accepted_at END,updated_at=now() WHERE id=j.id;
 INSERT INTO public.platform_org_admin_audit(organization_id,target_user_id,invite_id,actor_user_id,action,status,reason,origin,idempotency_key,new_values) VALUES(j.organization_id,j.user_id,j.id,p_actor_id,CASE WHEN p_outcome='completed' THEN 'access_completed' ELSE 'access_failed' END,CASE WHEN p_outcome='completed' THEN 'succeeded' ELSE 'failed' END,'Gestão segura de acesso','platform_invite_org_admin',p_operation_id,jsonb_build_object('kind',j.access_operation_kind,'outcome',p_outcome));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.platform_finish_admin_access(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_finish_admin_access(uuid,uuid,uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.platform_first_access_valid(p_user_id uuid,p_recovery boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN platform_private.provisional_password_state s ON s.user_id=p.user_id WHERE p.user_id=p_user_id AND p.ativo AND p.senha_provisoria AND (p_recovery OR s.expires_at IS NULL OR s.expires_at>now()));
$$;
REVOKE ALL ON FUNCTION public.platform_first_access_valid(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_first_access_valid(uuid,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.platform_claim_email_confirmation(p_actor_id uuid,p_op_id uuid,p_confirm_ambiguous boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE c public.platform_org_admin_email_changes%ROWTYPE; t uuid:=gen_random_uuid();
BEGIN
 PERFORM platform_private.require_service_role(); IF NOT public.is_platform_superadmin(p_actor_id) THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.platform_org_admin_email_changes WHERE id=p_op_id FOR UPDATE;
 IF NOT FOUND OR c.status NOT IN ('requested','failed') OR c.user_id IS NULL OR c.user_id=p_actor_id OR public.is_platform_superadmin(c.user_id) THEN RAISE EXCEPTION 'platform_target_denied' USING ERRCODE='42501'; END IF;
 IF c.confirmation_next_attempt_at>clock_timestamp() OR c.confirmation_lease_expires_at>clock_timestamp() THEN RAISE EXCEPTION 'email_confirmation_cooldown' USING ERRCODE='55P03'; END IF;
 IF c.confirmation_delivery_status IN ('sending','ambiguous') AND NOT p_confirm_ambiguous THEN RAISE EXCEPTION 'email_ambiguous_confirmation_required' USING ERRCODE='55P03'; END IF;
 IF c.attempt_count>=20 THEN RAISE EXCEPTION 'email_confirmation_rate_limit' USING ERRCODE='53400'; END IF;
 UPDATE public.platform_org_admin_email_changes SET status='requested',confirmation_lease=t,confirmation_lease_expires_at=clock_timestamp()+interval '2 minutes',confirmation_next_attempt_at=clock_timestamp()+interval '5 minutes',confirmation_expires_at=clock_timestamp()+interval '24 hours',confirmation_delivery_status='sending',attempt_count=attempt_count+1,updated_at=now() WHERE id=c.id;
 RETURN t;
END $$;
REVOKE ALL ON FUNCTION public.platform_claim_email_confirmation(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_claim_email_confirmation(uuid,uuid,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.platform_finish_email_confirmation(p_actor_id uuid,p_op_id uuid,p_lease uuid,p_outcome text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 PERFORM platform_private.require_service_role(); IF NOT public.is_platform_superadmin(p_actor_id) OR p_outcome NOT IN ('sent','failed','ambiguous') THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
 UPDATE public.platform_org_admin_email_changes SET confirmation_delivery_status=p_outcome,confirmation_sent_at=CASE WHEN p_outcome='sent' THEN now() ELSE confirmation_sent_at END,confirmation_lease=NULL,confirmation_lease_expires_at=NULL,last_error_code=CASE WHEN p_outcome='sent' THEN NULL ELSE 'confirmation_delivery_unconfirmed' END,updated_at=now() WHERE id=p_op_id AND confirmation_lease=p_lease AND confirmation_lease_expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'stale_lease' USING ERRCODE='55P03'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.platform_finish_email_confirmation(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_finish_email_confirmation(uuid,uuid,uuid,text) TO service_role;
-- Remove the previous reserved-schema session DELETE; Auth owns revocation.
CREATE OR REPLACE FUNCTION public.platform_complete_org_admin_email_change(p_actor_id uuid,p_op_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE c public.platform_org_admin_email_changes%ROWTYPE; j public.platform_org_admin_invites%ROWTYPE;
BEGIN
 PERFORM platform_private.require_service_role(); IF NOT public.is_platform_superadmin(p_actor_id) THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.platform_org_admin_email_changes WHERE id=p_op_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'platform_target_denied' USING ERRCODE='42501'; END IF;
 IF c.status='completed' THEN RETURN jsonb_build_object('status','completed','idempotent',true); END IF;
 IF c.status NOT IN ('requested','auth_updated','failed') OR c.confirmation_sent_at IS NULL OR c.user_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=c.user_id AND lower(u.email)=c.new_email AND u.email_confirmed_at IS NOT NULL AND COALESCE(u.email_change,'')='') THEN RAISE EXCEPTION 'email_confirmation_required' USING ERRCODE='55000'; END IF;
 SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=c.invite_id FOR UPDATE;
 IF j.user_id IS DISTINCT FROM c.user_id OR lower(j.email)<>c.old_email OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=c.user_id AND organization_id=c.organization_id) THEN RAISE EXCEPTION 'platform_target_denied' USING ERRCODE='42501'; END IF;
 UPDATE public.profiles SET email=c.new_email,updated_at=now() WHERE user_id=c.user_id AND organization_id=c.organization_id;
 UPDATE public.platform_org_admin_invites SET email=c.new_email,access_valid_after=clock_timestamp(),updated_at=now() WHERE id=j.id;
 UPDATE public.platform_org_admin_email_changes SET status='completed',completed_at=now(),last_error_code=NULL,updated_at=now() WHERE id=c.id;
 INSERT INTO public.platform_org_admin_audit(organization_id,target_user_id,invite_id,actor_user_id,action,status,reason,origin,idempotency_key,old_values,new_values) VALUES(c.organization_id,c.user_id,c.invite_id,p_actor_id,'email_change_completed','succeeded',c.reason,'auth_confirmed_reconciliation',c.idempotency_key,jsonb_build_object('email','***'),jsonb_build_object('email','***'));
 RETURN jsonb_build_object('status','completed','idempotent',false);
END $$;
-- Failed requests with issued confirmation links must not be silently superseded.
CREATE OR REPLACE FUNCTION platform_private.cancel_stale_email_change(p_invite_id uuid,p_actor_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$ BEGIN RETURN; END $$;
