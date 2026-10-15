BEGIN;
-- CANDIDATE assertive read-only preflight. Run ONLY on independently verified
-- canonical swzpzcwiasxmjutrmvkm. No GUC used for authorization or destination.
-- A mismatch raises 22012 (division by zero); no silent IF NOT EXISTS.
SELECT 1 / CASE WHEN to_regclass('platform_private.b2b_provisioning_receipts') IS NULL THEN 1 ELSE 0 END AS receipts_must_be_absent;
SELECT 1 / CASE WHEN count(*)=0 THEN 1 ELSE 0 END AS new_functions_absent FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='cf_user_guards_v1' AND p.proname IN ('acquire_invitation_gate','touch_invitation_profiles')) OR (n.nspname IN ('public','platform_private') AND p.proname IN ('b2b_claim_provisioning','b2b_finish_provisioning','b2b_prepare_provisioning_compensation','b2b_complete_provisioning_compensation','external_provisioning_scope'));
SELECT 1 / CASE WHEN count(*)=0 THEN 1 ELSE 0 END AS invitation_trigger_baseline_empty FROM pg_trigger WHERE tgrelid='public.platform_org_admin_invites'::regclass AND NOT tgisinternal;
WITH expected(signature,hash,definer,authexec) AS (VALUES
 ('public.admin_provision_user_profile_v1(uuid,text,text,public.app_role[],uuid[],uuid,uuid,text,text,text,text,text,text)','9a2e228a68f369f32fe323c6c2a7f1b8',false,false),
 ('public.b2b_provisioning_preflight(uuid,text,text)','6c273b67760ba1a2247ed9fd8755dfcf',false,true),
 ('platform_private.b2b_provisioning_preflight(uuid,text,text)','6e2c2eb62d5ecb13188d035f2a3c7f2b',true,true),
 ('public.handle_new_user()','6f3c5072b776329ac5ff9f8bbf6fd7b2',true,false))
SELECT signature,1 / CASE WHEN p.oid IS NOT NULL AND md5(pg_get_functiondef(p.oid))=e.hash AND p.prosecdef=e.definer AND p.proowner='postgres'::regrole AND has_function_privilege('authenticated',p.oid,'EXECUTE')=e.authexec AND NOT has_function_privilege('anon',p.oid,'EXECUTE') THEN 1 ELSE 0 END baseline_exact FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
SELECT 1 / CASE WHEN md5(string_agg(t.tgrelid::regclass::text||':'||t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\n' ORDER BY t.tgrelid::regclass::text,t.tgname))='baf23a188b315c042bc6d3dedd7663a6' THEN 1 ELSE 0 END user_chain_exact FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass);

-- CANDIDATO A+B FECHADO. NÃO APLICAR. Sem GRANT/publicação/Auth remoto.
-- Base: b2b-provisioning-lifecycle.sql (locks/receipts/compensação existentes).
-- Este arquivo substitui a base no pacote; nunca aplicar ambos em sequência.
-- REVIEWABLE CANDIDATE ONLY. Do not activate or apply until channel audit gate.
-- No Auth writes, passwords, links or emails in SQL. Used verbatim in local PG tests.
-- All invite mutations use the EXISTING user gate. Older producers may already
-- hold an invitation row before DML: never wait on the gate in that order.
-- NOWAIT aborts that transaction (55P03), releases its rows and requires an
-- explicit retry; no automatic email/Auth retry and no second lock registry.
-- Package order: assertive preflight-external-user-ab-readonly.sql, then this
-- body in the SAME transaction. This local body also rejects occupied objects.
DO $baseline$
BEGIN
 IF to_regclass('platform_private.b2b_provisioning_receipts') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.platform_org_admin_invites'::regclass AND NOT tgisinternal)
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
 (n.nspname='cf_user_guards_v1' AND p.proname IN ('acquire_invitation_gate','touch_invitation_profiles'))
 OR (n.nspname IN ('public','platform_private') AND p.proname IN ('external_provisioning_scope','b2b_claim_provisioning','b2b_finish_provisioning','b2b_prepare_provisioning_compensation','b2b_complete_provisioning_compensation'))) THEN
 RAISE EXCEPTION 'external_provisioning_baseline_mismatch' USING ERRCODE='55000'; END IF;
END $baseline$;
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
-- Stamp both old/new associated actors. This uses the existing profile stamp,
-- preventing delete/reinsert or revoke/reset (ABA) from restoring an old claim.
CREATE OR REPLACE FUNCTION cf_user_guards_v1.touch_invitation_profiles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $stamp$
DECLARE old_id uuid; new_id uuid; item uuid;
BEGIN
 IF TG_LEVEL<>'ROW' OR TG_RELID<>'public.platform_org_admin_invites'::regclass THEN
  RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'INSERT' THEN old_id:=OLD.user_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.user_id; END IF;
 FOR item IN SELECT DISTINCT x FROM unnest(ARRAY[old_id,new_id]) x WHERE x IS NOT NULL ORDER BY x
 LOOP UPDATE public.profiles SET updated_at=updated_at WHERE user_id=item; END LOOP;
 RETURN NULL;
END $stamp$;
REVOKE ALL ON FUNCTION cf_user_guards_v1.touch_invitation_profiles() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS z90_cf_invitation_profile_stamp ON public.platform_org_admin_invites;
CREATE TRIGGER z90_cf_invitation_profile_stamp AFTER INSERT OR UPDATE OR DELETE
ON public.platform_org_admin_invites FOR EACH ROW
EXECUTE FUNCTION cf_user_guards_v1.touch_invitation_profiles();
DROP TRIGGER IF EXISTS a00_cf_invitation_no_truncate ON public.platform_org_admin_invites;
CREATE TRIGGER a00_cf_invitation_no_truncate BEFORE TRUNCATE
ON public.platform_org_admin_invites FOR EACH STATEMENT
EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TABLE platform_private.b2b_provisioning_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL,
 organization_id uuid NOT NULL, partner_id uuid,
 external_role public.app_role NOT NULL DEFAULT 'parceiro_b2b', cliente_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[], principal_cliente_id uuid, target_snapshot jsonb NOT NULL DEFAULT '{}',
 idempotency_key uuid NOT NULL, email text NOT NULL, nome text NOT NULL,
 actor_stamp timestamptz NOT NULL, actor_iat bigint NOT NULL, actor_invite_fence jsonb NOT NULL, user_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 fence uuid NOT NULL DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'claimed',
 lease_until timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor_id,idempotency_key), UNIQUE(email)
);
REVOKE ALL ON platform_private.b2b_provisioning_receipts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON platform_private.b2b_provisioning_receipts FROM service_role;
ALTER TABLE platform_private.b2b_provisioning_receipts ENABLE ROW LEVEL SECURITY;


