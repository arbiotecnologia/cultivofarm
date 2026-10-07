-- Prova transacional: gestão de administradores provisionados.
-- Todo o bloco termina com RAISE EXCEPTION, garantindo rollback integral
-- (fixtures fictícias em organizations/auth.users/profiles/invites nunca persistem).
DO $proof$
DECLARE
  sa uuid := 'b2c9bb8c-3ac3-4d65-b977-b7c873954b2e';
  ox uuid := gen_random_uuid(); oy uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); ud uuid := gen_random_uuid();
  ia uuid; ib uuid; ic uuid; id_ uuid; if_ uuid;
  k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); r jsonb; op jsonb; t timestamptz; n int;
  out text := '';
BEGIN
  -- Fixtures (postgres)
  INSERT INTO public.organizations(id,nome,ativo,status,onboarding_dados) VALUES (ox,'ZZ Prova X',true,'ativa','{}'),(oy,'ZZ Prova Y',true,'ativa','{}');
  INSERT INTO auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  SELECT u, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',e,'{}','{}',now(),now()
  FROM (VALUES (ua,'zz.a@prova.invalid'),(ub,'zz.b@prova.invalid'),(uc,'zz.c@prova.invalid'),(ud,'zz.d@prova.invalid')) v(u,e);
  INSERT INTO public.profiles(user_id,nome,email,ativo,organization_id,cargo,cpf_cnpj) VALUES
    (ua,'Admin A','zz.a@prova.invalid',true,ox,'Responsável Principal',null),
    (ub,'Admin B','zz.b@prova.invalid',true,ox,'Administrador','52998224725'),
    (uc,'Admin C','zz.c@prova.invalid',true,oy,'Responsável Principal',null),
    (ud,'Admin D','zz.d@prova.invalid',true,ox,'Administrador',null);
  INSERT INTO public.user_roles(user_id,role) VALUES (ua,'administrador'),(ub,'administrador'),(uc,'administrador'),(ud,'administrador');
  INSERT INTO public.platform_org_admin_invites(organization_id,user_id,email,nome,cpf_cnpj,modo_acesso,responsavel_principal,invited_by,status,request_id)
    VALUES (ox,ua,'zz.a@prova.invalid','Admin A',null,'link',true,sa,'ativo',gen_random_uuid()) RETURNING id INTO ia;
  INSERT INTO public.platform_org_admin_invites(organization_id,user_id,email,nome,cpf_cnpj,modo_acesso,responsavel_principal,invited_by,status,request_id)
    VALUES (ox,ub,'zz.b@prova.invalid','Admin B','52998224725','link',false,sa,'ativo',gen_random_uuid()) RETURNING id INTO ib;
  INSERT INTO public.platform_org_admin_invites(organization_id,user_id,email,nome,modo_acesso,responsavel_principal,invited_by,status,request_id)
    VALUES (oy,uc,'zz.c@prova.invalid','Admin C','link',true,sa,'ativo',gen_random_uuid()) RETURNING id INTO ic;
  INSERT INTO public.platform_org_admin_invites(organization_id,user_id,email,nome,modo_acesso,responsavel_principal,invited_by,status,request_id)
    VALUES (ox,ud,'zz.d@prova.invalid','Admin D','link',false,sa,'pendente',gen_random_uuid()) RETURNING id INTO id_;
  INSERT INTO public.platform_org_admin_invites(organization_id,user_id,email,nome,modo_acesso,responsavel_principal,invited_by,status,request_id,email_delivery_status,email_last_error_code)
    VALUES (ox,null,'zz.f@prova.invalid','Admin F','link',false,sa,'falhou',gen_random_uuid(),'failed','email_smtp_rejected') RETURNING id INTO if_;
  PERFORM platform_private.issue_ticket('org_write', ox);
  UPDATE public.organizations SET responsavel_user_id=ua, responsavel_definido_em=now() WHERE id IN (ox);
  UPDATE public.organizations SET responsavel_user_id=uc WHERE id=oy;
  INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES (gen_random_uuid(),ub,now(),now()),(gen_random_uuid(),ub,now(),now());

  -- 1) anon
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,ub,'teste',ua,k1); out:=out||'anon:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'anon:denied('||SQLSTATE||');'; END;
  EXECUTE 'RESET ROLE';

  -- 2) admin de tenant (A) e usuário comum (D)
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,ub,'teste',ua,k1); out:=out||'tenant_admin:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'tenant_admin:denied;'; END;
  BEGIN PERFORM public.platform_update_org_admin(ib,'Hack','','','teste',now(),k1); out:=out||'tenant_edit:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'tenant_edit:denied;'; END;
  SELECT count(*) INTO n FROM public.platform_org_admin_audit; out:=out||'tenant_audit_rows_visible='||n||';';
  BEGIN INSERT INTO public.platform_org_admin_audit(organization_id,action,status,reason,origin,idempotency_key) VALUES (ox,'principal_transferred','succeeded','xx','x',k1); out:=out||'direct_insert:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'direct_insert:denied;'; END;
  BEGIN PERFORM public.platform_begin_org_admin_email_change(sa,ib,'x@y.zz','teste',k1); out:=out||'auth_begin_email:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'auth_begin_email:denied;'; END;
  EXECUTE 'RESET ROLE';

  -- 3) Superadmin: transferência
  PERFORM set_config('request.jwt.claims', json_build_object('sub',sa,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.platform_set_org_principal_admin(ox,ub,'Troca formal',ua,k1); out:=out||'transfer:'||(r->>'idempotent')||';';
  r := public.platform_set_org_principal_admin(ox,ub,'Troca formal',ua,k1); out:=out||'transfer_retry_idem:'||(r->>'idempotent')||';';
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,ub,'Outro motivo',ua,k1); out:=out||'idem_divergent:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'idem_divergent:conflict;'; END;
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,ua,'Volta',ua,gen_random_uuid()); out:=out||'stale_expected:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'stale_expected:conflict;'; END;
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,uc,'Outro tenant',ub,gen_random_uuid()); out:=out||'cross_tenant:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'cross_tenant:denied;'; END;
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,ud,'Pendente',ub,gen_random_uuid()); out:=out||'pending_candidate:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'pending_candidate:denied;'; END;
  BEGIN PERFORM public.platform_set_org_principal_admin(oy,uc,'Unico',uc,gen_random_uuid()); out:=out||'single_admin_self:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'single_admin_self:denied;'; END;
  BEGIN PERFORM public.platform_set_org_principal_admin(ox,ub,'x',ub,gen_random_uuid()); out:=out||'short_reason:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'short_reason:denied;'; END;

  -- 4) Edição
  SELECT updated_at INTO t FROM public.platform_org_admin_invites WHERE id=ib;
  r := public.platform_update_org_admin(ib,'Admin B Silva','11999990000','52998224725','Correção',t,k2); out:=out||'edit:'||(r->>'idempotent')||';';
  r := public.platform_update_org_admin(ib,'Admin B Silva','11999990000','52998224725','Correção',t,k2); out:=out||'edit_retry_idem:'||(r->>'idempotent')||';';
  BEGIN PERFORM public.platform_update_org_admin(ib,'Admin B Outro','','52998224725','Correção',t,gen_random_uuid()); out:=out||'edit_stale:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'edit_stale:conflict;'; END;
  SELECT updated_at INTO t FROM public.platform_org_admin_invites WHERE id=ib;
  BEGIN PERFORM public.platform_update_org_admin(ib,'Admin B Silva','11999990000','11144477735','CPF',t,gen_random_uuid()); out:=out||'active_cpf_change:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'active_cpf_change:denied;'; END;
  EXECUTE 'RESET ROLE';

  -- 5) Troca de e-mail (service_role)
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  op := public.platform_begin_org_admin_email_change(sa,if_,'zz.f2@prova.invalid','Endereço digitado errado',gen_random_uuid());
  r := public.platform_complete_org_admin_email_change(sa,(op->>'op_id')::uuid);
  SELECT count(*) INTO n FROM public.platform_org_admin_invites WHERE id=if_ AND email='zz.f2@prova.invalid' AND email_delivery_status='pending';
  out:=out||'failed_invite_email:'||(r->>'status')||'/reset='||n||';';
  BEGIN PERFORM public.platform_begin_org_admin_email_change(sa,ib,'zz.c@prova.invalid','Em uso',gen_random_uuid()); out:=out||'email_in_use:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'email_in_use:denied;'; END;
  BEGIN PERFORM public.platform_begin_org_admin_email_change(sa,ib,'invalido','Inválido',gen_random_uuid()); out:=out||'email_invalid:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'email_invalid:denied;'; END;
  BEGIN PERFORM public.platform_begin_org_admin_email_change(ua,ib,'zz.b2@prova.invalid','Não superadmin',gen_random_uuid()); out:=out||'actor_not_sa:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'actor_not_sa:denied;'; END;
  op := public.platform_begin_org_admin_email_change(sa,ib,'zz.b2@prova.invalid','Mudança de domínio',k1);
  BEGIN PERFORM public.platform_begin_org_admin_email_change(sa,ib,'zz.b3@prova.invalid','Paralela',gen_random_uuid()); out:=out||'parallel_op:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'parallel_op:denied;'; END;
  BEGIN PERFORM public.platform_complete_org_admin_email_change(sa,(op->>'op_id')::uuid); out:=out||'complete_before_auth:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'complete_before_auth:denied('||SQLERRM||');'; END;
  PERFORM public.platform_mark_org_admin_email_change(sa,(op->>'op_id')::uuid,'failed','auth_update_failed');
  r := public.platform_begin_org_admin_email_change(sa,ib,'zz.b2@prova.invalid','Mudança de domínio',k1);
  out:=out||'retry_after_fail:'||(r->>'status')||'/attempt='||(r->>'attempt')||';';
  UPDATE auth.users SET email='zz.b2@prova.invalid' WHERE id=ub;  -- simula updateUserById
  r := public.platform_complete_org_admin_email_change(sa,(op->>'op_id')::uuid);
  out:=out||'active_email:'||(r->>'status')||'/sessions_revoked='||(r->>'sessions_revoked')||';';
  r := public.platform_complete_org_admin_email_change(sa,(op->>'op_id')::uuid); out:=out||'complete_retry_idem:'||(r->>'idempotent')||';';
  SELECT count(*) INTO n FROM public.profiles WHERE user_id=ub AND email='zz.b2@prova.invalid'; out:=out||'profile_synced='||n||';';
  SELECT count(*) INTO n FROM public.platform_org_admin_invites WHERE id=ib AND email='zz.b2@prova.invalid'; out:=out||'invite_synced='||n||';';
  SELECT count(*) INTO n FROM auth.sessions WHERE user_id=ub; out:=out||'sessions_left='||n||';';

  -- 6) Estado final e imutabilidade
  SELECT count(*) INTO n FROM public.organizations WHERE id=ox AND responsavel_user_id=ub; out:=out||'org_resp_b='||n||';';
  SELECT count(*) FILTER (WHERE responsavel_principal) INTO n FROM public.platform_org_admin_invites WHERE organization_id=ox; out:=out||'principal_flags='||n||';';
  SELECT count(*) INTO n FROM public.user_roles WHERE user_id IN (ua,ub) AND role='administrador'; out:=out||'roles_preserved='||n||';';
  SELECT count(*) INTO n FROM public.platform_org_admin_audit WHERE organization_id=ox; out:=out||'audit_rows='||n||';';
  BEGIN UPDATE public.platform_org_admin_audit SET reason='xx' WHERE organization_id=ox; out:=out||'audit_update:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'audit_update:denied;'; END;
  BEGIN DELETE FROM public.platform_org_admin_audit WHERE organization_id=ox; out:=out||'audit_delete:ALLOWED!;';
  EXCEPTION WHEN OTHERS THEN out:=out||'audit_delete:denied;'; END;

  RAISE EXCEPTION 'PROOF_ROLLBACK %', out;
END $proof$;
