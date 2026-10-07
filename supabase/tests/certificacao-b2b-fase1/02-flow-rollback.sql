-- Exclusivamente swzpzcwiasxmjutrmvkm após preflight. Não usar staging.
-- nextval pode avançar: efeito técnico auditável; jamais executar setval.
-- Exceção final obrigatória reverte registros, perfis, planos e auditoria.
DO $proof$
DECLARE
 ua uuid := 'd856140b-26c9-4d6a-a5aa-8bea47e78fff';
 ub uuid := 'ef031451-3fa1-462d-a792-f1e72f335257';
 uc uuid := 'a7d45277-6dec-413d-bf6b-86620c1ef39f';
 us uuid := 'b2c9bb8c-3ac3-4d65-b977-b7c873954b2e';
 ver uuid := '4ace3cd9-ab4a-419b-96b4-0fadfad885d6';
 oa uuid; ob uuid; pa uuid; pb uuid; prod uuid; plan uuid;
 a uuid; b uuid; sim uuid; conv uuid; rid uuid; n int; denied boolean;
 items jsonb; r jsonb; replay jsonb; hash text;
 evidence jsonb := '[]'; stage text := 'setup';
BEGIN
 BEGIN
  PERFORM set_config('request.jwt.claims','{}',true);
  INSERT INTO public.organizations(nome,status,ativo) VALUES ('CERT_B2B_F1_A','ativa',true) RETURNING id INTO oa;
  INSERT INTO public.organizations(nome,status,ativo) VALUES ('CERT_B2B_F1_B','ativa',true) RETURNING id INTO ob;
  INSERT INTO public.partner_accounts(razao_social,ativo,commercial_state) VALUES ('CERT_B2B_F1_A',true,'SP') RETURNING id INTO pa;
  INSERT INTO public.partner_accounts(razao_social,ativo,commercial_state) VALUES ('CERT_B2B_F1_B',true,'SP') RETURNING id INTO pb;
  UPDATE public.organizations SET partner_account_id=pa WHERE id=oa;
  UPDATE public.organizations SET partner_account_id=pb WHERE id=ob;
  UPDATE public.profiles SET organization_id=oa,ativo=true,cliente_id=NULL WHERE user_id IN (ua,uc);
  UPDATE public.profiles SET organization_id=ob,ativo=true,cliente_id=NULL WHERE user_id=ub;
  DELETE FROM public.user_roles WHERE user_id IN (ua,ub,uc);
  INSERT INTO public.user_roles(user_id,role) VALUES(ua,'administrador'),(ub,'administrador'),(uc,'parceiro_b2b_tecnico');
  DELETE FROM public.partner_users WHERE user_id IN (ua,ub,uc);
  INSERT INTO public.partner_users(partner_id,user_id,papel) VALUES(pa,ua,'gestor'),(pb,ub,'gestor'),(pa,uc,'tecnico');
  UPDATE public.partner_financial_settings SET credit_limit=100000,auto_generate_receivable=true,billing_trigger='na_aprovacao' WHERE partner_id IN(pa,pb);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',us,'role','authenticated')::text,true);
  PERFORM public.platform_transition_subscription(oa,'start_trial','CERT_B2B_F1',gen_random_uuid(),ver);
  PERFORM public.platform_transition_subscription(ob,'start_trial','CERT_B2B_F1',gen_random_uuid(),ver);
  PERFORM set_config('request.jwt.claims','{}',true);
  INSERT INTO public.produtos(nome,codigo,tipo,ativo,b2b_enabled,valor_ha_brl,dose_ml_ha)
  VALUES('CERT_B2B_F1_PROD','CERT_B2B_F1_PROD','inoculante',true,true,100,100) RETURNING id INTO prod;
  INSERT INTO public.commercial_payment_plans(name,code,plan_type,active,pricing_mode,max_days,interest_type)
  VALUES('CERT_B2B_F1_PLAN','CERT_B2B_F1_PLAN','cash',true,'discount_from_base',30,'none') RETURNING id INTO plan;
  items:=jsonb_build_array(jsonb_build_object('item_tipo','produto','item_id',prod,'quantidade',2,'unidade_medida','hectare'));
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  stage:='server_simulation';
  r:=public.simulate_b2b_payment_plan_secure(pa,plan,items);
  hash:=r->>'cart_hash';
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',(r->>'final_amount')::numeric=200 AND length(hash)>0));
  stage:='wrong_hash'; denied:=false;
  BEGIN PERFORM public.create_partner_order_secure(pa,NULL,items,NULL,plan,NULL,NULL,'forged','CERT_B2B_F1_bad'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='price_changed'; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',denied));
  stage:='create_order';
  r:=public.create_partner_order_secure(pa,'CERT_B2B_F1',items,NULL,plan,NULL,NULL,hash,'CERT_B2B_F1_A'); a:=(r->>'id')::uuid;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',(r->>'total')::numeric=200));
  stage:='repeat_click';
  replay:=public.create_partner_order_secure(pa,'CERT_B2B_F1',items,NULL,plan,NULL,NULL,hash,'CERT_B2B_F1_A');
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',replay=r));
  stage:='idem_conflict'; denied:=false;
  BEGIN PERFORM public.create_partner_order_secure(pa,'changed',items,NULL,plan,NULL,NULL,hash,'CERT_B2B_F1_A'); EXCEPTION WHEN OTHERS THEN denied:=SQLERRM='idempotency_conflict'; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',denied));
  stage:='forged_partner'; denied:=false;
  BEGIN PERFORM public.create_partner_order_secure(pb,NULL,items,NULL,plan,NULL,NULL,hash,'CERT_B2B_F1_FORGED'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',denied));
  stage:='approval'; PERFORM public.approve_partner_order(a,'CERT_B2B_F1');
  SELECT count(*) INTO n FROM public.production_planning WHERE partner_order_id=a;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','production_handoff','pass',n=1,'rows',n));
  SELECT count(*) INTO n FROM public.partner_order_financial_links WHERE partner_order_id=a;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case','automatic_title_link','pass',n=1,'rows',n));
  stage:='financial_replay'; r:=public.generate_b2b_receivable_secure(a); rid:=(r->>'receivable_id')::uuid;
  replay:=public.generate_b2b_receivable_secure(a);
  SELECT count(*) INTO n FROM public.accounts_receivable WHERE origin_id=a;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',n=1 AND (replay->>'receivable_id')::uuid=rid,'rows',n));
  stage:='snapshot_immutable'; denied:=false;
  BEGIN UPDATE public.partner_order_items SET preco_unitario=1 WHERE order_id=a; EXCEPTION WHEN check_violation THEN denied:=true; END;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'pass',denied));
  RESET ROLE;
 EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('case',stage,'blocked',true,'sqlstate',SQLSTATE,'error',left(SQLERRM,180)));
 END;
 RAISE EXCEPTION 'CERT_B2B_F1_ROLLBACK:%',evidence;
END $proof$;