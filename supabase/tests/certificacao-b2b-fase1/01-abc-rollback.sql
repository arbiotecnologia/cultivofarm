-- Executar SOMENTE após preflight externo comprovar swzpzcwiasxmjutrmvkm.
-- Cada execução termina com CERT_B2B_F1_ROLLBACK:..., erro intencional
-- que desfaz também as alterações temporárias dos perfis/papéis.
-- Sem chamada de criação de pedido: nextval não é revertido por rollback.
DO $proof$
DECLARE
 ua uuid := 'd856140b-26c9-4d6a-a5aa-8bea47e78fff';
 ub uuid := 'ef031451-3fa1-462d-a792-f1e72f335257';
 uc uuid := 'a7d45277-6dec-413d-bf6b-86620c1ef39f';
  oa uuid; ob uuid; pa uuid; pb uuid; r jsonb; n integer;
 evidence jsonb := '[]'; stage text := 'setup'; denied boolean;
BEGIN
 BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE user_id IN (ua,ub,uc)) <> 3 THEN
   RAISE EXCEPTION 'fixture_identity_missing';
  END IF;
  INSERT INTO public.organizations(nome,status,ativo) VALUES ('CERT_B2B_F1_A','ativa',true) RETURNING id INTO oa;
  INSERT INTO public.organizations(nome,status,ativo) VALUES ('CERT_B2B_F1_B','ativa',true) RETURNING id INTO ob;
  INSERT INTO public.partner_accounts(razao_social,ativo) VALUES ('CERT_B2B_F1_A',true) RETURNING id INTO pa;
  INSERT INTO public.partner_accounts(razao_social,ativo) VALUES ('CERT_B2B_F1_B',true) RETURNING id INTO pb;
  UPDATE public.organizations SET partner_account_id=pa WHERE id=oa;
  UPDATE public.organizations SET partner_account_id=pb WHERE id=ob;
  UPDATE public.profiles SET organization_id=oa,ativo=true WHERE user_id IN (ua,uc);
  UPDATE public.profiles SET organization_id=ob,ativo=true WHERE user_id=ub;
  DELETE FROM public.user_roles WHERE user_id IN (ua,ub,uc);
  INSERT INTO public.user_roles(user_id,role) VALUES (ua,'administrador'),(ua,'parceiro_b2b'),(ub,'administrador'),(ub,'parceiro_b2b'),(uc,'parceiro_b2b_tecnico');
  DELETE FROM public.partner_users WHERE user_id IN (ua,ub,uc);
  INSERT INTO public.partner_users(partner_id,user_id,papel) VALUES (pa,ua,'gestor'),(pb,ub,'gestor'),(pa,uc,'tecnico');
  -- O cadastro de parceiro já cria suas configurações por trigger.
  INSERT INTO public.partner_financial_settings(partner_id,credit_limit) VALUES (pa,101),(pb,202)
  ON CONFLICT (partner_id) DO UPDATE SET credit_limit=EXCLUDED.credit_limit;
  stage:='A_credit';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  r:=public.rpc_b2b_partner_credit(pa);
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',(r->>'credit_limit')::numeric=101));
  SELECT count(*) INTO n FROM public.partner_financial_settings WHERE partner_id=pa;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','A_direct_own','pass',n=1));
  SELECT count(*) INTO n FROM public.partner_financial_settings WHERE partner_id=pb;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','A_direct_cross','pass',n=0));
  UPDATE public.partner_financial_settings SET credit_limit=999 WHERE partner_id=pb;
  GET DIAGNOSTICS n=ROW_COUNT;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','A_cross_update','pass',n=0));
  denied:=false;
  BEGIN PERFORM public.rpc_b2b_partner_credit(pb); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','A_cross_partner','pass',denied));
  denied:=false;
  BEGIN PERFORM public.rpc_b2b_credit_exposure(pb,0,null); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','A_cross_exposure','pass',denied));
  denied:=false;
  BEGIN PERFORM public.fn_b2b_credit_exposure(pa,0,null); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','A_direct_core','pass',denied));
  denied:=false;
  BEGIN PERFORM public.rpc_b2b_credit_exposure(pa,-1,null); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','A_negative_amount','pass',denied));
  denied:=false;
  BEGIN PERFORM public.rpc_b2b_credit_exposure(pa,0,gen_random_uuid()); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','A_forged_order','pass',denied));
  RESET ROLE;
  stage:='B_credit';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  r:=public.rpc_b2b_partner_credit(pb);
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',(r->>'credit_limit')::numeric=202));
  denied:=false;
  BEGIN PERFORM public.rpc_b2b_partner_credit(pa); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','B_cross_partner','pass',denied));
  RESET ROLE;
  stage:='C_credit';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uc,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  denied:=false;
  BEGIN PERFORM public.rpc_b2b_partner_credit(pa); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',denied));
  denied:=false;
  BEGIN PERFORM public.rpc_b2b_credit_exposure(pa,0,null); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','C_exposure','pass',denied));
  RESET ROLE;
  stage:='anonymous';
  PERFORM set_config('request.jwt.claims','{}',true);
  SET LOCAL ROLE anon;
  denied:=false;
  BEGIN PERFORM public.rpc_b2b_partner_credit(pa); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',denied));
  RESET ROLE;
 EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'blocked',true,'sqlstate',SQLSTATE,'error',left(SQLERRM,120)));
 END;
 RAISE EXCEPTION 'CERT_B2B_F1_ROLLBACK:%',evidence;
END $proof$;