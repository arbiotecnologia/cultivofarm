CREATE OR REPLACE FUNCTION platform_private.conclude_provisional_password_server(p_user_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE j public.platform_org_admin_invites%ROWTYPE;
BEGIN
 PERFORM platform_private.require_service_role();
 IF p_user_id IS NULL OR public.is_platform_superadmin(p_user_id) THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.platform_org_admin_invites WHERE user_id=p_user_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 PERFORM platform_private.issue_ticket('pwd_conclude',p_user_id);
 UPDATE public.profiles SET senha_provisoria=false,updated_at=now() WHERE user_id=p_user_id AND senha_provisoria IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'platform_primeiro_acesso_nao_pendente' USING ERRCODE='22023'; END IF;
 UPDATE public.platform_org_admin_invites SET status='ativo',concluido_em=now(),access_valid_after=clock_timestamp(),access_expires_at=NULL,access_operation_status='completed' WHERE user_id=p_user_id;
 DELETE FROM platform_private.provisional_password_state WHERE user_id=p_user_id;
 IF j.id IS NOT NULL THEN INSERT INTO public.platform_org_admin_audit(organization_id,target_user_id,invite_id,actor_user_id,action,status,reason,origin,idempotency_key) VALUES(j.organization_id,p_user_id,j.id,p_user_id,'password_self_completed','succeeded','Senha pessoal definida pelo titular','platform_complete_first_access',gen_random_uuid()); END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION platform_private.conclude_provisional_password_server(uuid) FROM PUBLIC,anon,authenticated;
-- Preserve existing legacy rows; expire new provisional state from its creation time.
ALTER TABLE platform_private.provisional_password_state ALTER COLUMN expires_at SET DEFAULT (now()+interval '24 hours');
CREATE OR REPLACE FUNCTION public.platform_org_admin_access_state(p_actor_id uuid,p_invite_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE j public.platform_org_admin_invites%ROWTYPE; pending boolean; exp timestamptz; active boolean;
BEGIN
 PERFORM platform_private.require_service_role(); IF NOT public.is_platform_superadmin(p_actor_id) THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=p_invite_id;
 IF NOT FOUND OR j.user_id IS NULL OR j.user_id=p_actor_id OR public.is_platform_superadmin(j.user_id) THEN RAISE EXCEPTION 'platform_target_denied' USING ERRCODE='42501'; END IF;
 SELECT p.senha_provisoria,p.ativo,s.expires_at INTO pending,active,exp FROM public.profiles p LEFT JOIN platform_private.provisional_password_state s ON s.user_id=p.user_id WHERE p.user_id=j.user_id AND p.organization_id=j.organization_id;
 RETURN jsonb_build_object('pending_password',pending,'provisional_expires_at',exp,'active',active,'last_sent_at',j.email_accepted_at,'next_attempt_at',greatest(j.email_next_attempt_at,j.access_requested_at+interval '5 minutes'),'status',j.status,'operation_status',j.access_operation_status,'user_id',j.user_id);
END $$;
REVOKE ALL ON FUNCTION public.platform_org_admin_access_state(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_org_admin_access_state(uuid,uuid) TO service_role;