-- Canonical target independently verified: swzpzcwiasxmjutrmvkm.
-- Forward-only. Absence retains the existing NOT NULL text contract as ''.
ALTER TABLE public.platform_org_admin_audit DROP CONSTRAINT IF EXISTS platform_org_admin_audit_reason_check;
ALTER TABLE public.platform_org_admin_audit ADD CONSTRAINT platform_org_admin_audit_reason_check
CHECK (char_length(btrim(reason)) >= 2 OR (action = 'admin_profile_updated' AND reason = ''));

DO $patch$
DECLARE v_definition text; v_old text := $old$IF char_length(v_motivo) < 2 THEN RAISE EXCEPTION 'platform_invalid: motivo obrigatório (mínimo 2 caracteres)' USING ERRCODE='22023'; END IF;$old$;
 v_new text := $new$IF char_length(v_motivo) = 1 THEN RAISE EXCEPTION 'platform_invalid: se informar o motivo, use ao menos 2 caracteres' USING ERRCODE='22023'; END IF;$new$;
BEGIN
 SELECT pg_get_functiondef('platform_private.update_org_admin_core(uuid,text,text,text,text,timestamptz,uuid)'::regprocedure) INTO v_definition;
 IF position(v_new IN v_definition) = 0 THEN
  IF position(v_old IN v_definition) = 0 THEN RAISE EXCEPTION 'unexpected_admin_core_definition'; END IF;
  EXECUTE replace(v_definition, v_old, v_new);
 END IF;
END $patch$;
-- CREATE OR REPLACE preserves existing owner and ACL; no wrapper/grant/RLS change.

-- Live SQL contract proof, not a real Auth session or a browser/RLS certification.
-- Every fixture mutation is enclosed in a subtransaction deliberately rolled back.
DO $proof$
DECLARE v_actor uuid; v_org uuid; v_id uuid := gen_random_uuid(); v_key uuid := gen_random_uuid();
 v_time timestamptz; v_result jsonb; v_hash_before text; v_hash_after text; v_claims text;
 v_reason text; v_name text; v_count integer; v_denied boolean;
BEGIN
 SELECT user_id INTO v_actor FROM public.user_roles WHERE role='superadmin' LIMIT 1;
 SELECT id INTO v_org FROM public.organizations ORDER BY id LIMIT 1;
 IF v_actor IS NULL OR v_org IS NULL THEN RAISE EXCEPTION 'proof_prerequisites_missing'; END IF;
 v_claims := current_setting('request.jwt.claims', true);
 SELECT md5(jsonb_build_array(
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]'::jsonb) FROM public.platform_org_admin_invites x),
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]'::jsonb) FROM public.platform_org_admin_audit x),
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]'::jsonb) FROM public.profiles x))::text) INTO v_hash_before;
 BEGIN
  INSERT INTO public.platform_org_admin_invites(id,organization_id,email,nome,modo_acesso,responsavel_principal,invited_by)
  VALUES(v_id,v_org,'cert-admin-reason-'||v_id::text||'@example.invalid','CERT_ADMIN_REASON initial','link',false,v_actor)
  RETURNING updated_at INTO v_time;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  FOREACH v_reason IN ARRAY ARRAY[NULL::text,'','   ',' ok '] LOOP
   v_name := 'CERT_ADMIN_REASON '||gen_random_uuid()::text;
   v_key := gen_random_uuid();
   v_result := public.platform_update_org_admin(v_id,v_name,NULL,NULL,v_reason,v_time,v_key);
   IF (v_result->>'idempotent')::boolean THEN RAISE EXCEPTION 'first_call_replay'; END IF;
   SELECT count(*) INTO v_count FROM public.platform_org_admin_audit
    WHERE invite_id=v_id AND idempotency_key=v_key AND reason=btrim(coalesce(v_reason,''))
      AND actor_user_id=v_actor AND organization_id=v_org AND origin='platform_rpc'
      AND action='admin_profile_updated' AND status='succeeded' AND created_at IS NOT NULL
      AND old_values ? 'nome' AND old_values ? 'telefone' AND old_values ? 'cpf_cnpj'
      AND new_values->>'nome'=v_name AND new_values ? 'telefone' AND new_values ? 'cpf_cnpj';
   IF v_count<>1 THEN RAISE EXCEPTION 'audit_contract_failed'; END IF;
   v_result := public.platform_update_org_admin(v_id,v_name,NULL,NULL,v_reason,v_time,v_key);
   IF NOT (v_result->>'idempotent')::boolean THEN RAISE EXCEPTION 'replay_failed'; END IF;
   IF (SELECT count(*) FROM public.platform_org_admin_audit WHERE idempotency_key=v_key)<>1 THEN RAISE EXCEPTION 'duplicate_audit'; END IF;
   v_denied := false;
   BEGIN PERFORM public.platform_update_org_admin(v_id,v_name||' conflict',NULL,NULL,v_reason,v_time,v_key);
   EXCEPTION WHEN SQLSTATE '40001' THEN v_denied := true; END;
   IF NOT v_denied THEN RAISE EXCEPTION 'idempotency_conflict_not_denied'; END IF;
   SELECT updated_at INTO v_time FROM public.platform_org_admin_invites WHERE id=v_id;
  END LOOP;
  v_denied := false;
  BEGIN PERFORM public.platform_update_org_admin(v_id,'CERT_ADMIN_REASON rejected',NULL,NULL,' x ',v_time,gen_random_uuid());
  EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'one_character_not_denied'; END IF;
  v_denied := false;
  BEGIN PERFORM public.platform_update_org_admin(v_id,'CERT_ADMIN_REASON stale',NULL,NULL,'',v_time-interval '1 second',gen_random_uuid());
  EXCEPTION WHEN SQLSTATE '40001' THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'stale_write_not_denied'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  v_denied := false;
  BEGIN PERFORM public.platform_update_org_admin(v_id,'CERT_ADMIN_REASON forbidden',NULL,NULL,NULL,v_time,gen_random_uuid());
  EXCEPTION WHEN SQLSTATE '42501' THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'unauthorized_not_denied'; END IF;
  v_denied := false;
  BEGIN PERFORM platform_private.update_org_admin_core(v_id,'CERT_ADMIN_REASON forbidden',NULL,NULL,NULL,v_time,gen_random_uuid());
  EXCEPTION WHEN SQLSTATE '42501' THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'core_unauthorized_not_denied'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='proof_rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 SELECT md5(jsonb_build_array(
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]'::jsonb) FROM public.platform_org_admin_invites x),
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]'::jsonb) FROM public.platform_org_admin_audit x),
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]'::jsonb) FROM public.profiles x))::text) INTO v_hash_after;
 IF v_hash_after IS DISTINCT FROM v_hash_before THEN RAISE EXCEPTION 'proof_state_not_restored'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_org_admin_invites WHERE id=v_id) OR EXISTS(SELECT 1 FROM public.platform_org_admin_audit WHERE invite_id=v_id) THEN RAISE EXCEPTION 'proof_residue'; END IF;
 IF current_setting('request.jwt.claims',true) IS DISTINCT FROM v_claims THEN
  -- An initially missing custom setting can read as empty after subtransaction rollback.
  IF coalesce(current_setting('request.jwt.claims',true),'')<>coalesce(v_claims,'') THEN RAISE EXCEPTION 'claims_not_restored'; END IF;
 END IF;
 RAISE NOTICE 'PASS SQL contract: null/empty/whitespace/2+, short denied, replay/conflict/OCC, wrapper/core unauthorized denied, full state hash restored; zero fixture residues. Not real Auth/RLS proof.';
END $proof$;