-- Prova transacional (rollback integral via RAISE): motivo opcional apenas na troca de e-mail.
DO $proof$
DECLARE
  sa uuid := 'b2c9bb8c-3ac3-4d65-b977-b7c873954b2e';
  ox uuid := gen_random_uuid(); ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ia uuid; ib uuid; ip uuid; k uuid := gen_random_uuid(); op jsonb; op2 jsonb; out text := ''; v text;
BEGIN
  INSERT INTO public.organizations(id,nome,ativo,status,onboarding_dados) VALUES (ox,'ZZ Prova M',true,'ativa','{}');
  INSERT INTO auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  SELECT u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',e,'{}','{}',now(),now()
  FROM (VALUES (ua,'zzm.a@prova.invalid'),(ub,'zzm.b@prova.invalid')) t(u,e);
  INSERT INTO public.profiles(user_id,nome,email,ativo,organization_id,cargo) VALUES
    (ua,'M A','zzm.a@prova.invalid',true,ox,'Responsável Principal'),(ub,'M B','zzm.b@prova.invalid',true,ox,'Administrador')
  ON CONFLICT (user_id) DO UPDATE SET organization_id=excluded.organization_id,email=excluded.email;
  DELETE FROM public.user_roles WHERE user_id IN (ua,ub);
  INSERT INTO public.user_roles(user_id,role) VALUES (ua,'administrador'),(ub,'administrador');
  INSERT INTO public.platform_org_admin_invites(organization_id,user_id,email,nome,modo_acesso,responsavel_principal,invited_by,status,request_id)
    VALUES (ox,ua,'zzm.a@prova.invalid','M A','link',true,sa,'ativo',gen_random_uuid()) RETURNING id INTO ia;
  INSERT INTO public.platform_org_admin_invites(organization_id,user_id,email,nome,modo_acesso,responsavel_principal,invited_by,status,request_id)
    VALUES (ox,ub,'zzm.b@prova.invalid','M B','link',false,sa,'ativo',gen_random_uuid()) RETURNING id INTO ib;
  INSERT INTO public.platform_org_admin_invites(organization_id,email,nome,modo_acesso,responsavel_principal,invited_by,status,request_id)
    VALUES (ox,'zzm.p@prova.invalid','M P','link',false,sa,'pendente',gen_random_uuid()) RETURNING id INTO ip;
  PERFORM platform_private.issue_ticket('org_write', ox);
  UPDATE public.organizations SET responsavel_user_id=ua, responsavel_definido_em=now() WHERE id=ox;

  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  EXECUTE 'SET LOCAL ROLE service_role';
  op := public.platform_begin_org_admin_email_change(sa,ib,'zzm.b2@prova.invalid',NULL,k);
  SELECT reason INTO v FROM public.platform_org_admin_email_changes WHERE id=(op->>'op_id')::uuid;
  out := out||'null_reason:accepted('||v||');';
  SELECT reason INTO v FROM public.platform_org_admin_audit WHERE idempotency_key=k AND action='email_change_requested';
  out := out||'audit_reason='||v||';';
  op2 := public.platform_begin_org_admin_email_change(sa,ib,'zzm.b2@prova.invalid','',k);
  out := out||'retry_same_key_empty:idem='||(op2->>'idempotent')||',same_op='||((op->>'op_id')=(op2->>'op_id'))||';';
  BEGIN PERFORM public.platform_begin_org_admin_email_change(sa,ib,'zzm.b2@prova.invalid','Outro motivo',k); out:=out||'key_conflict:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'key_conflict:denied;'; END;
  BEGIN PERFORM public.platform_begin_org_admin_email_change(sa,ip,'zzm.p2@prova.invalid',' x ',gen_random_uuid()); out:=out||'one_char:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'one_char:denied;'; END;
  op := public.platform_begin_org_admin_email_change(sa,ip,'zzm.p2@prova.invalid','  Digitado errado ',gen_random_uuid());
  SELECT reason INTO v FROM public.platform_org_admin_email_changes WHERE id=(op->>'op_id')::uuid;
  out := out||'two_plus:accepted('||v||');';
  BEGIN PERFORM public.platform_begin_org_admin_email_change(ua,ia,'zzm.a2@prova.invalid',NULL,gen_random_uuid()); out:=out||'not_superadmin:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'not_superadmin:denied;'; END;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.platform_begin_org_admin_email_change(sa,ia,'zzm.a3@prova.invalid',NULL,gen_random_uuid()); out:=out||'authenticated_direct:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'authenticated_direct:denied;'; END;
  EXECUTE 'RESET ROLE';

  -- Edição de administrador continua exigindo motivo (responsável principal: ver 03)
  PERFORM set_config('request.jwt.claims', json_build_object('sub',sa,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.platform_update_org_admin(ib,'M B Silva','','','',now(),gen_random_uuid()); out:=out||'edit_empty:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'edit_empty:denied('||left(SQLERRM,40)||');'; END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'PROOF_ROLLBACK %', out;
END $proof$;