CREATE OR REPLACE FUNCTION platform_private.external_provisioning_scope(p_actor uuid,p_role public.app_role,p_partner uuid,p_clients uuid[],p_primary uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $scope$
DECLARE org uuid; snapshot jsonb;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE user_id=p_actor FOR UPDATE;
 IF p_actor IS NULL OR org IS NULL OR platform_private.platform_actor_access_ready(p_actor) IS NOT TRUE
 OR public.has_role(p_actor,'administrador') IS NOT TRUE OR public.is_platform_superadmin(p_actor) IS TRUE
 THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=org AND ativo IS TRUE AND status='ativa' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF p_role = 'parceiro_b2b' THEN
 IF p_partner IS NULL OR cardinality(p_clients) IS DISTINCT FROM 0 OR p_primary IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(p_actor) WHERE feature_key='catalogo_precos') THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.partner_accounts WHERE id=p_partner FOR SHARE;
 SELECT jsonb_build_object('id',id,'updated_at',updated_at) INTO snapshot FROM public.partner_accounts
 WHERE id=p_partner AND commercial_owner_organization_id=org AND ativo IS TRUE AND deleted_at IS NULL;
 ELSE
 IF p_role IS DISTINCT FROM 'cliente_produtor' OR p_partner IS NOT NULL OR cardinality(p_clients) NOT BETWEEN 1 AND 100
 OR p_clients IS NULL OR array_position(p_clients,NULL) IS NOT NULL
 OR cardinality(p_clients)<>(SELECT count(DISTINCT id) FROM unnest(p_clients) id)
 OR p_primary IS NULL OR NOT (p_primary=ANY(p_clients)) THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 -- Explicit portal creation, never derive portal authority from technical user_clientes.
 PERFORM 1 FROM public.clientes WHERE id=ANY(p_clients) ORDER BY id FOR SHARE;
 IF (SELECT count(*) FROM public.clientes WHERE id=ANY(p_clients) AND organization_id=org AND status_cliente='ativo')<>cardinality(p_clients) THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) ORDER BY id) INTO snapshot FROM public.clientes WHERE id=ANY(p_clients);
 END IF;
 IF platform_private.platform_actor_access_ready(p_actor) IS NOT TRUE OR public.has_role(p_actor,'administrador') IS NOT TRUE THEN RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('organization_id',org,'snapshot',snapshot);
