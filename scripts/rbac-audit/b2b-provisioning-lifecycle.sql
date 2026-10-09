-- REVIEWABLE CANDIDATE ONLY. Do not activate or apply until channel audit gate.
-- No Auth writes, passwords, links or emails in SQL. Used verbatim in local PG tests.
-- All invite mutations use the EXISTING user gate. Older producers may already
-- hold an invitation row before DML: never wait on the gate in that order.
-- NOWAIT aborts that transaction (55P03), releases its rows and requires an
-- explicit retry; no automatic email/Auth retry and no second lock registry.
CREATE OR REPLACE FUNCTION cf_user_guards_v1.acquire_invitation_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $gate$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID<>'public.platform_org_admin_invites'::regclass THEN
  RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS NULL THEN
  RAISE EXCEPTION 'user_edit_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 RETURN NULL;
END $gate$;
REVOKE ALL ON FUNCTION cf_user_guards_v1.acquire_invitation_gate() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS a00_cf_invitation_gate ON public.platform_org_admin_invites;
CREATE TRIGGER a00_cf_invitation_gate BEFORE INSERT OR UPDATE OR DELETE
ON public.platform_org_admin_invites FOR EACH STATEMENT
EXECUTE FUNCTION cf_user_guards_v1.acquire_invitation_gate();
DROP TRIGGER IF EXISTS a00_cf_invitation_no_truncate ON public.platform_org_admin_invites;
CREATE TRIGGER a00_cf_invitation_no_truncate BEFORE TRUNCATE
ON public.platform_org_admin_invites FOR EACH STATEMENT
EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TABLE IF NOT EXISTS platform_private.b2b_provisioning_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL,
 organization_id uuid NOT NULL, partner_id uuid NOT NULL,
 idempotency_key uuid NOT NULL, email text NOT NULL, nome text NOT NULL,
 actor_stamp timestamptz NOT NULL, actor_iat bigint NOT NULL, actor_invite_fence jsonb NOT NULL, user_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 fence uuid NOT NULL DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'claimed',
 lease_until timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor_id,idempotency_key), UNIQUE(email)
);
REVOKE ALL ON platform_private.b2b_provisioning_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON platform_private.b2b_provisioning_receipts TO service_role;
ALTER TABLE platform_private.b2b_provisioning_receipts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION platform_private.b2b_claim_provisioning(p_partner uuid,p_key uuid,p_email text,p_nome text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ctx jsonb; r platform_private.b2b_provisioning_receipts; stamp timestamptz; issued bigint; invitation jsonb; inserted integer;
BEGIN
 -- Same first lock as live statement triggers: gate → receipt/profile → rows.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 ctx:=public.b2b_provisioning_preflight(p_partner,'parceiro_b2b','gestor');
 IF p_key IS NULL OR p_email IS NULL OR p_nome IS NULL OR length(trim(p_nome)) NOT BETWEEN 1 AND 200
 OR length(p_email)>254 OR lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
  RAISE EXCEPTION 'b2b_provisioning_invalid' USING ERRCODE='22023'; END IF;
 issued:=(auth.jwt()->>'iat')::bigint;
 IF issued IS NULL OR issued<=0 OR to_timestamp(issued)>clock_timestamp()+interval '1 minute' THEN
 RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 SELECT updated_at INTO STRICT stamp FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
 PERFORM 1 FROM public.platform_org_admin_invites WHERE user_id=auth.uid() ORDER BY id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_array(id,access_operation_id,access_operation_status,status,access_valid_after) ORDER BY id),'[]'::jsonb) INTO invitation FROM public.platform_org_admin_invites WHERE user_id=auth.uid();
 INSERT INTO platform_private.b2b_provisioning_receipts(actor_id,organization_id,partner_id,idempotency_key,email,nome,actor_stamp,actor_iat,actor_invite_fence)
 VALUES(auth.uid(),(ctx->>'organization_id')::uuid,p_partner,p_key,lower(trim(p_email)),trim(p_nome),stamp,issued,invitation)
 ON CONFLICT(actor_id,idempotency_key) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 SELECT * INTO STRICT r FROM platform_private.b2b_provisioning_receipts
 WHERE actor_id=auth.uid() AND idempotency_key=p_key FOR UPDATE;
 IF ROW(r.organization_id,r.partner_id,r.email,r.nome,r.actor_stamp,r.actor_iat,r.actor_invite_fence) IS DISTINCT FROM
 ROW((ctx->>'organization_id')::uuid,p_partner,lower(trim(p_email)),trim(p_nome),stamp,issued,invitation) THEN
  RAISE EXCEPTION 'b2b_provisioning_conflict' USING ERRCODE='42501'; END IF;
 -- Never renew/reclaim a timed-out lease: Auth may already exist. Reconcile by ID.
 RETURN jsonb_build_object('claim_id',r.id,'user_id',r.user_id,'fence',r.fence,'status',r.status,
  'lease_valid',r.lease_until>clock_timestamp(),'acquired',inserted=1,'organization_id',r.organization_id);
