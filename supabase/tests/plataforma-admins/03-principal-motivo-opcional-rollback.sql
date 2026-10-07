-- Prova transacional (rollback integral via RAISE): motivo opcional na transferência de responsável principal.
DO $proof$
DECLARE
  sa uuid := 'b2c9bb8c-3ac3-4d65-b977-b7c873954b2e';
  ox uuid := gen_random_uuid(); oy uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); uy uuid := gen_random_uuid();
  k1 uuid := gen_random_uuid(); r jsonb; out text := ''; v text; n int;
BEGIN
  INSERT INTO public.organizations(id,nome,ativo,status,onboarding_dados) VALUES (ox,'ZZ Prova RX',true,'ativa','{}'),(oy,'ZZ Prova RY',true,'ativa','{}');
  INSERT INTO auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  SELECT u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',e,'{}','{}',now(),now()
  FROM (VALUES (ua,'zzr.a@prova.invalid'),(ub,'zzr.b@prova.invalid'),(uc,'zzr.c@prova.invalid'),(uy,'zzr.y@prova.invalid')) t(u,e);
  INSERT INTO public.profiles(user_id,nome,email,ativo,organization_id,cargo) VALUES
    (ua,'R A','zzr.a@prova.invalid',true,ox,'Responsável Principal'),(ub,'R B','zzr.b@prova.invalid',true,ox,'Administrador'),
    (uc,'R C','zzr.c@prova.invalid',true,ox,'Administrador'),(uy,'R Y','zzr.y@prova.invalid',true,oy,'Responsável Principal')
  ON CONFLICT (user_id) DO UPDATE SET organization_id=excluded.organization_id,email=excluded.email;
  DELETE FROM public.user_roles WHERE user_id IN (ua,ub,uc,uy);
  INSERT INTO public.user_roles(user_id,role) VALUES (ua,'administrador'),(ub,'administrador'),(uc,'administrador'),(uy,'administrador');
  INSERT INTO public.platform_org_admin_invites(organization_id,user_id,email,nome,modo_acesso,responsavel_principal,invited_by,status,request_id) VALUES
    (ox,ua,'zzr.a@prova.invalid','R A','link',true,sa,'ativo',gen_random_uuid()),
    (ox,ub,'zzr.b@prova.invalid','R B','link',false,sa,'ativo',gen_random_uuid()),
    (ox,uc,'zzr.c@prova.invalid','R C','link',false,sa,'ativo',gen_random_uuid()),
    (oy,uy,'zzr.y@prova.invalid','R Y','link',true,sa,'ativo',gen_random_uuid());
  PERFORM platform_private.issue_ticket('org_write', ox);
  UPDATE public.organizations SET responsavel_user_id=ua, responsavel_definido_em=now() WHERE id=ox;
  PERFORM platform_private.issue_ticket('org_write', oy);
  UPDATE public.organizations SET responsavel_user_id=uy, responsavel_definido_em=now() WHERE id=oy;

  -- Não Superadmin (admin do tenant)
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,ub,NULL,ua,gen_random_uuid()); out:=out||'not_sa:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'not_sa:denied;'; END;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',sa,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,ub,' x ',ua,gen_random_uuid()); out:=out||'one_char:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'one_char:denied;'; END;
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,uy,NULL,ua,gen_random_uuid()); out:=out||'cross_tenant:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'cross_tenant:denied;'; END;
  r := public.platform_set_org_principal_admin(ox,ub,NULL,ua,k1);
  out := out||'no_reason:ok(idem='||coalesce(r->>'idempotent','false')||');';
  SELECT reason INTO v FROM public.platform_org_admin_audit WHERE action='principal_transferred' AND idempotency_key=k1;
  out := out||'audit_reason='||v||';';
  SELECT count(*) INTO n FROM public.platform_org_admin_audit WHERE idempotency_key=k1 AND organization_id=ox AND actor_user_id=sa
    AND old_values::text LIKE '%'||ua||'%' AND new_values::text LIKE '%'||ub||'%' AND created_at IS NOT NULL;
  out := out||'audit_old_new_actor_org_ts='||n||';';
  r := public.platform_set_org_principal_admin(ox,ub,'',ua,k1);
  out := out||'retry_same_key:idem='||(r->>'idempotent')||';';
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,ub,'Outro',ua,k1); out:=out||'key_conflict:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'key_conflict:denied;'; END;
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,uc,NULL,ua,gen_random_uuid()); out:=out||'stale_expected:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'stale_expected(concorrência):denied;'; END;
  r := public.platform_set_org_principal_admin(ox,uc,'  Reorganização ',ub,gen_random_uuid());
  SELECT reason INTO v FROM public.platform_org_admin_audit WHERE action='principal_transferred' AND target_user_id=uc AND organization_id=ox;
  out := out||'two_plus:ok('||v||');';
  SELECT count(*) INTO n FROM public.organizations WHERE id=ox AND responsavel_user_id=uc;
  out := out||'final_principal_c='||n||';';
  BEGIN PERFORM public.platform_update_org_admin((SELECT id FROM public.platform_org_admin_invites WHERE user_id=ub),'R B Silva','','','',now(),gen_random_uuid()); out:=out||'edit_empty:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'edit_empty:denied;'; END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'PROOF_ROLLBACK %', out;
END $proof$;
