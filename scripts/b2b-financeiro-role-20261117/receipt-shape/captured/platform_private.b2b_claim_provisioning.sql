CREATE OR REPLACE FUNCTION platform_private.b2b_claim_provisioning(p_partner uuid, p_key uuid, p_email text, p_nome text, p_roles app_role[], p_clients uuid[] DEFAULT ARRAY[]::uuid[], p_primary uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ctx jsonb; r platform_private.b2b_provisioning_receipts; stamp timestamptz; issued bigint; invitation jsonb; inserted integer;
BEGIN
 -- Same first lock as live statement triggers: gate → receipt/profile → rows.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;

 ctx:=platform_private.external_provisioning_scope(auth.uid(),p_roles,p_partner,p_clients,p_primary);
 IF p_key IS NULL OR p_email IS NULL OR p_nome IS NULL OR length(trim(p_nome)) NOT BETWEEN 1 AND 200
 OR length(p_email)>254 OR lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
  RAISE EXCEPTION 'b2b_provisioning_invalid' USING ERRCODE='22023'; END IF;
 issued:=(auth.jwt()->>'iat')::bigint;
 IF issued IS NULL OR issued<=0 OR to_timestamp(issued)>clock_timestamp()+interval '1 minute' THEN
 RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 SELECT updated_at INTO STRICT stamp FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
 PERFORM 1 FROM public.platform_org_admin_invites WHERE user_id=auth.uid() ORDER BY id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_array(id,access_operation_id,access_operation_status,status,access_valid_after) ORDER BY id),'[]'::jsonb) INTO invitation FROM public.platform_org_admin_invites WHERE user_id=auth.uid();
 INSERT INTO platform_private.b2b_provisioning_receipts(actor_id,organization_id,partner_id,idempotency_key,email,nome,actor_stamp,actor_iat,actor_invite_fence,external_role,external_roles,cliente_ids,principal_cliente_id,target_snapshot)
 VALUES(auth.uid(),(ctx->>'organization_id')::uuid,p_partner,p_key,lower(trim(p_email)),trim(p_nome),stamp,issued,invitation,p_roles[1],p_roles,p_clients,p_primary,ctx->'snapshot')
 ON CONFLICT(actor_id,idempotency_key) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 SELECT * INTO STRICT r FROM platform_private.b2b_provisioning_receipts
 WHERE actor_id=auth.uid() AND idempotency_key=p_key FOR UPDATE;
 IF ROW(r.organization_id,r.partner_id,r.email,r.nome,r.actor_stamp,r.actor_iat,r.actor_invite_fence,r.external_roles,r.cliente_ids,r.principal_cliente_id,r.target_snapshot) IS DISTINCT FROM
 ROW((ctx->>'organization_id')::uuid,p_partner,lower(trim(p_email)),trim(p_nome),stamp,issued,invitation,p_roles,p_clients,p_primary,ctx->'snapshot') THEN
  RAISE EXCEPTION 'b2b_provisioning_conflict' USING ERRCODE='42501'; END IF;
 -- Never renew/reclaim a timed-out lease: Auth may already exist. Reconcile by ID.
 RETURN jsonb_build_object('contract','C2_MULTIPROFILE_V1','external_roles',r.external_roles,'actor_id',r.actor_id,'partner_id',r.partner_id,'readers_ready',true,'provisioning_ready',true,'producer_links_valid','cliente_produtor'=ANY(r.external_roles),'claim_id',r.id,'user_id',r.user_id,'fence',r.fence,'status',r.status,
  'lease_valid',r.lease_until>clock_timestamp(),'acquired',inserted=1,'organization_id',r.organization_id);
END $function$