END $f$;
REVOKE ALL ON FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.b2b_claim_provisioning(p_partner uuid,p_key uuid,p_email text,p_nome text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT platform_private.b2b_claim_provisioning(p_partner,p_key,p_email,p_nome);
$f$;
REVOKE ALL ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.b2b_finish_provisioning(p_claim uuid,p_fence uuid,p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r platform_private.b2b_provisioning_receipts; actor public.profiles; target public.profiles; invitation jsonb;
BEGIN
 PERFORM platform_private.require_service_role();
 -- Acquire before receipt/profile locks, never wait for the trigger gate afterward.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 SELECT * INTO r FROM platform_private.b2b_provisioning_receipts WHERE id=p_claim FOR UPDATE;
 IF r.id IS NULL OR r.fence IS DISTINCT FROM p_fence OR r.user_id IS DISTINCT FROM p_user THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.platform_org_admin_invites WHERE user_id=r.actor_id ORDER BY id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_array(id,access_operation_id,access_operation_status,status,access_valid_after) ORDER BY id),'[]'::jsonb) INTO invitation FROM public.platform_org_admin_invites WHERE user_id=r.actor_id;
 IF invitation IS DISTINCT FROM r.actor_invite_fence OR EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=r.actor_id AND (i.access_operation_status='processing' OR i.status='processando' OR (i.access_valid_after IS NOT NULL AND to_timestamp(r.actor_iat)<=i.access_valid_after))) THEN
 RAISE EXCEPTION 'b2b_provisioning_actor_revoked' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.profiles WHERE user_id=r.actor_id FOR UPDATE;
 PERFORM 1 FROM public.partner_accounts WHERE id=r.partner_id FOR UPDATE;
 IF actor.organization_id IS DISTINCT FROM r.organization_id OR actor.updated_at IS DISTINCT FROM r.actor_stamp
 OR NOT platform_private.platform_actor_access_ready(r.actor_id)
 OR NOT public.has_role(r.actor_id,'administrador'::public.app_role)
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=r.organization_id AND o.ativo IS TRUE AND o.status='ativa')
 OR NOT EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=r.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL AND pa.commercial_owner_organization_id=r.organization_id)
 OR NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(r.actor_id) e WHERE e.feature_key='catalogo_precos') THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF r.status='completed' THEN
  IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=r.user_id AND p.organization_id=r.organization_id AND p.ativo IS TRUE)
  OR (SELECT count(*) FROM public.user_roles WHERE user_id=r.user_id)<>1
  OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=r.user_id AND role='parceiro_b2b')
  OR (SELECT count(*) FROM public.partner_users WHERE user_id=r.user_id)<>1
  OR NOT EXISTS(SELECT 1 FROM public.partner_users WHERE user_id=r.user_id AND partner_id=r.partner_id AND papel='gestor') THEN
   RAISE EXCEPTION 'b2b_provisioning_target_conflict' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('success',true,'user_id',r.user_id,'replay',true);
 END IF;
 IF r.status<>'claimed' OR r.lease_until<=clock_timestamp() THEN
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
 INSERT INTO public.user_roles(user_id,role) VALUES(p_user,'parceiro_b2b');
 INSERT INTO public.partner_users(user_id,partner_id,papel) VALUES(p_user,r.partner_id,'gestor');
 INSERT INTO platform_private.provisional_password_state(user_id,desde,expires_at)
 VALUES(p_user,clock_timestamp(),NULL);
 UPDATE platform_private.b2b_provisioning_receipts SET status='completed' WHERE id=r.id;
 RETURN jsonb_build_object('success',true,'user_id',p_user,'first_access_pending',true);
END $f$;
REVOKE ALL ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid) TO service_role;

-- Resolve uncertain finish BEFORE deleting Auth. completed is never compensated.
CREATE OR REPLACE FUNCTION public.b2b_prepare_provisioning_compensation(p_claim uuid,p_fence uuid,p_user uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r platform_private.b2b_provisioning_receipts;
BEGIN
 PERFORM platform_private.require_service_role();
 -- Acquire before receipt/profile locks, never wait for the trigger gate afterward.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 SELECT * INTO r FROM platform_private.b2b_provisioning_receipts WHERE id=p_claim FOR UPDATE;
 IF r.id IS NULL OR r.fence IS DISTINCT FROM p_fence OR r.user_id IS DISTINCT FROM p_user THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF r.status='completed' THEN RETURN 'completed'; END IF;
 IF r.status='aborted' THEN RETURN 'aborted'; END IF;
 UPDATE platform_private.b2b_provisioning_receipts SET status='compensating' WHERE id=r.id;
 RETURN 'compensating';
END $f$;
REVOKE ALL ON FUNCTION public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.b2b_complete_provisioning_compensation(p_claim uuid,p_fence uuid,p_user uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
 PERFORM platform_private.require_service_role();
 -- Acquire before receipt/profile locks, never wait for the trigger gate afterward.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 -- Auth deletion's cascades must have completed; never pretend cleanup succeeded.
 IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM public.partner_users WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN
  RAISE EXCEPTION 'b2b_compensation_pending' USING ERRCODE='42501'; END IF;
 UPDATE platform_private.b2b_provisioning_receipts SET status='aborted'
 WHERE id=p_claim AND fence=p_fence AND user_id=p_user AND status='compensating';
 IF NOT FOUND THEN RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 RETURN true;
END $f$;
REVOKE ALL ON FUNCTION public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) TO service_role;