END $scope$;
REVOKE ALL ON FUNCTION platform_private.external_provisioning_scope(uuid,public.app_role,uuid,uuid[],uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION platform_private.b2b_claim_provisioning(p_partner uuid,p_key uuid,p_email text,p_nome text,p_role public.app_role DEFAULT 'parceiro_b2b',p_clients uuid[] DEFAULT ARRAY[]::uuid[],p_primary uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE ctx jsonb; r platform_private.b2b_provisioning_receipts; stamp timestamptz; issued bigint; invitation jsonb; inserted integer;
BEGIN
 -- Same first lock as live statement triggers: gate → receipt/profile → rows.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 IF p_role = 'parceiro_b2b' THEN
 PERFORM public.b2b_provisioning_preflight(p_partner,p_role::text,'gestor'); END IF;
 ctx:=platform_private.external_provisioning_scope(auth.uid(),p_role,p_partner,p_clients,p_primary);
 IF p_key IS NULL OR p_email IS NULL OR p_nome IS NULL OR length(trim(p_nome)) NOT BETWEEN 1 AND 200
 OR length(p_email)>254 OR lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
  RAISE EXCEPTION 'b2b_provisioning_invalid' USING ERRCODE='22023'; END IF;
 issued:=(auth.jwt()->>'iat')::bigint;
 IF issued IS NULL OR issued<=0 OR to_timestamp(issued)>clock_timestamp()+interval '1 minute' THEN
 RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 SELECT updated_at INTO STRICT stamp FROM public.profiles WHERE user_id=auth.uid() FOR UPDATE;
 PERFORM 1 FROM public.platform_org_admin_invites WHERE user_id=auth.uid() ORDER BY id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_array(id,access_operation_id,access_operation_status,status,access_valid_after) ORDER BY id),'[]'::jsonb) INTO invitation FROM public.platform_org_admin_invites WHERE user_id=auth.uid();
 INSERT INTO platform_private.b2b_provisioning_receipts(actor_id,organization_id,partner_id,idempotency_key,email,nome,actor_stamp,actor_iat,actor_invite_fence,external_role,cliente_ids,principal_cliente_id,target_snapshot)
 VALUES(auth.uid(),(ctx->>'organization_id')::uuid,p_partner,p_key,lower(trim(p_email)),trim(p_nome),stamp,issued,invitation,p_role,p_clients,p_primary,ctx->'snapshot')
 ON CONFLICT(actor_id,idempotency_key) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 SELECT * INTO STRICT r FROM platform_private.b2b_provisioning_receipts
 WHERE actor_id=auth.uid() AND idempotency_key=p_key FOR UPDATE;
 IF ROW(r.organization_id,r.partner_id,r.email,r.nome,r.actor_stamp,r.actor_iat,r.actor_invite_fence,r.external_role,r.cliente_ids,r.principal_cliente_id,r.target_snapshot) IS DISTINCT FROM
 ROW((ctx->>'organization_id')::uuid,p_partner,lower(trim(p_email)),trim(p_nome),stamp,issued,invitation,p_role,p_clients,p_primary,ctx->'snapshot') THEN
  RAISE EXCEPTION 'b2b_provisioning_conflict' USING ERRCODE='42501'; END IF;
 -- Never renew/reclaim a timed-out lease: Auth may already exist. Reconcile by ID.
 RETURN jsonb_build_object('claim_id',r.id,'user_id',r.user_id,'fence',r.fence,'status',r.status,
  'lease_valid',r.lease_until>clock_timestamp(),'acquired',inserted=1,'organization_id',r.organization_id);
