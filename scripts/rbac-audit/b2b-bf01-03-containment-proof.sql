-- TEMPORARY_AUDIT_BF; SQL role/claims simulation is NOT a signed-in JWT proof.
-- Existing Auth identity, no Auth writes, no persistent links, no external calls.
BEGIN;
DO $proof$
DECLARE u uuid; partner uuid; client uuid; fixture uuid:=gen_random_uuid(); n integer; denied integer:=0; role_name text; command text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
 SELECT p.user_id INTO u FROM public.profiles p WHERE p.ativo AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.user_id AND r.role='administrador') ORDER BY p.id LIMIT 1;
 SELECT id INTO partner FROM public.partner_accounts ORDER BY id LIMIT 1;
 SELECT id INTO client FROM public.clientes ORDER BY id LIMIT 1;
 IF u IS NULL OR partner IS NULL OR client IS NULL THEN RAISE EXCEPTION 'PROOF_PREREQUISITES_MISSING'; END IF;
 INSERT INTO public.partner_clients(id,partner_id,cliente_id,assigned_by,active) VALUES(fixture,partner,client,u,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  EXECUTE format('SET LOCAL ROLE %I',role_name);
  FOREACH command IN ARRAY ARRAY[
   'SELECT public.assign_b2b_user_client_secure(NULL,NULL)',
   'SELECT public.unassign_b2b_user_client_secure(NULL,NULL)',
   'SELECT * FROM public.get_b2b_partner_clients_for_assignment_secure(NULL)',
   'SELECT public.cancel_b2b_receivable_secure(NULL,''TEMPORARY_AUDIT_BF'')'
  ] LOOP
   BEGIN EXECUTE command; RAISE EXCEPTION 'RPC_ACL_OPEN'; EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
  END LOOP;
  RESET ROLE;
 END LOOP;
 IF denied<>8 THEN RAISE EXCEPTION 'EXPECTED_EIGHT_RPC_DENIALS'; END IF;
 SET LOCAL ROLE authenticated;
 SELECT count(*) INTO n FROM public.partner_clients WHERE id=fixture;
 IF n<>0 THEN RAISE EXCEPTION 'PARTNER_CLIENT_ROW_VISIBLE'; END IF;
 UPDATE public.partner_clients SET active=false WHERE id=fixture;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'PARTNER_CLIENT_ROW_MUTATED'; END IF;
 BEGIN
  INSERT INTO public.partner_clients(partner_id,cliente_id,assigned_by,active) VALUES(partner,client,u,true);
  RAISE EXCEPTION 'PARTNER_CLIENT_INSERT_OPEN';
 EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 SELECT count(*) INTO n FROM public.partner_user_clients;
 IF n<>0 THEN RAISE EXCEPTION 'PARTNER_USER_CLIENT_ROWS_VISIBLE'; END IF;
 RESET ROLE;
 IF denied<>9 THEN RAISE EXCEPTION 'EXPECTED_NINE_DENIALS'; END IF;
 SELECT count(*) INTO n FROM public.partner_clients WHERE id=fixture AND active;
 IF n<>1 THEN RAISE EXCEPTION 'FIXTURE_CHANGED'; END IF;
END $proof$;
ROLLBACK;