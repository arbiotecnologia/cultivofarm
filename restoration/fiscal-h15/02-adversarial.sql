-- H15 adversarial harness — autossuficiente (versão sincronizada com o ensaio executado).
-- Uso: executar dentro de uma transação aberta após aplicar a migration H15 e SEMPRE
-- finalizar com ROLLBACK. A exceção controlada P1500 H15_ADVERSARIAL_PASS_ROLLBACK é
-- o resultado de SUCESSO: ela força o rollback integral da transação, garantindo que
-- nenhuma fixture (organização, perfil, papel ou nota criados no ensaio) persista.
-- Nunca submeter standalone; nunca capturar/suprimir a exceção P1500 final.
DO $test$
DECLARE a uuid; b uuid; org_a uuid; org_b uuid:=gen_random_uuid(); ca uuid; cb uuid:=gen_random_uuid(); ia uuid:=gen_random_uuid(); ib uuid:=gen_random_uuid(); n integer; q text;
BEGIN
 SELECT p.user_id,p.organization_id INTO a,org_a FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.user_id WHERE p.ativo AND r.role='administrador' LIMIT 1;
 SELECT p.user_id INTO b FROM public.profiles p WHERE p.user_id<>a ORDER BY p.user_id LIMIT 1;
 IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'H15_TEST_REQUIRES_TWO_EXISTING_IDENTITIES'; END IF;
 SELECT id INTO ca FROM public.company_fiscal_settings WHERE organization_id=org_a AND is_active;
 INSERT INTO public.organizations(id,nome,ativo) VALUES(org_b,'H15 rollback-only organization',true);
 UPDATE public.profiles SET organization_id=org_b,ativo=true WHERE user_id=b;
 INSERT INTO public.user_roles(user_id,role) VALUES(b,'administrador') ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 INSERT INTO public.fiscal_invoices(id,invoice_type,created_by,company_settings_id,status) VALUES(ia,'NFE',a,ca,'DRAFT');
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 INSERT INTO public.company_fiscal_settings(id,organization_id,is_active,production_enabled) VALUES(cb,org_b,true,false);
 INSERT INTO public.fiscal_invoices(id,invoice_type,created_by,company_settings_id,status) VALUES(ib,'NFE',b,cb,'DRAFT');
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 SELECT count(*) INTO n FROM public.fiscal_invoices WHERE id=ib;
 IF n<>0 THEN RAISE EXCEPTION 'H15_TEST_CROSS_TABLE_READ'; END IF;
 SELECT count(*) INTO n FROM public.company_fiscal_settings WHERE id=cb;
 IF n<>0 THEN RAISE EXCEPTION 'H15_TEST_CROSS_COMPANY_READ'; END IF;
 UPDATE public.fiscal_invoices SET notes='must not persist' WHERE id=ib;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'H15_TEST_CROSS_TABLE_UPDATE'; END IF;
 FOR q IN SELECT unnest(ARRAY[
 format('SELECT public.fn_fiscal_emitter_pendencies(%L::uuid)',cb),
 format('SELECT public.rpc_fiscal_tax_preview_v1(%L::uuid,''[]''::jsonb)',ib),
 format('SELECT public.rpc_fiscal_xml_status_v1(%L::uuid)',ib),
 format('SELECT public.rpc_fiscal_sefaz_transmission_status_v1(%L::uuid)',ib),
 format('SELECT public.rpc_fiscal_preflight_v1(%L::uuid)',ib),
 format('SELECT public.rpc_fiscal_draft_save(%L::uuid,''{}''::jsonb,''[]''::jsonb,1)',ib)
 ]) LOOP
 BEGIN EXECUTE q; RAISE EXCEPTION 'H15_TEST_RPC_ALLOWED_CROSS_ORGANIZATION';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 BEGIN
 UPDATE public.fiscal_invoices SET company_settings_id=cb WHERE id=ia;
 RAISE EXCEPTION 'H15_TEST_MUTABLE_ISSUER';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
 UPDATE public.fiscal_invoices SET company_snapshot='{"cnpj":"99999999999999"}'::jsonb WHERE id=ia;
 RAISE EXCEPTION 'H15_TEST_FORGED_SNAPSHOT';
 EXCEPTION WHEN check_violation THEN NULL; END;
 EXECUTE 'RESET ROLE';
 -- Sucesso: encerra com exceção controlada que força ROLLBACK integral.
 -- P1500 H15_ADVERSARIAL_PASS_ROLLBACK É O RESULTADO ESPERADO — nenhum fixture persiste.
 RAISE EXCEPTION 'H15_ADVERSARIAL_PASS_ROLLBACK' USING ERRCODE='P1500';
END $test$;
