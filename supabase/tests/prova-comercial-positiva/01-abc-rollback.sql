-- Prova comercial positiva A/B/C — AUDIT_PLAN_20261006_POS
-- Executa tudo em um único bloco e termina com RAISE EXCEPTION, o que
-- desfaz integralmente fixtures, vínculos, assinaturas, overrides e auditoria.
-- Nenhuma identidade Auth é criada: perfis de teste existentes são
-- reatribuídos apenas dentro da transação revertida.
DO $$
DECLARE
  v_sa uuid := 'b2c9bb8c-3ac3-4d65-b977-b7c873954b2e';
  ver uuid := '713b1a31-ed4c-48b6-b6e7-22ebd3ee1092';
  uA_adm uuid := 'd856140b-26c9-4d6a-a5aa-8bea47e78fff';
  uA_fin uuid := '70956249-6294-48da-a046-006b5cced0bb';
  uA_gc  uuid := 'cbdc4ef3-005a-4674-8ea3-4410c7d7d212';
  uA_tec uuid := 'a7d45277-6dec-413d-bf6b-86620c1ef39f';
  uA_ina uuid := '28c5f1ca-32a7-4826-b1ee-8fb93c5a5ab9';
  uB_adm uuid := 'ef031451-3fa1-462d-a792-f1e72f335257';
  uC_par uuid := '37303555-f734-4ba8-8d13-f8fa54603853';
  oA uuid; oB uuid; oC uuid; pA uuid; pC uuid; sA uuid; sA2 uuid; sC uuid;
  ov1 uuid; ov1b uuid; ov2 uuid; corr uuid := gen_random_uuid(); idem uuid := gen_random_uuid();
  ver_h0 text; vf_h0 text; ver_h1 text; vf_h1 text; snapA0 text; snapA1 text;
  o text := ''; r text; n int; u uuid;
  pay0 text; pay1 text;