END $f$;
REVOKE ALL ON FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.b2b_claim_provisioning(p_partner uuid,p_key uuid,p_email text,p_nome text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT platform_private.b2b_claim_provisioning(p_partner,p_key,p_email,p_nome);
$f$;
REVOKE ALL ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.b2b_finish_provisioning(p_claim uuid,p_fence uuid,p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r platform_private.b2b_provisioning_receipts; actor public.profiles; target public.profiles; invitation jsonb; ctx jsonb;
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
 ctx:=platform_private.external_provisioning_scope(r.actor_id,r.external_role,r.partner_id,r.cliente_ids,r.principal_cliente_id);
 IF ctx->'snapshot' IS DISTINCT FROM r.target_snapshot THEN RAISE EXCEPTION 'external_provisioning_target_changed' USING ERRCODE='42501'; END IF;
 IF actor.organization_id IS DISTINCT FROM r.organization_id OR actor.updated_at IS DISTINCT FROM r.actor_stamp
 OR NOT platform_private.platform_actor_access_ready(r.actor_id)
 OR NOT public.has_role(r.actor_id,'administrador'::public.app_role)
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=r.organization_id AND o.ativo IS TRUE AND o.status='ativa')
 THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF r.status='completed' THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=r.user_id AND lower(u.email)=r.email
   AND u.raw_app_meta_data->>'b2b_provisioning_receipt'=r.id::text)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=r.user_id AND organization_id=r.organization_id AND ativo IS TRUE)
  OR (SELECT count(*) FROM public.user_roles WHERE user_id=r.user_id)<>1
  OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=r.user_id AND role=r.external_role)
  OR (SELECT count(*) FROM public.partner_users WHERE user_id=r.user_id)<>(CASE WHEN r.partner_id IS NULL THEN 0 ELSE 1 END)
  OR (r.partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_users WHERE user_id=r.user_id AND partner_id=r.partner_id AND papel='gestor'))
  OR (SELECT count(*) FROM public.user_clientes WHERE user_id=r.user_id)<>cardinality(r.cliente_ids)
  OR EXISTS(SELECT 1 FROM public.user_clientes WHERE user_id=r.user_id AND (NOT (cliente_id=ANY(r.cliente_ids)) OR is_active IS NOT TRUE OR revoked_at IS NOT NULL OR principal IS DISTINCT FROM (cliente_id=r.principal_cliente_id))) THEN
   RAISE EXCEPTION 'b2b_provisioning_target_conflict' USING ERRCODE='42501'; END IF;
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
 PERFORM public.admin_provision_user_profile_v1(p_user,r.email,r.nome,ARRAY[r.external_role],r.cliente_ids,r.principal_cliente_id,r.partner_id,CASE WHEN r.partner_id IS NULL THEN NULL ELSE 'gestor' END);
 UPDATE public.user_clientes SET is_active=true,assigned_by=r.actor_id WHERE user_id=p_user;

 INSERT INTO platform_private.provisional_password_state(user_id,desde,expires_at)
 VALUES(p_user,clock_timestamp(),NULL);
 UPDATE platform_private.b2b_provisioning_receipts SET status='completed' WHERE id=r.id;
 RETURN jsonb_build_object('success',true,'user_id',p_user,'first_access_pending',true);
END $f$;
REVOKE ALL ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

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
REVOKE ALL ON FUNCTION public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.b2b_complete_provisioning_compensation(p_claim uuid,p_fence uuid,p_user uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE r platform_private.b2b_provisioning_receipts;
BEGIN
 PERFORM platform_private.require_service_role();
 -- Acquire before receipt/profile locks, never wait for the trigger gate afterward.
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 SELECT * INTO r FROM platform_private.b2b_provisioning_receipts WHERE id=p_claim FOR UPDATE;
 IF r.id IS NULL OR r.fence IS DISTINCT FROM p_fence OR r.user_id IS DISTINCT FROM p_user OR r.status<>'compensating' THEN
 RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 -- Auth deletion's cascades must have completed; never pretend cleanup succeeded.
 IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN
  RAISE EXCEPTION 'b2b_compensation_pending' USING ERRCODE='42501'; END IF;
 -- Live schema has NO Auth FK on these two links. Delete only exact receipt
 -- descendants after proven own Auth removal; unrelated links fail closed.
 IF EXISTS(SELECT 1 FROM public.partner_users WHERE user_id=p_user AND
 (r.partner_id IS NULL OR partner_id IS DISTINCT FROM r.partner_id OR papel IS DISTINCT FROM 'gestor'))
 OR EXISTS(SELECT 1 FROM public.user_clientes WHERE user_id=p_user AND
 (NOT (cliente_id=ANY(r.cliente_ids)) OR assigned_by IS DISTINCT FROM r.actor_id)) THEN
 RAISE EXCEPTION 'b2b_compensation_pending' USING ERRCODE='42501'; END IF;
 DELETE FROM public.partner_users WHERE user_id=r.user_id AND partner_id=r.partner_id AND papel='gestor';
 DELETE FROM public.user_clientes WHERE user_id=r.user_id AND cliente_id=ANY(r.cliente_ids) AND assigned_by=r.actor_id;
 UPDATE platform_private.b2b_provisioning_receipts SET status='aborted'
 WHERE id=p_claim AND fence=p_fence AND user_id=p_user AND status='compensating';
 IF NOT FOUND THEN RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 RETURN true;
END $f$;
REVOKE ALL ON FUNCTION public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.b2b_claim_provisioning(p_partner uuid,p_key uuid,p_email text,p_nome text,p_role public.app_role,p_clients uuid[],p_primary uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$
 SELECT platform_private.b2b_claim_provisioning(p_partner,p_key,p_email,p_nome,p_role,p_clients,p_primary);
$f$;
REVOKE ALL ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Existing prepare + complete constitute abort; no redundant abort entrypoint.

COMMIT;