GRANT USAGE ON SCHEMA public,auth,platform_private TO service_role;
GRANT EXECUTE ON FUNCTION platform_private.require_service_role() TO service_role;
CREATE FUNCTION pg_temp.denied(label text,statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN SQLSTATE '42501' OR unique_violation THEN
  RAISE NOTICE 'PASS %',label; RETURN; END;
 RAISE EXCEPTION 'FAIL %',label;
END $$;
RESET ROLE;
UPDATE public.profiles SET organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE public.user_roles SET role='administrador';
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
CREATE TEMP TABLE claims(label text PRIMARY KEY,body jsonb);
GRANT ALL ON claims TO authenticated,service_role;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
SET LOCAL ROLE authenticated;
INSERT INTO claims VALUES('one',public.b2b_claim_provisioning('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','one@example.invalid','One'));
SELECT pg_temp.assert_true('claim acquired once',(SELECT (body->>'acquired')::boolean FROM claims WHERE label='one'));
SELECT pg_temp.assert_true('claim retry same reserved user not acquired',
 (SELECT public.b2b_claim_provisioning('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','one@example.invalid','One')->>'acquired'='false'));
SELECT pg_temp.denied('claim retry cannot change partner',$$SELECT public.b2b_claim_provisioning('22222222-2222-4222-8222-222222222222','55555555-5555-4555-8555-555555555555','one@example.invalid','One')$$);
SELECT pg_temp.denied('cross tenant preflight denied',$$SELECT public.b2b_claim_provisioning('33333333-3333-4333-8333-333333333333','66666666-6666-4666-8666-666666666666','foreign@example.invalid','Foreign')$$);
SELECT pg_temp.denied('finish not executable by authenticated',$$SELECT public.b2b_finish_provisioning(null,null,null)$$);
RESET ROLE;
-- Local auth.users INSERT now executes the canonical handle_new_user trigger.
INSERT INTO auth.users(id,email,raw_app_meta_data) SELECT (body->>'user_id')::uuid,'one@example.invalid',jsonb_build_object('b2b_provisioning_receipt',body->>'claim_id') FROM claims WHERE label='one';
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.denied('wrong fence denied',format('SELECT public.b2b_finish_provisioning(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id','99999999-9999-4999-8999-999999999999',body->>'user_id')) FROM claims WHERE label='one';
SELECT pg_temp.assert_true('finish commits',public.b2b_finish_provisioning((body->>'claim_id')::uuid,(body->>'fence')::uuid,(body->>'user_id')::uuid)->>'success'='true') FROM claims WHERE label='one';
SELECT pg_temp.assert_true('completed finish replay',public.b2b_finish_provisioning((body->>'claim_id')::uuid,(body->>'fence')::uuid,(body->>'user_id')::uuid)->>'replay'='true') FROM claims WHERE label='one';
SELECT pg_temp.assert_true('completed compensation never permits deletion',public.b2b_prepare_provisioning_compensation((body->>'claim_id')::uuid,(body->>'fence')::uuid,(body->>'user_id')::uuid)='completed') FROM claims WHERE label='one';
RESET ROLE;
SELECT pg_temp.assert_true('owner derived from actor profile',p.organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') FROM public.profiles p JOIN claims c ON p.user_id=(c.body->>'user_id')::uuid WHERE c.label='one';
SELECT pg_temp.assert_true('exactly dedicated manager role',count(*)=1 AND min(role::text)='parceiro_b2b') FROM public.user_roles WHERE user_id=(SELECT (body->>'user_id')::uuid FROM claims WHERE label='one');
SELECT pg_temp.assert_true('exactly own partner link',count(*)=1 AND min(partner_id::text)='11111111-1111-4111-8111-111111111111' AND min(papel)='gestor') FROM public.partner_users WHERE user_id=(SELECT (body->>'user_id')::uuid FROM claims WHERE label='one');
SELECT pg_temp.assert_true('first access server only recovery required',p.senha_provisoria AND s.expires_at IS NULL AND s.pwd_digest IS NULL) FROM public.profiles p JOIN platform_private.provisional_password_state s USING(user_id) WHERE p.user_id=(SELECT (body->>'user_id')::uuid FROM claims WHERE label='one');
SELECT pg_temp.assert_true('first access actor not ready',NOT platform_private.platform_actor_access_ready((body->>'user_id')::uuid)) FROM claims WHERE label='one';
-- Live canonical overload, copied without rewriting its authorization predicate.
CREATE FUNCTION public.platform_first_access_valid(p_user_id uuid,p_recovery boolean,p_session_issued_at bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_session_issued_at IS NOT NULL AND p_session_issued_at>0 AND to_timestamp(p_session_issued_at)<=clock_timestamp()+interval '1 minute' AND EXISTS(SELECT 1 FROM public.profiles p JOIN platform_private.provisional_password_state s ON s.user_id=p.user_id WHERE p.user_id=p_user_id AND p.ativo IS TRUE AND p.senha_provisoria IS TRUE AND (s.expires_at>now() OR (p_recovery AND to_timestamp(p_session_issued_at)>s.desde))) AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_user_id AND (i.access_operation_status='processing' OR i.status='processando' OR (i.access_valid_after IS NOT NULL AND to_timestamp(p_session_issued_at)<=i.access_valid_after)));
$$;
SELECT pg_temp.assert_true('existing first access denies non recovery password session',NOT public.platform_first_access_valid((body->>'user_id')::uuid,false,extract(epoch FROM clock_timestamp())::bigint)) FROM claims WHERE label='one';
-- Simulate a later verified recovery JWT iat (AMR verification belongs to Edge).
SELECT pg_temp.assert_true('existing first access accepts later recovery proof',public.platform_first_access_valid((body->>'user_id')::uuid,true,extract(epoch FROM clock_timestamp())::bigint+2)) FROM claims WHERE label='one';
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
SET LOCAL ROLE authenticated;
INSERT INTO claims VALUES('two',public.b2b_claim_provisioning('22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666','two@example.invalid','Two'));
RESET ROLE;
INSERT INTO auth.users(id,email,raw_app_meta_data) SELECT (body->>'user_id')::uuid,'two@example.invalid',jsonb_build_object('b2b_provisioning_receipt',body->>'claim_id') FROM claims WHERE label='two';
-- Inject error at the last write; whole finish must roll back profile/role/link/state.
CREATE FUNCTION pg_temp.fail_first_access() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected' USING ERRCODE='42501'; END $$;
CREATE TRIGGER injected BEFORE INSERT ON platform_private.provisional_password_state FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_first_access();
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.denied('finish last write failure',format('SELECT public.b2b_finish_provisioning(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id',body->>'fence',body->>'user_id')) FROM claims WHERE label='two';
RESET ROLE;
SELECT pg_temp.assert_true('rollback no role link or tenant',p.organization_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.user_id) AND NOT EXISTS(SELECT 1 FROM public.partner_users u WHERE u.user_id=p.user_id)) FROM public.profiles p WHERE p.email='two@example.invalid';
DROP TRIGGER injected ON platform_private.provisional_password_state;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true('prepare compensation fences finish',public.b2b_prepare_provisioning_compensation((body->>'claim_id')::uuid,(body->>'fence')::uuid,(body->>'user_id')::uuid)='compensating') FROM claims WHERE label='two';
SELECT pg_temp.denied('compensating receipt cannot finish',format('SELECT public.b2b_finish_provisioning(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id',body->>'fence',body->>'user_id')) FROM claims WHERE label='two';
SELECT pg_temp.denied('cleanup not acknowledged while Auth exists',format('SELECT public.b2b_complete_provisioning_compensation(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id',body->>'fence',body->>'user_id')) FROM claims WHERE label='two';
RESET ROLE;
DELETE FROM public.profiles WHERE email='two@example.invalid'; DELETE FROM auth.users WHERE email='two@example.invalid';
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true('cleanup receipt completed only after deletion',public.b2b_complete_provisioning_compensation((body->>'claim_id')::uuid,(body->>'fence')::uuid,(body->>'user_id')::uuid)) FROM claims WHERE label='two';
RESET ROLE;
SELECT pg_temp.assert_true('anonymous cannot claim',NOT has_function_privilege('anon','public.b2b_claim_provisioning(uuid,uuid,text,text)','EXECUTE'));
SELECT pg_temp.assert_true('client cannot read receipt',NOT has_table_privilege('authenticated','platform_private.b2b_provisioning_receipts','SELECT'));
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
SET LOCAL ROLE authenticated;
INSERT INTO claims VALUES('three',public.b2b_claim_provisioning('22222222-2222-4222-8222-222222222222','77777777-7777-4777-8777-777777777777','three@example.invalid','Three'));
RESET ROLE;
INSERT INTO auth.users(id,email,raw_app_meta_data) SELECT (body->>'user_id')::uuid,'three@example.invalid',jsonb_build_object('b2b_provisioning_receipt',body->>'claim_id') FROM claims WHERE label='three';
-- Service subject is NULL; invite-only revocation must not depend on profile stamp.
CREATE TEMP TABLE original_stamp AS SELECT updated_at FROM public.profiles WHERE user_id='44444444-4444-4444-8444-444444444444';
INSERT INTO public.platform_org_admin_invites(user_id,status,access_valid_after,organization_id,email,nome,modo_acesso,invited_by)
VALUES('44444444-4444-4444-8444-444444444444','ativo',clock_timestamp(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin@example.invalid','Admin','link','44444444-4444-4444-8444-444444444444');
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.denied('revoked iat after claim with service uid null',format('SELECT public.b2b_finish_provisioning(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id',body->>'fence',body->>'user_id')) FROM claims WHERE label='three';
RESET ROLE;
SELECT pg_temp.assert_true('revocation does not touch profile stamp',(SELECT updated_at FROM original_stamp)=(SELECT updated_at FROM public.profiles WHERE user_id='44444444-4444-4444-8444-444444444444'));
UPDATE public.platform_org_admin_invites SET access_valid_after=NULL,access_operation_status='processing';
SET LOCAL ROLE service_role;
SELECT pg_temp.denied('invitation operation after claim denied',format('SELECT public.b2b_finish_provisioning(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id',body->>'fence',body->>'user_id')) FROM claims WHERE label='three';
RESET ROLE;
DELETE FROM public.platform_org_admin_invites;
-- User-editable provenance cannot replace application metadata.
UPDATE auth.users SET raw_user_meta_data=raw_app_meta_data,raw_app_meta_data='{}' WHERE email='three@example.invalid';
SET LOCAL ROLE service_role;
SELECT pg_temp.denied('editable metadata receipt denied by SQL',format('SELECT public.b2b_finish_provisioning(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id',body->>'fence',body->>'user_id')) FROM claims WHERE label='three';
RESET ROLE;
UPDATE auth.users SET raw_app_meta_data=raw_user_meta_data WHERE email='three@example.invalid';
UPDATE public.profiles SET updated_at=now()+interval '1 second' WHERE user_id='44444444-4444-4444-8444-444444444444';
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.denied('actor changed since claim denied',format('SELECT public.b2b_finish_provisioning(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id',body->>'fence',body->>'user_id')) FROM claims WHERE label='three';
RESET ROLE;
UPDATE public.profiles SET updated_at=now() WHERE user_id='44444444-4444-4444-8444-444444444444';
UPDATE public.partner_accounts SET commercial_owner_organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' WHERE id='22222222-2222-4222-8222-222222222222';
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.denied('partner owner changed since claim denied',format('SELECT public.b2b_finish_provisioning(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id',body->>'fence',body->>'user_id')) FROM claims WHERE label='three';
RESET ROLE;
UPDATE public.partner_accounts SET commercial_owner_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' WHERE id='22222222-2222-4222-8222-222222222222';
INSERT INTO public.user_roles SELECT (body->>'user_id')::uuid,'administrador' FROM claims WHERE label='three';
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.denied('preexisting extra role denied',format('SELECT public.b2b_finish_provisioning(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id',body->>'fence',body->>'user_id')) FROM claims WHERE label='three';
RESET ROLE;
DELETE FROM public.user_roles WHERE user_id=(SELECT (body->>'user_id')::uuid FROM claims WHERE label='three');
INSERT INTO public.partner_users SELECT (body->>'user_id')::uuid,'11111111-1111-4111-8111-111111111111','gestor' FROM claims WHERE label='three';
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.denied('preexisting wrong partner link denied',format('SELECT public.b2b_finish_provisioning(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id',body->>'fence',body->>'user_id')) FROM claims WHERE label='three';
RESET ROLE;
DELETE FROM public.partner_users WHERE user_id=(SELECT (body->>'user_id')::uuid FROM claims WHERE label='three');
UPDATE platform_private.b2b_provisioning_receipts SET lease_until=now()-interval '1 second' WHERE email='three@example.invalid';
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.denied('expired lease denied no automatic takeover',format('SELECT public.b2b_finish_provisioning(%L::uuid,%L::uuid,%L::uuid)',body->>'claim_id',body->>'fence',body->>'user_id')) FROM claims WHERE label='three';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT body->>'user_id' FROM claims WHERE label='one'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied('partner cannot provision another identity',$$SELECT public.b2b_claim_provisioning('11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888','four@example.invalid','Four')$$);
RESET ROLE;