BEGIN
  SELECT md5(row(v.*)::text) INTO ver_h0 FROM public.saas_plan_versions v WHERE id = ver;
  SELECT md5(string_agg(row(f.*)::text,'|' ORDER BY row(f.*)::text)) INTO vf_h0 FROM public.saas_plan_version_features f WHERE plan_version_id = ver;
  SELECT (SELECT count(*) FROM public.saas_payment_events)||'/'||(SELECT count(*) FROM public.saas_payment_outbox)||'/'||(SELECT count(*) FROM public.saas_payment_audit) INTO pay0;

  -- Fixtures (postgres, fora da API)
  INSERT INTO public.organizations(nome,status,ativo) VALUES ('AUDIT_PLAN_20261006_POS_A','ativa',true) RETURNING id INTO oA;
  INSERT INTO public.organizations(nome,status,ativo) VALUES ('AUDIT_PLAN_20261006_POS_B','ativa',true) RETURNING id INTO oB;
  INSERT INTO public.organizations(nome,status,ativo) VALUES ('AUDIT_PLAN_20261006_POS_C','ativa',true) RETURNING id INTO oC;
  INSERT INTO public.partner_accounts(razao_social,ativo) VALUES ('AUDIT_PLAN_20261006_POS_PARCEIRO_A',true) RETURNING id INTO pA;
  INSERT INTO public.partner_accounts(razao_social,ativo) VALUES ('AUDIT_PLAN_20261006_POS_PARCEIRO_C',true) RETURNING id INTO pC;
  UPDATE public.organizations SET partner_account_id = pA WHERE id = oA;
  UPDATE public.organizations SET partner_account_id = pC WHERE id = oC;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_sa,'role','authenticated')::text, true);
  UPDATE public.profiles SET organization_id = oA, ativo = true  WHERE user_id IN (uA_adm,uA_fin,uA_gc,uA_tec);
  UPDATE public.profiles SET organization_id = oA, ativo = false WHERE user_id = uA_ina;
  UPDATE public.profiles SET organization_id = oB, ativo = true, cliente_id = NULL WHERE user_id = uB_adm;
  UPDATE public.profiles SET organization_id = oC, ativo = true  WHERE user_id = uC_par;
  DELETE FROM public.user_roles WHERE user_id IN (uA_adm,uA_fin,uA_gc,uA_tec,uA_ina,uB_adm,uC_par);
  INSERT INTO public.user_roles(user_id,role) VALUES
    (uA_adm,'administrador'),(uA_fin,'financeiro'),(uA_gc,'gestor_comercial'),
    (uA_tec,'parceiro_b2b_tecnico'),(uA_ina,'administrador'),(uB_adm,'administrador'),(uC_par,'parceiro_b2b');
  DELETE FROM public.partner_users WHERE user_id IN (uA_tec,uC_par);
  INSERT INTO public.partner_users(partner_id,user_id,papel) VALUES (pA,uA_tec,'tecnico'),(pC,uC_par,'gestor');

  -- Assinaturas pelo fluxo oficial (Superadmin)
  sA  := public.platform_transition_subscription(oA,'start_trial','AUDIT_PLAN_20261006_POS A',corr,ver);
  sA2 := public.platform_transition_subscription(oA,'start_trial','AUDIT_PLAN_20261006_POS A',corr,ver);
  SELECT count(*) INTO n FROM public.organization_subscriptions WHERE organization_id = oA;
  o := o || format(E'\n[6] retry mesma correlação: mesmo id=%s, assinaturas A=%s, hist=%s', sA = sA2, n,
        (SELECT count(*) FROM public.organization_subscription_history WHERE correlation_id = corr));
  BEGIN
    PERFORM public.platform_transition_subscription(oA,'start_trial','AUDIT_PLAN_20261006_POS A2',gen_random_uuid(),ver);
    o := o || E'\n[6] segundo trial: PERMITIDO (FALHA)';
  EXCEPTION WHEN OTHERS THEN o := o || E'\n[6] segundo trial com outra chave: negado ('||left(SQLERRM,40)||')'; END;
  -- Ativação: não existe RPC pública TRIAL->ACTIVE; promovida só nesta transação.
  PERFORM platform_private.issue_ticket('saas_subscription_write', oA);
  BEGIN
    UPDATE public.organization_subscriptions SET status='ACTIVE' WHERE id = sA;
  EXCEPTION WHEN OTHERS THEN o := o || E'\n[A] promoção ACTIVE bloqueada: '||left(SQLERRM,80); END;
  o := o || E'\n[A] status A='||(SELECT status FROM public.organization_subscriptions WHERE id=sA);
  sC := public.platform_transition_subscription(oC,'start_trial','AUDIT_PLAN_20261006_POS C',gen_random_uuid(),ver);
  BEGIN
    PERFORM platform_private.issue_ticket('saas_subscription_write', oB);
    INSERT INTO public.organization_subscriptions(organization_id,plan_id,status)
      SELECT oB, plan_id, 'ACTIVE' FROM public.saas_plan_versions WHERE id = ver;
    o := o || E'\n[B] assinatura legada sem versão criada';
  EXCEPTION WHEN OTHERS THEN o := o || E'\n[B] sem assinatura (legada recusada: '||left(SQLERRM,60)||')'; END;

  -- Overrides em C: GRANT catalogo_precos, REVOKE fichas_tecnicas; retry idempotente
  ov1  := public.platform_set_feature_override(oC,'catalogo_precos','GRANT','AUDIT_PLAN_20261006_POS C',NULL,NULL,idem);
  ov1b := public.platform_set_feature_override(oC,'catalogo_precos','GRANT','AUDIT_PLAN_20261006_POS C',NULL,NULL,idem);
  ov2  := public.platform_set_feature_override(oC,'fichas_tecnicas','REVOKE','AUDIT_PLAN_20261006_POS C',NULL,NULL,gen_random_uuid());
  o := o || format(E'\n[6] override retry mesma chave: mesmo id=%s, overrides C=%s', ov1 = ov1b,
        (SELECT count(*) FROM public.organization_feature_overrides WHERE organization_id = oC));
  BEGIN
    PERFORM public.platform_set_feature_override(oC,'catalogo_precos','REVOKE','divergente',NULL,NULL,idem);
    o := o || E'\n[6] mesma chave payload divergente: ACEITO (FALHA)';
  EXCEPTION WHEN OTHERS THEN o := o || E'\n[6] mesma chave payload divergente: negado'; END;

  SELECT features_snapshot::text INTO snapA0 FROM public.organization_subscriptions WHERE id = sA;

  -- Provas por identidade
  FOREACH u IN ARRAY ARRAY[uA_adm,uA_fin,uA_gc,uA_tec,uA_ina,uB_adm,uC_par,v_sa] LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    r := CASE u WHEN uA_adm THEN 'A_admin' WHEN uA_fin THEN 'A_fin' WHEN uA_gc THEN 'A_gc' WHEN uA_tec THEN 'A_tec'
                WHEN uA_ina THEN 'A_inativo' WHEN uB_adm THEN 'B_admin' WHEN uC_par THEN 'C_parceiro' ELSE 'SA' END;
    BEGIN o := o || E'\n['||r||'] ctx='||public.get_my_entitlement_context();
    EXCEPTION WHEN OTHERS THEN o := o || E'\n['||r||'] ctx=ERRO '||left(SQLERRM,40); END;
    BEGIN o := o || ' feats='||coalesce((SELECT string_agg(feature_key,',' ORDER BY feature_key) FROM public.get_my_entitlements()),'-');
    EXCEPTION WHEN OTHERS THEN o := o || ' feats=ERRO'; END;
    BEGIN
      o := o || format(' subs_visiveis(A/B/C)=%s/%s/%s',
        (SELECT count(*) FROM public.organization_subscriptions WHERE organization_id=oA),
        (SELECT count(*) FROM public.organization_subscriptions WHERE organization_id=oB),
        (SELECT count(*) FROM public.organization_subscriptions WHERE organization_id=oC));
    EXCEPTION WHEN OTHERS THEN o := o || ' subs=ERRO '||left(SQLERRM,30); END;
    BEGIN SELECT count(*) INTO n FROM public.get_partner_catalog_secure(pA); o := o || ' cat(pA)=OK:'||n;
    EXCEPTION WHEN OTHERS THEN o := o || ' cat(pA)=NEG'; END;
    BEGIN SELECT count(*) INTO n FROM public.get_partner_catalog_secure(pC); o := o || ' cat(pC)=OK:'||n;
    EXCEPTION WHEN OTHERS THEN o := o || ' cat(pC)=NEG'; END;
    BEGIN
      SELECT 
             count(*) INTO n FROM public.get_partner_catalog_tecnico_secure();
      o := o || ' tec=OK:'||n||' linhas_com_preco='||(SELECT count(*) FROM public.get_partner_catalog_tecnico_secure()
              WHERE coalesce(valor_dose_brl,valor_litro_brl,valor_ha_brl,preco_tabela_dose,preco_tabela_litro,preco_tabela_ha) IS NOT NULL);
    EXCEPTION WHEN OTHERS THEN o := o || ' tec=NEG'; END;
    BEGIN PERFORM public.rpc_cc_simulate_price('partner',pC,NULL,NULL,NULL,NULL,'litro',NULL,current_date,1); o := o || ' sim(pC)=OK';
    EXCEPTION WHEN OTHERS THEN o := o || ' sim(pC)='||left(SQLERRM,28); END;
    BEGIN PERFORM public.rpc_cc_simulate_price('partner',pA,NULL,NULL,NULL,NULL,'litro',NULL,current_date,1); o := o || ' sim(pA)=OK';
    EXCEPTION WHEN OTHERS THEN o := o || ' sim(pA)='||left(SQLERRM,28); END;
    EXECUTE 'reset role';
  END LOOP;

  -- anon
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  EXECUTE 'set local role anon';
  BEGIN o := o || E'\n[anon] ctx='||public.get_my_entitlement_context(); EXCEPTION WHEN OTHERS THEN o := o || E'\n[anon] ctx=NEG'; END;
  BEGIN PERFORM 1 FROM public.get_partner_catalog_secure(pC); o := o || ' cat=OK(FALHA)'; EXCEPTION WHEN OTHERS THEN o := o || ' cat=NEG'; END;
  BEGIN SELECT count(*) INTO n FROM public.organization_subscriptions; o := o || ' subs='||n; EXCEPTION WHEN OTHERS THEN o := o || ' subs=NEG'; END;
  EXECUTE 'reset role';

  -- Forja: admin A tenta escrever/ler outra organização
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uA_adm,'role','authenticated')::text, true);
  EXECUTE 'set local role authenticated';
  BEGIN UPDATE public.profiles SET organization_id = oC WHERE user_id = uA_adm; GET DIAGNOSTICS n = ROW_COUNT;
    o := o || E'\n[3] admin A troca próprio organization_id->C: linhas='||n;
  EXCEPTION WHEN OTHERS THEN o := o || E'\n[3] admin A troca organization_id: negado'; END;
  BEGIN PERFORM public.platform_set_feature_override(oA,'catalogo_precos','GRANT','forja',NULL,NULL,gen_random_uuid()); o := o || ' override_proprio=ACEITO(FALHA)';
  EXCEPTION WHEN OTHERS THEN o := o || ' override_proprio=negado'; END;
  BEGIN UPDATE public.organizations SET partner_account_id = pC WHERE id = oA; GET DIAGNOSTICS n = ROW_COUNT; o := o || ' org.partner->pC linhas='||n;
  EXCEPTION WHEN OTHERS THEN o := o || ' org.partner->pC negado'; END;
  BEGIN SELECT count(*) INTO n FROM public.saas_payment_events; o := o || ' pay_events_visiveis='||n; EXCEPTION WHEN OTHERS THEN o := o || ' pay_events=NEG'; END;
  EXECUTE 'reset role';

  -- [5] imutabilidade: alterar catálogo global e tentar alterar versão publicada
  UPDATE public.saas_features SET description = coalesce(description,'')||' AUDIT_PLAN_20261006_POS' WHERE key='visitas_tecnicas';
  BEGIN UPDATE public.saas_plan_versions SET price_amount = price_amount WHERE id = ver; o := o || E'\n[5] update versão publicada: ACEITO';
  EXCEPTION WHEN OTHERS THEN o := o || E'\n[5] update versão publicada: negado'; END;
  BEGIN DELETE FROM public.saas_plan_version_features WHERE plan_version_id = ver; o := o || ' delete features: ACEITO(FALHA)';
  EXCEPTION WHEN OTHERS THEN o := o || ' delete features: negado'; END;
  SELECT md5(row(v.*)::text) INTO ver_h1 FROM public.saas_plan_versions v WHERE id = ver;
  SELECT md5(string_agg(row(f.*)::text,'|' ORDER BY row(f.*)::text)) INTO vf_h1 FROM public.saas_plan_version_features f WHERE plan_version_id = ver;
  SELECT features_snapshot::text INTO snapA1 FROM public.organization_subscriptions WHERE id = sA;
  o := o || format(E'\n[5] hash versão igual=%s, hash features igual=%s, snapshot assinatura igual=%s', ver_h0=ver_h1, vf_h0=vf_h1, snapA0 IS NOT DISTINCT FROM snapA1);
  o := o || E'\n[7] limites assinatura A='||coalesce((SELECT limits_snapshot::text FROM public.organization_subscriptions WHERE id=sA),'null')
        ||' defs ativas='||(SELECT count(*) FROM public.saas_limit_definitions WHERE active)
        ||' vínculos required='||(SELECT count(*) FROM public.saas_feature_limit_definitions WHERE required);
  SELECT (SELECT count(*) FROM public.saas_payment_events)||'/'||(SELECT count(*) FROM public.saas_payment_outbox)||'/'||(SELECT count(*) FROM public.saas_payment_audit) INTO pay1;
  o := o || E'\n[8] pagamentos antes='||pay0||' depois='||pay1;

  RAISE EXCEPTION 'AUDIT_RESULT_ROLLBACK %', o;
END $$;
