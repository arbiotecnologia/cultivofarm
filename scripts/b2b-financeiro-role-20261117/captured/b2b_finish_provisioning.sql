CREATE OR REPLACE FUNCTION public.b2b_finish_provisioning(p_claim uuid, p_fence uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r platform_private.b2b_provisioning_receipts; actor public.profiles; target public.profiles; invitation jsonb; ctx jsonb; rs public.app_role[];
BEGIN
 PERFORM platform_private.require_service_role();
 -- Acquire before receipt/profile locks, never wait for the trigger gate afterward.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 SELECT * INTO r FROM platform_private.b2b_provisioning_receipts WHERE id=p_claim FOR UPDATE;
 IF r.id IS NULL OR r.fence IS DISTINCT FROM p_fence OR r.user_id IS DISTINCT FROM p_user THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 rs:=COALESCE(r.external_roles,ARRAY[r.external_role]);
 PERFORM 1 FROM public.platform_org_admin_invites WHERE user_id=r.actor_id ORDER BY id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_array(id,access_operation_id,access_operation_status,status,access_valid_after) ORDER BY id),'[]'::jsonb) INTO invitation FROM public.platform_org_admin_invites WHERE user_id=r.actor_id;
 IF invitation IS DISTINCT FROM r.actor_invite_fence OR EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=r.actor_id AND (i.access_operation_status='processing' OR i.status='processando' OR (i.access_valid_after IS NOT NULL AND to_timestamp(r.actor_iat)<=i.access_valid_after))) THEN
 RAISE EXCEPTION 'b2b_provisioning_actor_revoked' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.profiles WHERE user_id=r.actor_id FOR UPDATE;
 IF r.external_roles IS NULL THEN ctx:=platform_private.external_provisioning_scope(r.actor_id,r.external_role,r.partner_id,r.cliente_ids,r.principal_cliente_id); ELSE ctx:=platform_private.external_provisioning_scope(r.actor_id,rs,r.partner_id,r.cliente_ids,r.principal_cliente_id); END IF;
 IF ctx->'snapshot' IS DISTINCT FROM r.target_snapshot THEN RAISE EXCEPTION 'external_provisioning_target_changed' USING ERRCODE='42501'; END IF;
 IF actor.organization_id IS DISTINCT FROM r.organization_id OR actor.updated_at IS DISTINCT FROM r.actor_stamp
 OR NOT platform_private.platform_actor_access_ready(r.actor_id)
 OR NOT public.has_role(r.actor_id,'administrador'::public.app_role)
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=r.organization_id AND o.ativo IS TRUE AND o.status='ativa')
 THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF r.status='completed' THEN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=r.user_id AND lower(email)=r.email AND raw_app_meta_data->>'b2b_provisioning_receipt'=r.id::text) THEN RAISE EXCEPTION 'b2b_provisioning_target_conflict'; END IF;
 RETURN jsonb_build_object('success',true,'user_id',r.user_id,'replay',true);
 END IF;
 IF r.status<>'claimed' THEN
  RAISE EXCEPTION 'b2b_provisioning_stale' USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM public.profiles WHERE user_id=p_user FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=r.user_id AND lower(u.email)=r.email
   AND u.raw_app_meta_data->>'b2b_provisioning_receipt'=r.id::text)
 OR target.user_id IS NULL OR target.organization_id IS NOT NULL OR target.cliente_id IS NOT NULL
 OR lower(target.email) IS DISTINCT FROM r.email
 OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM public.partner_users WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM public.user_clientes WHERE user_id=p_user) THEN
  RAISE EXCEPTION 'b2b_provisioning_target_conflict' USING ERRCODE='42501'; END IF;
 -- Existing server-only first-access contract; recovery proof required, no operator password.
 UPDATE public.profiles SET organization_id=r.organization_id,nome=r.nome,ativo=true,senha_provisoria=true WHERE user_id=p_user;
 PERFORM public.admin_provision_user_profile_v1(p_user,r.email,r.nome,rs,r.cliente_ids,r.principal_cliente_id,r.partner_id,CASE WHEN r.partner_id IS NULL THEN NULL WHEN 'parceiro_b2b'=ANY(rs) THEN 'gestor' ELSE 'tecnico' END);
 UPDATE public.user_clientes SET is_active=true,assigned_by=r.actor_id WHERE user_id=p_user;

 INSERT INTO platform_private.provisional_password_state(user_id,desde,expires_at)
 VALUES(p_user,clock_timestamp(),NULL);
 UPDATE platform_private.b2b_provisioning_receipts SET status='completed' WHERE id=r.id;
 RETURN jsonb_build_object('success',true,'user_id',p_user,'first_access_pending',true);
END $function$
